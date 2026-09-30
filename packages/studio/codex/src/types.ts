import type {Nullable} from "@opendaw/lib-std"

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
    readonly title: Nullable<string>
    readonly version: string
}

export type CodexInitializeResponse = JsonObject

export type CodexAccountRecord = {
    readonly type: string
    readonly email: Nullable<string>
    readonly planType: Nullable<string>
}

export type CodexAccountState = {
    readonly account: Nullable<CodexAccountRecord>
    readonly exists: boolean
    readonly accountType: Nullable<string>
    readonly authMode: Nullable<string>
    readonly email: Nullable<string>
    readonly planType: Nullable<string>
    readonly requiresOpenaiAuth: boolean
}

export type CodexAccountEvent =
    | {readonly type: "changed", readonly state: CodexAccountState}
    | {
        readonly type: "loginCompleted"
        readonly loginId: Nullable<string>
        readonly success: boolean
        readonly error: Nullable<string>
    }

export type CodexLogin = {
    readonly loginId: string
    readonly authUrl: string
}

export type CodexReasoningEffortOption = {
    readonly reasoningEffort: string
    readonly description: string
}

export type CodexInputModality = "text" | "image" | "audio"

export type CodexModel = {
    readonly id: string
    readonly model: string
    readonly displayName: string
    readonly description: string
    readonly hidden: boolean
    readonly supportedReasoningEfforts: ReadonlyArray<CodexReasoningEffortOption>
    readonly defaultReasoningEffort: string
    readonly isDefault: boolean
    readonly inputModalities: ReadonlyArray<CodexInputModality>
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

export type CodexDynamicToolCallContentItem =
    | {readonly type: "inputText", readonly text: string}
    | {readonly type: "inputImage", readonly imageUrl: string}
    | {readonly type: "inputAudio", readonly audioUrl: string}

export type CodexDynamicToolCallResponse = {
    readonly contentItems: ReadonlyArray<CodexDynamicToolCallContentItem>
    readonly success: boolean
}

export type CodexTurnItem = JsonObject & {
    readonly type: string
    readonly id: string
}

export type CodexThreadInfo = {
    readonly threadId: string
    readonly sessionId: Nullable<string>
}

export type CodexSubagentInfo = {
    readonly threadId: string
    readonly parentThreadId: Nullable<string>
    readonly nickname: Nullable<string>
    readonly role: Nullable<string>
    readonly path: Nullable<string>
}

export type CodexStartThreadOptions = {
    readonly model?: string
}

export type CodexStartTurnOptions = {
    readonly model?: string
    readonly effort?: string
    readonly summary?: string
}

export type CodexSessionEvent =
    | {readonly type: "connectionChanged", readonly state: CodexTransportState}
    | {readonly type: "accountChanged", readonly state: CodexAccountState}
    | {
        readonly type: "loginCompleted"
        readonly loginId: Nullable<string>
        readonly success: boolean
        readonly error: Nullable<string>
    }
    | {readonly type: "threadStarted", readonly thread: CodexThreadInfo}
    | {readonly type: "threadResumed", readonly thread: CodexThreadInfo}
    | {readonly type: "subagentStarted", readonly agent: CodexSubagentInfo}
    | {readonly type: "turnStarted", readonly threadId: string, readonly turnId: string}
    | {
        readonly type: "agentTextDelta"
        readonly threadId: string
        readonly turnId: string
        readonly itemId: string
        readonly text: string
    }
    | {
        readonly type: "reasoningSummaryDelta"
        readonly threadId: string
        readonly turnId: string
        readonly itemId: string
        readonly summaryIndex: Nullable<number>
        readonly text: string
    }
    | {
        readonly type: "reasoningSummaryPartAdded"
        readonly threadId: string
        readonly turnId: string
        readonly itemId: string
        readonly summaryIndex: Nullable<number>
        readonly text: string
    }
    | {
        readonly type: "itemStarted"
        readonly threadId: string
        readonly turnId: string
        readonly item: CodexTurnItem
    }
    | {
        readonly type: "itemCompleted"
        readonly threadId: string
        readonly turnId: string
        readonly item: CodexTurnItem
    }
    | {
        readonly type: "turnCompleted"
        readonly threadId: string
        readonly turnId: string
        readonly status: string
        readonly error: Nullable<string>
    }
    | {readonly type: "error", readonly error: string}
    | {readonly type: "disconnected", readonly error: Nullable<string>}
