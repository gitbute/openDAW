import {clamp, int, isDefined, Option, Optional} from "@opendaw/lib-std"
import {midiToHz} from "@opendaw/lib-dsp"
import {NoteNames} from "@/agent/NoteNames"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import {HarmonicSpectrum} from "@/agent/analysis/descriptors/dsp/HarmonicSpectrum"
import {MeasureMath} from "@/agent/analysis/descriptors/dsp/MeasureMath"
import {PitchYin} from "@/agent/analysis/descriptors/dsp/PitchYin"
import {StereoBands} from "@/agent/analysis/descriptors/dsp/StereoBands"
import type {FrameWindow} from "./AgentRender"

export type Envelope = { readonly peak: Float32Array, readonly rms: Float32Array }

export type PowerSpectrum = HarmonicSpectrum.Spectrum & { readonly db: Float32Array }

export type Fundamental = { readonly frequency: number, readonly source: "autocorrelation" | "note pitch" }

export type StereoBandWidth = {
    readonly centerHz: number
    /** Band level in dBFS, only meaningful against the other bands. */
    readonly db: number
    readonly correlation: number
    /** StereoBands.sideDb: -60 mono, 0 uncorrelated, positive anti-phase. */
    readonly widthDb: number
}

export namespace ViewMath {
    const PitchFrames = 8192
    const BandChunks = 128
    const BandChunkFrames = 2048

    export const OctaveCenters: ReadonlyArray<number> = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

    const OctaveEdges: ReadonlyArray<number> = OctaveCenters.slice(0, -1)
        .map((_center, index) => 1000.0 * Math.pow(2.0, index - 5) * Math.SQRT2)

    const meanPower = (channels: ReadonlyArray<Float32Array>, from: int, to: int): number => channels.length === 0 ? 0.0
        : channels.reduce((sum, channel) => sum + MeasureMath.rms(channel, from, to) ** 2, 0.0) / channels.length

    /** Per column the RMS of the mean channel power over at least windowFrames around its center. */
    export const rmsCurve = (channels: ReadonlyArray<Float32Array>, columns: int, windowFrames: int): Float32Array => {
        const rms = new Float32Array(columns)
        const length = MeasureMath.frameCount(channels)
        if (length === 0 || columns === 0) {return rms}
        const hop = length / columns
        const reach = Math.max(hop, windowFrames) / 2
        const blockFrames = Math.max(1, Math.floor(Math.min(hop, windowFrames) / 4))
        const power = MeasureMath.blockPower(channels, blockFrames)
        const prefix = new Float64Array(power.length + 1)
        power.forEach((value, index) => {prefix[index + 1] = prefix[index] + value})
        for (let column = 0; column < columns; column++) {
            const center = (column + 0.5) * hop
            const from = clamp(Math.floor((center - reach) / blockFrames), 0, power.length - 1)
            const to = clamp(Math.ceil((center + reach) / blockFrames), from + 1, power.length)
            rms[column] = Math.sqrt((prefix[to] - prefix[from]) / (to - from))
        }
        return rms
    }

    /** Per column the absolute peak over all channels, widened to at least windowFrames. */
    export const peakCurve = (channels: ReadonlyArray<Float32Array>, columns: int, windowFrames: int): Float32Array => {
        const peak = new Float32Array(columns)
        const length = MeasureMath.frameCount(channels)
        if (length === 0 || columns === 0) {return peak}
        const hop = length / columns
        const spans = new Float32Array(columns)
        for (let column = 0; column < columns; column++) {
            const from = Math.floor(column * hop)
            const to = Math.min(length, Math.max(from + 1, Math.floor((column + 1) * hop)))
            let max = 0.0
            for (const channel of channels) {
                for (let index = from; index < to; index++) {max = Math.max(max, Math.abs(channel[index]))}
            }
            spans[column] = max
        }
        const neighbours = Math.max(0, Math.round(Math.max(hop, windowFrames) / 2 / hop - 0.5))
        for (let column = 0; column < columns; column++) {
            for (let other = Math.max(0, column - neighbours); other <= Math.min(columns - 1, column + neighbours); other++) {
                peak[column] = Math.max(peak[column], spans[other])
            }
        }
        return peak
    }

