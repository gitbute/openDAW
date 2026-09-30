import {int, isDefined} from "@opendaw/lib-std"
import {AudioMetrics} from "@opendaw/lib-dsp"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AgentRender, AgentRenderStem} from "@/agent/listen/AgentRender"


const REGIONS: ReadonlyArray<readonly [string, number, number]> = [
    ["sub", 20, 60], ["low", 60, 250], ["lowMid", 250, 2000], ["highMid", 2000, 6000], ["high", 6000, 20000]]

const round = (value: number, digits: int = 1): number => {
    const scale = 10 ** digits
    return Math.round(value * scale) / scale
}

const bandPower = (bands: ReadonlyArray<AudioMetrics.Band>, fromHz: number, toHz: number): number => {
    const power = bands.filter(band => band.centerHz >= fromHz && band.centerHz < toHz)
        .reduce((sum, band) => sum + 10 ** (band.db / 10), 0)
    return power > 1e-12 ? round(10 * Math.log10(power)) : -120
}

const regions = (bands: ReadonlyArray<AudioMetrics.Band>): JsonObject =>
    Object.fromEntries(REGIONS.map(([name, fromHz, toHz]) => [name, bandPower(bands, fromHz, toHz)]))

const loudness = ({integratedLufs, loudnessRangeLu, truePeakDbtp, crestDb, maxShortTermLufs}: AudioMetrics.Loudness): JsonObject =>
    ({lufs: round(integratedLufs), lra: round(loudnessRangeLu), truePeakDbtp: round(truePeakDbtp),
        crestDb: round(crestDb), maxShortTermLufs: round(maxShortTermLufs)})

const perBar = (channels: AudioMetrics.Channels, sampleRate: number, barStartFrames: ReadonlyArray<int>): JsonValue =>
    AudioMetrics.loudnessPerSegment(channels, sampleRate, barStartFrames)
        .map(segment => segment.silent ? null : round(segment.lufs))

const timing = (onsets: ReadonlyArray<number>, stepSeconds: number): JsonValue => {
    if (onsets.length < 4) {return null}
    const {count, meanAbsDeviationMs, meanDeviationMs, fractionOnGrid, swingEstimate} = AudioMetrics.timing(onsets, stepSeconds)
    return {onsets: count, meanAbsDeviationMs: round(meanAbsDeviationMs), meanDeviationMs: round(meanDeviationMs),
        fractionOn16thGrid: round(fractionOnGrid, 2), swing: isDefined(swingEstimate) ? round(swingEstimate, 2) : null}
}

const stereo = (bands: ReadonlyArray<AudioMetrics.StereoBand>): JsonValue =>
    bands.filter(band => band.db > -90)
        .map(({centerHz, correlation, widthDb}) => ({hz: centerHz, correlation: round(correlation, 2), widthDb: round(widthDb)}))

const warnings = (mix: AudioMetrics.Analysis, stems: ReadonlyArray<AgentRenderStem>): ReadonlyArray<string> => {
    const {truePeakDbtp, silent} = mix.loudness
    const lowCorrelation = mix.stereoBands.filter(band => band.centerHz <= 125 && band.db > -60 && band.correlation < 0.5)
    return [
        ...(silent ? ["mix is silent"] : []),
        ...(truePeakDbtp > -1 ? [`true peak ${round(truePeakDbtp)} dBTP (above -1)`] : []),
        ...(lowCorrelation.length > 0 ? [`low end below 125 Hz is not mono-compatible (correlation < 0.5)`] : []),
        ...stems.filter(stem => stem.silent).map(stem => `stem '${stem.label}' is silent`)
    ]
}

export namespace ListenAnalysis {
    export const analyze = ({sampleRate, mix, stems, barStartFrames, stepSeconds}: AgentRender): JsonObject => {
        const options = {minIntervalSeconds: Math.max(0.03, 0.6 * stepSeconds)}
        const mixAnalysis = AudioMetrics.analyse(mix, sampleRate, options)
        const stemAnalyses = stems.map(stem => ({stem, analysis: stem.silent ? null : AudioMetrics.analyse(stem.channels, sampleRate, options)}))
        const masking = stemAnalyses.flatMap((first, index) => stemAnalyses.slice(index + 1).map(second => ({first, second})))
            .flatMap(({first, second}) => {
                if (!isDefined(first.analysis) || !isDefined(second.analysis)) {return []}
                if (AgentRender.related(first.stem, second.stem)) {return []}
                const {score, bands} = AudioMetrics.masking(first.analysis.spectrum, second.analysis.spectrum)
                const worst = [...bands].sort((first, second) => second.score - first.score).slice(0, 3).filter(band => band.score > 0.2)
                return score < 0.35 ? [] : [{pair: [first.stem.label, second.stem.label], score: round(score, 2), bandsHz: worst.map(band => band.centerHz)}]
            })
            .sort((first, second) => second.score - first.score)
            .slice(0, 6)
        return {
            mix: {
                ...loudness(mixAnalysis.loudness),
                lufsPerBar: perBar(mix, sampleRate, barStartFrames),
                spectrumRegionsDb: regions(mixAnalysis.spectrum),
                thirdOctaveDb: mixAnalysis.spectrum.map(band => [band.centerHz, round(band.db)]),
                stereoBands: stereo(mixAnalysis.stereoBands),
                timing: timing(mixAnalysis.onsets, stepSeconds)
            },
            stems: stemAnalyses.map(({stem, analysis}): JsonObject => isDefined(analysis) ? {
                label: stem.label,
                ...loudness(analysis.loudness),
                lufsPerBar: perBar(stem.channels, sampleRate, barStartFrames),
                spectrumRegionsDb: regions(analysis.spectrum),
                timing: timing(analysis.onsets, stepSeconds)
            } : {label: stem.label, silent: true}),
            masking,
            warnings: warnings(mixAnalysis, stems)
        }
    }
}
