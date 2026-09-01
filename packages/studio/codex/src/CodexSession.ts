import type {ToolCatalogSpec, ToolExecutor} from "@opendaw/studio-core"
import {CodexAccount} from "./CodexAccount"
import {
    CODEX_MODEL_CACHE_DIAGNOSTIC,
    normalizeCodexErrorMessage
} from "./CodexCompatibility"
import {CodexDynamicTools} from "./CodexDynamicTools"
import {PRODUCER_DEVELOPER_INSTRUCTIONS} from "./CodexInstructions"
import {CodexModels} from "./CodexModels"
import {CodexRpcClient} from "./CodexRpcClient"
import {ProducerToolPolicy} from "./ProducerToolPolicy"
import {emitCodexTrace, type CodexTraceSink} from "./CodexTrace"
import type {
    CodexAccountEvent,
    CodexAccountState,
    CodexClientInfo,
    CodexDynamicTool,
    CodexDynamicToolCallResponse,
    CodexInitializeResponse,
    CodexSessionEvent,
    CodexStartThreadOptions,
    CodexStartTurnOptions,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const asRecord = (value: JsonValue | undefined, context: string): Record<string, unknown> => {
    if (!isRecord(value)) {throw new Error(`${context} must be an object`)}
    return value
}

const stringAt = (value: Record<string, unknown>, name: string, context: string): string => {
    const result = value[name]
    if (typeof result !== "string") {throw new Error(`${context}.${name} must be a string`)}
    return result
}

const nullableIntegerAt = (value: Record<string, unknown>, name: string): number | null => {
    const result = value[name]
    return typeof result === "number" && Number.isInteger(result) ? result : null
}

const reasoningSummaryPartText = (value: Record<string, unknown>): string => {
    if (typeof value.text === "string") {return value.text}
    const part = value.part
    if (typeof part === "string") {return part}
    return isRecord(part) && typeof part.text === "string" ? part.text : ""
}

const reasoningSummaryIndex = (value: Record<string, unknown>, fallback: number): number | null =>
    nullableIntegerAt(value, "summaryIndex") ?? nullableIntegerAt(value, "index") ?? fallback

const reasoningSummaryParts = (item: Record<string, unknown>): ReadonlyArray<{
    readonly summaryIndex: number | null
    readonly text: string
}> => {
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

const nullableStringAt = (value: Record<string, unknown>, name: string): string | null => {
    const result = value[name]
    return result === null || result === undefined ? null : typeof result === "string" ? result : null
}

const threadInfo = (value: JsonValue, context: string): CodexThreadInfo => {
    const response = asRecord(value, context)
    const thread = asRecord(response.thread as JsonValue | undefined, `${context}.thread`)
    return {
        threadId: stringAt(thread, "id", `${context}.thread`),
        sessionId: nullableStringAt(thread, "sessionId")
    }
}

const turnId = (value: JsonValue, context: string): string => {
    const response = asRecord(value, context)
    const turn = asRecord(response.turn as JsonValue | undefined, `${context}.turn`)
    return stringAt(turn, "id", `${context}.turn`)
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const turnItem = (value: unknown, context: string): CodexTurnItem => {
    if (!isRecord(value)) {throw new Error(`${context} item must be an object`)}
    if (typeof value.type !== "string" || value.type.length === 0) {
        throw new Error(`${context} item.type must be a string`)
    }
    if (typeof value.id !== "string" || value.id.length === 0) {
        throw new Error(`${context} item.id must be a string`)
    }
    return value as CodexTurnItem
}

export type CodexSessionOptions = {
    readonly rpc: CodexRpcClient
    readonly catalog: ToolCatalogSpec
    readonly executor: ToolExecutor
    readonly account?: CodexAccount
    readonly clientInfo?: CodexClientInfo
    readonly serviceName?: string
    readonly developerInstructions?: string
    readonly traceSink?: CodexTraceSink
}

export class CodexSession {
    readonly #rpc: CodexRpcClient
    readonly #catalog: ToolCatalogSpec
    readonly #executor: ToolExecutor
    readonly #account: CodexAccount
    readonly #clientInfo: CodexClientInfo
    readonly #serviceName: string
    readonly #developerInstructions: string
    readonly #dynamicTools: CodexDynamicTools
    readonly #models: CodexModels
    readonly #producerToolPolicy = new ProducerToolPolicy()
    readonly #traceSink: CodexTraceSink | undefined
    readonly #listeners = new Set<(event: CodexSessionEvent) => void>()
    #threadId: string | undefined
    #sessionId: string | null = null
    #activeTurnId: string | undefined
    #lastDisconnectError: string | null = null
    #modelCacheDiagnosticReported = false
    readonly #reasoningSummaryTextByKey = new Map<string, string>()

    constructor(options: CodexSessionOptions) {
        const existing = sessionsByRpc.get(options.rpc)
        if (existing !== undefined) {
            throw new Error("Only one CodexSession may own a CodexRpcClient")
        }
        const dynamicTools = new CodexDynamicTools(options.catalog)
        sessionsByRpc.set(options.rpc, this)
        this.#rpc = options.rpc
        this.#catalog = options.catalog
        this.#executor = options.executor
        this.#account = options.account ?? new CodexAccount(options.rpc)
        this.#clientInfo = options.clientInfo ?? defaultClientInfo
        this.#serviceName = options.serviceName ?? defaultServiceName
        this.#developerInstructions = options.developerInstructions ?? PRODUCER_DEVELOPER_INSTRUCTIONS
        this.#dynamicTools = dynamicTools
        this.#traceSink = options.traceSink
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

    get catalog(): ToolCatalogSpec {return this.#catalog}

    get dynamicTools(): ReadonlyArray<CodexDynamicTool> {
        return this.#dynamicTools.tools
    }

    get threadId(): string | undefined {return this.#threadId}

    get sessionId(): string | null {return this.#sessionId}

    get activeTurnId(): string | undefined {return this.#activeTurnId}

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

    async listModels() {
        return this.#models.listModels()
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
            dynamicTools: this.#dynamicTools.tools as unknown as JsonValue,
            ...(options.model === undefined ? {} : {model: options.model})
        }
        const info = threadInfo(await this.#rpc.request("thread/start", params), "thread/start response")
        const notificationAlreadySetThread = this.#threadId !== undefined
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

    async startTurn(text: string, options: CodexStartTurnOptions = {}): Promise<string> {
        const threadId = this.#requireThread()
        const result = await this.#rpc.request("turn/start", {
            threadId,
            input: [{type: "text", text, text_elements: []}],
            ...(options.model === undefined ? {} : {model: options.model}),
            ...(options.effort === undefined ? {} : {effort: options.effort}),
            ...(options.summary === undefined ? {} : {summary: options.summary})
        })
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
        if (this.#threadId === undefined) {throw new Error("Start or resume a thread before starting a turn")}
        return this.#threadId
    }

    #setThread(info: CodexThreadInfo): void {
        if (this.#threadId !== undefined && this.#threadId !== info.threadId) {
            throw new Error("This CodexSession already owns another active thread")
        }
        const owner = activeThreads.get(info.threadId)
        if (owner !== undefined && owner !== this) {
            throw new Error(`Thread '${info.threadId}' already has an authoritative CodexSession`)
        }
        activeThreads.set(info.threadId, this)
        this.#threadId = info.threadId
        this.#sessionId = info.sessionId
    }

    #releaseThread(): void {
        const threadId = this.#threadId
        if (threadId !== undefined && activeThreads.get(threadId) === this) {
            activeThreads.delete(threadId)
        }
        this.#producerToolPolicy.clear()
        this.#threadId = undefined
        this.#sessionId = null
        this.#reasoningSummaryTextByKey.clear()
    }

    async #handleToolCall(request: RpcRequest): Promise<RpcServerRequestResult> {
        const failure = (message: string): RpcServerRequestResult => ({
            result: this.#toolResponse({ok: false, error: message}) as unknown as JsonValue
        })
        if (!isRecord(request.params)) {return failure("Dynamic tool call parameters must be an object")}
        const namespace = request.params.namespace
        const tool = request.params.tool
        if (typeof namespace !== "string" || namespace.length === 0) {
            return failure("Dynamic tool call requires a namespace")
        }
        if (typeof tool !== "string" || tool.length === 0) {
            return failure("Dynamic tool call requires a tool name")
        }
        const argumentsValue = request.params.arguments
        if (!isRecord(argumentsValue)) {
            return failure("Dynamic tool call arguments must be an object")
        }
        const threadId = typeof request.params.threadId === "string" ? request.params.threadId : undefined
        const turnId = typeof request.params.turnId === "string" ? request.params.turnId : undefined
        const policyThreadId = threadId ?? this.#threadId
        const invocation = {namespace, name: tool, arguments: argumentsValue as JsonObject}
        emitCodexTrace(this.#traceSink, {
            layer: "tool",
            phase: "tool-start",
            direction: "incoming",
            threadId,
            turnId,
            namespace,
            tool,
            payload: argumentsValue as JsonValue
        })
        let result
        const policyFailure = this.#producerToolPolicy.beforeToolCall(policyThreadId, invocation)
        if (policyFailure !== undefined) {
            result = {ok: false as const, error: policyFailure}
        } else {
            try {
                result = await this.#executor.execute(invocation)
            } catch (error) {
                result = {ok: false as const, error: errorMessage(error)}
            }
        }
        this.#producerToolPolicy.afterToolCall(policyThreadId, invocation, result)
        emitCodexTrace(this.#traceSink, {
            layer: "tool",
            phase: "tool-complete",
            direction: "outgoing",
            threadId,
            turnId,
            namespace,
            tool,
            result: result as unknown as JsonValue,
            error: result.ok ? undefined : result.error
        })
        return {result: this.#toolResponse(result) as unknown as JsonValue}
    }

    #toolResponse(result: {readonly ok: true, readonly value: unknown} | {readonly ok: false, readonly error: string}): CodexDynamicToolCallResponse {
        return {
            contentItems: [{
                type: "inputText",
                text: result.ok
                    ? result.value === null ? "{\"ok\":true}" : JSON.stringify(result.value) ?? "null"
                    : result.error
            }],
            success: result.ok
        }
    }

    #onNotification(notification: RpcNotification): void {
        try {
            switch (notification.method) {
                case "thread/started": this.#onThreadStarted(notification.params); break
                case "turn/started": this.#onTurnStarted(notification.params); break
                case "item/agentMessage/delta": this.#onAgentMessageDelta(notification.params); break
                case "item/reasoning/summaryTextDelta": this.#onReasoningSummaryDelta(notification.params); break
                case "item/reasoning/summaryPartAdded": this.#onReasoningSummaryPartAdded(notification.params); break
                case "item/started": this.#onItemStarted(notification.params); break
                case "item/completed": this.#onItemCompleted(notification.params); break
                case "turn/completed": this.#onTurnCompleted(notification.params); break
                case "error": this.#onServerError(notification.params); break
            }
        } catch (error) {
            this.#emit({type: "error", error: errorMessage(error)})
        }
    }

    #onThreadStarted(params: JsonValue | undefined): void {
        if (this.#threadId !== undefined) {
            const info = threadInfo(params as JsonValue, "thread/started notification")
            this.#setThread(info)
            return
        }
        const info = threadInfo(params as JsonValue, "thread/started notification")
        this.#setThread(info)
        this.#emit({type: "threadStarted", thread: info})
    }

    #onTurnStarted(params: JsonValue | undefined): void {
        const value = asRecord(params, "turn/started notification")
        const threadId = stringAt(value, "threadId", "turn/started notification")
        const turn = asRecord(value.turn as JsonValue | undefined, "turn/started notification.turn")
        const turnId = stringAt(turn, "id", "turn/started notification.turn")
        this.#activeTurnId = turnId
        this.#emit({type: "turnStarted", threadId, turnId})
    }

    #onAgentMessageDelta(params: JsonValue | undefined): void {
        const value = asRecord(params, "item/agentMessage/delta notification")
        this.#emit({
            type: "agentTextDelta",
            threadId: stringAt(value, "threadId", "item/agentMessage/delta notification"),
            turnId: stringAt(value, "turnId", "item/agentMessage/delta notification"),
            itemId: stringAt(value, "itemId", "item/agentMessage/delta notification"),
            text: stringAt(value, "delta", "item/agentMessage/delta notification")
        })
    }

    #onReasoningSummaryDelta(params: JsonValue | undefined): void {
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

    #onReasoningSummaryPartAdded(params: JsonValue | undefined): void {
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

    #onItemStarted(params: JsonValue | undefined): void {
        const value = asRecord(params, "item/started notification")
        this.#emit({
            type: "itemStarted",
            threadId: stringAt(value, "threadId", "item/started notification"),
            turnId: stringAt(value, "turnId", "item/started notification"),
            item: turnItem(value.item, "item/started notification")
        })
    }

    #onItemCompleted(params: JsonValue | undefined): void {
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

    #reasoningSummaryKey(itemId: string, summaryIndex: number | null): string {
        return `${itemId}\u0000${summaryIndex === null ? "null" : summaryIndex}`
    }

    #rememberReasoningSummaryText(itemId: string, summaryIndex: number | null, text: string): void {
        if (text.length === 0) {return}
        const key = this.#reasoningSummaryKey(itemId, summaryIndex)
        this.#reasoningSummaryTextByKey.set(key, (this.#reasoningSummaryTextByKey.get(key) ?? "") + text)
    }

    #unseenReasoningSummaryText(itemId: string, summaryIndex: number | null, text: string): string {
        if (text.length === 0) {return ""}
        const key = this.#reasoningSummaryKey(itemId, summaryIndex)
        const received = this.#reasoningSummaryTextByKey.get(key)
        if (received === undefined) {
            this.#reasoningSummaryTextByKey.set(key, text)
            return text
        }
        if (text === received) {return ""}
        if (!text.startsWith(received)) {return ""}
        const unseen = text.slice(received.length)
        if (unseen.length > 0) {this.#reasoningSummaryTextByKey.set(key, text)}
        return unseen
    }

    #onTurnCompleted(params: JsonValue | undefined): void {
        const value = asRecord(params, "turn/completed notification")
        const threadId = stringAt(value, "threadId", "turn/completed notification")
        const turn = asRecord(value.turn as JsonValue | undefined, "turn/completed notification.turn")
        const id = stringAt(turn, "id", "turn/completed notification.turn")
        const status = stringAt(turn, "status", "turn/completed notification.turn")
        const turnError = isRecord(turn.error) && typeof turn.error.message === "string"
            ? turn.error.message : null
        if (this.#activeTurnId === id) {this.#activeTurnId = undefined}
        this.#emit({type: "turnCompleted", threadId, turnId: id, status, error: turnError})
    }

    #onServerError(params: JsonValue | undefined): void {
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
        const isReasoningSummary = event.type === "reasoningSummaryDelta"
            || event.type === "reasoningSummaryPartAdded"
        const isItemLifecycle = event.type === "itemStarted" || event.type === "itemCompleted"
        const item = isItemLifecycle ? event.item : undefined
        const itemTool = item !== undefined && typeof item.tool === "string" ? item.tool : undefined
        const itemNamespace = item !== undefined && typeof item.namespace === "string" ? item.namespace : undefined
        const phase = event.type === "error"
            ? "error"
            : event.type === "connectionChanged"
                ? "state"
                : event.type === "itemStarted"
                    ? "item-start"
                    : event.type === "itemCompleted"
                        ? "item-complete"
                        : event.type === "agentTextDelta" || isReasoningSummary ? "notification" : "state"
        const payload = event.type === "agentTextDelta"
            ? {
                type: event.type,
                threadId: event.threadId,
                turnId: event.turnId,
                itemId: event.itemId,
                textLength: event.text.length,
                textPreview: event.text.slice(0, 120)
            }
            : isReasoningSummary
                ? {
                    type: event.type,
                    threadId: event.threadId,
                    turnId: event.turnId,
                    itemId: event.itemId,
                    summaryIndex: event.summaryIndex,
                    textLength: event.text.length,
                    textPreview: event.text.slice(0, 120)
                }
            : event as unknown as JsonValue
        emitCodexTrace(this.#traceSink, {
            layer: "session",
            phase,
            threadId: "threadId" in event ? event.threadId : undefined,
            turnId: "turnId" in event ? event.turnId : undefined,
            itemId: "itemId" in event ? event.itemId : item?.id,
            namespace: itemNamespace,
            tool: itemTool,
            payload,
            error: event.type === "error" ? event.error : undefined
        })
        this.#listeners.forEach(listener => {
            try {
                listener(event)
            } catch {
                // Consumer event handlers must not interrupt protocol processing.
            }
        })
    }
}
