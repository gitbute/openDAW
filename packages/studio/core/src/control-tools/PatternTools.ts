import {Interpolation, LoopableRegion, ppqn} from "@opendaw/lib-dsp"
import {
    NoteEventBoxAdapter,
    NoteRegionBoxAdapter,
    SignatureTrackAdapter,
    TimelineBoxAdapter,
    ValueEventBoxAdapter,
    ValueRegionBoxAdapter
} from "@opendaw/studio-adapters"
import {NoteRegionBox, ValueRegionBox} from "@opendaw/studio-boxes"
import type {JsonObject} from "../control-api/types"
import {ControlResolver} from "../control-api/ControlResolver"
import {resolveMusicalRange, musicalPosition} from "./MusicalTime"
import {assertKnownProperties, assertRecord} from "./ToolInput"
import type {
    PatternInspectionInput,
    PatternInspectionRegion,
    PatternNoteEvent,
    PatternNoteRegion,
    PatternTimedPosition,
    PatternValueEvent,
    PatternValueRegion,
    PatternInspectionResult
} from "./types"

const boxSpec = {kind: "handle", handle: "box", name: "Box"} as const
const OCCURRENCE_LIMIT = 512

const timedPosition = (signatureTrack: SignatureTrackAdapter, position: ppqn): PatternTimedPosition => ({
    pulses: position,
    musical: musicalPosition(signatureTrack, position)
})

const loopRange = (region: LoopableRegion.Region, start: ppqn, end: ppqn) =>
    LoopableRegion.locateLoops(region, start, end)

type NoteOccurrence = {readonly event: NoteEventBoxAdapter, readonly timelinePosition: ppqn}

const noteOccurrences = (region: NoteRegionBoxAdapter,
                         start: ppqn,
                         end: ppqn,
                         limit: number): {events: ReadonlyArray<NoteOccurrence>, truncated: boolean} => {
    const collection = region.optCollection.unwrapOrUndefined()
    if (collection === undefined || end <= start) {return {events: [], truncated: false}}
    const result: NoteOccurrence[] = []
    let truncated = false
    for (const cycle of loopRange(region, start, end)) {
        for (const event of collection.events.asArray()) {
            if (event.position < 0 || event.position >= region.loopDuration || event.complete <= 0) {continue}
            const timelinePosition = cycle.rawStart + event.position
            if (timelinePosition >= cycle.resultEnd || event.complete + cycle.rawStart <= cycle.resultStart) {
                continue
            }
            if (timelinePosition < region.position || timelinePosition >= region.complete) {continue}
            result.push({event, timelinePosition})
            if (result.length > limit) {
                truncated = true
                return {events: result.slice(0, limit), truncated}
            }
        }
    }
    return {events: result, truncated}
}

export const noteRegionHasActivity = (region: NoteRegionBoxAdapter,
                                      start: ppqn,
                                      end: ppqn): boolean => noteOccurrences(region, start, end, 1).events.length > 0

const valueOccurrences = (region: ValueRegionBoxAdapter,
                           start: ppqn,
                           end: ppqn,
                           limit: number): {events: ReadonlyArray<ValueEventBoxAdapter>, positions: ReadonlyArray<ppqn>, truncated: boolean} => {
    const collection = region.optCollection.unwrapOrUndefined()
    if (collection === undefined || end <= start) {return {events: [], positions: [], truncated: false}}
    const events: ValueEventBoxAdapter[] = []
    const positions: ppqn[] = []
    let truncated = false
    for (const cycle of loopRange(region, start, end)) {
        for (const event of collection.events.asArray()) {
            if (event.position < 0 || event.position >= region.loopDuration) {continue}
            const timelinePosition = cycle.rawStart + event.position
            if (timelinePosition < cycle.resultStart || timelinePosition >= cycle.resultEnd
                || timelinePosition < region.position || timelinePosition >= region.complete) {
                continue
            }
            events.push(event)
            positions.push(timelinePosition)
            if (events.length > limit) {
                truncated = true
                return {events: events.slice(0, limit), positions: positions.slice(0, limit), truncated}
            }
        }
    }
    return {events, positions, truncated}
}

const interpolationView = (interpolation: Interpolation): {interpolation: string, slope?: number} =>
    interpolation.type === "curve"
        ? {interpolation: interpolation.type, slope: interpolation.slope}
        : {interpolation: interpolation.type}

export class PatternTools {
    readonly #resolver: ControlResolver

