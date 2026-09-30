import {describe, expect, it, vi} from "vitest"
import type {Optional} from "@opendaw/lib-std"
import {AgentToolResult} from "./AgentTool"
import type {AgentTool, AgentToolbox} from "./AgentTool"
import {CodexRpcClient} from "./CodexRpcClient"
import {CodexSession} from "./CodexSession"
import type {CodexTransport} from "./CodexTransport"
import type {CodexTraceEvent} from "./CodexTrace"
import type {
    CodexSessionEvent,
    CodexTransportState,
    JsonObject,
    JsonValue,
    RpcMessage,
    RpcRequest,
    RpcResponse,
    Unsubscribe
} from "./types"

const isRequest = (message: RpcMessage): message is RpcRequest =>
    "method" in message && "id" in message

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

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
                        isDefault: false,
                        inputModalities: ["text", "image", "video"]
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
            case "thread/unsubscribe":
                transport.emit(response(message, {}))
                break
        }
    }
}

const emptySchema: JsonObject = {type: "object", properties: {}, additionalProperties: false}

const agentTool = (name: string, execute: AgentTool["execute"], inputSchema: JsonObject = emptySchema): AgentTool =>
    ({name, description: `Test tool ${name}.`, inputSchema, execute})

const toolbox = (namespace: string, tools: ReadonlyArray<AgentTool>): AgentToolbox =>
    ({namespace, description: `Test namespace ${namespace}.`, tools})

const toolCall = (id: number, namespace: string, tool: string, args: JsonValue = {}): RpcRequest => ({
    method: "item/tool/call",
    id,
    params: {threadId: "thread-1", turnId: "turn-1", callId: `call-${id}`, namespace, tool, arguments: args}
})

const replyTo = (transport: FakeTransport, id: number): Optional<RpcMessage> =>
    transport.sent.findLast(message => "id" in message && message.id === id && !("method" in message))

const deferred = <T>() => {
    let resolve: (value: T) => void = () => {}
    const promise = new Promise<T>(resolver => {resolve = resolver})
    return {promise, resolve}
}

const pngDataUrl = "data:image/png;base64,iVBORw0KGgo="

