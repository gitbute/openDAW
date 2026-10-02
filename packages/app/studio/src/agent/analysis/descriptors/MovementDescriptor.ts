import {int, isDefined, Option, Optional} from "@opendaw/lib-std"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundNote, SoundTarget} from "../SoundTarget"
import {MeasureMath} from "./dsp/MeasureMath"
import {ModulationRate} from "./dsp/ModulationRate"
import {SpectralFrames} from "./dsp/SpectralFrames"

const MinSegmentSeconds = 0.5
const MinRateHz = 0.25
const MaxRateHz = 16
const AmpMinDepthDb = 1.5
const BrightMinDepthOct = 0.15
const SweepMinOct = 0.4
const CurvePoints = 16

type Range = {from: int, to: int, note: Optional<int>}
type Modulation = {rateHz: number, depth: number}
type Shape = "static" | "periodic" | "sweep up" | "sweep down" | "periodic+sweep up" | "periodic+sweep down"
type Segment = {
    note: Optional<int>, seconds: number, startHz: number, endHz: number
    amp: Option<Modulation>, bright: Option<Modulation>, sweepOct: number, shape: Shape
}

const {round, median} = MeasureMath

const activeValues = (values: Float64Array, active: Uint8Array, from: int, to: int): Array<number> => {
    const result: Array<number> = []
    for (let index = from; index < to; index++) {if (active[index] === 1) {result.push(values[index])}}
    return result
}

const thirds = ({centroidHz, active}: SpectralFrames.Frames, from: int, to: int): ReadonlyArray<number> => {
    const values = activeValues(centroidHz, active, from, to)
    const third = Math.max(1, Math.floor(values.length / 3))
    return [values.slice(0, third), values.slice(Math.floor((values.length - third) / 2), Math.floor((values.length + third) / 2)),
        values.slice(values.length - third)].map(slice => slice.length > 0 ? median(slice) : NaN)
}

const modulationOf = (curve: Float64Array, frameRate: number, minHz: number, maxHz: number, minDepth: number,
                      response: (rateHz: number) => number): {trend: ModulationRate.Trend, modulation: Option<Modulation>} => {
    const trend = ModulationRate.trend(curve, frameRate)
    const modulation = ModulationRate.periodicity(trend.residual, frameRate, minHz, maxHz)
        .map(({rateHz}): Optional<Modulation> => {
            const depth = ModulationRate.depth(trend.residual, frameRate, rateHz) / response(rateHz)
            return depth >= minDepth ? {rateHz, depth} : undefined
        })
    return {trend, modulation}
}

const analyseSegment = (frames: SpectralFrames.Frames, {from, to, note}: Range): Segment => {
    const {powerDb, centroidHz, frameRate} = frames
    const seconds = (to - from) / frameRate
    const minHz = Math.max(MinRateHz, 2 / seconds), maxHz = Math.min(MaxRateHz, frameRate / 3)
    let peak = -Infinity
    for (let index = from; index < to; index++) {peak = Math.max(peak, powerDb[index])}
    const level = Float64Array.from(powerDb.subarray(from, to), value => Math.max(value, peak - 60))
    const octaves = Float64Array.from(centroidHz.subarray(from, to), value => Math.log2(Math.max(20, value)))
    const amp = modulationOf(level, frameRate, minHz, maxHz, AmpMinDepthDb, SpectralFrames.envelopeResponse).modulation
    const {trend, modulation} = modulationOf(octaves, frameRate, minHz, maxHz, BrightMinDepthOct, () => 1)
    const change = trend.change
    const linearSweep = Math.abs(change) >= SweepMinOct && trend.r2 >= 0.5
    // ripples on a clear sweep are not a modulation
    const bright = linearSweep ? modulation.map(mod => mod.depth >= 0.1 * Math.abs(change) ? mod : undefined) : modulation
    const sweep = linearSweep || (Math.abs(change) >= SweepMinOct && bright.mapOr(({depth}) => Math.abs(change) >= depth, false))
    const direction = change > 0 ? "sweep up" : "sweep down"
    const shape: Shape = bright.nonEmpty() ? (sweep ? `periodic+${direction}` : "periodic") : sweep ? direction : "static"
    const [startHz, , endHz] = thirds(frames, from, to)
    return {note, seconds, startHz, endHz, amp, bright, sweepOct: sweep ? change : 0, shape}
}

