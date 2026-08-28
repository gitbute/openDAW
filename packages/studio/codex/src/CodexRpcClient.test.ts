import {describe, expect, it} from "vitest"
import {CodexRpcClient} from "./CodexRpcClient"
import type {CodexTransport} from "./CodexTransport"
import type {
    CodexTransportState,
    JsonValue,
    RpcMessage,
    RpcNotification,
    RpcRequest,
    Unsubscribe
} from "./types"

const isRequest = (message: RpcMessage): message is RpcRequest =>
    "method" in message && "id" in message

const tick = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
}

class FakeTransport implements CodexTransport {
    readonly sent: RpcMessage[] = []
    readonly #messageListeners = new Set<(message: RpcMessage) => void>()
    readonly #errorListeners = new Set<(error: Error) => void>()
    readonly #stateListeners = new Set<(state: CodexTransportState) => void>()
    #state: CodexTransportState = "disconnected"

    get state(): CodexTransportState {return this.#state}

    async connect(): Promise<void> {
        this.#setState("connecting")
        this.#setState("connected")
    }

    send(message: RpcMessage): void {this.sent.push(message)}

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

    emit(message: RpcMessage): void {this.#messageListeners.forEach(listener => listener(message))}

    emitError(error: Error): void {this.#errorListeners.forEach(listener => listener(error))}

    #setState(state: CodexTransportState): void {
        this.#state = state
        this.#stateListeners.forEach(listener => listener(state))
    }
}

const initialize = async (client: CodexRpcClient, transport: FakeTransport): Promise<void> => {
    const connected = client.connect({name: "test", title: "Test", version: "1.0.0"})
    await tick()
    const request = transport.sent[0]
    if (!isRequest(request)) {throw new Error("Expected initialize request")}
    transport.emit({
        id: request.id,
        result: {
            userAgent: "codex-test",
            codexHome: "C:/codex",
            platformFamily: "windows",
            platformOs: "windows"
        }
    })
    await connected
}

describe("CodexRpcClient", () => {
    it("initializes before any other request and opts into experimental APIs", async () => {
        const transport = new FakeTransport()
        const client = new CodexRpcClient(transport)

        await initialize(client, transport)

        expect(transport.sent[0]).toEqual({
            method: "initialize",
            id: 1,
            params: {
                clientInfo: {name: "test", title: "Test", version: "1.0.0"},
                capabilities: {experimentalApi: true, requestAttestation: false}
            }
        })
        expect(transport.sent[1]).toEqual({method: "initialized"})
    })

    it("correlates out-of-order responses and rejects matching RPC errors", async () => {
        const transport = new FakeTransport()
        const client = new CodexRpcClient(transport)
        await initialize(client, transport)

        const first = client.request("first", {value: 1})
        const second = client.request("second", {value: 2})
        const firstRequest = transport.sent[2]
        const secondRequest = transport.sent[3]
        if (!isRequest(firstRequest) || !isRequest(secondRequest)) {throw new Error("Expected requests")}
        transport.emit({id: secondRequest.id, result: "second result"})
        transport.emit({id: firstRequest.id, result: "first result"})
        await expect(first).resolves.toBe("first result")
        await expect(second).resolves.toBe("second result")

        const rejected = client.request("failure")
        const rejectedRequest = transport.sent[4]
        if (!isRequest(rejectedRequest)) {throw new Error("Expected rejected request")}
        transport.emit({id: rejectedRequest.id, error: {code: -32000, message: "nope"}})
        await expect(rejected).rejects.toThrow("nope (-32000)")
    })

    it("delivers notifications and answers server requests with the original id", async () => {
        const transport = new FakeTransport()
        const client = new CodexRpcClient(transport)
        await initialize(client, transport)
        const received: RpcNotification[] = []
        client.subscribeNotifications(notification => received.push(notification))

        client.registerServerRequestHandler("item/tool/call", () => ({result: {accepted: true}}))
        transport.emit({method: "warning", params: {message: "hello"}})
        transport.emit({
            method: "item/tool/call",
            id: 77,
            params: {namespace: "daw_project", tool: "set_bpm", arguments: {value: 120}}
        })
        await tick()

        expect(received).toEqual([{method: "warning", params: {message: "hello"}}])
        expect(transport.sent.at(-1)).toEqual({id: 77, result: {accepted: true}})

        transport.emit({method: "unknown/server/request", id: 78, params: null})
        await tick()
        expect(transport.sent.at(-1)).toEqual({
            id: 78,
            error: {code: -32601, message: "Method 'unknown/server/request' is not supported"}
        })
    })

    it("rejects pending requests when the transport disconnects", async () => {
        const transport = new FakeTransport()
        const client = new CodexRpcClient(transport)
        await initialize(client, transport)
        const pending = client.request("long_running")
        transport.emitError(new Error("socket lost"))
        await expect(pending).rejects.toThrow("socket lost")
    })
})
