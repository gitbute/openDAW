import {Box} from "@opendaw/lib-box"
import {ppqn} from "@opendaw/lib-dsp"
import {
    AnyRegionBoxAdapter,
    AudioRegionBoxAdapter,
    AudioUnitBoxAdapter,
    NoteEventCollectionBoxAdapter,
    NoteRegionBoxAdapter,
    RootBoxAdapter,
    SignatureTrackAdapter,
    TimelineBoxAdapter,
    TrackBoxAdapter,
    TrackType,
    ValueEventCollectionBoxAdapter,
    ValueRegionBoxAdapter
} from "@opendaw/studio-adapters"
import type {ControlHandle, JsonObject} from "../control-api/types"
import {ControlResolver} from "../control-api/ControlResolver"
import {musicalPosition, resolveMusicalRange} from "./MusicalTime"
import {assertKnownProperties, assertRecord} from "./ToolInput"
import {noteRegionHasActivity} from "./PatternTools"
import type {
    ArrangementAudioUnit,
    ArrangementAutomationContent,
    ArrangementContent,
    ArrangementInspectionInput,
    ArrangementInspectionResult,
    ArrangementNoteContent,
    ArrangementRange,
    ArrangementRegion,
    ArrangementTrack
} from "./types"

type HandleSpec = {
    readonly kind: "handle"
    readonly handle: "box"
    readonly name: "AudioUnitBox"
}

type Bucket = {readonly start: ppqn, readonly end: ppqn}

type TrackSnapshot = {
    readonly adapter: TrackBoxAdapter
    readonly regions: ReadonlyArray<AnyRegionBoxAdapter>
}

type UnitSnapshot = {
    readonly adapter: AudioUnitBoxAdapter
    readonly tracks: ReadonlyArray<TrackSnapshot>
}

type ContentState = {
    readonly contents: Array<ArrangementContent>
    readonly ids: Map<string, string>
    nextNotes: number
    nextAutomation: number
}

const boxSpec: HandleSpec = {kind: "handle", handle: "box", name: "AudioUnitBox"}

const regionIntersects = (region: AnyRegionBoxAdapter, start: ppqn, end: ppqn): boolean =>
    region.position < end && region.complete > start

const trackTypeName = (type: TrackType): string =>
    typeof TrackType[type] === "string" ? TrackType[type] : TrackType.toLabelString(type)

const uniqueHandles = (handles: ReadonlyArray<ControlHandle>): ReadonlyArray<ControlHandle> => {
    const seen = new Set<string>()
    return handles.filter(handle => {
        if (seen.has(handle.$address)) {return false}
        seen.add(handle.$address)
        return true
    }).toSorted((left, right) => left.$address.localeCompare(right.$address))
}

export class ArrangementTools {
    readonly #resolver: ControlResolver

    constructor(resolver: ControlResolver) {
        this.#resolver = resolver
    }

