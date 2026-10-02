import {int} from "@opendaw/lib-std"
import {AudioMetrics} from "@opendaw/lib-dsp"
import type {JsonValue} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundTarget} from "../SoundTarget"
import {MeasureMath} from "./dsp/MeasureMath"

const ClipLevel = 0.999
const GateDb = -70
const NearPeakDb = 3
const CurvePoints = 16
const DcReportDb = -60
const FlatTopRun = 4

const {round} = MeasureMath

type Samples = {clipped: int, longestClipRun: int, longestPeakRun: int, dcOffset: number}

const shortTermLevels = (channels: AudioMetrics.Channels, sampleRate: number): Float64Array => {
    const blocks = MeasureMath.blockPower(channels, Math.max(1, Math.round(sampleRate * 0.1)))
    const width = Math.min(3, blocks.length)
    return Float64Array.from({length: blocks.length - width + 1}, (_value, start) =>
        MeasureMath.powerDb(MeasureMath.mean(blocks, start, start + width)))
}

const scanSamples = (channels: AudioMetrics.Channels, numFrames: int, samplePeak: number): Samples => {
    const peakLevel = samplePeak - 1e-5
    let clipped = 0, longestClipRun = 0, longestPeakRun = 0, dcOffset = 0
    for (const samples of channels) {
        let clipRun = 0, peakRun = 0, sum = 0
        for (let index = 0; index < numFrames; index++) {
            const value = samples[index]
            const magnitude = Math.abs(value)
            sum += value
            if (magnitude >= ClipLevel) {
                clipped++
                clipRun++
                if (clipRun > longestClipRun) {longestClipRun = clipRun}
            } else {
                clipRun = 0
            }
            if (magnitude >= peakLevel) {
                peakRun++
                if (peakRun > longestPeakRun) {longestPeakRun = peakRun}
            } else {
                peakRun = 0
            }
        }
        const mean = sum / numFrames
        if (Math.abs(mean) > Math.abs(dcOffset)) {dcOffset = mean}
    }
    return {clipped, longestClipRun, longestPeakRun, dcOffset}
}

export const DynamicsDescriptor: SoundDescriptor = {
    key: "dynamics",
    summary: "dynamics: plrDb, psrDb, rms300msDb p10/p50/p90, spreadDb, nearPeakShare (dense), clipping, flat tops, DC",
    describe: ({channels, sampleRate, focused, loudness: measured}: SoundTarget): JsonValue => {
        const numFrames = MeasureMath.frameCount(channels)
        if (numFrames < sampleRate * 0.05) {return {tooShort: true}}
        const loudness = measured ?? AudioMetrics.loudness(channels, sampleRate)
        if (loudness.samplePeakDbfs <= MeasureMath.FloorDb) {return {silent: true}}
        const levels = shortTermLevels(channels, sampleRate)
        const gated = MeasureMath.sorted(levels.filter(level => level >= GateDb))
        const loudest = gated.length > 0 ? gated[gated.length - 1] : MeasureMath.FloorDb
        const nearPeak = gated.filter(level => level >= loudest - NearPeakDb).length
        const {clipped, longestClipRun, longestPeakRun, dcOffset} = scanSamples(channels, numFrames, 10 ** (loudness.samplePeakDbfs / 20))
        const [p10, p50, p90] = [0.1, 0.5, 0.9].map(fraction => MeasureMath.percentile(gated, fraction))
        const dcOffsetDb = MeasureMath.amplitudeDb(Math.abs(dcOffset))
        const result = MeasureMath.compact({
            plrDb: loudness.silent ? null : round(loudness.truePeakDbtp - loudness.integratedLufs, 1),
            psrDb: loudness.maxShortTermLufs <= MeasureMath.FloorDb ? null : round(loudness.truePeakDbtp - loudness.maxShortTermLufs, 1),
            rms300msDb: gated.length === 0 ? null : {p10: round(p10, 1), p50: round(p50, 1), p90: round(p90, 1)},
            spreadDb: gated.length === 0 ? null : round(p90 - p10, 1),
            nearPeakShare: gated.length === 0 ? null : round(nearPeak / gated.length, 2),
            clippedSamples: clipped,
            longestClipRun: longestClipRun > 0 ? longestClipRun : null,
            longestPeakRun: longestPeakRun >= FlatTopRun ? longestPeakRun : null,
            dcOffsetDb: dcOffsetDb >= DcReportDb ? round(dcOffsetDb, 1) : null
        })
        if (!focused) {return result}
        const points = Math.min(CurvePoints, levels.length)
        return {
            ...result,
            rms300msDbCurve: MeasureMath.curve(levels, index => levels[index] >= GateDb, points, slice => Math.max(...slice), 1),
            curveStepMs: Math.round(levels.length / Math.max(1, points) * 100)
        }
    }
}