    export const envelope = (channels: ReadonlyArray<Float32Array>, columns: int, windowFrames: int): Envelope =>
        ({peak: peakCurve(channels, columns, windowFrames), rms: rmsCurve(channels, columns, windowFrames)})

    export const envelopeFrames = (sampleRate: number, frequency: Option<number>, totalFrames: int): int =>
        Math.max(1, Math.min(Math.round(totalFrames / 8), Math.round(sampleRate * frequency.mapOr(hz => clamp(2 / hz, 0.01, 0.06), 0.025))))

    export const noteRmsDb = (channels: ReadonlyArray<Float32Array>, {startFrame, endFrame}: SoundNote): number =>
        MeasureMath.powerDb(meanPower(channels, startFrame, endFrame))

    export const loudestNote = (channels: ReadonlyArray<Float32Array>, notes: ReadonlyArray<SoundNote>): Option<SoundNote> => {
        const levels = notes.map(note => noteRmsDb(channels, note))
        return Option.wrap(notes[levels.reduce((best, level, index) => level > levels[best] ? index : best, 0)])
    }

    export const firstAudibleNote = (channels: ReadonlyArray<Float32Array>, notes: ReadonlyArray<SoundNote>): Option<SoundNote> => {
        const levels = notes.map(note => noteRmsDb(channels, note))
        const threshold = levels.reduce((max, level) => Math.max(max, level), -Infinity) - 30.0
        return Option.wrap(notes[levels.findIndex(level => level >= threshold)])
    }

    export const wholeNote = (channels: ReadonlyArray<Float32Array>): SoundNote =>
        ({index: 0, startFrame: 0, endFrame: Math.max(1, MeasureMath.frameCount(channels)), offFrame: undefined, pitch: undefined})

    export const sustainSpan = ({startFrame, endFrame, offFrame}: SoundNote, sampleRate: number): FrameWindow => {
        const end = isDefined(offFrame) && offFrame > startFrame ? Math.min(endFrame, offFrame) : endFrame
        const length = end - startFrame
        const attack = Math.min(Math.round(0.05 * sampleRate), Math.round(length * 0.25))
        return {startFrame: startFrame + attack, endFrame: Math.max(startFrame + attack + 1, end)}
    }

    const toneLevelDb = (signal: Float32Array, sampleRate: number, frequency: number): number => {
        const cycles = Math.floor(signal.length * frequency / sampleRate)
        const to = cycles > 0 ? Math.min(signal.length, Math.round(cycles * sampleRate / frequency)) : signal.length
        const {amplitude} = MeasureMath.sine(signal, sampleRate, frequency, 0, to)
        return MeasureMath.ratioDb(amplitude * amplitude / 2, MeasureMath.rms(signal, 0, to) ** 2)
    }

    /** YIN in the sustain; off the played pitch only by octaves, and those only with energy at the estimate (no chord subharmonics). */
    export const fundamental = (channels: ReadonlyArray<Float32Array>, {startFrame, endFrame}: FrameWindow, sampleRate: number,
                                pitch: Optional<int>): Option<Fundamental> => {
        const center = (startFrame + endFrame) >> 1
        const middle = MeasureMath.mono(channels, Math.max(startFrame, center - PitchFrames / 2), Math.min(endFrame, center + PitchFrames / 2))
        const estimate = PitchYin.estimate(middle, sampleRate)
        const played = isDefined(pitch) ? midiToHz(pitch) : undefined
        const accepted = Option.wrap(estimate).flatMap(({hz, periodicity}) => {
            if (periodicity < PitchYin.VoicedPeriodicity) {return Option.None}
            if (!isDefined(played)) {return Option.wrap(hz)}
            const semitones = 12 * Math.log2(hz / played)
            const octaves = Math.round(semitones / 12)
            if (Math.abs(semitones - 12 * octaves) > 0.5 || Math.abs(octaves) > 2) {return Option.None}
            return octaves === 0 || toneLevelDb(middle, sampleRate, hz) > -20 ? Option.wrap(hz) : Option.None
        })
        if (accepted.nonEmpty()) {return Option.wrap({frequency: accepted.unwrap(), source: "autocorrelation"})}
        return isDefined(played) ? Option.wrap({frequency: played, source: "note pitch"}) : Option.None
    }