    inspect(input: ArrangementInspectionInput | JsonObject = {}): ArrangementInspectionResult {
        const value = assertRecord(input, "inspect_arrangement input")
        assertKnownProperties(value, ["target", "startPosition", "endPosition", "startMusical", "endMusical"], "inspect_arrangement input")

        const root = this.#resolver.adapters().find(adapter => adapter instanceof RootBoxAdapter)
        if (!(root instanceof RootBoxAdapter)) {throw new Error("Project root is unavailable.")}
        const timeline = this.#resolver.adapters().find(adapter => adapter instanceof TimelineBoxAdapter)
        if (!(timeline instanceof TimelineBoxAdapter)) {throw new Error("Project timeline is unavailable.")}

        const allUnits = root.audioUnits.adapters()
        let target: AudioUnitBoxAdapter | undefined
        if (value.target !== undefined) {
            const resolved = this.#resolver.resolve(boxSpec, value.target)
            if (!(resolved instanceof Box)) {throw new Error("target must address an AudioUnitBox")}
            target = this.#targetUnit(resolved, allUnits)
        }
        const units = target === undefined ? allUnits : [target]

        const defaultEnd = Math.max(
            0,
            timeline.box.durationInPulses.getValue(),
            ...allUnits.flatMap(unit => unit.tracks.values()
                .flatMap(track => track.regions.collection.asArray().map(region => region.complete)))
        )
        const range = resolveMusicalRange(value, timeline.signatureTrack,
            {startPosition: 0, endPosition: defaultEnd}, "inspect_arrangement input") as ArrangementRange
        const {resolutionBars, buckets} = this.#buckets(range, timeline.signatureTrack)
        const snapshots = units.map(unit => ({
            adapter: unit,
            tracks: unit.tracks.values().map(track => ({
                adapter: track,
                regions: Array.from(track.regions.collection.iterateRange(range.startPosition, range.endPosition))
                    .filter(region => regionIntersects(region, range.startPosition, range.endPosition))
            }))
        }))
        const contentState: ContentState = {
            contents: [],
            ids: new Map(),
            nextNotes: 1,
            nextAutomation: 1
        }
        const audioUnits = snapshots.map(snapshot => this.#audioUnitView(
            snapshot, buckets, timeline.signatureTrack, contentState))
        const density = buckets.map(bucket => snapshots.filter(snapshot =>
            snapshot.tracks.some(track => this.#isActive(track, bucket, true))).length)
        const markers = timeline.markerTrack.events.asArray()
            .filter(marker => marker.position >= range.startPosition && marker.position < range.endPosition)
            .map(marker => ({
                handle: this.#resolver.handle(marker),
                position: marker.position,
                musical: musicalPosition(timeline.signatureTrack, marker.position),
                label: marker.label
            }))

        return {
            range,
            resolutionBars,
            density,
            markers,
            audioUnits,
            contents: contentState.contents
        }
    }

    #targetUnit(resolved: Box, units: ReadonlyArray<AudioUnitBoxAdapter>): AudioUnitBoxAdapter {
        const unit = units.find(candidate => candidate.box === resolved)
        if (unit === undefined) {throw new Error("target must address an AudioUnitBox in the project")}
        return unit
    }

    #buckets(range: ArrangementRange, signatureTrack: SignatureTrackAdapter): {
        resolutionBars: number
        buckets: ReadonlyArray<Bucket>
    } {
        if (range.endPosition <= range.startPosition) {
            return {resolutionBars: 1, buckets: [{start: range.startPosition, end: range.endPosition}]}
        }
        const startBar = signatureTrack.toParts(range.startPosition).bars
        const beforeEnd = Math.max(range.startPosition, range.endPosition - 0.000001)
        const endBar = signatureTrack.toParts(beforeEnd).bars
        const barCount = Math.max(1, endBar - startBar + 1)
        let resolutionBars = 1
        while (Math.ceil(barCount / resolutionBars) > 32) {resolutionBars *= 2}
        const bucketCount = Math.max(1, Math.ceil(barCount / resolutionBars))
        const buckets = Array.from({length: bucketCount}, (_, index) => {
            const start = index === 0
                ? range.startPosition
                : Math.min(range.endPosition, signatureTrack.fromParts({
                    bars: startBar + index * resolutionBars,
                    beats: 0,
                    semiquavers: 0,
                    ticks: 0
                }))
            const end = index === bucketCount - 1
                ? range.endPosition
                : Math.min(range.endPosition, signatureTrack.fromParts({
                    bars: startBar + (index + 1) * resolutionBars,
                    beats: 0,
                    semiquavers: 0,
                    ticks: 0
                }))
            return {start, end}
        })
        return {resolutionBars, buckets}
    }

