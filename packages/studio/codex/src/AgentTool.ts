import type {CodexDynamicToolCallContentItem, JsonObject, JsonValue} from "./types"

export type AgentToolContent = CodexDynamicToolCallContentItem

export type AgentToolResult = {
    readonly ok: boolean
    readonly content: ReadonlyArray<AgentToolContent>
}

export interface AgentTool {
    readonly name: string
    readonly description: string
    readonly inputSchema: JsonObject
    // true: touches no live state, so the session runs it immediately instead of queueing it behind other calls
    readonly concurrent?: boolean | ((args: JsonObject) => boolean)
    execute(args: JsonObject): Promise<AgentToolResult>
}

export interface AgentToolbox {
    readonly namespace: string
    readonly description: string
    readonly tools: ReadonlyArray<AgentTool>
}

export namespace AgentToolResult {
    export const text = (text: string): AgentToolResult => ({ok: true, content: [{type: "inputText", text}]})
    export const json = (value: JsonValue): AgentToolResult => text(JSON.stringify(value))
    export const failure = (message: string): AgentToolResult =>
        ({ok: false, content: [{type: "inputText", text: message}]})
    export const withImages = (result: AgentToolResult, imageUrls: ReadonlyArray<string>): AgentToolResult =>
        ({ok: result.ok, content: [...result.content, ...imageUrls.map(imageUrl => ({type: "inputImage" as const, imageUrl}))]})
}
