import {describe, expect, it, vi} from "vitest"
import {ToolCatalog, ToolExecutor} from "@opendaw/studio-core"
import type {ControlApi, JsonObject, JsonValue} from "@opendaw/studio-core"
import {CodexRpcClient} from "./CodexRpcClient"
import {CodexSession} from "./CodexSession"
import type {CodexTransport} from "./CodexTransport"
import type {
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
                transport.emit({
                    method: "thread/started",
                    params: {thread: {id: "thread-1", sessionId: "session-1"}}
                })
                transport.emit(response(message, {thread: {id: "thread-1", sessionId: "session-1"}}))
                break
            case "thread/resume":
                transport.emit(response(message, {thread: {id: "thread-1", sessionId: "session-1"}}))
                break
            case "turn/start": {
                const input = message.params as JsonObject
                const turnNumber = Array.isArray(input.input) && input.input[0] !== undefined
                    ? transport.sent.filter(candidate => isRequest(candidate) && candidate.method === "turn/start").length
                    : 0
                const id = `turn-${turnNumber}`
                transport.emit({
                    method: "turn/started",
                    params: {threadId: "thread-1", turn: {id}}
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
        const session = new CodexSession({
            rpc: new CodexRpcClient(transport),
            catalog,
            executor,
            serviceName: "openDAW-test",
            developerInstructions: "Operate the current openDAW project as a producer."
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
            const secondTurn = await session.startTurn("Adjust the pattern.")
            expect(firstTurn).toBe("turn-1")
            expect(secondTurn).toBe("turn-2")
            expect((requestWithMethod(transport, "turn/start").params as JsonObject).threadId)
                .toBe("thread-1")
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

            await session.startTurn("One more change.")
            await session.interruptTurn()
            expect(requestWithMethod(transport, "turn/interrupt").params).toEqual({
                threadId: "thread-1", turnId: "turn-3"
            })
        } finally {
            await session.disconnect()
        }
    })
})
