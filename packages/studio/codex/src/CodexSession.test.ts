import {describe, expect, it, vi} from "vitest"
import {ToolCatalog, ToolExecutor} from "@opendaw/studio-core"
import type {ControlApi, JsonObject, JsonValue} from "@opendaw/studio-core"
import {CodexRpcClient} from "./CodexRpcClient"
import {CodexSession} from "./CodexSession"
import type {CodexTransport} from "./CodexTransport"
import type {
    CodexSessionEvent,
    CodexTransportState,
    RpcMessage,
    RpcRequest,
    RpcResponse,
    Unsubscribe
} from "./types"

const isRequest = (message: RpcMessage): message is RpcRequest =>
    "method" in message && "id" in message

const tick = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

class FakeTransport implements CodexTransport {
    readonly sent: RpcMessage[] = []
    readonly #messageListeners = new Set<(message: RpcMessage) => void>()
    readonly #errorListeners = new Set<(error: Error) => void>()
    readonly #stateListeners = new Set<(state: CodexTransportState) => void>()
    #state: CodexTransportState = "disconnected"
    onSend: ((message: RpcMessage) => void) | undefined

    get state(): CodexTransportState {return this.#state}

    async connect(): Promise<void> {
        this.#setState("connecting")
        this.#setState("connected")
    }

    send(message: RpcMessage): void {
        this.sent.push(message)
        this.onSend?.(message)
    }

    subscribe(listener: (message: RpcMessage) => void): Unsubscribe {
        this.#messageListeners.add(listener)
        return () => this.#messageListeners.delete(listener)
    }

    subscribeError(listener: (error: Error) => void): Unsubscribe {
        this.#errorListeners.add(listener)
        return () => this.#errorListeners.delete(listener)
    }

    subscribeState(listener: (state: CodexTransportState) => void): Unsubscribe {
        this.#stateListeners.add(listener)
        return () => this.#stateListeners.delete(listener)
    }

    async close(): Promise<void> {this.#setState("disconnected")}

    emit(message: RpcMessage): void {
        this.#messageListeners.forEach(listener => listener(message))
    }

    disconnectUnexpectedly(): void {this.#setState("disconnected")}

    #setState(state: CodexTransportState): void {
        this.#state = state
        this.#stateListeners.forEach(listener => listener(state))
    }
}

const response = (request: RpcRequest, result: JsonValue): RpcResponse => ({id: request.id, result})

const requestWithMethod = (transport: FakeTransport, method: string): RpcRequest => {
    const request = transport.sent.findLast(message => isRequest(message) && message.method === method)
    if (!isRequest(request)) {throw new Error(`Missing ${method} request`)}
    return request
}

const installServer = (transport: FakeTransport): void => {
    let threadNumber = 0
    let currentThreadId = "thread-1"
    transport.onSend = message => {
        if (!isRequest(message)) {return}
        switch (message.method) {
            case "initialize":
                transport.emit(response(message, {
                    userAgent: "codex-test",
                    codexHome: "C:/codex",
                    platformFamily: "windows",
                    platformOs: "windows"
                }))
                break
            case "model/list": {
                const params = message.params as JsonObject
                const page = params.cursor === "page-2" ? 2 : 1
                transport.emit(response(message, page === 1 ? {
                    data: [{
                        id: "model-1",
                        model: "dynamic-model",
                        displayName: "Dynamic model",
                        description: "A model supplied by App Server.",
                        hidden: false,
                        supportedReasoningEfforts: [{reasoningEffort: "vendor-effort", description: "Vendor effort"}],
                        defaultReasoningEffort: "vendor-effort",
                        isDefault: true
                    }],
                    nextCursor: "page-2"
                } : {
                    data: [{
                        id: "hidden-model-id",
                        model: "hidden-model",
                        displayName: "Hidden model",
                        description: "Should not reach the UI.",
                        hidden: true,
                        supportedReasoningEfforts: [{reasoningEffort: "hidden-effort", description: "Hidden effort"}],
                        defaultReasoningEffort: "hidden-effort",
                        isDefault: false
                    }, {
                        id: "model-2",
                        model: "another-model",
                        displayName: "Another model",
                        description: "Another visible model.",
                        hidden: false,
                        supportedReasoningEfforts: [{reasoningEffort: "another-effort", description: "Another effort"}],
                        defaultReasoningEffort: "another-effort",
                        isDefault: false
                    }],
                    nextCursor: null
                }))
                break
            }
            case "account/read":
                transport.emit(response(message, {
                    account: {type: "chatgpt", email: "producer@example.com", planType: "pro"},
                    requiresOpenaiAuth: false
                }))
                break
            case "account/login/start":
                transport.emit(response(message, {
                    type: "chatgpt",
                    loginId: "login-1",
                    authUrl: "https://example.test/login"
                }))
                break
            case "account/login/cancel":
                transport.emit(response(message, {status: "canceled"}))
                break
            case "account/logout":
                transport.emit(response(message, {}))
                break
            case "thread/start":
                currentThreadId = `thread-${++threadNumber}`
                transport.emit({
                    method: "thread/started",
                    params: {thread: {id: currentThreadId, sessionId: `session-${threadNumber}`}}
                })
                transport.emit(response(message, {thread: {id: currentThreadId, sessionId: `session-${threadNumber}`}}))
                break
            case "thread/resume":
                transport.emit(response(message, {thread: {id: currentThreadId, sessionId: `session-${threadNumber}`}}))
                break
            case "turn/start": {
                const input = message.params as JsonObject
                const turnNumber = Array.isArray(input.input) && input.input[0] !== undefined
                    ? transport.sent.filter(candidate => isRequest(candidate) && candidate.method === "turn/start").length
                    : 0
                const id = `turn-${turnNumber}`
                transport.emit({
                    method: "turn/started",
                    params: {threadId: currentThreadId, turn: {id}}
                })
                transport.emit(response(message, {turn: {id}}))
                break
            }
            case "turn/interrupt":
                transport.emit(response(message, {}))
                break
        }
    }
}

describe("CodexSession", () => {
    it("composes account, thread, turns, and the real Slice-2 executor bridge", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const catalog = new ToolCatalog()
        const calls: Array<JsonObject> = []
        const controlApi = {
            resolver: {},
            call: vi.fn((request: JsonObject): JsonValue => {
                calls.push(request)
                return "ok"
            }),
            callAsync: vi.fn(async (request: JsonObject): Promise<JsonValue> => {
                calls.push(request)
                return "ok"
            })
        } as unknown as ControlApi
        const executor = new ToolExecutor(controlApi, catalog)
        const trace: Array<Record<string, unknown>> = []
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport, event => trace.push(event as unknown as Record<string, unknown>)),
            catalog,
            executor,
            serviceName: "openDAW-test",
            developerInstructions: "Operate the current openDAW project as a producer.",
            traceSink: event => trace.push(event as unknown as Record<string, unknown>)
        })
        const events: Array<{readonly type: string, readonly [key: string]: unknown}> = []
        session.subscribe(event => events.push(event))

        try {
            await session.connect()
            const account = await session.readAccount()
            expect(account).toMatchObject({
                exists: true,
                accountType: "chatgpt",
                authMode: "chatgpt",
                email: "producer@example.com",
                planType: "pro",
                requiresOpenaiAuth: false
            })
            const login = await session.startChatGPTLogin()
            expect(login).toEqual({loginId: "login-1", authUrl: "https://example.test/login"})
            expect(requestWithMethod(transport, "account/read").params).toEqual({refreshToken: false})
            expect(requestWithMethod(transport, "account/login/start").params).toEqual({
                type: "chatgpt",
                useHostedLoginSuccessPage: true,
                appBrand: "chatgpt"
            })

            const models = await session.listModels()
            expect(models).toEqual([
                {
                    id: "model-1",
                    model: "dynamic-model",
                    displayName: "Dynamic model",
                    description: "A model supplied by App Server.",
                    hidden: false,
                    supportedReasoningEfforts: [{reasoningEffort: "vendor-effort", description: "Vendor effort"}],
                    defaultReasoningEffort: "vendor-effort",
                    isDefault: true
                },
                {
                    id: "model-2",
                    model: "another-model",
                    displayName: "Another model",
                    description: "Another visible model.",
                    hidden: false,
                    supportedReasoningEfforts: [{reasoningEffort: "another-effort", description: "Another effort"}],
                    defaultReasoningEffort: "another-effort",
                    isDefault: false
                }
            ])
            const modelRequests = transport.sent.filter(message => isRequest(message) && message.method === "model/list")
            expect(modelRequests).toHaveLength(2)
            expect(modelRequests.map(request => request.params)).toEqual([
                {limit: 100, cursor: null, includeHidden: false},
                {limit: 100, cursor: "page-2", includeHidden: false}
            ])

            transport.emit({
                method: "account/updated",
                params: {authMode: "chatgpt", planType: "plus"}
            })
            transport.emit({
                method: "account/login/completed",
                params: {loginId: "login-1", success: true, error: null}
            })

            const thread = await session.startThread({model: "test-model"})
            expect(thread).toEqual({threadId: "thread-1", sessionId: "session-1"})
            const threadParams = requestWithMethod(transport, "thread/start").params as JsonObject
            expect(threadParams.dynamicTools).toEqual(session.dynamicTools)
            expect(threadParams.developerInstructions)
                .toBe("Operate the current openDAW project as a producer.")
            expect(threadParams.serviceName).toBe("openDAW-test")
            expect(threadParams.approvalPolicy).toBe("never")
            expect(threadParams.sandbox).toBe("read-only")
            expect(threadParams.model).toBe("test-model")
            expect(events.filter(event => event.type === "threadStarted")).toHaveLength(1)

            const successfulCall = {
                method: "item/tool/call",
                id: 91,
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    callId: "call-1",
                    namespace: "daw_project",
                    tool: "set_bpm",
                    arguments: {value: 90}
                }
            } satisfies RpcRequest
            transport.emit(successfulCall)
            await tick()
            const successReply = transport.sent.at(-1)
            expect(successReply).toMatchObject({
                id: 91,
                result: {success: true, contentItems: [{type: "inputText", text: '"ok"'}]}
            })
            expect(calls).toContainEqual({operation: "project.setBpm", arguments: {value: 90}})

            transport.emit({
                method: "item/tool/call",
                id: 92,
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    callId: "call-2",
                    namespace: "daw_project",
                    tool: "missing_tool",
                    arguments: {}
                }
            })
            await tick()
            expect(transport.sent.at(-1)).toMatchObject({
                id: 92,
                result: {success: false, contentItems: [{type: "inputText"}]}
            })

