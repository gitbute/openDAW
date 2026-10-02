import {int, isDefined, Optional} from "@opendaw/lib-std"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundNote, SoundTarget} from "../SoundTarget"
import {DecayTime} from "./dsp/DecayTime"
import {MeasureMath} from "./dsp/MeasureMath"
import {StereoBands} from "./dsp/StereoBands"

const CurvePoints = 16
const MovingRangeDb = 3

type TailWindow = {note: Optional<int>, from: int, to: int}

const {round, median} = MeasureMath

const tailWindows = (notes: ReadonlyArray<SoundNote>, numFrames: int): ReadonlyArray<TailWindow> => {
    if (notes.length === 0) {return [{note: undefined, from: 0, to: numFrames}]}
    const starts = notes.map(({startFrame}) => startFrame).sort((first, second) => first - second)
    const seen = new Set<int>()
    return notes.flatMap(({index, startFrame, offFrame}) => {
        const from = offFrame ?? startFrame
        const masked = isDefined(offFrame) && notes.some(other => other.startFrame <= offFrame
            && (other.offFrame ?? other.endFrame) > offFrame && other.index !== index)
        if (masked || seen.has(from)) {return []}
        seen.add(from)
        return [{note: index, from, to: starts.find(start => start > from) ?? numFrames}]
    })
}

const tails = (envelope: DecayTime.Envelope, notes: ReadonlyArray<SoundNote>, numFrames: int, focused: boolean): JsonObject => {
    const windows = tailWindows(notes, numFrames)
    const measured = windows.map(window => ({window, tail: DecayTime.measure(envelope, window.from, window.to)}))
    const decays = measured.flatMap(({tail}) => tail.mapOr(({decaySeconds}) => [decaySeconds], []))
    const earlyLate = windows.flatMap(({from, to}) => {
        const value = DecayTime.earlyLateDb(envelope, from, to)
        return isDefined(value) ? [value] : []
    })
    const source = notes.length === 0 ? "whole" : notes.some(({offFrame}) => isDefined(offFrame)) ? "note-offs" : "notes"
    return MeasureMath.compact({
        decaySeconds: round(median(decays), 2),
        tailsMeasured: decays.length,
        tailsFrom: source,
        earlyLateDb: round(median(earlyLate), 1),
        perNote: focused && notes.length > 0 ? MeasureMath.noteTable(["note", "decaySeconds"], measured
            .map(({window, tail}) => [window.note ?? null, tail.mapOr(({decaySeconds}) => round(decaySeconds, 2), null)]), notes.length)
            : undefined
    })
}

const bandJson = (band: StereoBands.Power): JsonObject => ({
    correlation: round(StereoBands.correlation(band), 2), sideDb: round(StereoBands.sideDb(band), 1),
    monoDb: round(StereoBands.monoDb(band), 1)
})

export const SpaceDescriptor: SoundDescriptor = {
    key: "space",
    summary: "space: correlation, sideDb (-60 mono..0 wide), monoDb, bands, balanceDb, width, decaySeconds, earlyLateDb",
    describe: ({channels, sampleRate, notes, focused}: SoundTarget): JsonValue => {
        const numFrames = MeasureMath.frameCount(channels)
        if (numFrames < sampleRate * 0.05) {return {tooShort: true}}
        const envelope = DecayTime.envelope(channels, sampleRate)
        if (envelope.power.every(power => power < 1e-10)) {return {silent: true}}
        const tailInfo = tails(envelope, notes, numFrames, focused)
        const left = channels[0], right = channels.length > 1 ? channels[1] : channels[0]
        if (channels.length < 2 || StereoBands.isMono(left, right)) {return {mono: true, ...tailInfo}}
        const {bands, blocks, blockSeconds} = StereoBands.analyse(left, right, sampleRate)
        const overall = StereoBands.sum(bands)
        const totalPower = StereoBands.total(overall)
        const loudestBlock = blocks.reduce((max, block) => Math.max(max, StereoBands.total(block)), 0)
        const blockSide = Float64Array.from(blocks, block => StereoBands.sideDb(block))
        const activeBlock = (index: int): boolean => StereoBands.total(blocks[index]) >= loudestBlock * 1e-3
        const activeSide = MeasureMath.sorted(blockSide.filter((_value, index) => activeBlock(index)))
        const sideRange = activeSide.length > 1 ? MeasureMath.percentile(activeSide, 0.9) - MeasureMath.percentile(activeSide, 0.1) : 0
        const result: JsonObject = {
            correlation: round(StereoBands.correlation(overall), 2),
            sideDb: round(StereoBands.sideDb(overall), 1),
            bands: Object.fromEntries(StereoBands.Names.map((name, index) =>
                [name, StereoBands.total(bands[index]) < totalPower * 1e-4 ? null : bandJson(bands[index])])),
            balanceDb: round(StereoBands.balanceDb(overall), 1),
            sideDbRange: round(sideRange, 1),
            width: sideRange >= MovingRangeDb ? "moving" : "stable",
            ...tailInfo
        }
        if (!focused) {return result}
        const points = Math.min(CurvePoints, blocks.length)
        return {
            ...result,
            sideDbCurve: MeasureMath.curve(blockSide, activeBlock, points, median, 1),
            curveStepMs: Math.round(blocks.length / Math.max(1, points) * blockSeconds * 1000)
        }
    }
}