    export const pitchName = (frequency: number): string => NoteNames.ofHz(frequency)

    /** Four periods (or 20 ms) in the sustain, starting at an upward zero crossing of the mono mix. */
    export const closeUpSpan = (channels: ReadonlyArray<Float32Array>, sustain: FrameWindow, sampleRate: number,
                                periodFrames: Option<number>): FrameWindow => {
        const available = sustain.endFrame - sustain.startFrame
        const wanted = periodFrames.match({none: () => 0.02 * sampleRate, some: frames => frames * 4})
        const length = Math.max(2, Math.min(available, Math.round(wanted)))
        const center = sustain.startFrame + Math.floor(available * 0.4)
        const start = clamp(center - Math.floor(length / 2), sustain.startFrame, sustain.endFrame - length)
        const end = Math.min(start + Math.round(periodFrames.unwrapOrElse(0.005 * sampleRate)), sustain.endFrame - length)
        const from = Math.max(sustain.startFrame, start - 1)
        const signal = MeasureMath.mono(channels, from, Math.max(from, end))
        for (let index = Math.max(start, sustain.startFrame + 1); index < end; index++) {
            if (signal[index - 1 - from] < 0.0 && signal[index - from] >= 0.0) {return {startFrame: index, endFrame: index + length}}
        }
        return {startFrame: start, endFrame: start + length}
    }

    export const peakDbNear = ({binHz, db}: PowerSpectrum, frequency: number, halfWidthHz: number): number => {
        const from = Math.max(0, Math.floor((frequency - halfWidthHz) / binHz))
        const to = Math.min(db.length - 1, Math.ceil((frequency + halfWidthHz) / binHz))
        let best = from
        for (let bin = from; bin <= to; bin++) {if (db[bin] > db[best]) {best = bin}}
        if (best === 0 || best === db.length - 1) {return db[best]}
        const [before, at, after] = [db[best - 1], db[best], db[best + 1]]
        const curvature = before - 2 * at + after
        if (curvature >= 0) {return at}
        const shift = clamp(0.5 * (before - after) / curvature, -0.5, 0.5)
        return at - 0.25 * (before - after) * shift
    }

    /** Peak-connected display envelope: max within halfWidth(f), averaged in dB over the same width. */
    export const spectralEnvelope = (spectrum: PowerSpectrum, frequencies: ReadonlyArray<number>,
                                     halfWidthHz: (frequency: number) => number): Float32Array => {
        const peaks = Float32Array.from(frequencies, frequency => peakDbNear(spectrum, frequency, halfWidthHz(frequency)))
        return Float32Array.from(frequencies, (frequency, index) => {
            const width = halfWidthHz(frequency)
            let sum = 0.0
            let count = 0
            for (let other = index; other >= 0 && frequencies[other] >= frequency - width; other--) {
                sum += peaks[other]
                count++
            }
            for (let other = index + 1; other < frequencies.length && frequencies[other] <= frequency + width; other++) {
                sum += peaks[other]
                count++
            }
            return sum / count
        })
    }

    export const logFrequencies = (count: int, minHz: number, maxHz: number): ReadonlyArray<number> =>
        Array.from({length: count}, (_value, index) => minHz * Math.pow(maxHz / minHz, count <= 1 ? 0 : index / (count - 1)))

