import {isDefined, Nullable, Optional, tryCatch} from "@opendaw/lib-std"
import {AgentToolResult, type AgentTool, type AgentToolbox} from "./AgentTool"
import {CodexAccount} from "./CodexAccount"
import {
    CODEX_MODEL_CACHE_DIAGNOSTIC,
    normalizeCodexErrorMessage
} from "./CodexCompatibility"
import {CodexContentGate} from "./CodexContentGate"
import {CodexDynamicTools} from "./CodexDynamicTools"
import {CodexJson} from "./CodexJson"
import {PRODUCER_DEVELOPER_INSTRUCTIONS} from "./CodexInstructions"
import {CodexModels} from "./CodexModels"
import {CodexRpcClient} from "./CodexRpcClient"
import {emitCodexTrace, type CodexTracePhase, type CodexTraceSink} from "./CodexTrace"

import type {
    CodexAccountEvent,
    CodexAccountState,
    CodexClientInfo,
    CodexDynamicTool,
    CodexDynamicToolCallResponse,
    CodexInitializeResponse,
    CodexModel,
    CodexSessionEvent,
    CodexStartThreadOptions,
    CodexStartTurnOptions,
    CodexSubagentInfo,
    CodexTurnItem,
    CodexThreadInfo,
    CodexTransportState,
    JsonObject,
    JsonValue,
    RpcNotification,
    RpcRequest,
    RpcServerRequestResult,
    Unsubscribe
} from "./types"

const defaultClientInfo: CodexClientInfo = {
    name: "opendaw",
    title: "openDAW Codex Integration",
    version: "0.0.0"
}

const defaultServiceName = "opendaw-studio"

const sessionsByRpc = new WeakMap<CodexRpcClient, CodexSession>()
const activeThreads = new Map<string, CodexSession>()

const {
    asObjectRecord: asRecord, errorMessage, isObjectRecord: isRecord, nullableIntegerAt, nullableStringAt, stringAt
} = CodexJson

type ReasoningSummaryPart = {readonly summaryIndex: Nullable<number>, readonly text: string}

type TraceIds = {readonly threadId?: string, readonly turnId?: string, readonly itemId?: string}

const reasoningSummaryPartText = (value: Record<string, unknown>): string => {
    if (typeof value.text === "string") {return value.text}
    const part = value.part
    if (typeof part === "string") {return part}
    return isRecord(part) && typeof part.text === "string" ? part.text : ""
}

const reasoningSummaryIndex = (value: Record<string, unknown>, fallback: number): Nullable<number> =>
    nullableIntegerAt(value, "summaryIndex") ?? nullableIntegerAt(value, "index") ?? fallback

const reasoningSummaryParts = (item: Record<string, unknown>): ReadonlyArray<ReasoningSummaryPart> => {
    const summary = item.summary
    if (typeof summary === "string") {return [{summaryIndex: 0, text: summary}]}
    if (isRecord(summary)) {
        return [{summaryIndex: reasoningSummaryIndex(summary, 0), text: reasoningSummaryPartText(summary)}]
    }
    if (!Array.isArray(summary)) {return []}
    return summary.map((part, index) => {
        if (typeof part === "string") {return {summaryIndex: index, text: part}}
        if (!isRecord(part)) {return {summaryIndex: index, text: ""}}
        return {summaryIndex: reasoningSummaryIndex(part, index), text: reasoningSummaryPartText(part)}
    })
}

const threadInfo = (value: unknown, context: string): CodexThreadInfo => {
    const response = asRecord(value, context)
    const thread = asRecord(response.thread, `${context}.thread`)
    return {
        threadId: stringAt(thread, "id", `${context}.thread`),
        sessionId: CodexJson.nullableStringAt(thread, "sessionId")
    }
}

const subagentPath = (thread: Record<string, unknown>): Nullable<string> => {
    const source = thread.source
    const subAgent = isRecord(source) ? source.subAgent : undefined
    const spawn = isRecord(subAgent) ? subAgent.thread_spawn : undefined
    return isRecord(spawn) ? nullableStringAt(spawn, "agent_path") : null
}