const modulationJson = (rateHz: number, depth: number, depthKey: string, digits: int, bpm: number): JsonObject => {
    const sync = ModulationRate.tempoSync(rateHz, bpm)
    return {rateHz: round(rateHz, 2), ...(isDefined(sync) ? {sync} : {}), [depthKey]: round(depth, digits)}
}

const noteRanges = (frames: SpectralFrames.Frames, notes: ReadonlyArray<SoundNote>): ReadonlyArray<Range> => {
    const half = frames.fftSize / 2, hop = frames.hop
    const seen = new Set<string>()
    return notes.flatMap(({index, startFrame, endFrame, offFrame}) => {
        const from = Math.max(0, Math.ceil((startFrame - half) / hop))
        const to = Math.min(frames.count, Math.floor(((offFrame ?? endFrame) - half) / hop) + 1)
        const key = `${from}:${to}`
        if ((to - from) / frames.frameRate < MinSegmentSeconds || seen.has(key)) {return []}
        seen.add(key)
        return [{from, to, note: index}]
    })
}

const wholeRange = ({active, frameRate}: SpectralFrames.Frames): ReadonlyArray<Range> => {
    const from = active.indexOf(1), to = active.lastIndexOf(1) + 1
    return (to - from) / frameRate >= MinSegmentSeconds ? [{from, to, note: undefined}] : []
}

const followsNotes = (rateHz: number, notes: ReadonlyArray<SoundNote>, sampleRate: number): boolean => {
    if (notes.length < 3) {return false}
    const starts = notes.map(({startFrame}) => startFrame).sort((first, second) => first - second)
    const intervals = starts.slice(1).map((start, index) => start - starts[index]).filter(interval => interval > 0)
    if (intervals.length < 2) {return false}
    const noteRate = sampleRate / median(intervals)
    return [0.5, 1, 2].some(factor => Math.abs(rateHz / (noteRate * factor) - 1) < 0.03)
}

const share = (selected: ReadonlyArray<Segment>, segments: ReadonlyArray<Segment>): JsonObject => {
    if (segments.length < 2) {return {}}
    const seconds = (list: ReadonlyArray<Segment>) => list.reduce((sum, segment) => sum + segment.seconds, 0)
    return {share: round(seconds(selected) / seconds(segments), 2)}
}

const ampSummary = (segments: ReadonlyArray<Segment>, bpm: number): Optional<JsonObject> => {
    const modulated = segments.filter(({amp}) => amp.nonEmpty())
    if (modulated.length === 0) {return undefined}
    return {
        ...modulationJson(median(modulated.map(({amp}) => amp.unwrap().rateHz)),
            median(modulated.map(({amp}) => amp.unwrap().depth)), "depthDb", 1, bpm),
        ...share(modulated, segments)
    }
}

const brightSummary = (segments: ReadonlyArray<Segment>, bpm: number): JsonObject => {
    const weights = new Map<Shape, number>()
    segments.forEach(({shape, seconds}) => weights.set(shape, (weights.get(shape) ?? 0) + seconds))
    const shape = [...weights.entries()].sort((first, second) => second[1] - first[1])[0][0]
    const periodic = segments.filter(({bright}) => bright.nonEmpty())
    const sweeps = segments.filter(segment => segment.sweepOct !== 0 && segment.shape === shape)
    return {
        shape,
        ...(periodic.length > 0 && shape.startsWith("periodic") ? {
            ...modulationJson(median(periodic.map(({bright}) => bright.unwrap().rateHz)),
                median(periodic.map(({bright}) => bright.unwrap().depth)), "depthOct", 2, bpm),
            ...share(periodic, segments)
        } : {}),
        ...(sweeps.length > 0 ? {sweepOct: round(median(sweeps.map(({sweepOct}) => sweepOct)), 2)} : {})
    }
}