    /** Mid up, side (R - L) to the right: mono is a vertical line. */
    export const gonioPoint = (left: number, right: number, gain: number): [number, number] =>
        [(right - left) * 0.5 * gain, (left + right) * 0.5 * gain]

    /** Gain that puts the 99.5th percentile of the vector length near the edge. */
    export const gonioGain = (left: Float32Array, right: Float32Array): number => {
        const bins = 1024
        let max = 0.0
        for (let index = 0; index < left.length; index++) {
            max = Math.max(max, left[index] * left[index] + right[index] * right[index])
        }
        if (max < 1e-12) {return 1.0}
        const histogram = new Uint32Array(bins)
        const scale = bins / max
        for (let index = 0; index < left.length; index++) {
            histogram[Math.min(bins - 1, Math.floor((left[index] * left[index] + right[index] * right[index]) * scale))]++
        }
        const target = left.length * 0.995
        let count = 0
        let bin = 0
        while (bin < bins - 1 && count + histogram[bin] < target) {count += histogram[bin++]}
        return clamp(0.9 / Math.sqrt((bin + 1) / bins * max * 0.5), 0.5, 64.0)
    }

    export const gonioDensity = (left: Float32Array, right: Float32Array, size: int, gain: number): Uint32Array => {
        const density = new Uint32Array(size * size)
        const half = size / 2
        for (let index = 0; index < left.length; index++) {
            const [x, y] = gonioPoint(left[index], right[index], gain)
            const column = Math.floor(half + x * half)
            const row = Math.floor(half - y * half)
            if (column >= 0 && column < size && row >= 0 && row < size) {density[row * size + column]++}
        }
        return density
    }

    /** L/R correlation per column over at least windowFrames, NaN where silent. */
    export const correlationCurve = (left: Float32Array, right: Float32Array, columns: int, windowFrames: int): Float32Array => {
        const result = new Float32Array(columns).fill(NaN)
        const length = left.length
        if (length === 0) {return result}
        const hop = length / columns
        const reach = Math.max(hop, windowFrames) / 2
        for (let column = 0; column < columns; column++) {
            const center = (column + 0.5) * hop
            const from = Math.max(0, Math.floor(center - reach))
            const to = Math.min(length, Math.ceil(center + reach))
            const power: StereoBands.Power = {ll: 0.0, rr: 0.0, lr: 0.0}
            for (let index = from; index < to; index++) {
                power.ll += left[index] * left[index]
                power.rr += right[index] * right[index]
                power.lr += left[index] * right[index]
            }
            if (StereoBands.total(power) / (2 * Math.max(1, to - from)) >= 1e-8) {result[column] = StereoBands.correlation(power)}
        }
        return result
    }

    /** StereoBands per octave; long renders are sampled in BandChunks evenly spread chunks. */
    export const octaveBands = (left: Float32Array, right: Float32Array, sampleRate: number): ReadonlyArray<StereoBandWidth> => {
        const length = Math.min(left.length, right.length)
        const whole = length <= BandChunkFrames * BandChunks
        const size = whole ? length : BandChunkFrames
        const starts = whole ? [0]
            : Array.from({length: BandChunks}, (_chunk, index) => Math.round(index * (length - size) / (BandChunks - 1)))
        const chunks = starts.map(start => StereoBands.analyse(left.subarray(start, start + size),
            right.subarray(start, start + size), sampleRate, OctaveEdges).bands)
        return OctaveCenters.map((centerHz, index) => {
            const power = StereoBands.sum(chunks.map(bands => bands[index]))
            return {
                centerHz, db: MeasureMath.powerDb(StereoBands.total(power) / (2 * chunks.length)),
                correlation: StereoBands.correlation(power), widthDb: StereoBands.sideDb(power)
            }
        })
    }
}
