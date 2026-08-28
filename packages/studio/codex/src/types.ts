export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | ReadonlyArray<JsonValue> | JsonObject
export type JsonObject = {readonly [key: string]: JsonValue}

export type RpcId = number | string

export type RpcError = {
    readonly code: number
    readonly message: string
    readonly data?: JsonValue
}

export type RpcRequest = {
    readonly method: string
    readonly id: RpcId
    readonly params?: JsonValue
}

export type RpcNotification = {
    readonly method: string
    readonly params?: JsonValue
}

export type RpcResponse = {
    readonly id: RpcId
    readonly result?: JsonValue
    readonly error?: RpcError
}

export type RpcMessage = RpcRequest | RpcNotification | RpcResponse

export type RpcServerRequestResult =
    | {readonly result: JsonValue}
    | {readonly error: RpcError}

export type RpcServerRequestHandler =
    (request: RpcRequest) => RpcServerRequestResult | Promise<RpcServerRequestResult>

export type Unsubscribe = () => void

export type CodexTransportState = "disconnected" | "connecting" | "connected" | "closing"

export type CodexClientInfo = {
    readonly name: string
    readonly title: string | null
    readonly version: string
}

export type CodexInitializeResponse = JsonObject

export type CodexAccountRecord = {
    readonly type: string
    readonly email: string | null
    readonly planType: string | null
}

export type CodexAccountState = {
    readonly account: CodexAccountRecord | null
    readonly exists: boolean
    readonly accountType: string | null
    readonly authMode: string | null
    readonly email: string | null
    readonly planType: string | null
    readonly requiresOpenaiAuth: boolean
}

export type CodexAccountEvent =
    | {readonly type: "changed", readonly state: CodexAccountState}
    | {
        readonly type: "loginCompleted"
        readonly loginId: string | null
        readonly success: boolean
        readonly error: string | null
    }

export type CodexLogin = {
    readonly loginId: string
    readonly authUrl: string
}

export type CodexDynamicFunctionTool = {
    readonly type: "function"
    readonly name: string
    readonly description: string
    readonly inputSchema: JsonValue
    readonly deferLoading: boolean
}

export type CodexDynamicNamespaceTool = CodexDynamicFunctionTool

export type CodexDynamicNamespace = {
    readonly type: "namespace"
    readonly name: string
    readonly description: string
    readonly tools: ReadonlyArray<CodexDynamicNamespaceTool>
}

export type CodexDynamicTool = CodexDynamicNamespace

export type CodexDynamicToolCallContentItem = {
    readonly type: "inputText"
    readonly text: string
}

export type CodexDynamicToolCallResponse = {
    readonly contentItems: ReadonlyArray<CodexDynamicToolCallContentItem>
    readonly success: boolean
}

export type CodexThreadInfo = {
    readonly threadId: string
    readonly sessionId: string | null
}

export type CodexStartThreadOptions = {
    readonly model?: string
}

export type CodexSessionEvent =
    | {readonly type: "connectionChanged", readonly state: CodexTransportState}
    | {readonly type: "accountChanged", readonly state: CodexAccountState}
    | {
        readonly type: "loginCompleted"
        readonly loginId: string | null
        readonly success: boolean
        readonly error: string | null
    }
    | {readonly type: "threadStarted", readonly thread: CodexThreadInfo}
    | {readonly type: "threadResumed", readonly thread: CodexThreadInfo}
    | {readonly type: "turnStarted", readonly threadId: string, readonly turnId: string}
    | {
        readonly type: "agentTextDelta"
        readonly threadId: string
        readonly turnId: string
        readonly itemId: string
        readonly text: string
    }
    | {
        readonly type: "dynamicToolStarted"
        readonly threadId: string
        readonly turnId: string
        readonly itemId: string
        readonly namespace: string | null
        readonly tool: string
        readonly arguments: JsonValue
    }
    | {
        readonly type: "dynamicToolCompleted"
        readonly threadId: string
        readonly turnId: string
        readonly itemId: string
        readonly namespace: string | null
        readonly tool: string
        readonly success: boolean | null
        readonly contentItems: ReadonlyArray<CodexDynamicToolCallContentItem> | null
    }
    | {
        readonly type: "turnCompleted"
        readonly threadId: string
        readonly turnId: string
        readonly status: string
        readonly error: string | null
    }
    | {readonly type: "error", readonly error: string}
    | {readonly type: "disconnected", readonly error: string | null}
