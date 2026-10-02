import {assert, clamp, int, Optional} from "@opendaw/lib-std"
import {BiquadCoeff} from "./biquad-coeff"
import {BiquadMono} from "./biquad-processor"
import {FFT} from "./fft"
import {KWeightingFilter, SILENCE_DB, TruePeak} from "./loudness"

/**
 * Offline measurements of rendered audio for automated judgement. Pure functions over planar channels.
 * Every number is finite; silence reads SILENCE_DB (-120) instead of -Infinity.
 */
export namespace AudioMetrics {
    export type Channels = ReadonlyArray<Float32Array>

    export type Loudness = {
        /** No 400 ms block above the -70 LUFS absolute gate. */
        silent: boolean
        durationSeconds: number
        /** BS.1770-4 gated integrated loudness (absolute -70 LUFS, relative -10 LU; 400 ms blocks, 75% overlap). */
        integratedLufs: number
        /** Share of 100 ms blocks above the -70 LUFS absolute gate (integratedLufs only measures these). */
        activeFraction: number
        /** EBU Tech 3342 LRA over 3 s short-term values (10 Hz), P95 - P10 after -20 LU relative gate. */
        loudnessRangeLu: number
        maxMomentaryLufs: number
        maxShortTermLufs: number
        /** 4x oversampled (BS.1770-4 Annex 2) */
        truePeakDbtp: number
        samplePeakDbfs: number
        /** Unweighted RMS over all channels (a sine peaking at 0 dBFS reads -3.01). */
        rmsDbfs: number
        /** samplePeakDbfs - rmsDbfs */
        crestDb: number
    }

    export type Segment = {startFrame: int, endFrame: int, lufs: number, peakDbfs: number, silent: boolean}

    /** db is the band's mean-square power relative to a full-scale sine: a 0 dBFS sine inside the band reads 0 dB. */
    export type Band = {centerHz: number, lowHz: number, highHz: number, db: number}

    /** db as in Band (mean of both channels); widthDb = side energy minus mid energy (-120: mono, 0: uncorrelated, +120: anti-phase). */
    export type StereoBand = Band & {correlation: number, widthDb: number}

    export type Timing = {
        count: int
        meanAbsDeviationMs: number
        maxDeviationMs: number
        /** Positive: onsets are late on average. */
        meanDeviationMs: number
        fractionOnGrid: number
        /** Position of odd steps within a step pair: 0.5 straight, 0.667 triplet swing. Needs >= 2 odd and even onsets. */
        swingEstimate: Optional<number>
    }

    /** A sounding event in frames, endFrame exclusive. */
    export type NoteSpan = {startFrame: int, endFrame: int}

    export type MaskingBand = {centerHz: number, overlapDb: number, score: number}
    export type Masking = {bands: ReadonlyArray<MaskingBand>, score: number}

    export type SpectrumOptions = {fftSize?: int}
    export type OnsetOptions = {thresholdDb?: number, minIntervalSeconds?: number}

    export type Analysis = {
        loudness: Loudness
        spectrum: ReadonlyArray<Band>
        stereoBands: ReadonlyArray<StereoBand>
        onsets: ReadonlyArray<number>
    }

    const THIRD_OCTAVE_NOMINAL: ReadonlyArray<number> = [
        20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
        2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]
    const OCTAVE_NOMINAL: ReadonlyArray<number> = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    const DEFAULT_FFT_SIZE = 8192
    const ABSOLUTE_GATE_LUFS = -70.0
    const SILENT_POWER = 1e-12

    const frameCount = (channels: Channels): int =>
        channels.length === 0 ? 0 : channels.reduce((min, channel) => Math.min(min, channel.length), Number.MAX_SAFE_INTEGER)

    const amplitudeDb = (linear: number): number => linear > 1e-6 ? 20.0 * Math.log10(linear) : SILENCE_DB

    const powerDb = (power: number): number => power > 1e-12 ? 10.0 * Math.log10(power) : SILENCE_DB