    constructor(resolver: ControlResolver) {this.#resolver = resolver}

    inspect(input: PatternInspectionInput | JsonObject): PatternInspectionResult {
        const value = assertRecord(input, "inspect_patterns input")
        assertKnownProperties(value, ["regions", "startMusical", "endMusical"], "inspect_patterns input")
        if (!Array.isArray(value.regions) || value.regions.length < 1 || value.regions.length > 8) {
            throw new Error("regions must contain between 1 and 8 region handles")
        }
        const timeline = this.#timeline()
        const regions = value.regions.map((handle, index) => this.#resolveRegion(handle, index))
        const hasRange = Object.hasOwn(value, "startMusical") || Object.hasOwn(value, "endMusical")
        const selectedRange = hasRange
            ? resolveMusicalRange(value, timeline,
                {startPosition: 0, endPosition: this.#maxRegionEnd(regions)}, "inspect_patterns input")
            : undefined
        const inspected = regions.map(region => this.#inspectRegion(
            region, timeline, selectedRange?.startPosition, selectedRange?.endPosition))
        return {
            regions: inspected,
            ...(selectedRange === undefined ? {} : {range: selectedRange})
        }
    }

    #timeline(): SignatureTrackAdapter {
        const timeline = this.#resolver.adapters().find(adapter => adapter instanceof TimelineBoxAdapter)
        if (!(timeline instanceof TimelineBoxAdapter)) {
            throw new Error("Project signature track is unavailable.")
        }
        return timeline.signatureTrack
    }

    #resolveRegion(value: unknown, index: number): NoteRegionBoxAdapter | ValueRegionBoxAdapter {
        const resolved = this.#resolver.resolve(boxSpec, value)
        if (!(resolved instanceof NoteRegionBox || resolved instanceof ValueRegionBox)) {
            throw new Error(`regions[${index}] must be a NoteRegionBox or ValueRegionBox handle`)
        }
        const adapter = this.#resolver.adapters().find(candidate => candidate.box === resolved)
        if (adapter instanceof NoteRegionBoxAdapter || adapter instanceof ValueRegionBoxAdapter) {return adapter}
        throw new Error(`regions[${index}] is not an inspectable timeline region`)
    }

    #maxRegionEnd(regions: ReadonlyArray<NoteRegionBoxAdapter | ValueRegionBoxAdapter>): ppqn {
        return Math.max(0, ...regions.map(region => region.complete))
    }

    #inspectRegion(region: NoteRegionBoxAdapter | ValueRegionBoxAdapter,
                   signatureTrack: SignatureTrackAdapter,
                   selectedStart?: ppqn,
                   selectedEnd?: ppqn): PatternInspectionRegion {
        const start = selectedStart ?? region.position
        const end = selectedEnd ?? region.complete
        const base = {
            region: this.#resolver.handle(region.box),
            label: region.label,
            regionStart: timedPosition(signatureTrack, region.position),
            regionEnd: timedPosition(signatureTrack, region.complete),
            loop: {offsetPulses: region.loopOffset, durationPulses: region.loopDuration}
        }
        if (region instanceof NoteRegionBoxAdapter) {
            const collection = region.optCollection.unwrapOrUndefined()
            const occurrences = noteOccurrences(region, start, end, OCCURRENCE_LIMIT)
            const events: PatternNoteEvent[] = occurrences.events.map(({event, timelinePosition}) =>
                ({
                    handle: this.#resolver.handle(event),
                    sourcePositionPulses: event.position,
                    timelinePositionPulses: timelinePosition,
                    timelineMusical: musicalPosition(signatureTrack, timelinePosition),
                    durationPulses: event.duration,
                    pitch: event.pitch,
                    velocity: event.velocity,
                    cent: event.cent,
                    chance: event.chance,
                    playCount: event.playCount
                }))
            events.sort((left, right) => left.timelinePositionPulses - right.timelinePositionPulses
                || left.pitch - right.pitch || left.handle.$address.localeCompare(right.handle.$address))
            return {
                kind: "notes",
                ...base,
                sourceEventCount: collection?.events.length() ?? 0,
                eventCount: events.length,
                events,
                truncated: occurrences.truncated
            } satisfies PatternNoteRegion
        }
        const collection = region.optCollection.unwrapOrUndefined()
        const occurrences = valueOccurrences(region, start, end, OCCURRENCE_LIMIT)
        const events: PatternValueEvent[] = occurrences.events.map((event, index) => {
            const view = interpolationView(event.interpolation)
            return {
                handle: this.#resolver.handle(event),
                sourcePositionPulses: event.position,
                timelinePositionPulses: occurrences.positions[index],
                timelineMusical: musicalPosition(signatureTrack, occurrences.positions[index]),
                value: event.value,
                ...view
            }
        })
        return {
            kind: "automation",
            ...base,
            sourceEventCount: collection?.events.length() ?? 0,
            eventCount: events.length,
            events,
            truncated: occurrences.truncated
        } satisfies PatternValueRegion
    }
}
