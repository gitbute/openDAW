import {CodexRpcClient} from "./CodexRpcClient"
import {emitCodexTrace, type CodexTraceSink} from "./CodexTrace"
import type {CodexModel, CodexReasoningEffortOption, JsonValue} from "./types"

const MODEL_PAGE_LIMIT = 100

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const asRecord = (value: JsonValue, context: string): Record<string, unknown> => {
    if (!isRecord(value)) {throw new Error(`${context} must be an object`)}
    return value
}

const stringAt = (value: Record<string, unknown>, name: string, context: string): string => {
    const result = value[name]
    if (typeof result !== "string") {throw new Error(`${context}.${name} must be a string`)}
    return result
}

const booleanAt = (value: Record<string, unknown>, name: string, context: string): boolean => {
    const result = value[name]
    if (typeof result !== "boolean") {throw new Error(`${context}.${name} must be a boolean`)}
    return result
}

const reasoningEffort = (value: unknown, context: string): CodexReasoningEffortOption => {
    const option = asRecord(value as JsonValue, context)
    return {
        reasoningEffort: stringAt(option, "reasoningEffort", context),
        description: stringAt(option, "description", context)
    }
}

const model = (value: unknown, index: number): CodexModel => {
    const context = `model/list response.data[${index}]`
    const record = asRecord(value as JsonValue, context)
    const efforts = record.supportedReasoningEfforts
    if (!Array.isArray(efforts)) {throw new Error(`${context}.supportedReasoningEfforts must be an array`)}
    return {
        id: stringAt(record, "id", context),
        model: stringAt(record, "model", context),
        displayName: stringAt(record, "displayName", context),
        description: stringAt(record, "description", context),
        hidden: booleanAt(record, "hidden", context),
        supportedReasoningEfforts: Object.freeze(efforts.map((option, effortIndex) =>
            Object.freeze(reasoningEffort(option, `${context}.supportedReasoningEfforts[${effortIndex}]`)))),
        defaultReasoningEffort: stringAt(record, "defaultReasoningEffort", context),
        isDefault: booleanAt(record, "isDefault", context)
    }
}

const nextCursorAt = (response: Record<string, unknown>): string | null => {
    const cursor = response.nextCursor
    if (cursor === undefined || cursor === null) {return null}
    if (typeof cursor !== "string") {throw new Error("model/list response.nextCursor must be a string or null")}
    return cursor
}

export class CodexModels {
    readonly #rpc: CodexRpcClient
    readonly #traceSink: CodexTraceSink | undefined

    constructor(rpc: CodexRpcClient, traceSink?: CodexTraceSink) {
        this.#rpc = rpc
        this.#traceSink = traceSink
    }

    async listModels(): Promise<ReadonlyArray<CodexModel>> {
        const models: CodexModel[] = []
        let cursor: string | null = null
        do {
            const params = {
                limit: MODEL_PAGE_LIMIT,
                cursor,
                includeHidden: false
            }
            const response = asRecord(await this.#rpc.request("model/list", params), "model/list response")
            const data = response.data
            if (!Array.isArray(data)) {throw new Error("model/list response.data must be an array")}
            data.map(model).filter(candidate => !candidate.hidden).forEach(candidate => models.push(candidate))
            cursor = nextCursorAt(response)
            emitCodexTrace(this.#traceSink, {
                layer: "session",
                phase: "response",
                method: "model/list",
                payload: {count: data.length, nextCursor: cursor}
            })
        } while (cursor !== null)
        return Object.freeze(models.slice())
    }
}