    const windowMeans = (values: Float64Array, count: int, width: int): Float64Array => {
        if (count < width) {
            let sum = 0.0
            for (let i = 0; i < count; i++) {sum += values[i]}
            return Float64Array.of(count > 0 ? sum / count : 0.0)
        }
        const result = new Float64Array(count - width + 1)
        let sum = 0.0
        for (let i = 0; i < width; i++) {sum += values[i]}
        result[0] = sum / width
        for (let i = width; i < count; i++) {
            sum += values[i] - values[i - width]
            result[i - width + 1] = Math.max(0.0, sum) / width
        }
        return result
    }

    const gatedMean = (energies: Float64Array, threshold: number): number => {
        let sum = 0.0, count = 0
        for (let i = 0; i < energies.length; i++) {
            if (energies[i] >= threshold) {
                sum += energies[i]
                count++
            }
        }
        return count > 0 ? sum / count : 0.0
    }

    const maxLoudness = (energies: Float64Array): number => {
        let max = 0.0
        for (let i = 0; i < energies.length; i++) {if (energies[i] > max) {max = energies[i]}}
        return KWeightingFilter.loudnessOf(max)
    }

    const loudnessRange = (shortTerm: Float64Array): number => {
        const absMean = gatedMean(shortTerm, KWeightingFilter.meanSquareOf(ABSOLUTE_GATE_LUFS))
        if (absMean <= 0.0) {return 0.0}
        const threshold = absMean * 0.01
        const values: Array<number> = []
        for (let i = 0; i < shortTerm.length; i++) {
            if (shortTerm[i] >= threshold) {values.push(KWeightingFilter.loudnessOf(shortTerm[i]))}
        }
        if (values.length < 2) {return 0.0}
        values.sort((first, second) => first - second)
        const percentile = (fraction: number): number => {
            const rank = fraction * (values.length - 1)
            const index = Math.floor(rank)
            const next = Math.min(values.length - 1, index + 1)
            return values[index] + (values[next] - values[index]) * (rank - index)
        }
        return Math.max(0.0, percentile(0.95) - percentile(0.1))
    }

    const silentLoudness = (durationSeconds: number): Loudness => ({
        silent: true, durationSeconds, integratedLufs: SILENCE_DB, activeFraction: 0.0, loudnessRangeLu: 0.0, maxMomentaryLufs: SILENCE_DB,
        maxShortTermLufs: SILENCE_DB, truePeakDbtp: SILENCE_DB, samplePeakDbfs: SILENCE_DB, rmsDbfs: SILENCE_DB, crestDb: 0.0
    })

    /** BS.1770-4 / EBU R128 loudness. Every channel has weight 1 (mono is measured as one channel, not dual-mono). */
    export const loudness = (channels: Channels, sampleRate: number): Loudness => {
        assert(sampleRate > 0, "sampleRate must be positive")
        const numFrames = frameCount(channels)
        if (numFrames === 0) {return silentLoudness(0.0)}
        const subLength = Math.max(1, Math.round(sampleRate * 0.1))
        const numSub = Math.floor(numFrames / subLength)
        const subEnergy = new Float64Array(Math.max(1, numSub))
        let totalWeighted = 0.0, sumSquares = 0.0, peak = 0.0
        for (const samples of channels) {
            const filter = new KWeightingFilter(sampleRate)
            for (let sub = 0; sub < numSub; sub++) {
                const energy = filter.sumSquares(samples, sub * subLength, (sub + 1) * subLength)
                subEnergy[sub] += energy / subLength
                totalWeighted += energy
            }
            totalWeighted += filter.sumSquares(samples, numSub * subLength, numFrames)
            for (let i = 0; i < numFrames; i++) {
                const value = samples[i]
                sumSquares += value * value
                const abs = Math.abs(value)
                if (abs > peak) {peak = abs}
            }
        }
        if (numSub === 0) {subEnergy[0] = totalWeighted / numFrames}
        const count = Math.max(1, numSub)
        const momentary = windowMeans(subEnergy, count, 4)
        const shortTerm = windowMeans(subEnergy, count, 30)
        const absoluteGate = KWeightingFilter.meanSquareOf(ABSOLUTE_GATE_LUFS)
        const absMean = gatedMean(momentary, absoluteGate)
        const activeFraction = subEnergy.slice(0, count).filter(energy => energy >= absoluteGate).length / count
        const durationSeconds = numFrames / sampleRate
        const samplePeakDbfs = amplitudeDb(peak)
        const rmsDbfs = amplitudeDb(Math.sqrt(sumSquares / (numFrames * channels.length)))
        const truePeakDbtp = peak > 1e-6 ? amplitudeDb(Math.max(peak, TruePeak.measure(channels))) : SILENCE_DB
        const base = {
            durationSeconds, activeFraction, truePeakDbtp, samplePeakDbfs, rmsDbfs, crestDb: samplePeakDbfs - rmsDbfs,
            maxMomentaryLufs: maxLoudness(momentary), maxShortTermLufs: maxLoudness(shortTerm)
        }
        if (absMean <= 0.0) {return {...base, silent: true, integratedLufs: SILENCE_DB, loudnessRangeLu: 0.0}}
        const integratedLufs = KWeightingFilter.loudnessOf(gatedMean(momentary, absMean * 0.1))
        return {...base, silent: false, integratedLufs, loudnessRangeLu: loudnessRange(shortTerm)}
    }