const subagentInfo = (thread: Record<string, unknown>, threadId: string,
                      parentThreadId: Nullable<string>): CodexSubagentInfo => ({
    threadId, parentThreadId, nickname: nullableStringAt(thread, "agentNickname"),
    role: nullableStringAt(thread, "agentRole"), path: subagentPath(thread)
})

const turnId = (value: JsonValue, context: string): string => {
    const response = asRecord(value, context)
    const turn = asRecord(response.turn, `${context}.turn`)
    return stringAt(turn, "id", `${context}.turn`)
}

const isTurnItem = (value: Record<string, unknown>): value is CodexTurnItem =>
    typeof value.type === "string" && value.type.length > 0 && typeof value.id === "string" && value.id.length > 0

const turnItem = (value: unknown, context: string): CodexTurnItem => {
    if (!isRecord(value)) {throw new Error(`${context} item must be an object`)}
    if (typeof value.type !== "string" || value.type.length === 0) {
        throw new Error(`${context} item.type must be a string`)
    }
    if (!isTurnItem(value)) {throw new Error(`${context} item.id must be a string`)}
    return value
}

const traceIds = (event: CodexSessionEvent): TraceIds => {
    switch (event.type) {
        case "turnStarted":
        case "turnCompleted":
            return {threadId: event.threadId, turnId: event.turnId}
        case "agentTextDelta":
        case "reasoningSummaryDelta":
        case "reasoningSummaryPartAdded":
            return {threadId: event.threadId, turnId: event.turnId, itemId: event.itemId}
        case "itemStarted":
        case "itemCompleted":
            return {threadId: event.threadId, turnId: event.turnId, itemId: event.item.id}
        default:
            return {}
    }
}

const tracePhase = (event: CodexSessionEvent): CodexTracePhase => {
    switch (event.type) {
        case "error":
            return "error"
        case "itemStarted":
            return "item-start"
        case "itemCompleted":
            return "item-complete"
        case "agentTextDelta":
        case "reasoningSummaryDelta":
        case "reasoningSummaryPartAdded":
            return "notification"
        default:
            return "state"
    }
}

const tracePayload = (event: CodexSessionEvent): JsonValue => {
    switch (event.type) {
        case "agentTextDelta":
            return {
                type: event.type, threadId: event.threadId, turnId: event.turnId, itemId: event.itemId,
                textLength: event.text.length, textPreview: event.text.slice(0, 120)
            }
        case "reasoningSummaryDelta":
        case "reasoningSummaryPartAdded":
            return {
                type: event.type, threadId: event.threadId, turnId: event.turnId, itemId: event.itemId,
                summaryIndex: event.summaryIndex, textLength: event.text.length, textPreview: event.text.slice(0, 120)
            }
        default:
            return event
    }
}

export type CodexSessionOptions = {
    readonly rpc: CodexRpcClient
    readonly toolboxes: ReadonlyArray<AgentToolbox>
    readonly account?: CodexAccount
    readonly clientInfo?: CodexClientInfo
    readonly serviceName?: string
    readonly developerInstructions?: string
    readonly traceSink?: CodexTraceSink
}

export class CodexSession {
    readonly #rpc: CodexRpcClient
    readonly #toolboxes: ReadonlyArray<AgentToolbox>
    readonly #account: CodexAccount
    readonly #clientInfo: CodexClientInfo
    readonly #serviceName: string
    readonly #developerInstructions: string
    readonly #dynamicTools: CodexDynamicTools
    readonly #models: CodexModels
    readonly #traceSink: Optional<CodexTraceSink>
    readonly #listeners: Set<(event: CodexSessionEvent) => void>
    readonly #reasoningSummaryTextByKey: Map<string, string>
    #toolQueue: Promise<unknown> = Promise.resolve()
    #knownModels: ReadonlyArray<CodexModel> = []
    #activeModel: Optional<string>
    #threadId: Optional<string>
    #sessionId: Nullable<string> = null
    #activeTurnId: Optional<string>
    #lastDisconnectError: Nullable<string> = null
    #modelCacheDiagnosticReported = false