describe("CodexSession", () => {
    it("dispatches tool calls to the tool matching namespace and name", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const inspect = vi.fn(async (args: JsonObject) => AgentToolResult.json({inspected: args.unit ?? null}))
        const edit = vi.fn(async () => AgentToolResult.text("edited"))
        const otherInspect = vi.fn(async () => AgentToolResult.text("wrong namespace"))
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [
                toolbox("daw_inspect", [agentTool("inspect", inspect), agentTool("edit", edit)]),
                toolbox("daw_other", [agentTool("inspect", otherInspect)])
            ]
        })
        try {
            await session.connect()
            transport.emit(toolCall(11, "daw_inspect", "inspect", {unit: "Bass"}))
            await tick()
            expect(inspect).toHaveBeenCalledWith({unit: "Bass"})
            expect(otherInspect).not.toHaveBeenCalled()
            expect(replyTo(transport, 11)).toEqual({
                id: 11,
                result: {success: true, contentItems: [{type: "inputText", text: "{\"inspected\":\"Bass\"}"}]}
            })
            transport.emit(toolCall(12, "daw_inspect", "edit"))
            await tick()
            expect(edit).toHaveBeenCalledTimes(1)
            expect(replyTo(transport, 12)).toMatchObject({result: {success: true}})
        } finally {
            await session.disconnect()
        }
    })

    it("fails unknown tools and malformed calls without executing anything", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const execute = vi.fn(async () => AgentToolResult.text("ok"))
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [agentTool("known", execute)])]
        })
        try {
            await session.connect()
            transport.emit(toolCall(21, "daw", "missing"))
            transport.emit(toolCall(22, "elsewhere", "known"))
            transport.emit(toolCall(23, "daw", "known", ["not", "an", "object"]))
            transport.emit({method: "item/tool/call", id: 24, params: {namespace: "daw", arguments: {}}})
            await tick()
            await tick()
            expect(replyTo(transport, 21)).toEqual({
                id: 21,
                result: {success: false, contentItems: [{type: "inputText", text: "Unknown tool 'daw.missing'"}]}
            })
            expect(replyTo(transport, 22)).toMatchObject({
                result: {success: false, contentItems: [{text: "Unknown tool 'elsewhere.known'"}]}
            })
            expect(replyTo(transport, 23)).toMatchObject({
                result: {success: false, contentItems: [{text: "Dynamic tool call arguments must be an object"}]}
            })
            expect(replyTo(transport, 24)).toMatchObject({
                result: {success: false, contentItems: [{text: "Dynamic tool call requires a tool name"}]}
            })
            expect(execute).not.toHaveBeenCalled()
        } finally {
            await session.disconnect()
        }
    })

    it("turns rejected and synchronously thrown tool executions into failure results", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [
                agentTool("rejects", async () => {throw new Error("async failure")}),
                agentTool("throws", () => {throw new Error("sync failure")}),
                agentTool("works", async () => AgentToolResult.text("still alive"))
            ])]
        })
        try {
            await session.connect()
            transport.emit(toolCall(31, "daw", "rejects"))
            transport.emit(toolCall(32, "daw", "throws"))
            transport.emit(toolCall(33, "daw", "works"))
            await tick()
            await tick()
            expect(replyTo(transport, 31)).toEqual({
                id: 31,
                result: {success: false, contentItems: [{type: "inputText", text: "async failure"}]}
            })
            expect(replyTo(transport, 32)).toEqual({
                id: 32,
                result: {success: false, contentItems: [{type: "inputText", text: "sync failure"}]}
            })
            expect(replyTo(transport, 33)).toMatchObject({
                result: {success: true, contentItems: [{type: "inputText", text: "still alive"}]}
            })
            expect(transport.sent.some(message => "error" in message)).toBe(false)
        } finally {
            await session.disconnect()
        }
    })

    it("serialises tool calls so a fast call only starts after a slow one completed", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const order: Array<string> = []
        const slow = deferred<AgentToolResult>()
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [
                agentTool("slow", () => {
                    order.push("slow:start")
                    return slow.promise.then(result => {
                        order.push("slow:end")
                        return result
                    })
                }),
                agentTool("fast", async () => {
                    order.push("fast:start")
                    return AgentToolResult.text("fast")
                })
            ])]
        })
        try {
            await session.connect()
            transport.emit(toolCall(41, "daw", "slow"))
            transport.emit(toolCall(42, "daw", "fast"))
            await tick()
            await tick()
            expect(order).toEqual(["slow:start"])
            expect(replyTo(transport, 41)).toBeUndefined()
            expect(replyTo(transport, 42)).toBeUndefined()
            slow.resolve(AgentToolResult.text("slow"))
            await tick()
            await tick()
            expect(order).toEqual(["slow:start", "slow:end", "fast:start"])
            const replies = transport.sent.filter(message => "id" in message && !("method" in message))
                .map(message => "id" in message ? message.id : undefined)
            expect(replies.slice(-2)).toEqual([41, 42])
        } finally {
            await session.disconnect()
        }
    })

    it("keeps the queue running after a failing call", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [
                agentTool("broken", () => Promise.reject(new Error("broken"))),
                agentTool("fine", async () => AgentToolResult.text("fine"))
            ])]
        })
        try {
            await session.connect()
            transport.emit(toolCall(51, "daw", "broken"))
            transport.emit(toolCall(52, "daw", "fine"))
            await tick()
            await tick()
            expect(replyTo(transport, 51)).toMatchObject({result: {success: false}})
            expect(replyTo(transport, 52)).toMatchObject({result: {success: true}})
        } finally {
            await session.disconnect()
        }
    })

    it("runs concurrent tools immediately while serial tools stay queued behind each other", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const order: Array<string> = []
        const mutate = deferred<AgentToolResult>()
        const audition = deferred<AgentToolResult>()
        const tracked = (name: string, gate: Promise<AgentToolResult>, concurrent?: boolean): AgentTool => ({
            ...agentTool(name, () => {
                order.push(`${name}:start`)
                return gate.then(result => {
                    order.push(`${name}:end`)
                    return result
                })
            }),
            ...(concurrent === true ? {concurrent} : {})
        })
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [
                tracked("mutate", mutate.promise),
                tracked("audition", audition.promise, true),
                agentTool("inspect", async () => {
                    order.push("inspect:start")
                    return AgentToolResult.text("inspected")
                }),
                {...agentTool("reference", async () => {
                    order.push("reference:start")
                    return AgentToolResult.text("reference")
                }), concurrent: true}
            ])]
        })
        try {
            await session.connect()
            transport.emit(toolCall(71, "daw", "mutate"))
            transport.emit(toolCall(72, "daw", "audition"))
            transport.emit(toolCall(73, "daw", "inspect"))
            transport.emit(toolCall(74, "daw", "reference"))
            await tick()
            await tick()
            expect([...order].sort()).toEqual(["audition:start", "mutate:start", "reference:start"])
            expect(replyTo(transport, 74)).toMatchObject({result: {success: true}})
            expect(replyTo(transport, 73), "a serial tool waits for the running serial tool").toBeUndefined()
            audition.resolve(AgentToolResult.text("heard"))
            await tick()
            expect(replyTo(transport, 72)).toMatchObject({result: {success: true}})
            expect(replyTo(transport, 71)).toBeUndefined()
            expect(order).not.toContain("inspect:start")
            mutate.resolve(AgentToolResult.text("mutated"))
            await tick()
            await tick()
            expect(order.slice(3)).toEqual(["audition:end", "mutate:end", "inspect:start"])
            expect(replyTo(transport, 73)).toMatchObject({result: {success: true}})
        } finally {
            await session.disconnect()
        }
    })

    it("queues calls to unknown tools and malformed calls like serial tools", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const slow = deferred<AgentToolResult>()
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [agentTool("slow", () => slow.promise)])]
        })
        try {
            await session.connect()
            transport.emit(toolCall(81, "daw", "slow"))
            transport.emit(toolCall(82, "daw", "missing"))
            await tick()
            expect(replyTo(transport, 82)).toBeUndefined()
            slow.resolve(AgentToolResult.text("done"))
            await tick()
            await tick()
            expect(replyTo(transport, 82)).toMatchObject({result: {success: false}})
        } finally {
            await session.disconnect()
        }
    })

    it("passes image content through for image-capable models and strips it for text-only models", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const withMedia = async (): Promise<AgentToolResult> => ({
            ok: true,
            content: [
                {type: "inputText", text: "piano roll"},
                {type: "inputImage", imageUrl: pngDataUrl},
                {type: "inputAudio", audioUrl: "data:audio/wav;base64,UklGRg=="}
            ]
        })
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [agentTool("render", withMedia)])]
        })
        try {
            await session.connect()
            transport.emit(toolCall(61, "daw", "render"))
            await tick()
            expect(replyTo(transport, 61)).toMatchObject({
                result: {contentItems: [{type: "inputText"}, {type: "inputImage"}, {type: "inputAudio"}]}
            })
            await session.listModels()
            await session.startThread({model: "another-model"})
            expect(session.activeModel).toBe("another-model")
            transport.emit(toolCall(62, "daw", "render"))
            await tick()
            expect(replyTo(transport, 62)).toEqual({
                id: 62,
                result: {
                    success: true,
                    contentItems: [
                        {type: "inputText", text: "piano roll"},
                        {type: "inputImage", imageUrl: pngDataUrl},
                        {
                            type: "inputText",
                            text: "[1 audio attachment omitted: the active model does not accept audio input]"
                        }
                    ]
                }
            })
            await session.startTurn("Use the text-only model.", {model: "dynamic-model"})
            transport.emit(toolCall(63, "daw", "render"))
            await tick()
            expect(replyTo(transport, 63)).toEqual({
                id: 63,
                result: {
                    success: true,
                    contentItems: [
                        {type: "inputText", text: "piano roll"},
                        {
                            type: "inputText",
                            text: "[1 image attachment omitted: the active model does not accept image input]\n"
                                + "[1 audio attachment omitted: the active model does not accept audio input]"
                        }
                    ]
                }
            })
        } finally {
            await session.disconnect()
        }
    })

    it("uses the default listed model for gating when no model was chosen", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            toolboxes: [toolbox("daw", [agentTool("image", async () =>
                AgentToolResult.withImages(AgentToolResult.text("image"), [pngDataUrl, pngDataUrl]))])]
        })
        try {
            await session.connect()
            await session.listModels()
            await session.startThread()
            transport.emit(toolCall(71, "daw", "image"))
            await tick()
            expect(replyTo(transport, 71)).toMatchObject({
                result: {
                    contentItems: [
                        {type: "inputText", text: "image"},
                        {type: "inputText", text: "[2 image attachments omitted: the active model does not accept image input]"}
                    ]
                }
            })
        } finally {
            await session.disconnect()
        }
    })

    it("rejects toolboxes with invalid schemas before owning the rpc client", () => {
        const transport = new FakeTransport()
        const rpc = new CodexRpcClient(transport)
        const open: JsonObject = {type: "object", properties: {value: {type: "number"}}}
        expect(() => new CodexSession({rpc, toolboxes: [toolbox("daw", [agentTool("open", vi.fn(), open)])]}))
            .toThrow(/additionalProperties=false/)
        expect(() => new CodexSession({rpc, toolboxes: []})).not.toThrow()
    })

    it("deduplicates the incompatible Codex model-cache diagnostic", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({rpc: new CodexRpcClient(transport), toolboxes: []})
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

    it("drops the account record when the server reports a logout", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({rpc: new CodexRpcClient(transport), toolboxes: []})
        try {
            await session.connect()
            await session.readAccount()
            transport.emit({method: "account/updated", params: {authMode: null, planType: null}})
            expect(session.account.state).toMatchObject({account: null, authMode: null, email: null, requiresOpenaiAuth: true})
        } finally {
            await session.disconnect()
        }
    })

    it("composes account, models, thread, turns and toolbox tool calls", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const calls: Array<JsonObject> = []
        const setBpm = agentTool("set_bpm", async args => {
            calls.push(args)
            return AgentToolResult.json("ok")
        }, {type: "object", properties: {value: {type: "number"}}, required: ["value"], additionalProperties: false})
        const trace: Array<CodexTraceEvent> = []
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport, event => trace.push(event)),
            toolboxes: [toolbox("daw_project", [setBpm])],
            serviceName: "openDAW-test",
            developerInstructions: "Operate the current openDAW project as a producer.",
            traceSink: event => trace.push(event)
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
                    isDefault: true,
                    inputModalities: ["text"]
                },
                {
                    id: "model-2",
                    model: "another-model",
                    displayName: "Another model",
                    description: "Another visible model.",
                    hidden: false,
                    supportedReasoningEfforts: [{reasoningEffort: "another-effort", description: "Another effort"}],
                    defaultReasoningEffort: "another-effort",
                    isDefault: false,
                    inputModalities: ["text", "image"]
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
            expect(calls).toEqual([{value: 90}])

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
        const session = new CodexSession({rpc: new CodexRpcClient(transport), toolboxes: []})
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

    it("reports subagent threads without taking over the owned thread or its active turn", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({rpc: new CodexRpcClient(transport), toolboxes: []})
        const events: CodexSessionEvent[] = []
        session.subscribe(event => events.push(event))
        try {
            await session.connect()
            await session.startThread()
            const turnId = await session.startTurn("Research a bassline")
            transport.emit({
                method: "thread/started",
                params: {
                    thread: {
                        id: "child-1", sessionId: "session-1", parentThreadId: "thread-1", agentNickname: "Euclid",
                        agentRole: "explorer",
                        source: {subAgent: {thread_spawn: {parent_thread_id: "thread-1", depth: 1, agent_path: "root/bass_design"}}}
                    }
                }
            })
            transport.emit({method: "turn/started", params: {threadId: "child-1", turn: {id: "child-turn"}}})
            expect(events.filter(event => event.type === "subagentStarted")).toEqual([{
                type: "subagentStarted",
                agent: {threadId: "child-1", parentThreadId: "thread-1", nickname: "Euclid", role: "explorer", path: "root/bass_design"}
            }])
            expect(events.some(event => event.type === "error")).toBe(false)
            expect(session.threadId).toBe("thread-1")
            expect(session.activeTurnId).toBe(turnId)
            await session.closeThread()
            expect(session.threadId).toBeUndefined()
            expect(session.activeTurnId).toBeUndefined()
            expect(requestWithMethod(transport, "thread/unsubscribe").params).toEqual({threadId: "thread-1"})
            await session.startThread()
            expect(session.threadId).toBe("thread-2")
        } finally {
            await session.disconnect()
        }
    })

    it("normalizes readable reasoning summaries and ignores raw reasoning text", async () => {
        const transport = new FakeTransport()
        installServer(transport)
        const session = new CodexSession({rpc: new CodexRpcClient(transport), toolboxes: []})
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
})
