import type {CodexTransport} from "./CodexTransport"
import {CODEX_MODEL_CACHE_DIAGNOSTIC, normalizeCodexErrorMessage} from "./CodexCompatibility"
import {compactTracePayload, emitCodexTrace, type CodexTraceSink} from "./CodexTrace"
import type {
    CodexClientInfo,
    CodexInitializeResponse,
    CodexTransportState,
    JsonObject,
    JsonValue,
    RpcMessage,
    RpcNotification,
    RpcRequest,
    RpcResponse,
    RpcServerRequestHandler,
    RpcServerRequestResult,
    Unsubscribe
} from "./types"

const defaultClientInfo: CodexClientInfo = {
    name: "opendaw",
    title: "openDAW Codex Integration",
    version: "0.0.0"
}

const hasOwn = (value: object, name: string): boolean => Object.prototype.hasOwnProperty.call(value, name)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error))

const errorFromRpc = (error: unknown): Error => {
    if (!isRecord(error)) {return new Error("Codex App Server returned an invalid RPC error")}
    const code = typeof error.code === "number" ? ` (${error.code})` : ""
    const message = normalizeCodexErrorMessage(typeof error.message === "string"
        ? error.message : "Unknown RPC error")
    return new Error(message === CODEX_MODEL_CACHE_DIAGNOSTIC ? message : `${message}${code}`)
}

const errorReply = (code: number, message: string): RpcServerRequestResult => ({
    error: {code, message}
})

type PendingRequest = {
    readonly method: string
    readonly resolve: (value: JsonValue) => void
    readonly reject: (reason: Error) => void
}

export class CodexRpcClient {
    readonly #transport: CodexTransport
    readonly #pending = new Map<number, PendingRequest>()
    readonly #serverRequestHandlers = new Map<string, RpcServerRequestHandler>()
    readonly #notificationListeners = new Set<(notification: RpcNotification) => void>()
    readonly #errorListeners = new Set<(error: Error) => void>()
    readonly #stateListeners = new Set<(state: CodexTransportState) => void>()
    #nextRequestId = 1
    #initialized = false
    #initializeResponse: CodexInitializeResponse | undefined
    #connectPromise: Promise<CodexInitializeResponse> | undefined
    readonly #traceSink: CodexTraceSink | undefined

