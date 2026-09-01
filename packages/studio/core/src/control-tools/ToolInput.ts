import type {JsonObject} from "../control-api/types"
import {musicalPosition, musicalPositionToPulses} from "../project/MusicalTime"
import type {MusicalPosition, MusicalTimelineRange} from "../project/MusicalTime"
import type {ppqn} from "@opendaw/lib-dsp"
import type {SignatureTrackAdapter} from "@opendaw/studio-adapters"

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

export const parseMusicalPosition = (value: unknown, context: string): MusicalPosition => {
    const object = assertRecord(value, context)
    assertKnownProperties(object, ["bar", "beat", "sixteenth", "ticks"], context)
    const bar = finiteNumber(object, "bar")
    const beat = object.beat === undefined ? 1 : finiteNumber(object, "beat")
    const sixteenth = object.sixteenth === undefined ? 1 : finiteNumber(object, "sixteenth")
    const ticks = optionalNonNegativeInteger(object, "ticks") ?? 0
    if (!Number.isInteger(bar) || bar < 1) {throw new Error(`${context}.bar must be a positive integer`)}
    if (!Number.isInteger(beat) || beat < 1) {throw new Error(`${context}.beat must be a positive integer`)}
    if (!Number.isInteger(sixteenth) || sixteenth < 1) {
        throw new Error(`${context}.sixteenth must be a positive integer`)
    }
    return {bar, beat, sixteenth, ticks} as MusicalPosition
}

/** Resolve one of the paired raw or musical range forms used by manual tools. */
export const resolveMusicalRange = (value: JsonObject,
                                    signatureTrack: SignatureTrackAdapter,
                                    defaults: {readonly startPosition: ppqn, readonly endPosition: ppqn},
                                    context: string): MusicalTimelineRange => {
    const hasRawStart = Object.hasOwn(value, "startPosition")
    const hasRawEnd = Object.hasOwn(value, "endPosition")
    const hasMusicalStart = Object.hasOwn(value, "startMusical")
    const hasMusicalEnd = Object.hasOwn(value, "endMusical")
    if (hasRawStart !== hasRawEnd) {throw new Error("startPosition and endPosition must be supplied together")}
    if (hasMusicalStart !== hasMusicalEnd) {throw new Error("startMusical and endMusical must be supplied together")}
    if ((hasRawStart || hasRawEnd) && (hasMusicalStart || hasMusicalEnd)) {
        throw new Error("Use either startPosition/endPosition or startMusical/endMusical, not both")
    }
    let startPosition = defaults.startPosition
    let endPosition = defaults.endPosition
    if (hasRawStart) {
        startPosition = finiteNumber(value, "startPosition")
        endPosition = finiteNumber(value, "endPosition")
    } else if (hasMusicalStart) {
        const start = parseMusicalPosition(value.startMusical, `${context}.startMusical`)
        const end = parseMusicalPosition(value.endMusical, `${context}.endMusical`)
        startPosition = musicalPositionToPulses(signatureTrack, start)
        endPosition = musicalPositionToPulses(signatureTrack, end)
    }
    if (startPosition < 0 || endPosition < 0) {
        throw new Error("timeline positions must be non-negative")
    }
    if (endPosition < startPosition) {
        throw new Error("endPosition must be greater than or equal to startPosition")
    }
    return {
        startPosition,
        endPosition,
        startMusical: musicalPosition(signatureTrack, startPosition),
        endMusical: musicalPosition(signatureTrack, endPosition)
    }
}
