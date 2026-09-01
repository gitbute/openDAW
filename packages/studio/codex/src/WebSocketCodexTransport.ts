import type {CodexTransport} from "./CodexTransport"
import {compactTraceMessage, emitCodexTrace, type CodexTraceSink} from "./CodexTrace"
import type {CodexTransportState, RpcMessage, Unsubscribe} from "./types"

export const DEFAULT_CODEX_APP_SERVER_URL = "ws://127.0.0.1:4500"

export type WebSocketFactory = (url: string) => WebSocket

const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error))

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

export class WebSocketCodexTransport implements CodexTransport {
    readonly #url: string
    readonly #socketFactory: WebSocketFactory
    readonly #traceSink: CodexTraceSink | undefined
    readonly #messageListeners = new Set<(message: RpcMessage) => void>()
    readonly #errorListeners = new Set<(error: Error) => void>()
    readonly #stateListeners = new Set<(state: CodexTransportState) => void>()
    #socket: WebSocket | undefined
    #state: CodexTransportState = "disconnected"
    #connectPromise: Promise<void> | undefined
    #connectReject: ((reason?: unknown) => void) | undefined

    constructor(url: string = DEFAULT_CODEX_APP_SERVER_URL,
                socketFactory: WebSocketFactory = target => new WebSocket(target),
                traceSink?: CodexTraceSink) {
        this.#url = url
        this.#socketFactory = socketFactory
        this.#traceSink = traceSink
    }

    get url(): string {return this.#url}

    get state(): CodexTransportState {return this.#state}

    connect(): Promise<void> {
        if (this.#state === "connected") {return Promise.resolve()}
        if (this.#state === "connecting" && this.#connectPromise !== undefined) {
            return this.#connectPromise
        }
        if (this.#state === "closing") {return Promise.reject(new Error("WebSocket transport is closing"))}
        this.#setState("connecting")

        let resolveConnection: () => void = () => {}
        let rejectConnection: (reason?: unknown) => void = () => {}
        const promise = new Promise<void>((resolve, reject) => {
            resolveConnection = resolve
            rejectConnection = reject
        })
        this.#connectPromise = promise
        this.#connectReject = rejectConnection

        let socket: WebSocket
        try {
            socket = this.#socketFactory(this.#url)
        } catch (error) {
            this.#clearConnectionPromise()
            this.#setState("disconnected")
            const cause = asError(error)
            this.#emitError(cause)
            rejectConnection(cause)
            return promise
        }
        this.#socket = socket

        socket.addEventListener("open", () => {
            if (this.#socket !== socket) {return}
            this.#clearConnectionPromise()
            this.#setState("connected")
            resolveConnection()
        })
        socket.addEventListener("message", event => {
            if (this.#socket !== socket) {return}
            this.#receive(event.data)
        })
        socket.addEventListener("error", () => {
            if (this.#socket !== socket) {return}
            const error = new Error("Codex WebSocket transport error")
            this.#emitError(error)
            if (this.#state === "connecting") {
                this.#socket = undefined
                this.#clearConnectionPromise()
                this.#setState("disconnected")
                rejectConnection(error)
            }
        })
        socket.addEventListener("close", event => {
            if (this.#socket !== socket) {return}
            this.#socket = undefined
            if (this.#state === "connecting") {
                const error = new Error(`Codex WebSocket closed before connecting (code ${event.code})`)
                this.#clearConnectionPromise()
                this.#setState("disconnected")
                rejectConnection(error)
                return
            }
            this.#setState("disconnected")
        })
        return promise
    }

    send(message: RpcMessage): void {
        if (this.#state !== "connected" || this.#socket === undefined) {
            throw new Error("WebSocket transport is not connected")
        }
        emitCodexTrace(this.#traceSink, {
            layer: "transport",
            phase: "send",
            direction: "outgoing",
            method: "method" in message ? message.method : undefined,
            rpcId: "id" in message ? message.id : undefined,
            payload: compactTraceMessage(message)
        })
        this.#socket.send(JSON.stringify(message))
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

    async close(): Promise<void> {
        const socket = this.#socket
        if (socket === undefined) {
            this.#setState("disconnected")
            return
        }
        if (this.#state === "connecting") {
            const error = new Error("WebSocket transport closed while connecting")
            const rejectConnection = this.#connectReject
            this.#clearConnectionPromise()
            rejectConnection?.(error)
        }
        this.#setState("closing")
        this.#socket = undefined
        try {
            socket.close()
        } catch (error) {
            this.#emitError(asError(error))
        }
        this.#setState("disconnected")
    }

    #receive(data: unknown): void {
        if (typeof data !== "string") {
            this.#emitError(new Error("Codex App Server WebSocket messages must be text"))
            return
        }
        let message: unknown
        try {
            message = JSON.parse(data)
        } catch (error) {
            this.#emitError(new Error(`Invalid Codex App Server JSON: ${asError(error).message}`))
            return
        }
        if (!isRecord(message)) {
            this.#emitError(new Error("Codex App Server message must be a JSON object"))
            return
        }
        const rpcMessage = message as RpcMessage
        emitCodexTrace(this.#traceSink, {
            layer: "transport",
            phase: "receive",
            direction: "incoming",
            method: "method" in rpcMessage ? rpcMessage.method : undefined,
            rpcId: "id" in rpcMessage ? rpcMessage.id : undefined,
            payload: compactTraceMessage(rpcMessage)
        })
        this.#messageListeners.forEach(listener => {
            try {
                listener(rpcMessage)
            } catch (error) {
                this.#emitError(asError(error))
            }
        })
    }

    #clearConnectionPromise(): void {
        this.#connectPromise = undefined
        this.#connectReject = undefined
    }

    #setState(state: CodexTransportState): void {
        if (this.#state === state) {return}
        this.#state = state
        emitCodexTrace(this.#traceSink, {
            layer: "transport",
            phase: "state",
            payload: {state}
        })
        this.#stateListeners.forEach(listener => {
            try {
                listener(state)
            } catch (error) {
                this.#emitError(asError(error))
            }
        })
    }

    #emitError(error: Error): void {
        emitCodexTrace(this.#traceSink, {
            layer: "transport",
            phase: "error",
            error: error.message
        })
        this.#errorListeners.forEach(listener => {
            try {
                listener(error)
            } catch {
                // Listener failures must not break the transport event loop.
            }
        })
    }
}
