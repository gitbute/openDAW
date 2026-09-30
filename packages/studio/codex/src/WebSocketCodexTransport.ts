import {isDefined, Optional, tryCatch} from "@opendaw/lib-std"
import type {CodexTransport} from "./CodexTransport"
import {CodexJson} from "./CodexJson"
import {compactTraceMessage, emitCodexTrace, type CodexTraceSink} from "./CodexTrace"
import type {CodexTransportState, RpcMessage, Unsubscribe} from "./types"

export const DEFAULT_CODEX_APP_SERVER_URL = "ws://127.0.0.1:4500"

export type WebSocketFactory = (url: string) => WebSocket

const {asError} = CodexJson

export class WebSocketCodexTransport implements CodexTransport {
    readonly #url: string
    readonly #socketFactory: WebSocketFactory
    readonly #traceSink: Optional<CodexTraceSink>
    readonly #messageListeners = new Set<(message: RpcMessage) => void>()
    readonly #errorListeners = new Set<(error: Error) => void>()
    readonly #stateListeners = new Set<(state: CodexTransportState) => void>()
    #socket: Optional<WebSocket>
    #state: CodexTransportState = "disconnected"
    #connectPromise: Optional<Promise<void>>
    #connectReject: Optional<(reason?: unknown) => void>

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
        if (this.#state === "connecting" && isDefined(this.#connectPromise)) {
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
        const created = tryCatch(() => this.#socketFactory(this.#url))
        if (created.status === "failure") {
            this.#clearConnectionPromise()
            this.#setState("disconnected")
            const cause = asError(created.error)
            this.#emitError(cause)
            rejectConnection(cause)
            return promise
        }
        const socket = created.value
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
        if (this.#state !== "connected" || !isDefined(this.#socket)) {
            throw new Error("WebSocket transport is not connected")
        }
        emitCodexTrace(this.#traceSink, {
            layer: "transport",
            phase: "send",
            direction: "outgoing",
            method: CodexJson.methodOf(message),
            rpcId: CodexJson.idOf(message),
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
        if (!isDefined(socket)) {
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
        const closed = tryCatch(() => socket.close())
        if (closed.status === "failure") {this.#emitError(asError(closed.error))}
        this.#setState("disconnected")
    }

    #receive(data: unknown): void {
        if (typeof data !== "string") {
            this.#emitError(new Error("Codex App Server WebSocket messages must be text"))
            return
        }
        const parsed = tryCatch((): unknown => JSON.parse(data))
        if (parsed.status === "failure") {
            this.#emitError(new Error(`Invalid Codex App Server JSON: ${asError(parsed.error).message}`))
            return
        }
        const message = parsed.value
        if (!CodexJson.isRpcMessage(message)) {
            this.#emitError(new Error("Codex App Server message must be a JSON object"))
            return
        }
        emitCodexTrace(this.#traceSink, {
            layer: "transport",
            phase: "receive",
            direction: "incoming",
            method: CodexJson.methodOf(message),
            rpcId: CodexJson.idOf(message),
            payload: compactTraceMessage(message)
        })
        this.#messageListeners.forEach(listener => this.#guard(() => listener(message)))
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
        this.#stateListeners.forEach(listener => this.#guard(() => listener(state)))
    }

    #guard(procedure: () => void): void {
        const result = tryCatch(procedure)
        if (result.status === "failure") {this.#emitError(asError(result.error))}
    }

    #emitError(error: Error): void {
        emitCodexTrace(this.#traceSink, {
            layer: "transport",
            phase: "error",
            error: error.message
        })
        this.#errorListeners.forEach(listener => tryCatch(() => listener(error)))

    }
}
