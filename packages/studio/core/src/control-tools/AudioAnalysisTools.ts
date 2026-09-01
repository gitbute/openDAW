import {AudioAnalyser, AudioData} from "@opendaw/lib-dsp"
import {DefaultObservableValue, Option, UUID} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {AudioUnitBoxAdapter, ExportConfiguration} from "@opendaw/studio-adapters"
import {OfflineEngineRenderer} from "../OfflineEngineRenderer"
import {ControlResolver} from "../control-api/ControlResolver"
import type {JsonObject} from "../control-api/types"
import type {Project} from "../project/Project"
import type {AudioAnalysisResult, AudioAnalysisBand} from "./types"
import {assertKnownProperties, assertRecord, resolveMusicalRange} from "./ToolInput"

const WAVEFORM_BUCKETS = 64
const FFT_SIZE = AudioAnalyser.DEFAULT_SIZE << 1
const DB_FLOOR = -120
const SPECTRUM_EDGES = [20, 40, 80, 160, 315, 630, 1250, 2500, 5000, 10000, 20000]

const rounded = (value: number, digits: number = 3): number => {
    if (!Number.isFinite(value)) {return 0}
    return Number(value.toFixed(digits))
}

const dbfs = (amplitude: number): number => amplitude <= 0
    ? DB_FLOOR
    : Math.max(DB_FLOOR, 20 * Math.log10(amplitude))

const sampleAt = (frame: Float32Array | undefined, index: number): number => {
    const value = frame?.[index] ?? 0
    return Number.isFinite(value) ? value : 0
}

const channelFrames = (audioData: AudioData): ReadonlyArray<Float32Array> =>
    audioData.frames.slice(0, Math.min(2, audioData.numberOfChannels))

const amplitudeAt = (frames: ReadonlyArray<Float32Array>, index: number): number => {
    let amplitude = 0
    frames.forEach(frame => {amplitude = Math.max(amplitude, Math.abs(sampleAt(frame, index)))})
    return amplitude
}

const spectrumEdges = (sampleRate: number): ReadonlyArray<number> => {
    const nyquist = Math.max(0, sampleRate * 0.5)
    if (nyquist <= SPECTRUM_EDGES[0]) {return []}
    const edges: Array<number> = [SPECTRUM_EDGES[0]]
    for (const edge of SPECTRUM_EDGES.slice(1)) {
        const clipped = Math.min(edge, nyquist)
        if (clipped > edges.at(-1)!) {edges.push(clipped)}
        if (clipped >= nyquist) {break}
    }
    return edges
}

const summarizeSpectrum = (audioData: AudioData, frames: ReadonlyArray<Float32Array>): ReadonlyArray<AudioAnalysisBand> => {
    const analyser = new AudioAnalyser({size: AudioAnalyser.DEFAULT_SIZE})
    const left = new Float32Array(FFT_SIZE)
    const right = new Float32Array(FFT_SIZE)
    const leftFrame = frames[0]
    const rightFrame = frames[1]
    const numberOfFrames = Math.max(0, audioData.numberOfFrames)
    const blocks = Math.max(1, Math.ceil(numberOfFrames / FFT_SIZE))
    for (let block = 0; block < blocks; block++) {
        const offset = block * FFT_SIZE
        left.fill(0)
        right.fill(0)
        const length = Math.max(0, Math.min(FFT_SIZE, numberOfFrames - offset))
        if (length > 0) {
            for (let index = 0; index < length; index++) {
                left[index] = sampleAt(leftFrame, offset + index)
                right[index] = sampleAt(rightFrame, offset + index)
            }
        }
        analyser.process(left, right, 0, FFT_SIZE)
    }

    const edges = spectrumEdges(audioData.sampleRate)
    const bins = analyser.bins()
    const binWidth = audioData.sampleRate / FFT_SIZE
    const energies = edges.slice(0, -1).map((fromHz, index) => {
        const toHz = edges[index + 1]
        const firstBin = Math.max(0, Math.ceil(fromHz / binWidth))
        const lastBin = Math.min(bins.length - 1, Math.ceil(toHz / binWidth) - 1)
        let sum = 0
        let count = 0
        for (let bin = firstBin; bin <= lastBin; bin++) {
            const magnitude = bins[bin]
            if (Number.isFinite(magnitude)) {
                sum += magnitude * magnitude
                count++
            }
        }
        return {
            fromHz,
            toHz,
            energy: count === 0 ? 0 : Math.sqrt(sum / count)
        }
    })
    const strongest = energies.reduce((max, band) => Math.max(max, band.energy), 0)
    return energies.map(({fromHz, toHz, energy}) => ({
        fromHz,
        toHz,
        relativeDb: rounded(strongest <= 0 || energy <= 0
            ? strongest <= 0 ? 0 : DB_FLOOR
            : Math.max(DB_FLOOR, 20 * Math.log10(energy / strongest)))
    }))
}