    /**
     * Ungated K-weighted loudness per segment. Segment i spans [starts[i], starts[i + 1]), the last one runs to the end.
     * Starts are sorted, clamped and de-duplicated. silent: below the -70 LUFS absolute gate.
     */
    export const loudnessPerSegment = (channels: Channels, sampleRate: number,
                                       segmentStartFrames: ReadonlyArray<int>): ReadonlyArray<Segment> => {
        const numFrames = frameCount(channels)
        const starts = Array.from(new Set(segmentStartFrames.map(frame => clamp(Math.floor(frame), 0, numFrames))))
            .sort((first, second) => first - second)
            .filter(frame => frame < numFrames)
        if (starts.length === 0) {return []}
        const ends = starts.map((frame, index) => index + 1 < starts.length ? starts[index + 1] : numFrames)
        const energies = new Float64Array(starts.length)
        const peaks = new Float64Array(starts.length)
        for (const samples of channels) {
            const filter = new KWeightingFilter(sampleRate)
            filter.sumSquares(samples, 0, starts[0])
            for (let index = 0; index < starts.length; index++) {
                energies[index] += filter.sumSquares(samples, starts[index], ends[index])
                let peak = peaks[index]
                for (let i = starts[index]; i < ends[index]; i++) {
                    const abs = Math.abs(samples[i])
                    if (abs > peak) {peak = abs}
                }
                peaks[index] = peak
            }
        }
        return starts.map((startFrame, index) => {
            const endFrame = ends[index]
            const lufs = KWeightingFilter.loudnessOf(energies[index] / (endFrame - startFrame))
            return {startFrame, endFrame, lufs, peakDbfs: amplitudeDb(peaks[index]), silent: lufs < ABSOLUTE_GATE_LUFS}
        })
    }

    type CrossSpectrum = {binHz: number, ll: Float64Array, rr: Float64Array, lr: Float64Array}