    constructor(options: CodexSessionOptions) {
        const existing = sessionsByRpc.get(options.rpc)
        if (isDefined(existing)) {
            throw new Error("Only one CodexSession may own a CodexRpcClient")
        }
        const dynamicTools = new CodexDynamicTools(options.toolboxes)
        sessionsByRpc.set(options.rpc, this)
        this.#rpc = options.rpc
        this.#toolboxes = options.toolboxes
        this.#account = options.account ?? new CodexAccount(options.rpc)
        this.#clientInfo = options.clientInfo ?? defaultClientInfo
        this.#serviceName = options.serviceName ?? defaultServiceName
        this.#developerInstructions = options.developerInstructions ?? PRODUCER_DEVELOPER_INSTRUCTIONS
        this.#dynamicTools = dynamicTools
        this.#traceSink = options.traceSink
        this.#listeners = new Set()
        this.#reasoningSummaryTextByKey = new Map()
        this.#models = new CodexModels(options.rpc, options.traceSink)
        this.#rpc.subscribeNotifications(notification => this.#onNotification(notification))
        this.#rpc.subscribeErrors(error => {
            const message = normalizeCodexErrorMessage(error.message)
            this.#lastDisconnectError = message
            this.#emitError(message)
        })
        this.#rpc.subscribeState(state => this.#onConnectionState(state))
        this.#account.subscribe(event => this.#onAccountEvent(event))
        this.#rpc.registerServerRequestHandler(
            "item/tool/call", request => this.#handleToolCall(request))
    }

    get account(): CodexAccount {return this.#account}

    get toolboxes(): ReadonlyArray<AgentToolbox> {return this.#toolboxes}

    get dynamicTools(): ReadonlyArray<CodexDynamicTool> {
        return this.#dynamicTools.tools
    }

    get threadId(): Optional<string> {return this.#threadId}

    get sessionId(): Nullable<string> {return this.#sessionId}

    get activeTurnId(): Optional<string> {return this.#activeTurnId}

    get activeModel(): Optional<string> {return this.#activeModel}

    subscribe(listener: (event: CodexSessionEvent) => void): Unsubscribe {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }

    async connect(): Promise<CodexInitializeResponse> {
        return this.#rpc.connect(this.#clientInfo)
    }

    async disconnect(): Promise<void> {
        this.#releaseThread()
        this.#activeTurnId = undefined
        await this.#rpc.disconnect()
    }

    async readAccount(): Promise<CodexAccountState> {
        return this.#account.readAccount()
    }

    async listModels(): Promise<ReadonlyArray<CodexModel>> {
        const models = await this.#models.listModels()
        this.#knownModels = models
        return models
    }

    async startChatGPTLogin() {
        return this.#account.startChatGPTLogin()
    }

    async cancelLogin(loginId: string): Promise<{readonly status: string}> {
        return this.#account.cancelLogin(loginId)
    }

    async logout(): Promise<void> {
        await this.#account.logout()
    }

    async startThread(options: CodexStartThreadOptions = {}): Promise<CodexThreadInfo> {
        const params: JsonObject = {
            approvalPolicy: "never",
            sandbox: "read-only",
            serviceName: this.#serviceName,
            developerInstructions: this.#developerInstructions,
            dynamicTools: this.#dynamicTools.tools,
            ...(isDefined(options.model) ? {model: options.model} : {})
        }
        const info = threadInfo(await this.#rpc.request("thread/start", params), "thread/start response")
        if (isDefined(options.model)) {this.#activeModel = options.model}
        const notificationAlreadySetThread = isDefined(this.#threadId)
        this.#setThread(info)
        if (!notificationAlreadySetThread) {this.#emit({type: "threadStarted", thread: info})}
        return info
    }

    async resumeThread(threadId: string = this.#threadId ?? ""): Promise<CodexThreadInfo> {
        if (threadId.length === 0) {throw new Error("A thread id is required to resume a thread")}
        const info = threadInfo(await this.#rpc.request("thread/resume", {threadId}), "thread/resume response")
        this.#setThread(info)
        this.#emit({type: "threadResumed", thread: info})
        return info
    }

    async closeThread(): Promise<void> {
        const threadId = this.#threadId
        this.#releaseThread()
        this.#activeTurnId = undefined
        if (!isDefined(threadId)) {return}
        await this.#rpc.request("thread/unsubscribe", {threadId}).then(() => undefined, () => undefined)
    }

    async startTurn(text: string, options: CodexStartTurnOptions = {}): Promise<string> {
        const threadId = this.#requireThread()
        const result = await this.#rpc.request("turn/start", {
            threadId,
            input: [
                ...(text.length > 0 || !isDefined(options.images) ? [{type: "text", text, text_elements: []}] : []),
                ...(options.images ?? []).map(url => ({type: "image", url}))
            ],
            ...(isDefined(options.model) ? {model: options.model} : {}),
            ...(isDefined(options.effort) ? {effort: options.effort} : {}),
            ...(isDefined(options.summary) ? {summary: options.summary} : {})
        })
        if (isDefined(options.model)) {this.#activeModel = options.model}
        const id = turnId(result, "turn/start response")
        this.#activeTurnId = id
        return id
    }

    async interruptTurn(turnId: string = this.#activeTurnId ?? ""): Promise<void> {
        const threadId = this.#requireThread()
        if (turnId.length === 0) {throw new Error("An active turn id is required to interrupt a turn")}
        await this.#rpc.request("turn/interrupt", {threadId, turnId})
        if (this.#activeTurnId === turnId) {this.#activeTurnId = undefined}
    }

    #requireThread(): string {
        if (!isDefined(this.#threadId)) {throw new Error("Start or resume a thread before starting a turn")}
        return this.#threadId
    }

    #setThread(info: CodexThreadInfo): void {
        if (isDefined(this.#threadId) && this.#threadId !== info.threadId) {
            throw new Error("This CodexSession already owns another active thread")
        }
        const owner = activeThreads.get(info.threadId)
        if (isDefined(owner) && owner !== this) {
            throw new Error(`Thread '${info.threadId}' already has an authoritative CodexSession`)
        }
        activeThreads.set(info.threadId, this)
        this.#threadId = info.threadId
        this.#sessionId = info.sessionId
    }

    #releaseThread(): void {
        const threadId = this.#threadId
        if (isDefined(threadId) && activeThreads.get(threadId) === this) {
            activeThreads.delete(threadId)
        }
        this.#threadId = undefined
        this.#sessionId = null
        this.#reasoningSummaryTextByKey.clear()
    }

    #handleToolCall(request: RpcRequest): Promise<RpcServerRequestResult> {
        if (this.#isConcurrent(request)) {return this.#executeToolCall(request)}
        const next = this.#toolQueue.then(() => this.#executeToolCall(request))
        this.#toolQueue = next.catch(() => undefined)
        return next
    }

    #isConcurrent({params}: RpcRequest): boolean {
        if (!CodexJson.isJsonObject(params)) {return false}
        const {namespace, tool} = params
        return typeof namespace === "string" && typeof tool === "string"
            && this.#findTool(namespace, tool)?.concurrent === true
    }

    #findTool(namespace: string, name: string): Optional<AgentTool> {
        return this.#toolboxes.find(toolbox => toolbox.namespace === namespace)?.tools
            .find(tool => tool.name === name)
    }

    #activeModelInfo(): Optional<CodexModel> {
        const active = this.#activeModel
        return isDefined(active)
            ? this.#knownModels.find(model => model.model === active || model.id === active)
            : this.#knownModels.find(model => model.isDefault)
    }

    #gate(result: AgentToolResult): AgentToolResult {
        const model = this.#activeModelInfo()
        if (!isDefined(model)) {return result}
        const content = CodexContentGate.apply(result.content, model.inputModalities)
        return content === result.content ? result : {ok: result.ok, content}
    }

    #runTool(tool: AgentTool, args: JsonObject): Promise<AgentToolResult> {
        return Promise.resolve()
            .then(() => tool.execute(args))
            .catch(error => AgentToolResult.failure(errorMessage(error)))
    }

    async #executeToolCall(request: RpcRequest): Promise<RpcServerRequestResult> {
        const failure = (message: string): RpcServerRequestResult => ({
            result: this.#toolResponse(AgentToolResult.failure(message))
        })
        const params = request.params
        if (!CodexJson.isJsonObject(params)) {return failure("Dynamic tool call parameters must be an object")}
        const {namespace, tool} = params
        if (typeof namespace !== "string" || namespace.length === 0) {
            return failure("Dynamic tool call requires a namespace")
        }
        if (typeof tool !== "string" || tool.length === 0) {
            return failure("Dynamic tool call requires a tool name")
        }
        const argumentsValue = params.arguments
        if (!CodexJson.isJsonObject(argumentsValue)) {
            return failure("Dynamic tool call arguments must be an object")
        }
        const threadId = typeof params.threadId === "string" ? params.threadId : undefined
        const turnId = typeof params.turnId === "string" ? params.turnId : undefined
        emitCodexTrace(this.#traceSink, {
            layer: "tool",
            phase: "tool-start",
            direction: "incoming",
            threadId,
            turnId,
            namespace,
            tool,
            payload: argumentsValue
        })
        const agentTool = this.#findTool(namespace, tool)
        const result: AgentToolResult = this.#gate(isDefined(agentTool)
            ? await this.#runTool(agentTool, argumentsValue)
            : AgentToolResult.failure(`Unknown tool '${namespace}.${tool}'`))
        emitCodexTrace(this.#traceSink, {
            layer: "tool",
            phase: "tool-complete",
            direction: "outgoing",
            threadId,
            turnId,
            namespace,
            tool,
            result: this.#toolResponse(result),
            error: result.ok ? undefined : result.content.map(item => item.type === "inputText" ? item.text : "").join("\n")
        })
        return {result: this.#toolResponse(result)}
    }

    #toolResponse(result: AgentToolResult): CodexDynamicToolCallResponse {
        return {contentItems: result.content, success: result.ok}
    }

    #onNotification(notification: RpcNotification): void {
        const handled = tryCatch(() => this.#dispatchNotification(notification))
        if (handled.status === "failure") {this.#emit({type: "error", error: errorMessage(handled.error)})}
    }

    #dispatchNotification({method, params}: RpcNotification): void {
        switch (method) {
            case "thread/started": this.#onThreadStarted(params); break
            case "turn/started": this.#onTurnStarted(params); break
            case "item/agentMessage/delta": this.#onAgentMessageDelta(params); break
            case "item/reasoning/summaryTextDelta": this.#onReasoningSummaryDelta(params); break
            case "item/reasoning/summaryPartAdded": this.#onReasoningSummaryPartAdded(params); break
            case "item/started": this.#onItemStarted(params); break
            case "item/completed": this.#onItemCompleted(params); break
            case "turn/completed": this.#onTurnCompleted(params); break
            case "error": this.#onServerError(params); break
        }
    }

    #onThreadStarted(params: Optional<JsonValue>): void {
        const thread = asRecord(asRecord(params, "thread/started notification").thread, "thread/started notification.thread")
        const threadId = stringAt(thread, "id", "thread/started notification.thread")
        const parentThreadId = nullableStringAt(thread, "parentThreadId")
        if (isDefined(parentThreadId) || (isDefined(this.#threadId) && this.#threadId !== threadId)) {
            this.#emit({type: "subagentStarted", agent: subagentInfo(thread, threadId, parentThreadId)})
            return
        }
        const alreadyKnown = isDefined(this.#threadId)
        const info = threadInfo(params, "thread/started notification")
        this.#setThread(info)
        if (!alreadyKnown) {this.#emit({type: "threadStarted", thread: info})}
    }

    #onTurnStarted(params: Optional<JsonValue>): void {
        const value = asRecord(params, "turn/started notification")
        const threadId = stringAt(value, "threadId", "turn/started notification")
        const turn = asRecord(value.turn, "turn/started notification.turn")
        const turnId = stringAt(turn, "id", "turn/started notification.turn")
        if (!isDefined(this.#threadId) || this.#threadId === threadId) {this.#activeTurnId = turnId}
        this.#emit({type: "turnStarted", threadId, turnId})
    }

    #onAgentMessageDelta(params: Optional<JsonValue>): void {
        const value = asRecord(params, "item/agentMessage/delta notification")
        this.#emit({
            type: "agentTextDelta",
            threadId: stringAt(value, "threadId", "item/agentMessage/delta notification"),
            turnId: stringAt(value, "turnId", "item/agentMessage/delta notification"),
            itemId: stringAt(value, "itemId", "item/agentMessage/delta notification"),
            text: stringAt(value, "delta", "item/agentMessage/delta notification")
        })
    }

    #onReasoningSummaryDelta(params: Optional<JsonValue>): void {
        const value = asRecord(params, "item/reasoning/summaryTextDelta notification")
        const itemId = stringAt(value, "itemId", "item/reasoning/summaryTextDelta notification")
        const summaryIndex = nullableIntegerAt(value, "summaryIndex")
        const text = stringAt(value, "delta", "item/reasoning/summaryTextDelta notification")
        this.#rememberReasoningSummaryText(itemId, summaryIndex, text)
        this.#emit({
            type: "reasoningSummaryDelta",
            threadId: stringAt(value, "threadId", "item/reasoning/summaryTextDelta notification"),
            turnId: stringAt(value, "turnId", "item/reasoning/summaryTextDelta notification"),
            itemId,
            summaryIndex,
            text
        })
    }

    #onReasoningSummaryPartAdded(params: Optional<JsonValue>): void {
        const value = asRecord(params, "item/reasoning/summaryPartAdded notification")
        const itemId = stringAt(value, "itemId", "item/reasoning/summaryPartAdded notification")
        const summaryIndex = nullableIntegerAt(value, "summaryIndex")
        const text = reasoningSummaryPartText(value)
        this.#rememberReasoningSummaryText(itemId, summaryIndex, text)
        this.#emit({
            type: "reasoningSummaryPartAdded",
            threadId: stringAt(value, "threadId", "item/reasoning/summaryPartAdded notification"),
            turnId: stringAt(value, "turnId", "item/reasoning/summaryPartAdded notification"),
            itemId,
            summaryIndex,
            text
        })
    }

    #onItemStarted(params: Optional<JsonValue>): void {
        const value = asRecord(params, "item/started notification")
        this.#emit({
            type: "itemStarted",
            threadId: stringAt(value, "threadId", "item/started notification"),
            turnId: stringAt(value, "turnId", "item/started notification"),
            item: turnItem(value.item, "item/started notification")
        })
    }

    #onItemCompleted(params: Optional<JsonValue>): void {
        const value = asRecord(params, "item/completed notification")
        const item = turnItem(value.item, "item/completed notification")
        const threadId = stringAt(value, "threadId", "item/completed notification")
        const turnId = stringAt(value, "turnId", "item/completed notification")
        if (item.type === "reasoning") {
            reasoningSummaryParts(item).forEach(({summaryIndex, text}) => {
                const unseenText = this.#unseenReasoningSummaryText(item.id, summaryIndex, text)
                if (unseenText.length === 0) {return}
                this.#emit({
                    type: "reasoningSummaryPartAdded",
                    threadId,
                    turnId,
                    itemId: item.id,
                    summaryIndex,
                    text: unseenText
                })
            })
        }
        this.#emit({
            type: "itemCompleted",
            threadId,
            turnId,
            item
        })
    }

    #reasoningSummaryKey(itemId: string, summaryIndex: Nullable<number>): string {
        return `${itemId}\u0000${isDefined(summaryIndex) ? summaryIndex : "null"}`
    }

    #rememberReasoningSummaryText(itemId: string, summaryIndex: Nullable<number>, text: string): void {
        if (text.length === 0) {return}
        const key = this.#reasoningSummaryKey(itemId, summaryIndex)
        this.#reasoningSummaryTextByKey.set(key, (this.#reasoningSummaryTextByKey.get(key) ?? "") + text)
    }

    #unseenReasoningSummaryText(itemId: string, summaryIndex: Nullable<number>, text: string): string {
        if (text.length === 0) {return ""}
        const key = this.#reasoningSummaryKey(itemId, summaryIndex)
        const received = this.#reasoningSummaryTextByKey.get(key)
        if (!isDefined(received)) {
            this.#reasoningSummaryTextByKey.set(key, text)
            return text
        }
        if (text === received) {return ""}
        if (!text.startsWith(received)) {return ""}
        const unseen = text.slice(received.length)
        if (unseen.length > 0) {this.#reasoningSummaryTextByKey.set(key, text)}
        return unseen
    }

    #onTurnCompleted(params: Optional<JsonValue>): void {
        const value = asRecord(params, "turn/completed notification")
        const threadId = stringAt(value, "threadId", "turn/completed notification")
        const turn = asRecord(value.turn, "turn/completed notification.turn")
        const id = stringAt(turn, "id", "turn/completed notification.turn")
        const status = stringAt(turn, "status", "turn/completed notification.turn")
        const turnError = isRecord(turn.error) && typeof turn.error.message === "string"
            ? turn.error.message : null
        if (this.#activeTurnId === id) {this.#activeTurnId = undefined}
        this.#emit({type: "turnCompleted", threadId, turnId: id, status, error: turnError})
    }

    #onServerError(params: Optional<JsonValue>): void {
        const value = asRecord(params, "error notification")
        this.#emitError(stringAt(value, "message", "error notification"))
    }

    #onAccountEvent(event: CodexAccountEvent): void {
        if (event.type === "changed") {
            this.#emit({type: "accountChanged", state: event.state})
        } else {
            this.#emit({
                type: "loginCompleted",
                loginId: event.loginId,
                success: event.success,
                error: event.error
            })
        }
    }

    #onConnectionState(state: CodexTransportState): void {
        if (state === "disconnected") {
            this.#releaseThread()
            this.#activeTurnId = undefined
        }
        this.#emit({type: "connectionChanged", state})
        if (state === "disconnected") {
            this.#emit({type: "disconnected", error: this.#lastDisconnectError})
            this.#lastDisconnectError = null
        }
    }

    #emitError(message: string): void {
        const normalized = normalizeCodexErrorMessage(message)
        if (normalized === CODEX_MODEL_CACHE_DIAGNOSTIC) {
            if (this.#modelCacheDiagnosticReported) {return}
            this.#modelCacheDiagnosticReported = true
        }
        this.#emit({type: "error", error: normalized})
    }

    #emit(event: CodexSessionEvent): void {
        const item = event.type === "itemStarted" || event.type === "itemCompleted" ? event.item : undefined
        emitCodexTrace(this.#traceSink, {
            layer: "session",
            phase: tracePhase(event),
            ...traceIds(event),
            namespace: typeof item?.namespace === "string" ? item.namespace : undefined,
            tool: typeof item?.tool === "string" ? item.tool : undefined,
            payload: tracePayload(event),
            error: event.type === "error" ? event.error : undefined
        })
        this.#listeners.forEach(listener => tryCatch(() => listener(event)))
    }
}
