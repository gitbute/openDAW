import {isAbsent, isDefined, Nullable, Optional, tryCatch} from "@opendaw/lib-std"
import {CodexJson} from "./CodexJson"
import type {JsonObject, JsonValue, RpcId} from "./types"

export type CodexTraceLayer = "transport" | "rpc" | "session" | "tool"

export type CodexTracePhase =
    | "send"
    | "receive"
    | "request"
    | "response"
    | "notification"
    | "state"
    | "item-start"
    | "item-complete"
    | "tool-start"
    | "tool-complete"
    | "error"

export type CodexTraceEvent = {
    readonly timestamp: number
    readonly layer: CodexTraceLayer
    readonly phase: CodexTracePhase
    readonly direction?: "outgoing" | "incoming"
    readonly method?: string
    readonly rpcId?: RpcId
    readonly threadId?: string
    readonly turnId?: string
    readonly itemId?: string
    readonly namespace?: Nullable<string>
    readonly tool?: string
    readonly payload?: JsonValue
    readonly result?: JsonValue
    readonly error?: string
}

export type CodexTraceEventInput = Omit<CodexTraceEvent, "timestamp"> & {readonly timestamp?: number}

export type CodexTraceSink = (event: CodexTraceEvent) => void

const sensitiveKey = (key: string): boolean => {
    const normalized = key.toLowerCase()
    return normalized.includes("token")
        || normalized.includes("authorization")
        || normalized.includes("cookie")
        || normalized.includes("authurl")
}

export const redactTraceValue = (value: unknown): JsonValue => {
    if (isAbsent(value)) {return null}
    if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
        return value
    }
    if (Array.isArray(value)) {return value.map(redactTraceValue)}
    if (CodexJson.isObjectRecord(value)) {
        const result: Record<string, JsonValue> = {}
        Object.entries(value).forEach(([key, child]) => {
            result[key] = sensitiveKey(key) ? "[REDACTED]" : redactTraceValue(child)
        })
        return result
    }
    return String(value)
}

const compactDelta = (value: unknown): JsonValue => {
    if (!CodexJson.isObjectRecord(value)) {return redactTraceValue(value)}
    const delta = value.delta
    const redacted = redactTraceValue(value) as JsonObject
    const withoutDelta: Record<string, JsonValue> = {...redacted}
    delete withoutDelta.delta
    return {
        ...withoutDelta,
        deltaLength: typeof delta === "string" ? delta.length : 0,
        deltaPreview: typeof delta === "string" ? delta.slice(0, 120) : ""
    }
}

export const compactTracePayload = (method: string, value: unknown): JsonValue =>
    method === "item/agentMessage/delta" ? compactDelta(value) : redactTraceValue(value)

export const compactTraceMessage = (value: unknown): JsonValue => {
    if (!CodexJson.isObjectRecord(value) || typeof value.method !== "string") {return redactTraceValue(value)}
    return {
        ...redactTraceValue(value) as JsonObject,
        params: compactTracePayload(value.method, value.params)
    }
}

export const emitCodexTrace = (sink: Optional<CodexTraceSink>, event: CodexTraceEventInput): void => {
    if (!isDefined(sink)) {return}
    const traced: CodexTraceEvent = {
        ...event,
        timestamp: event.timestamp ?? Date.now(),
        ...(isDefined(event.payload) ? {payload: redactTraceValue(event.payload)} : {}),
        ...(isDefined(event.result) ? {result: redactTraceValue(event.result)} : {})
    }
    tryCatch(() => sink(traced))
}