    const crossSpectrum = (channels: Channels, sampleRate: number, fftSize: int): CrossSpectrum => {
        assert(fftSize >= 256 && (fftSize & (fftSize - 1)) === 0, "fftSize must be a power of two >= 256")
        const half = fftSize >> 1
        const ll = new Float64Array(half + 1), rr = new Float64Array(half + 1), lr = new Float64Array(half + 1)
        const binHz = sampleRate / fftSize
        const numFrames = frameCount(channels)
        if (numFrames === 0) {return {binHz, ll, rr, lr}}
        const left = channels[0]
        const right = channels.length > 1 ? channels[1] : channels[0]
        const windowLength = Math.min(fftSize, numFrames)
        const window = new Float32Array(windowLength)
        let windowPower = 0.0
        for (let i = 0; i < windowLength; i++) {
            window[i] = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * i / windowLength)
            windowPower += window[i] * window[i]
        }
        const hop = half
        const numWindows = numFrames >= fftSize ? Math.floor((numFrames - fftSize) / hop) + 1 : 1
        const fft = new FFT(fftSize)
        const real = new Float32Array(fftSize)
        const imag = new Float32Array(fftSize)
        const mask = fftSize - 1
        for (let frame = 0; frame < numWindows; frame++) {
            const offset = frame * hop
            real.fill(0.0)
            imag.fill(0.0)
            for (let i = 0; i < windowLength; i++) {
                real[i] = left[offset + i] * window[i]
                imag[i] = right[offset + i] * window[i]
            }
            fft.process(real, imag)
            for (let k = 0; k <= half; k++) {
                const mirror = (fftSize - k) & mask
                const re = real[k], im = imag[k], mirrorRe = real[mirror], mirrorIm = imag[mirror]
                const leftRe = (re + mirrorRe) * 0.5, leftIm = (im - mirrorIm) * 0.5
                const rightRe = (im + mirrorIm) * 0.5, rightIm = (mirrorRe - re) * 0.5
                ll[k] += leftRe * leftRe + leftIm * leftIm
                rr[k] += rightRe * rightRe + rightIm * rightIm
                lr[k] += leftRe * rightRe + leftIm * rightIm
            }
        }
        for (let k = 0; k <= half; k++) {
            const scale = (k === 0 || k === half ? 1.0 : 2.0) / (fftSize * windowPower * numWindows)
            ll[k] *= scale
            rr[k] *= scale
            lr[k] *= scale
        }
        return {binHz, ll, rr, lr}
    }

    const bandSum = (power: Float64Array, binHz: number, lowHz: number, highHz: number): number => {
        const last = Math.min(power.length - 1, Math.floor(highHz / binHz + 0.5))
        let sum = 0.0
        for (let k = Math.max(0, Math.floor(lowHz / binHz + 0.5)); k <= last; k++) {
            const overlap = Math.min((k + 0.5) * binHz, highHz) - Math.max((k - 0.5) * binHz, lowHz)
            if (overlap > 0.0) {sum += power[k] * overlap / binHz}
        }
        return sum
    }

    const bandLayout = (nominal: ReadonlyArray<number>, exponentOf: (index: int) => number, halfWidth: number,
                        sampleRate: number): ReadonlyArray<Omit<Band, "db">> => nominal.map((centerHz, index) => {
        const exact = 1000.0 * Math.pow(2.0, exponentOf(index))
        return {centerHz, lowHz: exact * Math.pow(2.0, -halfWidth), highHz: Math.min(sampleRate / 2, exact * Math.pow(2.0, halfWidth))}
    })

    const spectrumOf = ({binHz, ll, rr, lr}: CrossSpectrum, sampleRate: number): ReadonlyArray<Band> =>
        bandLayout(THIRD_OCTAVE_NOMINAL, index => (index - 17) / 3, 1.0 / 6.0, sampleRate).map(band => {
            if (band.lowHz >= band.highHz) {return {...band, db: SILENCE_DB}}
            const {lowHz, highHz} = band
            const mid = (bandSum(ll, binHz, lowHz, highHz) + bandSum(rr, binHz, lowHz, highHz)
                + 2.0 * bandSum(lr, binHz, lowHz, highHz)) * 0.25
            return {...band, db: powerDb(2.0 * mid)}
        })

    const stereoBandsOf = ({binHz, ll, rr, lr}: CrossSpectrum, sampleRate: number): ReadonlyArray<StereoBand> =>
        bandLayout(OCTAVE_NOMINAL, index => index - 5, 0.5, sampleRate).map(band => {
            const {lowHz, highHz} = band
            const left = lowHz < highHz ? bandSum(ll, binHz, lowHz, highHz) : 0.0
            const right = lowHz < highHz ? bandSum(rr, binHz, lowHz, highHz) : 0.0
            const cross = lowHz < highHz ? bandSum(lr, binHz, lowHz, highHz) : 0.0
            const total = left + right
            if (total <= SILENT_POWER) {return {...band, db: SILENCE_DB, correlation: 1.0, widthDb: SILENCE_DB}}
            const correlation = left <= total * SILENT_POWER || right <= total * SILENT_POWER
                ? 0.0 : clamp(cross / Math.sqrt(left * right), -1.0, 1.0)
            const epsilon = total * SILENT_POWER
            const mid = Math.max(0.0, total + 2.0 * cross) * 0.25
            const side = Math.max(0.0, total - 2.0 * cross) * 0.25
            return {...band, db: powerDb(total), correlation, widthDb: 10.0 * Math.log10((side + epsilon) / (mid + epsilon))}
        })

    /** Welch-averaged (periodic Hann, 50% overlap) power of mid = (L + R) / 2 in 31 1/3-octave bands (20 Hz - 20 kHz). */
    export const spectrum = (channels: Channels, sampleRate: number, options?: SpectrumOptions): ReadonlyArray<Band> =>
        spectrumOf(crossSpectrum(channels, sampleRate, options?.fftSize ?? DEFAULT_FFT_SIZE), sampleRate)

    /** Per-octave (31.5 Hz - 16 kHz) L/R correlation and side-vs-mid energy. Mono input reads correlation 1. */
    export const stereoBands = (channels: Channels, sampleRate: number, options?: SpectrumOptions): ReadonlyArray<StereoBand> =>
        stereoBandsOf(crossSpectrum(channels, sampleRate, options?.fftSize ?? DEFAULT_FFT_SIZE), sampleRate)

    const FAST_HOPS = 5
    const SLOW_HOPS = 50

    const hopEnergies = (signal: Float32Array, hop: int): Float64Array => {
        const numHops = Math.floor(signal.length / hop)
        const prefix = new Float64Array(numHops + 1)
        for (let h = 0; h < numHops; h++) {
            let energy = 0.0
            for (let i = h * hop, end = (h + 1) * hop; i < end; i++) {energy += signal[i] * signal[i]}
            prefix[h + 1] = prefix[h] + energy / hop
        }
        return prefix
    }

    const loudestWindow = (prefix: Float64Array): number => {
        let loudest = 0.0
        for (let h = FAST_HOPS; h < prefix.length; h++) {loudest = Math.max(loudest, (prefix[h] - prefix[h - FAST_HOPS]) / FAST_HOPS)}
        return loudest
    }

    const detectFrames = (signal: Float32Array, prefix: Float64Array, hop: int, floor: number, ratio: number,
                          lookAhead: int): Array<int> => {
        const numHops = prefix.length - 1
        const result: Array<int> = []
        let armed = true
        let lastFrame = -1
        for (let h = FAST_HOPS - 1; h < numHops; h++) {
            const fast = (prefix[h + 1] - prefix[h + 1 - FAST_HOPS]) / FAST_HOPS
            const slowFrom = Math.max(0, h + 1 - FAST_HOPS - SLOW_HOPS)
            const slowCount = h + 1 - FAST_HOPS - slowFrom
            const slow = slowCount > 0 ? (prefix[h + 1 - FAST_HOPS] - prefix[slowFrom]) / slowCount : 0.0
            if (!armed) {
                if (fast < slow * 2.0) {armed = true}
                continue
            }
            if (fast < floor || fast <= slow * ratio) {continue}
            const searchFrom = Math.max(0, (h + 1 - FAST_HOPS) * hop, lastFrame + 1)
            const searchTo = Math.min(signal.length, (h + 1) * hop + lookAhead)
            let attackPeak = 0.0
            for (let i = searchFrom; i < searchTo; i++) {attackPeak = Math.max(attackPeak, Math.abs(signal[i]))}
            const threshold = Math.max(attackPeak * 0.25, Math.sqrt(slow) * 3.0)
            let onsetFrame = searchFrom
            while (onsetFrame < searchTo - 1 && Math.abs(signal[onsetFrame]) < threshold) {onsetFrame++}
            armed = false
            result.push(onsetFrame)
            lastFrame = onsetFrame
        }
        return result
    }

    /**
     * Onset times in seconds. Energy detector on 1 ms hops over the mono mix and its > 2 kHz part (so hats under a
     * kick tail are found): fires when the 5 ms energy exceeds the preceding 50 ms by thresholdDb (default 6) and is
     * within 50 dB of the loudest 5 ms; refined to the first sample above 25% of the attack peak.
     */
    export const onsets = (channels: Channels, sampleRate: number, options?: OnsetOptions): ReadonlyArray<number> => {
        const numFrames = frameCount(channels)
        const hop = Math.max(1, Math.round(sampleRate * 0.001))
        if (Math.floor(numFrames / hop) <= FAST_HOPS) {return []}
        const mono = new Float32Array(numFrames)
        for (const samples of channels) {
            for (let i = 0; i < numFrames; i++) {mono[i] += samples[i]}
        }
        for (let i = 0; i < numFrames; i++) {mono[i] /= channels.length}
        const high = new Float32Array(numFrames)
        new BiquadMono().process(new BiquadCoeff().setHighpassParams(2000.0 / sampleRate), mono, high, 0, numFrames)
        const monoPrefix = hopEnergies(mono, hop)
        const loudest = loudestWindow(monoPrefix)
        if (loudest <= SILENT_POWER) {return []}
        const floor = loudest * 1e-5
        const ratio = Math.pow(10.0, (options?.thresholdDb ?? 6.0) / 10.0)
        const lookAhead = Math.round(sampleRate * 0.005)
        const candidates = detectFrames(mono, monoPrefix, hop, floor, ratio, lookAhead)
            .concat(detectFrames(high, hopEnergies(high, hop), hop, floor, ratio, lookAhead))
            .sort((first, second) => first - second)
        const minIntervalFrames = Math.round((options?.minIntervalSeconds ?? 0.03) * sampleRate)
        const result: Array<number> = []
        let lastFrame = -minIntervalFrames
        for (const frame of candidates) {
            if (frame - lastFrame < minIntervalFrames) {continue}
            result.push(frame / sampleRate)
            lastFrame = frame
        }
        return result
    }

    /**
     * One span per onset: it ends at the next onset or where the 5 ms RMS of the mono mix falls releaseDb (default 40)
     * below the span's own peak, whichever comes first.
     */
    export const noteSpans = (channels: Channels, sampleRate: number, onsetSeconds: ReadonlyArray<number>,
                              releaseDb: number = 40.0): ReadonlyArray<NoteSpan> => {
        const numFrames = frameCount(channels)
        const hop = Math.max(1, Math.round(sampleRate * 0.005))
        const numHops = Math.ceil(numFrames / hop)
        const rms = new Float64Array(numHops)
        for (let h = 0; h < numHops; h++) {
            let energy = 0.0
            const end = Math.min(numFrames, (h + 1) * hop)
            for (const samples of channels) {
                for (let i = h * hop; i < end; i++) {
                    const value = samples[i]
                    energy += value * value
                }
            }
            rms[h] = Math.sqrt(energy / Math.max(1, (end - h * hop) * channels.length))
        }
        const starts = onsetSeconds.map(seconds => clamp(Math.round(seconds * sampleRate), 0, numFrames))
            .filter(frame => frame < numFrames)
        const release = Math.pow(10.0, -releaseDb / 20.0)
        return starts.map((startFrame, index) => {
            const limitFrame = index + 1 < starts.length ? starts[index + 1] : numFrames
            const firstHop = Math.floor(startFrame / hop)
            const lastHop = Math.max(firstHop + 1, Math.ceil(limitFrame / hop))
            let peakHop = firstHop
            for (let h = firstHop; h < lastHop; h++) {if (rms[h] > rms[peakHop]) {peakHop = h}}
            const threshold = rms[peakHop] * release
            let endFrame = limitFrame
            for (let h = peakHop + 1; h < lastHop; h++) {
                if (rms[h] < threshold) {
                    endFrame = Math.min(limitFrame, h * hop)
                    break
                }
            }
            return {startFrame, endFrame: Math.max(startFrame + 1, endFrame)}
        })
    }

    /** Deviation of onsets from the grid offsetSeconds + k * secondsPerStep. On grid: within toleranceMs (default 10). */
    export const timing = (onsetSeconds: ReadonlyArray<number>, secondsPerStep: number,
                           offsetSeconds: number = 0.0, toleranceMs: number = 10.0): Timing => {
        assert(secondsPerStep > 0.0, "secondsPerStep must be positive")
        if (onsetSeconds.length === 0) {
            return {count: 0, meanAbsDeviationMs: 0.0, maxDeviationMs: 0.0, meanDeviationMs: 0.0, fractionOnGrid: 0.0, swingEstimate: undefined}
        }
        let sumAbs = 0.0, sum = 0.0, max = 0.0, onGrid = 0, oddSum = 0.0, oddCount = 0, evenSum = 0.0, evenCount = 0
        for (const seconds of onsetSeconds) {
            const position = (seconds - offsetSeconds) / secondsPerStep
            const step = Math.round(position)
            const deviationMs = (position - step) * secondsPerStep * 1000.0
            sumAbs += Math.abs(deviationMs)
            sum += deviationMs
            max = Math.max(max, Math.abs(deviationMs))
            if (Math.abs(deviationMs) <= toleranceMs) {onGrid++}
            if ((step & 1) === 1) {
                oddSum += position - step
                oddCount++
            } else {
                evenSum += position - step
                evenCount++
            }
        }
        const count = onsetSeconds.length
        const swingEstimate = oddCount >= 2 && evenCount >= 2
            ? clamp(0.5 + (oddSum / oddCount - evenSum / evenCount) * 0.5, 0.0, 1.0) : undefined
        return {
            count, meanAbsDeviationMs: sumAbs / count, maxDeviationMs: max, meanDeviationMs: sum / count,
            fractionOnGrid: onGrid / count, swingEstimate
        }
    }

    /**
     * Spectral overlap of two sources measured with the same band layout. A band is prominent for a source by
     * 1 + (db - maxDb) / rangeDb (clamped to 0..1, default range 12 dB). Band score = min of both prominences,
     * overlapDb = level of the weaker source there (SILENCE_DB when the score is 0). Summary score in 0..1:
     * sum of band scores / the smaller of both total prominences (1: the narrower source sits entirely inside the other).
     */
    export const masking = (first: ReadonlyArray<Band>, second: ReadonlyArray<Band>, rangeDb: number = 12.0): Masking => {
        assert(first.length === second.length, "masking requires identical band layouts")
        const prominence = (bands: ReadonlyArray<Band>): ReadonlyArray<number> => {
            const maxDb = bands.reduce((max, band) => Math.max(max, band.db), SILENCE_DB)
            return bands.map(band => maxDb <= SILENCE_DB || band.db <= SILENCE_DB ? 0.0 : clamp(1.0 + (band.db - maxDb) / rangeDb, 0.0, 1.0))
        }
        const firstProminence = prominence(first)
        const secondProminence = prominence(second)
        const bands = first.map((band, index) => {
            const score = Math.min(firstProminence[index], secondProminence[index])
            return {centerHz: band.centerHz, overlapDb: score > 0.0 ? Math.min(band.db, second[index].db) : SILENCE_DB, score}
        })
        const sumOf = (values: ReadonlyArray<number>) => values.reduce((total, value) => total + value, 0.0)
        const norm = Math.min(sumOf(firstProminence), sumOf(secondProminence))
        return {bands, score: norm > 0.0 ? clamp(sumOf(bands.map(band => band.score)) / norm, 0.0, 1.0) : 0.0}
    }

    /** loudness, spectrum, stereoBands and onsets in one call (the STFT is shared). */
    export const analyse = (channels: Channels, sampleRate: number, options?: SpectrumOptions & OnsetOptions): Analysis => {
        const cross = crossSpectrum(channels, sampleRate, options?.fftSize ?? DEFAULT_FFT_SIZE)
        return {
            loudness: loudness(channels, sampleRate),
            spectrum: spectrumOf(cross, sampleRate),
            stereoBands: stereoBandsOf(cross, sampleRate),
            onsets: onsets(channels, sampleRate, options)
        }
    }
}
