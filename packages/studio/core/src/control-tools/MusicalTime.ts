import {PPQN, ppqn, PPQNParts} from "@opendaw/lib-dsp"
import {int} from "@opendaw/lib-std"
import {SignatureTrackAdapter} from "@opendaw/studio-adapters"
import type {JsonObject} from "../control-api/types"
import {assertKnownProperties, assertRecord, finiteNumber, optionalNonNegativeInteger} from "./ToolInput"

/** One-based musical position used by producer-facing control operations. */
export type MusicalPosition = {
    bar: int
    beat?: int
    sixteenth?: int
    ticks?: int
}

/** Named musical lengths resolved through the active project signature. */
export type MusicalDuration =
    | "bar"
    | "whole"
    | "half"
    | "quarter"
    | "eighth"
    | "sixteenth"
    | "dotted-half"
    | "dotted-quarter"
    | "dotted-eighth"
    | "triplet-half"
    | "triplet-quarter"
    | "triplet-eighth"

export type MusicalPositionView = {
    readonly bar: number
    readonly beat: number
    readonly sixteenth: number
    readonly ticks: number
}

export type MusicalTimelineRange = {
    readonly startPosition: ppqn
    readonly endPosition: ppqn
    readonly startMusical: MusicalPositionView
    readonly endMusical: MusicalPositionView
}

export const musicalPosition = (signatureTrack: SignatureTrackAdapter,
                                position: ppqn): MusicalPositionView => {
    const parts = signatureTrack.toParts(Math.max(0, position))
    return {
        bar: parts.bars + 1,
        beat: parts.beats + 1,
        sixteenth: parts.semiquavers + 1,
        ticks: parts.ticks
    }
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

export const musicalPositionParts = (position: MusicalPosition): PPQNParts => {
    const {bar, beat = 1, sixteenth = 1, ticks = 0} = position
    if (!Number.isInteger(bar) || bar < 1) {throw new Error("bar must be a positive integer")}
    if (!Number.isInteger(beat) || beat < 1) {throw new Error("beat must be a positive integer")}
    if (!Number.isInteger(sixteenth) || sixteenth < 1) {
        throw new Error("sixteenth must be a positive integer")
    }
    if (!Number.isInteger(ticks) || ticks < 0) {throw new Error("ticks must be a non-negative integer")}
    return {bars: bar - 1, beats: beat - 1, semiquavers: sixteenth - 1, ticks}
}

export const musicalPositionToPulses = (signatureTrack: SignatureTrackAdapter,
                                        position: MusicalPosition,
                                        referencePosition?: ppqn): ppqn => {
    const parts = musicalPositionParts(position)
    if (referencePosition === undefined) {return signatureTrack.fromParts(parts)}
    const [nominator, denominator] = signatureTrack.signatureAt(referencePosition)
    return PPQN.fromParts(parts, nominator, denominator)
}

export const musicalDurationToPulses = (signatureTrack: SignatureTrackAdapter,
                                        duration: MusicalDuration,
                                        referencePosition: ppqn): ppqn => {
    const [nominator, denominator] = signatureTrack.signatureAt(referencePosition)
    switch (duration) {
        case "bar": return PPQN.fromSignature(nominator, denominator)
        case "whole": return PPQN.Whole
        case "half": return PPQN.Half
        case "quarter": return PPQN.Quarter
        case "eighth": return PPQN.Eighth
        case "sixteenth": return PPQN.Sixteenth
        case "dotted-half": return PPQN.Dotted(PPQN.Half)
        case "dotted-quarter": return PPQN.Dotted(PPQN.Quarter)
        case "dotted-eighth": return PPQN.Dotted(PPQN.Eighth)
        case "triplet-half": return PPQN.Triplet(PPQN.Half)
        case "triplet-quarter": return PPQN.Triplet(PPQN.Quarter)
        case "triplet-eighth": return PPQN.Triplet(PPQN.Eighth)
    }
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