const Columns = ["note", "startHz", "endHz", "ampHz", "ampSync", "ampDb", "bright", "brightHz", "brightSync", "brightOct", "sweepOct"]

const segmentRow = ({note, startHz, endHz, amp, bright, shape, sweepOct}: Segment, bpm: number): ReadonlyArray<JsonValue> => [
    note ?? null, round(startHz, 0), round(endHz, 0),
    amp.mapOr(({rateHz}) => round(rateHz, 2), null), amp.mapOr(({rateHz}) => ModulationRate.tempoSync(rateHz, bpm) ?? null, null),
    amp.mapOr(({depth}) => round(depth, 1), null), shape === "static" ? null : shape,
    bright.mapOr(({rateHz}) => round(rateHz, 2), null), bright.mapOr(({rateHz}) => ModulationRate.tempoSync(rateHz, bpm) ?? null, null),
    bright.mapOr(({depth}) => round(depth, 2), null), sweepOct === 0 ? null : round(sweepOct, 2)]

export const MovementDescriptor: SoundDescriptor = {
    key: "movement",
    summary: "movement: brightnessHz, flux, ampMod (tremolo/pump), brightMod (filter motion): rateHz, sync, depth, sweep",
    describe: ({channels, sampleRate, notes, bpm, focused}: SoundTarget): JsonValue => {
        const frames = SpectralFrames.analyse(channels, sampleRate)
        if (frames.count < 8) {return {tooShort: true}}
        if (frames.activeCount < 4) {return {silent: true}}
        const {centroidHz, flux, active, count, frameRate} = frames
        const [startHz, midHz, endHz] = thirds(frames, 0, count)
        const sortedCentroid = MeasureMath.sorted(activeValues(centroidHz, active, 0, count))
        const fluxValues: Array<number> = []
        for (let index = 1; index < count; index++) {if (active[index] === 1 && active[index - 1] === 1) {fluxValues.push(flux[index])}}
        const sortedFlux = MeasureMath.sorted(fluxValues)
        const ranges = noteRanges(frames, notes)
        const segments = (ranges.length > 0 ? ranges : wholeRange(frames)).map(range => analyseSegment(frames, range))
        const ampMod = segments.length === 0 ? undefined : ampSummary(segments, bpm)
        const notesDriveAmp = ranges.length === 0 && segments.length > 0 && segments[0].amp
            .mapOr(({rateHz}) => followsNotes(rateHz, notes, sampleRate), false)
        const result: JsonObject = {
            brightnessHz: {start: round(startHz, 0), mid: round(midHz, 0), end: round(endHz, 0),
                p10: round(MeasureMath.percentile(sortedCentroid, 0.1), 0), p90: round(MeasureMath.percentile(sortedCentroid, 0.9), 0)},
            fluxMean: round(MeasureMath.mean(sortedFlux), 3),
            fluxP95: round(MeasureMath.percentile(sortedFlux, 0.95), 3),
            scope: ranges.length > 0 ? "notes" : "whole",
            ampMod: segments.length === 0 ? null : isDefined(ampMod) ? {...ampMod, ...(notesDriveAmp ? {followsNotes: true} : {})} : "none",
            brightMod: segments.length === 0 ? null : brightSummary(segments, bpm)
        }
        if (!focused) {return MeasureMath.compact(result)}
        return MeasureMath.compact({
            ...result,
            brightnessCurveHz: MeasureMath.curve(centroidHz, index => active[index] === 1, CurvePoints, median, 0),
            curveStepMs: Math.round(count / CurvePoints / frameRate * 1000),
            perNote: ranges.length > 0
                ? MeasureMath.noteTable(Columns, segments.map(segment => segmentRow(segment, bpm)), notes.length) : undefined
        })
    }
}
