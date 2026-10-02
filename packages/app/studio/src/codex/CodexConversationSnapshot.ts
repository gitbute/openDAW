import {isDefined, Nullable, Option, Optional, tryCatch} from "@opendaw/lib-std"
import {CodexJson} from "@opendaw/studio-codex"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {CodexConversationEntry} from "./CodexAgentController"

export type CodexConversationSnapshot = {
    readonly threadId: Nullable<string>
    readonly entries: ReadonlyArray<CodexConversationEntry>
    /** The project is a copy (Save As): continue in a fork of threadId instead of the thread itself. */
    readonly forkPending: boolean
}

export type CodexConversationStore = {
    load(): Promise<Option<CodexConversationSnapshot>>
    save(snapshot: CodexConversationSnapshot): Promise<void>
}

const {isJsonObject} = CodexJson

type ActivityEntry = Extract<CodexConversationEntry, {type: "activity"}>

export namespace CodexConversationSnapshot {
    export const Version = 1
    export const MaxEntries = 400
    export const MaxText = 8000
    export const MaxMessage = 20000
    export const ImageNote = "[image]"
    export const TrimmedNotice = "Earlier messages were trimmed."

    const trimText = (text: string, limit: number): string =>
        text.length > limit ? `${text.slice(0, limit - 1)}…` : text

    const isImageData = (text: string): boolean => text.startsWith("data:") && text.length > 256

    const compact = (value: JsonValue): JsonValue => {
        if (typeof value === "string") {return isImageData(value) ? ImageNote : trimText(value, MaxText)}
        if (Array.isArray(value)) {return value.map(element => compact(element))}
        if (!isJsonObject(value)) {return value}
        if (value.type === "inputImage") {return {type: "inputText", text: ImageNote}}
        return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, compact(field)]))
    }

    const compactItem = (item: JsonObject): JsonObject => {
        const compacted = compact(item)
        return isJsonObject(compacted) ? compacted : item
    }

    const settle = (entry: CodexConversationEntry): CodexConversationEntry => {
        switch (entry.type) {
            case "assistant":
            case "reasoning":
                return {...entry, text: trimText(entry.text, MaxMessage), complete: true}
            case "user":
            case "notice":
                return {...entry, text: trimText(entry.text, MaxMessage)}
            case "activity": {
                const interrupted = entry.status === "running"
                const settled: ActivityEntry = {
                    ...entry, item: compactItem(entry.item), status: interrupted ? "failed" : entry.status,
                    ...(interrupted ? {error: "Interrupted"} : {})
                }
                return settled
            }
        }
    }

    export const create = (threadId: Nullable<string>, entries: ReadonlyArray<CodexConversationEntry>,
                           forkPending: boolean = false): CodexConversationSnapshot => {
        const kept = entries.slice(-MaxEntries).map(entry => settle(entry))
        const trimmed = entries.length > MaxEntries && kept.at(0)?.type !== "notice"
        const notice: CodexConversationEntry = {type: "notice", id: "notice-trimmed", text: TrimmedNotice}
        return {threadId, entries: trimmed ? [notice, ...kept.slice(1)] : kept, forkPending}
    }

    const isString = (value: Optional<JsonValue>): value is string => typeof value === "string"

    const isEntry = (value: JsonValue): value is JsonValue & CodexConversationEntry => {
        if (!isJsonObject(value) || !isString(value.text) && value.type !== "activity") {return false}
        switch (value.type) {
            case "user":
                return isString(value.id)
                    && (!isDefined(value.images) || Array.isArray(value.images) && value.images.every(isString))
            case "notice":
                return isString(value.id)
            case "assistant":
                return isString(value.itemId) && isString(value.turnId) && typeof value.complete === "boolean"
            case "reasoning":
                return isString(value.itemId) && isString(value.turnId) && typeof value.complete === "boolean"
                    && (value.summaryIndex === null || typeof value.summaryIndex === "number")
            case "activity":
                return isString(value.itemId) && isString(value.turnId) && isString(value.kind)
                    && isString(value.label) && isJsonObject(value.item)
                    && (value.status === "success" || value.status === "failed" || value.status === "running")
                    && (!isDefined(value.error) || isString(value.error))
            default:
                return false
        }
    }

    export const encode = ({threadId, entries, forkPending}: CodexConversationSnapshot): string =>
        JSON.stringify({version: Version, threadId, entries, ...(forkPending ? {forkPending} : {})})

    export const decode = (text: string): Option<CodexConversationSnapshot> => {
        const parsed = tryCatch((): JsonValue => JSON.parse(text))
        if (parsed.status === "failure") {return Option.None}
        const json = parsed.value
        if (!isJsonObject(json) || json.version !== Version || !Array.isArray(json.entries)) {return Option.None}
        const threadId = isString(json.threadId) ? json.threadId : null
        const entries = json.entries.filter(entry => isEntry(entry))
        return Option.wrap({threadId, entries, forkPending: json.forkPending === true})
    }
}
