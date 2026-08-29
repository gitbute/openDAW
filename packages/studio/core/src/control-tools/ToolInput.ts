import type {JsonObject} from "../control-api/types"

export const assertRecord = (value: unknown, context: string): JsonObject => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${context} must be an object`)
    }
    return value as JsonObject
}

export const assertKnownProperties = (value: JsonObject,
                                       known: ReadonlyArray<string>, context: string): void => {
    Object.keys(value).forEach(name => {
        if (!known.includes(name)) {throw new Error(`Unknown property '${name}' for ${context}`)}
    })
}

export const optionalString = (value: JsonObject, name: string): string | undefined => {
    const candidate = value[name]
    if (candidate === undefined) {return undefined}
    if (typeof candidate !== "string") {throw new Error(`${name} must be a string`)}
    return candidate
}

export const requiredString = (value: JsonObject, name: string, context: string): string => {
    const candidate = value[name]
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
        throw new Error(`${name} must be a non-empty string for ${context}`)
    }
    return candidate
}

export const optionalFiniteNumber = (value: JsonObject, name: string): number | undefined => {
    const candidate = value[name]
    if (candidate === undefined) {return undefined}
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
        throw new Error(`${name} must be a finite number`)
    }
    return candidate
}

export const finiteNumber = (value: JsonObject, name: string): number => {
    const candidate = optionalFiniteNumber(value, name)
    if (candidate === undefined) {throw new Error(`${name} must be a finite number`)}
    return candidate
}

export const optionalNonNegativeInteger = (value: JsonObject, name: string): number | undefined => {
    const candidate = value[name]
    if (candidate === undefined) {return undefined}
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0) {
        throw new Error(`${name} must be a non-negative integer`)
    }
    return candidate
}