    #audioUnitView(snapshot: UnitSnapshot, buckets: ReadonlyArray<Bucket>,
                   signatureTrack: SignatureTrackAdapter, contentState: ContentState): ArrangementAudioUnit {
        const musicalActivity = buckets.map(bucket =>
            snapshot.tracks.some(track => this.#isActive(track, bucket, true)) ? "1" : "0").join("")
        const automationActivity = buckets.map(bucket =>
            snapshot.tracks.some(track => this.#isActive(track, bucket, false)) ? "1" : "0").join("")
        return {
            handle: this.#resolver.handle(snapshot.adapter),
            label: snapshot.adapter.label,
            type: snapshot.adapter.type,
            isInstrument: snapshot.adapter.isInstrument,
            isBus: snapshot.adapter.isBus,
            isOutput: snapshot.adapter.isOutput,
            musicalActivity,
            automationActivity,
            tracks: snapshot.tracks.map(track => this.#trackView(track, signatureTrack, contentState))
        }
    }

    #trackView(snapshot: TrackSnapshot, signatureTrack: SignatureTrackAdapter,
               contentState: ContentState): ArrangementTrack {
        return {
            handle: this.#resolver.handle(snapshot.adapter),
            type: trackTypeName(snapshot.adapter.type),
            targetName: snapshot.adapter.targetName.mapOr(value => value, ""),
            targetControlName: snapshot.adapter.targetControlName.mapOr(value => value, ""),
            regions: snapshot.regions.map(region => this.#regionView(region, signatureTrack, contentState))
        }
    }

    #regionView(region: AnyRegionBoxAdapter, signatureTrack: SignatureTrackAdapter,
                contentState: ContentState): ArrangementRegion {
        const base: ArrangementRegion = {
            handle: this.#resolver.handle(region),
            label: region.label,
            startPosition: region.position,
            endPosition: region.complete,
            startMusical: musicalPosition(signatureTrack, region.position),
            endMusical: musicalPosition(signatureTrack, region.complete),
            muted: region.mute,
            loopOffset: region.loopOffset,
            loopDuration: region.loopDuration
        }
        if (region instanceof NoteRegionBoxAdapter) {
            const collection = region.optCollection.unwrapOrUndefined()
            return collection === undefined
                ? base
                : {...base, content: this.#contentId(collection, contentState)}
        }
        if (region instanceof ValueRegionBoxAdapter) {
            const collection = region.optCollection.unwrapOrUndefined()
            return collection === undefined
                ? base
                : {...base, content: this.#contentId(collection, contentState)}
        }
        if (region instanceof AudioRegionBoxAdapter) {
            const audioFile = region.optFile.mapOr(file => this.#resolver.handle(file), undefined)
            const gain = region.gain.getValue()
            return {
                ...base,
                ...(audioFile === undefined ? {} : {audioFile}),
                ...(Number.isFinite(gain) ? {gain} : {})
            }
        }
        return base
    }

    #contentId(collection: NoteEventCollectionBoxAdapter | ValueEventCollectionBoxAdapter,
               state: ContentState): string {
        const key = collection.address.toString()
        const existing = state.ids.get(key)
        if (existing !== undefined) {return existing}
        const id = collection instanceof NoteEventCollectionBoxAdapter
            ? `n${state.nextNotes++}`
            : `a${state.nextAutomation++}`
        state.ids.set(key, id)
        state.contents.push(collection instanceof NoteEventCollectionBoxAdapter
            ? this.#noteContent(collection, id)
            : this.#automationContent(collection, id))
        return id
    }

    #owners(collection: NoteEventCollectionBoxAdapter | ValueEventCollectionBoxAdapter): ReadonlyArray<ControlHandle> {
        return uniqueHandles(collection.box.owners.pointerHub.incoming()
            .map(pointer => this.#resolver.handle(pointer.box)))
    }

    #noteContent(collection: NoteEventCollectionBoxAdapter, id: string): ArrangementNoteContent {
        const events = collection.events.asArray()
        if (events.length === 0) {
            return {
                id,
                kind: "notes",
                handle: this.#resolver.handle(collection),
                eventsHandle: this.#resolver.handle(collection.box.events),
                owners: this.#owners(collection),
                noteCount: 0,
                sourceSpanPulses: 0,
                pitchMin: null,
                pitchMax: null,
                uniquePitches: 0,
                averagePitch: null,
                averageVelocity: null,
                averageDurationPulses: null
            }
        }
        let minPitch = Infinity
        let maxPitch = -Infinity
        let minPosition = Infinity
        let maxComplete = -Infinity
        let pitchTotal = 0
        let velocityTotal = 0
        let durationTotal = 0
        const pitches = new Set<number>()
        events.forEach(event => {
            minPitch = Math.min(minPitch, event.pitch)
            maxPitch = Math.max(maxPitch, event.pitch)
            minPosition = Math.min(minPosition, event.position)
            maxComplete = Math.max(maxComplete, event.complete)
            pitchTotal += event.pitch
            velocityTotal += event.velocity
            durationTotal += event.duration
            pitches.add(event.pitch)
        })
        return {
            id,
            kind: "notes",
            handle: this.#resolver.handle(collection),
            eventsHandle: this.#resolver.handle(collection.box.events),
            owners: this.#owners(collection),
            noteCount: events.length,
            sourceSpanPulses: Math.max(0, maxComplete - minPosition),
            pitchMin: minPitch,
            pitchMax: maxPitch,
            uniquePitches: pitches.size,
            averagePitch: pitchTotal / events.length,
            averageVelocity: velocityTotal / events.length,
            averageDurationPulses: durationTotal / events.length
        }
    }

    #automationContent(collection: ValueEventCollectionBoxAdapter, id: string): ArrangementAutomationContent {
        const events = collection.events.asArray()
        if (events.length === 0) {
            return {
                id,
                kind: "automation",
                handle: this.#resolver.handle(collection),
                eventsHandle: this.#resolver.handle(collection.box.events),
                owners: this.#owners(collection),
                eventCount: 0,
                sourceSpanPulses: 0,
                minValue: null,
                maxValue: null,
                startValue: null,
                endValue: null
            }
        }
        let minValue = Infinity
        let maxValue = -Infinity
        events.forEach(event => {
            minValue = Math.min(minValue, event.value)
            maxValue = Math.max(maxValue, event.value)
        })
        const startValue = events[0].value
        const endValue = events.at(-1)!.value
        return {
            id,
            kind: "automation",
            handle: this.#resolver.handle(collection),
            eventsHandle: this.#resolver.handle(collection.box.events),
            owners: this.#owners(collection),
            eventCount: events.length,
            sourceSpanPulses: Math.max(0, events.at(-1)!.position - events[0].position),
            minValue: Number.isFinite(minValue) ? minValue : null,
            maxValue: Number.isFinite(maxValue) ? maxValue : null,
            startValue: Number.isFinite(startValue) ? startValue : null,
            endValue: Number.isFinite(endValue) ? endValue : null
        }
    }

    #isActive(snapshot: TrackSnapshot, bucket: Bucket, musical: boolean): boolean {
        const type = snapshot.adapter.type
        if (musical
            ? type !== TrackType.Notes && type !== TrackType.Audio
            : type !== TrackType.Value) {
            return false
        }
        if (!snapshot.adapter.enabled.getValue()) {return false}
        return snapshot.regions.some(region => {
            if (region.mute) {return false}
            if (musical && region instanceof NoteRegionBoxAdapter) {
                return noteRegionHasActivity(region, bucket.start, bucket.end)
            }
            return regionIntersects(region, bucket.start, bucket.end)
        })
    }
}
