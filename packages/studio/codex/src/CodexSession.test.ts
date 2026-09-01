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
    it("enforces first-use device help before producer mutations and apply_edit", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const catalog = new ToolCatalog()
        const execute = vi.fn(async (invocation: {
            readonly name: string
            readonly arguments?: JsonObject
        }) => invocation.name === "inspect_device_help"
            ? {
                ok: true as const,
                value: {
                    category: invocation.arguments?.category ?? "instrument",
                    factory: invocation.arguments?.factory ?? "Apparat"
                }
            }
            : {
                ok: true as const,
                value: {tool: invocation.name}
            })
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            catalog,
            executor: {execute} as unknown as ToolExecutor
        })
        const call = async (id: number, tool: string, arguments_: JsonObject): Promise<RpcMessage> => {
            transport.emit({
                method: "item/tool/call",
                id,
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    namespace: tool === "inspect_device_help" ? "daw_resources" : "daw_project",
                    tool,
                    arguments: arguments_
                }
            })
            await tick()
            const reply = transport.sent.findLast(message => "id" in message && message.id === id)
            if (reply === undefined) {throw new Error(`Missing reply for ${tool}`)}
            return reply
        }

        try {
            await session.connect()
            await session.startThread()

            const blocked = await call(101, "create_any_instrument", {factory: "Apparat"})
            expect(blocked).toMatchObject({
                result: {
                    success: false,
                    contentItems: [{type: "inputText", text: expect.stringContaining(
                        'daw_resources.inspect_device_help({"category":"instrument","factory":"Apparat"})')
                    }]
                }
            })
            expect(execute).not.toHaveBeenCalled()

            await call(102, "inspect_device_help", {category: "instrument", factory: "Apparat"})
            await call(103, "create_any_instrument", {factory: "Apparat"})
            expect(execute).toHaveBeenCalledTimes(2)

            const blockedEdit = await call(104, "apply_edit", {
                steps: [{
                    id: "delay",
                    namespace: "daw_project",
                    tool: "insert_audio_effect",
                    arguments: {factory: "Delay"}
                }]
            })
            expect(blockedEdit).toMatchObject({
                result: {
                    success: false,
                    contentItems: [{type: "inputText", text: expect.stringContaining(
                        'daw_resources.inspect_device_help({"category":"audio-effect","factory":"Delay"})')
                    }]
                }
            })
            expect(execute).toHaveBeenCalledTimes(2)

            await call(105, "inspect_device_help", {category: "audio-effect", factory: "Delay"})
            await call(106, "apply_edit", {
                steps: [{
                    id: "delay",
                    namespace: "daw_project",
                    tool: "insert_audio_effect",
                    arguments: {factory: "Delay"}
                }]
            })
            expect(execute).toHaveBeenCalledTimes(4)
        } finally {
            await session.disconnect()
        }
    })

    it("deduplicates the incompatible Codex model-cache diagnostic", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const catalog = new ToolCatalog()
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            catalog,
            executor: {execute: vi.fn()} as unknown as ToolExecutor
        })
        const events: CodexSessionEvent[] = []
        session.subscribe(event => events.push(event))

        try {
            await session.connect()
            const message = "failed to renew cache TTL: missing field `supports_parallel_tool_calls`"
            transport.emit({method: "error", params: {message}})
            transport.emit({method: "error", params: {message}})
            const errors = events.filter((event): event is Extract<CodexSessionEvent, {type: "error"}> =>
                event.type === "error")
            expect(errors).toHaveLength(1)
            expect(errors[0].error).toBe(
                "The connected Codex client has an incompatible model cache/schema. Update Codex and remove only CODEX_HOME/models_cache.json, then reconnect.")
        } finally {
            await session.disconnect()
        }
    })

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
                effort: "another-effort",
                summary: "auto"
            })
            expect(firstTurn).toBe("turn-1")
            expect(secondTurn).toBe("turn-2")
            expect((requestWithMethod(transport, "turn/start").params as JsonObject).threadId)
                .toBe("thread-1")
            expect(requestWithMethod(transport, "turn/start").params).toMatchObject({
                model: "another-model",
                effort: "another-effort",
                summary: "auto"
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
                "itemStarted",
                "itemCompleted",
                "turnCompleted"
            ]))
            expect(session.activeTurnId).toBeUndefined()
            expect(trace.some(event => event.layer === "rpc")).toBe(true)
            expect(trace.some(event => event.layer === "session")).toBe(true)
            expect(trace.some(event => event.layer === "session"
                && event.phase === "item-start" && event.itemId === "item-1")).toBe(true)
            expect(trace.some(event => event.layer === "session"
                && event.phase === "item-complete" && event.itemId === "item-1")).toBe(true)
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

    it("emits generic lifecycle events for every App Server item type", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            catalog: new ToolCatalog(),
            executor: {execute: vi.fn()} as unknown as ToolExecutor
        })
        const events: CodexSessionEvent[] = []
        session.subscribe(event => events.push(event))

        try {
            await session.connect()
            const items = [
                {
                    type: "dynamicToolCall", id: "dynamic-1", namespace: "daw_project", tool: "set_bpm",
                    arguments: {value: 128}, status: "inProgress"
                },
                {
                    type: "webSearch", id: "web-1", query: "openDAW sidechain routing",
                    action: {type: "search", query: "openDAW sidechain routing"}
                },
                {
                    type: "mcpToolCall", id: "mcp-1", server: "spotify", tool: "search", status: "inProgress",
                    arguments: {query: "Boards of Canada"}
                },
                {type: "futureSuperTool", id: "future-1", foo: "bar"}
            ]
            items.forEach(item => transport.emit({
                method: "item/started",
                params: {threadId: "thread-1", turnId: "turn-1", item}
            }))

            const lifecycle = events.filter((event): event is Extract<CodexSessionEvent, {
                type: "itemStarted"
            }> => event.type === "itemStarted")
            expect(lifecycle).toHaveLength(items.length)
            expect(lifecycle.map(event => event.item)).toEqual(items)
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
            transport.emit({
                method: "item/completed",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    item: {
                        type: "reasoning",
                        id: "reasoning-1",
                        summary: [
                            {type: "summaryText", text: "Inspecting the project…"},
                            {type: "summaryText", text: "Choosing suitable samples…"}
                        ],
                        content: [{type: "reasoningText", text: "hidden completed reasoning"}]
                    }
                }
            })
            transport.emit({
                method: "item/completed",
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    item: {
                        type: "reasoning",
                        id: "reasoning-2",
                        summary: [
                            {type: "summaryText", text: "Inspecting existing state…"},
                            {type: "summaryText", text: "Choosing a safe edit…"}
                        ],
                        content: [{type: "reasoningText", text: "hidden fallback reasoning"}]
                    }
                }
            })

            expect(events.filter(event => event.type === "reasoningSummaryPartAdded")).toEqual([{
                type: "reasoningSummaryPartAdded",
                threadId: "thread-1",
                turnId: "turn-1",
                itemId: "reasoning-1",
                summaryIndex: 0,
                text: ""
            }, {
                type: "reasoningSummaryPartAdded",
                threadId: "thread-1",
                turnId: "turn-1",
                itemId: "reasoning-2",
                summaryIndex: 0,
                text: "Inspecting existing state…"
            }, {
                type: "reasoningSummaryPartAdded",
                threadId: "thread-1",
                turnId: "turn-1",
                itemId: "reasoning-2",
                summaryIndex: 1,
                text: "Choosing a safe edit…"
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
            expect(events).not.toContainEqual(expect.objectContaining({text: "hidden completed reasoning"}))
            expect(events).not.toContainEqual(expect.objectContaining({text: "hidden fallback reasoning"}))
            expect(events.filter(event => "itemId" in event && event.itemId === "reasoning-1"
                && "text" in event && event.text !== "")).toHaveLength(2)
        } finally {
            await session.disconnect()
        }
    })

    it("presents successful void dynamic tools as an explicit acknowledgement", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const catalog = new ToolCatalog()
        const controlApi = {
            resolver: {},
            call: vi.fn(() => null),
            callAsync: vi.fn(async () => null)
        } as unknown as ControlApi
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            catalog,
            executor: new ToolExecutor(controlApi, catalog)
        })
        try {
            await session.connect()
            transport.emit({
                method: "item/tool/call",
                id: 101,
                params: {
                    threadId: "thread-1",
                    turnId: "turn-1",
                    namespace: "daw_project",
                    tool: "set_bpm",
                    arguments: {value: 123}
                }
            })
            await tick()
            expect(transport.sent.at(-1)).toMatchObject({
                id: 101,
                result: {
                    success: true,
                    contentItems: [{type: "inputText", text: "{\"ok\":true}"}]
                }
            })
        } finally {
            await session.disconnect()
        }
    })
})
