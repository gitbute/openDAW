import {isAbsent, isDefined, Nullable, Optional, panic} from "@opendaw/lib-std"
import {CodexJson} from "./CodexJson"
import {CodexRpcClient} from "./CodexRpcClient"
import {emitCodexTrace, type CodexTraceSink} from "./CodexTrace"
import type {CodexInputModality, CodexModel, CodexReasoningEffortOption} from "./types"

const MODEL_PAGE_LIMIT = 100

const modalities: ReadonlyArray<CodexInputModality> = ["text", "image", "audio"]

const isModality = (value: unknown): value is CodexInputModality =>
    modalities.some(modality => modality === value)

const inputModalities = (value: unknown, context: string): ReadonlyArray<CodexInputModality> => {
    if (isAbsent(value)) {return Object.freeze(["text"])}
    if (!Array.isArray(value)) {return panic(`${context}.inputModalities must be an array`)}
    return Object.freeze(value.filter(isModality))
}

const reasoningEffort = (value: unknown, context: string): CodexReasoningEffortOption => {
    const option = CodexJson.asObjectRecord(value, context)
    return {
        reasoningEffort: CodexJson.stringAt(option, "reasoningEffort", context),
        description: CodexJson.stringAt(option, "description", context)
    }
}

const model = (value: unknown, index: number): CodexModel => {
    const context = `model/list response.data[${index}]`
    const record = CodexJson.asObjectRecord(value, context)
    const efforts = record.supportedReasoningEfforts
    if (!Array.isArray(efforts)) {throw new Error(`${context}.supportedReasoningEfforts must be an array`)}
    return {
        id: CodexJson.stringAt(record, "id", context),
        model: CodexJson.stringAt(record, "model", context),
        displayName: CodexJson.stringAt(record, "displayName", context),
        description: CodexJson.stringAt(record, "description", context),
        hidden: CodexJson.booleanAt(record, "hidden", context),
        supportedReasoningEfforts: Object.freeze(efforts.map((option, effortIndex) =>
            Object.freeze(reasoningEffort(option, `${context}.supportedReasoningEfforts[${effortIndex}]`)))),
        defaultReasoningEffort: CodexJson.stringAt(record, "defaultReasoningEffort", context),
        isDefault: CodexJson.booleanAt(record, "isDefault", context),
        inputModalities: inputModalities(record.inputModalities, context)
    }
}

const nextCursorAt = (response: Record<string, unknown>): Nullable<string> => {
    const cursor = response.nextCursor
    if (isAbsent(cursor)) {return null}
    if (typeof cursor !== "string") {throw new Error("model/list response.nextCursor must be a string or null")}
    return cursor
}

export class CodexModels {
    readonly #rpc: CodexRpcClient
    readonly #traceSink: Optional<CodexTraceSink>

    constructor(rpc: CodexRpcClient, traceSink?: CodexTraceSink) {
        this.#rpc = rpc
        this.#traceSink = traceSink
    }

    async listModels(): Promise<ReadonlyArray<CodexModel>> {
        const models: Array<CodexModel> = []
        let cursor: Nullable<string> = null
        do {
            const params = {
                limit: MODEL_PAGE_LIMIT,
                cursor,
                includeHidden: false
            }
            const response = CodexJson.asObjectRecord(await this.#rpc.request("model/list", params), "model/list response")
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
        } while (isDefined(cursor))
        return Object.freeze(models.slice())
    }
}
