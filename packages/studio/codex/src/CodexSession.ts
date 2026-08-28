import type {ToolCatalogSpec, ToolExecutor} from "@opendaw/studio-core"
import {CodexAccount} from "./CodexAccount"
import {CodexDynamicTools} from "./CodexDynamicTools"
import {PRODUCER_DEVELOPER_INSTRUCTIONS} from "./CodexInstructions"
import {CodexModels} from "./CodexModels"
import {CodexRpcClient} from "./CodexRpcClient"
import {emitCodexTrace, type CodexTraceSink} from "./CodexTrace"
import type {
    CodexAccountEvent,
    CodexAccountState,
    CodexClientInfo,
    CodexDynamicTool,
    CodexDynamicToolCallContentItem,
    CodexDynamicToolCallResponse,
    CodexInitializeResponse,
    CodexSessionEvent,
    CodexStartThreadOptions,
    CodexStartTurnOptions,
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

const dynamicToolItem = (value: unknown): {
    readonly itemId: string
    readonly namespace: string | null
    readonly tool: string
    readonly arguments: JsonValue
    readonly success: boolean | null
    readonly contentItems: ReadonlyArray<CodexDynamicToolCallContentItem> | null
} | undefined => {
    if (!isRecord(value) || value.type !== "dynamicToolCall") {return undefined}
    if (typeof value.id !== "string" || typeof value.tool !== "string") {return undefined}
    const namespace = value.namespace === null || value.namespace === undefined
        ? null
        : typeof value.namespace === "string" ? value.namespace : null
    const argumentsValue = value.arguments
    if (argumentsValue === undefined) {return undefined}
    const contentItems = Array.isArray(value.contentItems)
        ? value.contentItems.filter((item): item is CodexDynamicToolCallContentItem =>
            isRecord(item) && item.type === "inputText" && typeof item.text === "string")
        : null
    return {
        itemId: value.id,
        namespace,
        tool: value.tool,
        arguments: argumentsValue as JsonValue,
        success: typeof value.success === "boolean" ? value.success : null,
        contentItems
    }
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
    readonly #traceSink: CodexTraceSink | undefined
    readonly #listeners = new Set<(event: CodexSessionEvent) => void>()
    #threadId: string | undefined
    #sessionId: string | null = null
    #activeTurnId: string | undefined
    #lastDisconnectError: string | null = null
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
            this.#lastDisconnectError = error.message
            this.#emit({type: "error", error: error.message})
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
        if (this.#threadId !== undefined && activeThreads.get(this.#threadId) === this) {
            activeThreads.delete(this.#threadId)
        }
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
        try {
            result = await this.#executor.execute({
                namespace,
                name: tool,
                arguments: argumentsValue as JsonObject
            })
        } catch (error) {
            result = {ok: false as const, error: errorMessage(error)}
        }
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
                text: result.ok ? JSON.stringify(result.value) ?? "null" : result.error
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
        const item = dynamicToolItem(value.item)
        if (item === undefined) {return}
        this.#emit({
            type: "dynamicToolStarted",
            threadId: stringAt(value, "threadId", "item/started notification"),
            turnId: stringAt(value, "turnId", "item/started notification"),
            itemId: item.itemId,
            namespace: item.namespace,
            tool: item.tool,
            arguments: item.arguments
        })
    }

    #onItemCompleted(params: JsonValue | undefined): void {
        const value = asRecord(params, "item/completed notification")
        const completedItem = value.item
        if (isRecord(completedItem) && completedItem.type === "reasoning") {
            const itemId = completedItem.id
            if (typeof itemId !== "string") {return}
            const threadId = stringAt(value, "threadId", "item/completed notification")
            const turnId = stringAt(value, "turnId", "item/completed notification")
            reasoningSummaryParts(completedItem).forEach(({summaryIndex, text}) => {
                const unseenText = this.#unseenReasoningSummaryText(itemId, summaryIndex, text)
                if (unseenText.length === 0) {return}
                this.#emit({
                    type: "reasoningSummaryPartAdded",
                    threadId,
                    turnId,
                    itemId,
                    summaryIndex,
                    text: unseenText
                })
            })
            return
        }
        const item = dynamicToolItem(value.item)
        if (item === undefined) {return}
        this.#emit({
            type: "dynamicToolCompleted",
            threadId: stringAt(value, "threadId", "item/completed notification"),
            turnId: stringAt(value, "turnId", "item/completed notification"),
            itemId: item.itemId,
            namespace: item.namespace,
            tool: item.tool,
            success: item.success,
            contentItems: item.contentItems
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
        this.#emit({type: "error", error: stringAt(value, "message", "error notification")})
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

    #emit(event: CodexSessionEvent): void {
        const isReasoningSummary = event.type === "reasoningSummaryDelta"
            || event.type === "reasoningSummaryPartAdded"
        const phase = event.type === "error"
            ? "error"
            : event.type === "connectionChanged"
                ? "state"
                : event.type === "dynamicToolStarted"
                    ? "tool-start"
                    : event.type === "dynamicToolCompleted"
                        ? "tool-complete"
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
            itemId: "itemId" in event ? event.itemId : undefined,
            namespace: "namespace" in event ? event.namespace : undefined,
            tool: "tool" in event ? event.tool : undefined,
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
