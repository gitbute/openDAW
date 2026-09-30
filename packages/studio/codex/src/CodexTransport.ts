import type {RpcMessage, CodexTransportState, Unsubscribe} from "./types"

export interface CodexTransport {
    readonly state: CodexTransportState
    connect(): Promise<void>
    send(message: RpcMessage): void
    subscribe(listener: (message: RpcMessage) => void): Unsubscribe
    subscribeError(listener: (error: Error) => void): Unsubscribe
    subscribeState(listener: (state: CodexTransportState) => void): Unsubscribe
    close(): Promise<void>
}