            const firstTurn = await session.startTurn("Create a short pattern.")
            const secondTurn = await session.startTurn("Adjust the pattern.", {
                model: "another-model",
                effort: "another-effort"
            })
            expect(firstTurn).toBe("turn-1")
            expect(secondTurn).toBe("turn-2")
            expect((requestWithMethod(transport, "turn/start").params as JsonObject).threadId)
                .toBe("thread-1")
            expect(requestWithMethod(transport, "turn/start").params).toMatchObject({
                model: "another-model",
                effort: "another-effort"
            })
            expect(events.filter(event => event.type === "turnStarted")).toHaveLength(2)

            transport.emit({
                method: "item/agentMessage/delta",
                params: {threadId: "thread-1", turnId: "turn-2", itemId: "message-1", delta: "done"}
            })
            transport.emit({
                method: "item/started",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-2",
                    item: {
                        type: "dynamicToolCall",
                        id: "item-1",
                        namespace: "daw_project",
                        tool: "set_bpm",
                        arguments: {value: 92}
                    }
                }
            })
            transport.emit({
                method: "item/completed",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-2",
                    item: {
                        type: "dynamicToolCall",
                        id: "item-1",
                        namespace: "daw_project",
                        tool: "set_bpm",
                        arguments: {value: 92},
                        success: true,
                        contentItems: [{type: "inputText", text: '"ok"'}]
                    }
                }
            })
            transport.emit({
                method: "turn/completed",
                params: {
                    threadId: "thread-1",
                    turn: {id: "turn-2", status: "completed", error: null}
                }
            })
            expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
                "connectionChanged",
                "accountChanged",
                "loginCompleted",
                "threadStarted",
                "turnStarted",
                "agentTextDelta",
                "dynamicToolStarted",
                "dynamicToolCompleted",
                "turnCompleted"
            ]))
            expect(session.activeTurnId).toBeUndefined()
            expect(trace.some(event => event.layer === "rpc")).toBe(true)
            expect(trace.some(event => event.layer === "session")).toBe(true)
            expect(trace.some(event => event.layer === "tool" && event.phase === "tool-start")).toBe(true)

            await session.startTurn("One more change.")
            await session.interruptTurn()
            expect(requestWithMethod(transport, "turn/interrupt").params).toEqual({
                threadId: "thread-1", turnId: "turn-3"
            })

            await session.startTurn("Connection loss test.")
            expect(session.activeTurnId).toBe("turn-4")
            transport.disconnectUnexpectedly()
            expect(session.threadId).toBeUndefined()
            expect(session.sessionId).toBeNull()
            expect(session.activeTurnId).toBeUndefined()
            expect(events.some(event => event.type === "disconnected")).toBe(true)

            await session.connect()
            const replacement = await session.startThread()
            expect(replacement).toEqual({threadId: "thread-2", sessionId: "session-2"})
        } finally {
            await session.disconnect()
        }
    })

    it("normalizes readable reasoning summaries and ignores raw reasoning text", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const catalog = new ToolCatalog()
        const controlApi = {
            resolver: {},
            call: vi.fn(() => "ok"),
            callAsync: vi.fn(async () => "ok")
        } as unknown as ControlApi
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            catalog,
            executor: new ToolExecutor(controlApi, catalog)
        })
        const events: CodexSessionEvent[] = []
        session.subscribe(event => events.push(event))

        try {
            await session.connect()
            transport.emit({
                method: "item/reasoning/summaryPartAdded",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    itemId: "reasoning-1",
                    summaryIndex: 0,
                    part: {type: "summaryText"}
                }
            })
            transport.emit({
                method: "item/reasoning/summaryTextDelta",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    itemId: "reasoning-1",
                    summaryIndex: 0,
                    delta: "Inspecting the project…"
                }
            })
            transport.emit({
                method: "item/reasoning/summaryTextDelta",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    itemId: "reasoning-1",
                    summaryIndex: 1,
                    delta: "Choosing suitable samples…"
                }
            })
            transport.emit({
                method: "item/reasoning/textDelta",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    itemId: "reasoning-1",
                    delta: "hidden raw reasoning"
                }
            })

            expect(events.filter(event => event.type === "reasoningSummaryPartAdded")).toEqual([{
                type: "reasoningSummaryPartAdded",
                threadId: "thread-1",
                turnId: "turn-1",
                itemId: "reasoning-1",
                summaryIndex: 0,
                text: ""
            }])
            expect(events.filter(event => event.type === "reasoningSummaryDelta")).toEqual([
                {
                    type: "reasoningSummaryDelta",
                    threadId: "thread-1",
                    turnId: "turn-1",
                    itemId: "reasoning-1",
                    summaryIndex: 0,
                    text: "Inspecting the project…"
                },
                {
                    type: "reasoningSummaryDelta",
                    threadId: "thread-1",
                    turnId: "turn-1",
                    itemId: "reasoning-1",
                    summaryIndex: 1,
                    text: "Choosing suitable samples…"
                }
            ])
            expect(events).not.toContainEqual(expect.objectContaining({text: "hidden raw reasoning"}))
        } finally {
            await session.disconnect()
        }
    })
})
