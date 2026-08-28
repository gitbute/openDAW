import {PrimitiveField, PrimitiveType} from "@opendaw/lib-box"
import type {AutomatableParameterFieldAdapter} from "@opendaw/studio-adapters"
import {ControlChoice, JsonValue} from "./types"

export const toJsonValue = (value: unknown): JsonValue => {
    if (value === null) {return null}
    if (typeof value === "string" || typeof value === "boolean") {return value}
    if (typeof value === "number") {return Number.isFinite(value) ? value : null}
    if (ArrayBuffer.isView(value)) {return Array.from(value as unknown as ArrayLike<number>)}
    if (Array.isArray(value)) {return value.map(toJsonValue)}
    if (typeof value === "object" && value !== null
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]))
    }
    return null
}

export const constraintsOf = (field: PrimitiveField<any, any>): JsonValue | undefined => {
    const constraints = (field as unknown as PrimitiveField & {readonly constraints?: unknown}).constraints
    return constraints === undefined ? undefined : toJsonValue(constraints)
}

export const choicesOf = (parameter: AutomatableParameterFieldAdapter): ReadonlyArray<ControlChoice> => {
    const field = parameter.field
    const candidates: Array<boolean | number> = []
    if (field.type === PrimitiveType.Boolean) {
        candidates.push(false, true)
    } else if (field.type === PrimitiveType.Int32) {
        const constraints = (field as unknown as PrimitiveField & {readonly constraints?: unknown}).constraints
        if (typeof constraints === "object" && constraints !== null) {
            const record = constraints as {readonly values?: unknown, readonly length?: unknown}
            if (Array.isArray(record.values)) {
                record.values.filter((value): value is number =>
                    typeof value === "number" && Number.isFinite(value)).forEach(value => candidates.push(value))
            } else if (typeof record.length === "number" && Number.isInteger(record.length)
                && record.length >= 0 && record.length <= 256) {
                for (let index = 0; index < record.length; index++) {candidates.push(index)}
            }
        }
    }
    return candidates.flatMap(candidate => {
        try {
            const printed = parameter.stringMapping.x(candidate as never)
            return typeof printed.value === "string"
                ? [{value: candidate, label: printed.value, unit: printed.unit}]
                : []
        } catch (_error) {
            return []
        }
    })
}
