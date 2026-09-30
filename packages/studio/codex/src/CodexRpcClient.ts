import {isDefined, Optional, tryCatch} from "@opendaw/lib-std"
import type {CodexTransport} from "./CodexTransport"
import {CodexJson} from "./CodexJson"
import {CODEX_MODEL_CACHE_DIAGNOSTIC, normalizeCodexErrorMessage} from "./CodexCompatibility"
import {compactTracePayload, emitCodexTrace, redactTraceValue, type CodexTraceSink} from "./CodexTrace"
import type {
    CodexClientInfo,
    CodexInitializeResponse,
    CodexTransportState,
    JsonObject,
    JsonValue,
    RpcError,
    RpcId,
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

const {asError, hasOwn} = CodexJson

const errorFromRpc = (error: unknown): Error => {
    if (!CodexJson.isObjectRecord(error)) {return new Error("Codex App Server returned an invalid RPC error")}
    const code = typeof error.code === "number" ? ` (${error.code})` : ""
    const message = normalizeCodexErrorMessage(typeof error.message === "string"
        ? error.message : "Unknown RPC error")
    return new Error(message === CODEX_MODEL_CACHE_DIAGNOSTIC ? message : `${message}${code}`)
}

const errorReply = (code: number, message: string): RpcServerRequestResult => ({
    error: {code, message}
})

const isErrorResult = (result: RpcServerRequestResult): result is {readonly error: RpcError} => hasOwn(result, "error")

const isSuccessResult = (result: RpcServerRequestResult): result is {readonly result: JsonValue} =>
    hasOwn(result, "result")

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
    #initializeResponse: Optional<CodexInitializeResponse>
    #connectPromise: Optional<Promise<CodexInitializeResponse>>
    readonly #traceSink: Optional<CodexTraceSink>

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
        if (this.#initialized && isDefined(this.#initializeResponse)) {
            return this.#initializeResponse
        }
        if (isDefined(this.#connectPromise)) {return this.#connectPromise}
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
            const request: RpcRequest = isDefined(params) ? {method, id, params} : {method, id}
            const sent = tryCatch(() => this.#transport.send(request))
            if (sent.status === "failure") {
                this.#pending.delete(id)
                reject(asError(sent.error))
            }
        })
    }

    #onMessage(message: RpcMessage): void {
        if (!CodexJson.isObjectRecord(message)) {
            this.#emitError(new Error("Codex App Server message must be an object"))
            return
        }
        if (CodexJson.isRpcRequest(message)) {
            void this.#handleServerRequest(message)
            return
        }
        if (CodexJson.isRpcNotification(message)) {
            this.#notify(message)
            return
        }
        if (CodexJson.isRpcResponse(message)) {
            this.#handleResponse(message)
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
        if (!isDefined(pending)) {return}
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
                payload: redactTraceValue(response.error)
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
                payload: redactTraceValue(response)
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
        if (!isDefined(handler)) {
            this.#sendResponse(request.id, errorReply(-32601, `Method '${request.method}' is not supported`))
            return
        }
        const outcome = await Promise.resolve().then(() => handler(request))
            .then(result => ({ok: true as const, result}), (error: unknown) => ({ok: false as const, error}))
        if (outcome.ok) {
            const {result} = outcome
            if (isSuccessResult(result)) {
                emitCodexTrace(this.#traceSink, {
                    layer: "rpc",
                    phase: "response",
                    direction: "outgoing",
                    method: request.method,
                    rpcId: request.id,
                    result: result.result
                })
                this.#sendResponse(request.id, {result: result.result})
            } else if (isErrorResult(result)) {
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
            return
        }
        const message = asError(outcome.error).message
        emitCodexTrace(this.#traceSink, {
            layer: "rpc",
            phase: "error",
            direction: "outgoing",
            method: request.method,
            rpcId: request.id,
            error: message
        })
        this.#sendResponse(request.id, errorReply(-32603, message))
    }

    #sendResponse(id: RpcId, result: RpcServerRequestResult): void {
        const sent = tryCatch(() => this.#transport.send({id, ...result}))
        if (sent.status === "failure") {this.#emitError(asError(sent.error))}
    }

    #notify(notification: RpcNotification): void {
        emitCodexTrace(this.#traceSink, {
            layer: "rpc",
            phase: "notification",
            direction: "incoming",
            method: notification.method,
            payload: compactTracePayload(notification.method, notification.params)
        })
        this.#notificationListeners.forEach(listener => this.#guard(() => listener(notification)))
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
        this.#stateListeners.forEach(listener => this.#guard(() => listener(state)))
    }

    #rejectPending(error: Error): void {
        const pending = [...this.#pending.values()]
        this.#pending.clear()
        pending.forEach(request => request.reject(error))
    }

    #asObject(value: JsonValue, context: string): JsonObject {
        if (!CodexJson.isJsonObject(value)) {throw new Error(`${context} must be an object`)}
        return value
    }

    #guard(procedure: () => void): void {
        const result = tryCatch(procedure)
        if (result.status === "failure") {this.#emitError(asError(result.error))}
    }

    #emitError(error: Error): void {
        this.#errorListeners.forEach(listener => tryCatch(() => listener(error)))
    }

}