    constructor(transport: CodexTransport, traceSink?: CodexTraceSink) {
        this.#transport = transport
        this.#traceSink = traceSink
        transport.subscribe(message => this.#onMessage(message))
        transport.subscribeError(error => this.#onTransportError(error))
        transport.subscribeState(state => this.#onTransportState(state))
    }

    get state(): CodexTransportState {return this.#transport.state}

    get isInitialized(): boolean {return this.#initialized}

    async connect(clientInfo: CodexClientInfo = defaultClientInfo): Promise<CodexInitializeResponse> {
        if (this.#initialized && this.#initializeResponse !== undefined) {
            return this.#initializeResponse
        }
        if (this.#connectPromise !== undefined) {return this.#connectPromise}
        const connectPromise = this.#connect(clientInfo)
        this.#connectPromise = connectPromise
        connectPromise.then(
            () => {if (this.#connectPromise === connectPromise) {this.#connectPromise = undefined}},
            () => {if (this.#connectPromise === connectPromise) {this.#connectPromise = undefined}}
        )
        return connectPromise
    }

    async request(method: string, params?: JsonValue): Promise<JsonValue> {
        if (!this.#initialized) {throw new Error("Codex RPC client is not initialized")}
        return this.#request(method, params)
    }

    async disconnect(): Promise<void> {
        this.#initialized = false
        this.#initializeResponse = undefined
        this.#rejectPending(new Error("Codex RPC client disconnected"))
        await this.#transport.close()
    }

    subscribeNotifications(listener: (notification: RpcNotification) => void): Unsubscribe {
        this.#notificationListeners.add(listener)
        return () => this.#notificationListeners.delete(listener)
    }

    subscribeErrors(listener: (error: Error) => void): Unsubscribe {
        this.#errorListeners.add(listener)
        return () => this.#errorListeners.delete(listener)
    }

    subscribeState(listener: (state: CodexTransportState) => void): Unsubscribe {
        this.#stateListeners.add(listener)
        return () => this.#stateListeners.delete(listener)
    }

    registerServerRequestHandler(method: string, handler: RpcServerRequestHandler): Unsubscribe {
        this.#serverRequestHandlers.set(method, handler)
        return () => {
            if (this.#serverRequestHandlers.get(method) === handler) {
                this.#serverRequestHandlers.delete(method)
            }
        }
    }

    async #connect(clientInfo: CodexClientInfo): Promise<CodexInitializeResponse> {
        await this.#transport.connect()
        const result = await this.#request("initialize", {
            clientInfo,
            capabilities: {
                experimentalApi: true,
                requestAttestation: false
            }
        })
        const response = this.#asObject(result, "initialize response")
        this.#transport.send({method: "initialized"})
        this.#initialized = true
        this.#initializeResponse = response
        return response
    }

    #request(method: string, params?: JsonValue): Promise<JsonValue> {
        const id = this.#nextRequestId++
        return new Promise<JsonValue>((resolve, reject) => {
            this.#pending.set(id, {method, resolve, reject})
            emitCodexTrace(this.#traceSink, {
                layer: "rpc",
                phase: "request",
                direction: "outgoing",
                method,
                rpcId: id,
                payload: params ?? null
            })
            try {
                const request: RpcRequest = params === undefined ? {method, id} : {method, id, params}
                this.#transport.send(request)
            } catch (error) {
                this.#pending.delete(id)
                reject(asError(error))
            }
        })
    }

    #onMessage(message: RpcMessage): void {
        if (!isRecord(message)) {
            this.#emitError(new Error("Codex App Server message must be an object"))
            return
        }
        const messageValue = message as Record<string, unknown>
        if (typeof messageValue.method === "string") {
            if (hasOwn(message, "id")) {
                void this.#handleServerRequest(message as unknown as RpcRequest)
            } else {
                this.#notify(message as unknown as RpcNotification)
            }
            return
        }
        if (hasOwn(message, "id")) {
            this.#handleResponse(message as unknown as RpcResponse)
            return
        }
        this.#emitError(new Error("Codex App Server message is neither a request nor a response"))
    }

    #handleResponse(response: RpcResponse): void {
        if (typeof response.id !== "number") {
            this.#emitError(new Error("Codex RPC response id must be numeric"))
            return
        }
        const pending = this.#pending.get(response.id)
        if (pending === undefined) {return}
        this.#pending.delete(response.id)
        if (hasOwn(response, "error")) {
            const error = errorFromRpc(response.error)
            emitCodexTrace(this.#traceSink, {
                layer: "rpc",
                phase: "response",
                direction: "incoming",
                method: pending.method,
                rpcId: response.id,
                error: error.message,
                payload: response.error as JsonValue
            })
            pending.reject(error)
            return
        }
        if (!hasOwn(response, "result")) {
            const error = new Error("Codex RPC response has neither result nor error")
            emitCodexTrace(this.#traceSink, {
                layer: "rpc",
                phase: "error",
                direction: "incoming",
                method: pending.method,
                rpcId: response.id,
                error: error.message,
                payload: response as unknown as JsonValue
            })
            pending.reject(error)
            return
        }
        const result = response.result ?? null
        emitCodexTrace(this.#traceSink, {
            layer: "rpc",
            phase: "response",
            direction: "incoming",
            method: pending.method,
            rpcId: response.id,
            result
        })
        pending.resolve(result)
    }

    async #handleServerRequest(request: RpcRequest): Promise<void> {
        emitCodexTrace(this.#traceSink, {
            layer: "rpc",
            phase: "request",
            direction: "incoming",
            method: request.method,
            rpcId: request.id,
            payload: request.params ?? null
        })
        const handler = this.#serverRequestHandlers.get(request.method)
        if (handler === undefined) {
            this.#sendResponse(request.id, errorReply(-32601, `Method '${request.method}' is not supported`))
            return
        }
        try {
            const result = await handler(request)
            if ("result" in result) {
                emitCodexTrace(this.#traceSink, {
                    layer: "rpc",
                    phase: "response",
                    direction: "outgoing",
                    method: request.method,
                    rpcId: request.id,
                    result: result.result
                })
                this.#sendResponse(request.id, {result: result.result})
            } else if ("error" in result) {
                emitCodexTrace(this.#traceSink, {
                    layer: "rpc",
                    phase: "response",
                    direction: "outgoing",
                    method: request.method,
                    rpcId: request.id,
                    error: result.error.message,
                    payload: result.error.data ?? null
                })
                this.#sendResponse(request.id, {error: result.error})
            } else {
                this.#sendResponse(request.id, errorReply(-32603, "Server request handler returned an invalid result"))
            }
        } catch (error) {
            emitCodexTrace(this.#traceSink, {
                layer: "rpc",
                phase: "error",
                direction: "outgoing",
                method: request.method,
                rpcId: request.id,
                error: asError(error).message
            })
            this.#sendResponse(request.id, errorReply(-32603, asError(error).message))
        }
    }

    #sendResponse(id: number | string, result: RpcServerRequestResult): void {
        try {
            this.#transport.send({id, ...result} as RpcResponse)
        } catch (error) {
            this.#emitError(asError(error))
        }
    }

    #notify(notification: RpcNotification): void {
        emitCodexTrace(this.#traceSink, {
            layer: "rpc",
            phase: "notification",
            direction: "incoming",
            method: notification.method,
            payload: compactTracePayload(notification.method, notification.params)
        })
        this.#notificationListeners.forEach(listener => {
            try {
                listener(notification)
            } catch (error) {
                this.#emitError(asError(error))
            }
        })
    }

    #onTransportError(error: Error): void {
        this.#rejectPending(error)
        this.#initialized = false
        this.#initializeResponse = undefined
        emitCodexTrace(this.#traceSink, {
            layer: "rpc",
            phase: "error",
            error: error.message
        })
        this.#emitError(error)
    }

    #onTransportState(state: CodexTransportState): void {
        if (state === "disconnected") {
            this.#initialized = false
            this.#initializeResponse = undefined
        }
        emitCodexTrace(this.#traceSink, {
            layer: "rpc",
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

    #rejectPending(error: Error): void {
        const pending = [...this.#pending.values()]
        this.#pending.clear()
        pending.forEach(request => request.reject(error))
    }

    #asObject(value: JsonValue, context: string): JsonObject {
        if (!isRecord(value)) {throw new Error(`${context} must be an object`)}
        return value as JsonObject
    }

    #emitError(error: Error): void {
        this.#errorListeners.forEach(listener => {
            try {
                listener(error)
            } catch {
                // Listener failures must not interrupt protocol processing.
            }
        })
    }
}
