import {int, isAbsent, isDefined, Optional, tryCatch} from "@opendaw/lib-std"
import {Box, BoxGraph} from "@opendaw/lib-box"
import {Context} from "../impl/Context"

type Limits = { readonly depth: int, readonly entries: int }

type Walk = { readonly limits: Limits, readonly seen: Set<object>, nodes: int }

const MaxNodes = 20_000
const MaxLeafKeys = 16

// deepest first: toJson keeps the first level whose JSON fits, so deep levels are dropped before anything else
const Levels: ReadonlyArray<Limits> = [
    {depth: 7, entries: 100}, {depth: 6, entries: 50}, {depth: 5, entries: 24},
    {depth: 4, entries: 12}, {depth: 3, entries: 6}, {depth: 2, entries: 3}
]

const LogLimits: Limits = {depth: 2, entries: 100}

// facade plumbing that is not part of the scripting API
const InternalGetter = /^(constructor|context|attached)$|Box$/

const isInternal = (value: unknown): boolean => value instanceof Box || value instanceof BoxGraph || value instanceof Context

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> => typeof value === "object" && isDefined(value)

const collectKeys = (object: object): ReadonlyArray<string> => {
    const keys = new Set<string>(Object.keys(object))
    for (let proto = Object.getPrototypeOf(object); isDefined(proto) && proto !== Object.prototype;
         proto = Object.getPrototypeOf(proto)) {
        Object.entries(Object.getOwnPropertyDescriptors(proto))
            .filter(([key, descriptor]) => isDefined(descriptor.get) && !InternalGetter.test(key))
            .forEach(([key]) => keys.add(key))
    }
    return Array.from(keys)
}

const isScalar = (value: unknown): boolean =>
    isAbsent(value) || typeof value === "number" || typeof value === "string" || typeof value === "boolean"

const snapshot = (value: unknown, depth: int, walk: Walk): unknown => {
    if (isAbsent(value)) {return null}
    if (typeof value === "number") {return Number.isFinite(value) ? value : String(value)}
    if (typeof value === "string" || typeof value === "boolean") {return value}
    if (typeof value === "bigint" || typeof value === "symbol") {return value.toString()}
    if (typeof value === "function") {return `[function ${value.name}]`}
    if (!isRecord(value)) {return String(value)}
    if (++walk.nodes > MaxNodes) {return "[truncated]"}
    if (walk.seen.has(value)) {return "[circular]"}
    if (value instanceof Error) {return `${value.name}: ${value.message}`}
    if (value instanceof Date) {return value.toISOString()}
    if (ArrayBuffer.isView(value)) {return `[${value.constructor.name}(${value.byteLength} bytes)]`}
    if (value instanceof ArrayBuffer) {return `[ArrayBuffer(${value.byteLength} bytes)]`}
    const toJSON = value.toJSON
    if (typeof toJSON === "function") {
        const converted = tryCatch(() => toJSON.call(value))
        return converted.status === "success" ? snapshot(converted.value, depth, walk) : "[unserializable]"
    }
    if (depth >= walk.limits.depth) {return leaf(value, walk)}
    walk.seen.add(value)
    const result = Array.isArray(value) || value instanceof Set ? snapshotList(Array.from(value), depth, walk)
        : value instanceof Map ? snapshotList(Array.from(value.entries()), depth, walk)
            : snapshotObject(value, depth, walk)
    walk.seen.delete(value)
    return result
}

const marker = (value: unknown, walk: Walk): unknown => isScalar(value) ? snapshot(value, 0, walk)
    : Array.isArray(value) ? `[array(${value.length})]` : "[object]"

// past the depth limit objects still show their scalar members, nested ones become markers
const leafObject = (value: Record<PropertyKey, unknown>, walk: Walk): unknown => {
    if (value instanceof Set || value instanceof Map) {return `[${value.constructor.name}(${value.size})]`}
    const keys = collectKeys(value)
    if (keys.length > MaxLeafKeys) {return "[object]"}
    const result: Record<string, unknown> = {}
    keys.forEach(key => {
        const read = tryCatch(() => value[key])
        if (read.status === "failure" || typeof read.value === "function" || isInternal(read.value)) {return}
        result[key] = marker(read.value, walk)
    })
    return result
}

const leaf = (value: Record<PropertyKey, unknown>, walk: Walk): unknown => {
    if (!Array.isArray(value)) {return leafObject(value, walk)}
    if (value.length > walk.limits.entries) {return `[array(${value.length})]`}
    return value.map(entry => isRecord(entry) && !Array.isArray(entry) ? leafObject(entry, walk) : marker(entry, walk))
}

const snapshotList = (values: ReadonlyArray<unknown>, depth: int, walk: Walk): unknown => {
    const {entries} = walk.limits
    const result: Array<unknown> = values.slice(0, entries).map(entry => snapshot(entry, depth + 1, walk))
    if (values.length > entries) {result.push(`[${values.length - entries} more]`)}
    return result
}

const snapshotObject = (object: Record<PropertyKey, unknown>, depth: int, walk: Walk): unknown => {
    const result: Record<string, unknown> = {}
    collectKeys(object).forEach(key => {
        const read = tryCatch(() => object[key])
        if (read.status === "failure" || typeof read.value === "function" || isInternal(read.value)) {return}
        result[key] = snapshot(read.value, depth + 1, walk)
    })
    return result
}

const stringify = (value: unknown, limits: Limits): Optional<string> => {
    const converted = tryCatch(() => JSON.stringify(snapshot(value, 0, {limits, seen: new Set(), nodes: 0})))
    return converted.status === "success" ? converted.value : undefined
}

export namespace ScriptValues {
    // Class instances (the API facades) expose their getters, so returning `project.audioUnits` is readable.
    export const toJson = (value: unknown, maxLength: int): string => {
        let text = "null"
        for (const limits of Levels) {
            text = stringify(value, limits) ?? "null"
            if (text.length <= maxLength) {return text}
        }
        return JSON.stringify(`${text.slice(0, maxLength)}... [truncated, ${text.length} chars]`)
    }

    export const format = (value: unknown): string => {
        if (typeof value === "string") {return value}
        if (value instanceof Error) {return `${value.name}: ${value.message}`}
        return stringify(value, LogLimits) ?? String(value)
    }
}