/** Summarize rendered PCM without exposing the PCM itself. */
export const summarizeAudio = (audioData: AudioData):
    Omit<AudioAnalysisResult, "target" | "range" | "requestedDurationSeconds" | "tailDurationSeconds"> => {
    const frames = channelFrames(audioData)
    const numberOfFrames = Math.max(0, audioData.numberOfFrames)
    let peak = 0
    let sumSquares = 0
    let count = 0
    for (let index = 0; index < numberOfFrames; index++) {
        frames.forEach(frame => {
            const amplitude = Math.abs(sampleAt(frame, index))
            peak = Math.max(peak, amplitude)
            sumSquares += amplitude * amplitude
            count++
        })
    }
    const rms = count === 0 ? 0 : Math.sqrt(sumSquares / count)
    const peakDbfs = dbfs(peak)
    const rmsDbfs = dbfs(rms)
    const waveform = Array.from({length: WAVEFORM_BUCKETS}, (_, bucket) => {
        if (numberOfFrames === 0) {return 0}
        const start = Math.floor(bucket * numberOfFrames / WAVEFORM_BUCKETS)
        const end = Math.min(numberOfFrames,
            Math.max(start + 1, Math.floor((bucket + 1) * numberOfFrames / WAVEFORM_BUCKETS)))
        let value = 0
        for (let index = start; index < end; index++) {value = Math.max(value, amplitudeAt(frames, index))}
        return rounded(value, 4)
    })
    return {
        sampleRate: Number.isFinite(audioData.sampleRate) ? audioData.sampleRate : 0,
        renderedDurationSeconds: rounded(numberOfFrames / (audioData.sampleRate || 1)),
        level: {
            peakDbfs: rounded(peakDbfs),
            rmsDbfs: rounded(rmsDbfs),
            crestDb: rounded(peak === 0 ? 0 : peakDbfs - rmsDbfs)
        },
        spectrum: summarizeSpectrum(audioData, frames),
        waveform
    }
}

export type AudioAnalysisRenderer = (configuration: ExportConfiguration) => Promise<AudioData>

const audioUnitLabel = (resolver: ControlResolver, box: AudioUnitBox): string => {
    const adapter = resolver.adapters().find(candidate =>
        candidate instanceof AudioUnitBoxAdapter && candidate.box === box)
    return adapter instanceof AudioUnitBoxAdapter && adapter.label.length > 0
        ? adapter.label
        : box.type.getValue()
}

export class AudioAnalysisTools {
    readonly #project: Project
    readonly #resolver: ControlResolver
    readonly #render: AudioAnalysisRenderer

    constructor(project: Project, resolver: ControlResolver, render?: AudioAnalysisRenderer) {
        this.#project = project
        this.#resolver = resolver
        this.#render = render ?? (configuration => OfflineEngineRenderer.start(
            project,
            Option.wrap(configuration),
            new DefaultObservableValue(0),
            undefined,
            project.engine.sampleRate
        ))
    }

    async inspect(input: JsonObject = {}): Promise<AudioAnalysisResult> {
        const value = assertRecord(input, "inspect_audio input")
        assertKnownProperties(value, ["target", "startPosition", "endPosition", "startMusical", "endMusical"], "inspect_audio input")

        const targetArgument = value.target
        let target: AudioUnitBox | undefined
        if (targetArgument !== undefined) {
            const resolved = this.#resolver.resolve({kind: "handle", handle: "box", name: "AudioUnitBox"}, targetArgument)
            if (!(resolved instanceof AudioUnitBox)) {
                throw new Error("target must be an AudioUnitBox handle")
            }
            target = resolved
        }
        const timeline = this.#project.timelineBoxAdapter
        const hasExplicitRange = Object.hasOwn(value, "startPosition") || Object.hasOwn(value, "endPosition")
            || Object.hasOwn(value, "startMusical") || Object.hasOwn(value, "endMusical")
        const resolvedRange = resolveMusicalRange(value, timeline.signatureTrack,
            {startPosition: 0, endPosition: this.#project.lastRegionAction()}, "inspect_audio input")
        if (hasExplicitRange && resolvedRange.endPosition <= resolvedRange.startPosition) {
            throw new Error("endPosition must be greater than startPosition")
        }
        const range = !hasExplicitRange
            ? "full" as const
            : {start: resolvedRange.startPosition, end: resolvedRange.endPosition}
        const configuration: ExportConfiguration = target === undefined
            ? {range}
            : {
                range,
                stems: {
                    [UUID.toString(target.address.uuid)]: {
                        includeAudioEffects: true,
                        includeSends: true,
                        useInstrumentOutput: false,
                        fileName: "analysis"
                    }
                }
        }
        const audioData = await this.#render(configuration)
        const summary = summarizeAudio(audioData)
        const renderedDurationSeconds = summary.renderedDurationSeconds
        const requestedDurationSeconds = this.#project.tempoMap.intervalToSeconds(
            resolvedRange.startPosition, resolvedRange.endPosition)
        return {
            target: target === undefined
                ? "master"
                : {handle: this.#resolver.handle(target), label: audioUnitLabel(this.#resolver, target)},
            range: resolvedRange,
            ...summary,
            requestedDurationSeconds: rounded(requestedDurationSeconds),
            renderedDurationSeconds,
            tailDurationSeconds: rounded(Math.max(0, renderedDurationSeconds - requestedDurationSeconds))
        }
    }
}
