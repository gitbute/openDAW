import {int} from "@opendaw/lib-std"

/** Floor used by all loudness/level readings instead of -Infinity. */
export const SILENCE_DB = -120.0

/** ITU-R BS.1770-4 K-weighting (pre-filter shelf + RLB high-pass), re-derived for any sample rate. */
export class KWeightingFilter {
    static readonly LUFS_OFFSET = -0.691

    static loudnessOf(meanSquare: number): number {
        return meanSquare > 0.0 ? Math.max(SILENCE_DB, KWeightingFilter.LUFS_OFFSET + 10.0 * Math.log10(meanSquare)) : SILENCE_DB
    }

    static meanSquareOf(loudness: number): number {return Math.pow(10.0, (loudness - KWeightingFilter.LUFS_OFFSET) / 10.0)}

    readonly #sb0: number
    readonly #sb1: number
    readonly #sb2: number
    readonly #sa1: number
    readonly #sa2: number
    readonly #ha1: number
    readonly #ha2: number

    #sx1 = 0.0
    #sx2 = 0.0
    #sy1 = 0.0
    #sy2 = 0.0
    #hy1 = 0.0
    #hy2 = 0.0

    constructor(sampleRate: number) {
        const shelfK = Math.tan(Math.PI * 1681.974450955533 / sampleRate)
        const shelfQ = 0.7071752369554196
        const vh = Math.pow(10.0, 3.999843853973347 / 20.0)
        const vb = Math.pow(vh, 0.4996667741545416)
        const sa0 = 1.0 + shelfK / shelfQ + shelfK * shelfK
        this.#sb0 = (vh + vb * shelfK / shelfQ + shelfK * shelfK) / sa0
        this.#sb1 = 2.0 * (shelfK * shelfK - vh) / sa0
        this.#sb2 = (vh - vb * shelfK / shelfQ + shelfK * shelfK) / sa0
        this.#sa1 = 2.0 * (shelfK * shelfK - 1.0) / sa0
        this.#sa2 = (1.0 - shelfK / shelfQ + shelfK * shelfK) / sa0
        const passK = Math.tan(Math.PI * 38.13547087602444 / sampleRate)
        const passQ = 0.5003270373238773
        const ha0 = 1.0 + passK / passQ + passK * passK
        this.#ha1 = 2.0 * (passK * passK - 1.0) / ha0
        this.#ha2 = (1.0 - passK / passQ + passK * passK) / ha0
    }

    /** [b0, b1, b2, a1, a2] of the shelf and the high-pass (whose numerator is 1, -2, 1). */
    get coefficients(): ReadonlyArray<number> {
        return [this.#sb0, this.#sb1, this.#sb2, this.#sa1, this.#sa2, 1.0, -2.0, 1.0, this.#ha1, this.#ha2]
    }

    reset(): void {
        this.#sx1 = this.#sx2 = this.#sy1 = this.#sy2 = this.#hy1 = this.#hy2 = 0.0
    }

    /** Filters samples[from..to) (state carries over between calls) and returns the sum of squared outputs. */
    sumSquares(samples: Float32Array, from: int, to: int): number {
        const sb0 = this.#sb0, sb1 = this.#sb1, sb2 = this.#sb2, sa1 = this.#sa1, sa2 = this.#sa2
        const ha1 = this.#ha1, ha2 = this.#ha2
        let sx1 = this.#sx1, sx2 = this.#sx2, sy1 = this.#sy1, sy2 = this.#sy2, hy1 = this.#hy1, hy2 = this.#hy2
        let sum = 0.0
        for (let i = from; i < to; i++) {
            const x = samples[i]
            const sy = sb0 * x + sb1 * sx1 + sb2 * sx2 - sa1 * sy1 - sa2 * sy2
            const hy = sy - 2.0 * sy1 + sy2 - ha1 * hy1 - ha2 * hy2
            sx2 = sx1
            sx1 = x
            sy2 = sy1
            sy1 = sy
            hy2 = hy1
            hy1 = hy
            sum += hy * hy
        }
        this.#sx1 = sx1
        this.#sx2 = sx2
        this.#sy1 = Math.abs(sy1) < 1e-30 ? 0.0 : sy1
        this.#sy2 = Math.abs(sy2) < 1e-30 ? 0.0 : sy2
        this.#hy1 = Math.abs(hy1) < 1e-30 ? 0.0 : hy1
        this.#hy2 = Math.abs(hy2) < 1e-30 ? 0.0 : hy2
        return sum
    }
}

/** True peak per ITU-R BS.1770-4 Annex 2: 4x oversampling with a 64-tap Kaiser-windowed sinc (flat ±0.03 dB to 0.4 fs). */
export namespace TruePeak {
    export const OVERSAMPLING = 4
    export const TAPS_PER_PHASE = 16

    const HALF = TAPS_PER_PHASE / 2
    const BETA = 5.0
    const BLOCK = 256

    const besselI0 = (value: number): number => {
        let sum = 1.0, term = 1.0
        for (let k = 1; k < 50; k++) {
            term *= (value / (2.0 * k)) * (value / (2.0 * k))
            sum += term
        }
        return sum
    }

    const createPhases = (): ReadonlyArray<Float64Array> => {
        const phases: Array<Float64Array> = []
        for (let phase = 1; phase < OVERSAMPLING; phase++) {
            const coeffs = new Float64Array(TAPS_PER_PHASE)
            let sum = 0.0
            for (let j = 0; j < TAPS_PER_PHASE; j++) {
                const offset = (j - (HALF - 1)) - phase / OVERSAMPLING
                const ratio = offset / HALF
                const sinc = Math.sin(Math.PI * offset) / (Math.PI * offset)
                coeffs[j] = sinc * besselI0(BETA * Math.sqrt(Math.max(0.0, 1.0 - ratio * ratio))) / besselI0(BETA)
                sum += coeffs[j]
            }
            for (let j = 0; j < TAPS_PER_PHASE; j++) {coeffs[j] /= sum}
            phases.push(coeffs)
        }
        return phases
    }

    /** Interpolation filters for the fractional positions 1/4, 2/4, 3/4; tap j weights sample n + j - 7. */
    export const phases: ReadonlyArray<Float64Array> = createPhases()

    const L1_NORM: number = phases.reduce((max, coeffs) => Math.max(max, coeffs.reduce((sum, value) => sum + Math.abs(value), 0.0)), 0.0)

    const interpolatedMax = (samples: Float32Array, from: int, to: int): number => {
        const [p1, p2, p3] = phases
        const length = samples.length
        let peak = 0.0
        for (let n = from; n < to; n++) {
            const base = n - (HALF - 1)
            let y1 = 0.0, y2 = 0.0, y3 = 0.0
            if (base >= 0 && base + TAPS_PER_PHASE <= length) {
                for (let j = 0; j < TAPS_PER_PHASE; j++) {
                    const x = samples[base + j]
                    y1 += p1[j] * x
                    y2 += p2[j] * x
                    y3 += p3[j] * x
                }
            } else {
                for (let j = 0; j < TAPS_PER_PHASE; j++) {
                    const index = base + j
                    if (index < 0 || index >= length) {continue}
                    const x = samples[index]
                    y1 += p1[j] * x
                    y2 += p2[j] * x
                    y3 += p3[j] * x
                }
            }
            const local = Math.max(Math.abs(y1), Math.abs(y2), Math.abs(y3))
            if (local > peak) {peak = local}
        }
        return peak
    }

    /** Linear true peak over all channels. Skips blocks that provably cannot exceed the running maximum. */
    export const measure = (channels: ReadonlyArray<Float32Array>): number => {
        let peak = 0.0
        const candidates: Array<{ channel: int, block: int, bound: number }> = []
        channels.forEach((samples, channel) => {
            const numBlocks = Math.ceil(samples.length / BLOCK)
            const blockMax = new Float32Array(numBlocks)
            for (let block = 0; block < numBlocks; block++) {
                const end = Math.min(samples.length, (block + 1) * BLOCK)
                let max = 0.0
                for (let i = block * BLOCK; i < end; i++) {
                    const value = Math.abs(samples[i])
                    if (value > max) {max = value}
                }
                blockMax[block] = max
                if (max > peak) {peak = max}
            }
            for (let block = 0; block < numBlocks; block++) {
                const bound = Math.max(blockMax[block], block > 0 ? blockMax[block - 1] : 0.0,
                    block < numBlocks - 1 ? blockMax[block + 1] : 0.0) * L1_NORM
                if (bound > peak) {candidates.push({channel, block, bound})}
            }
        })
        candidates.sort((first, second) => second.bound - first.bound)
        for (const {channel, block, bound} of candidates) {
            if (bound <= peak) {break}
            const samples = channels[channel]
            peak = Math.max(peak, interpolatedMax(samples, block * BLOCK, Math.min(samples.length, (block + 1) * BLOCK)))
        }
        return peak
    }

    /** Streaming true-peak detector for one channel (8 samples latency). */
    export class Detector {
        readonly #history: Float64Array = new Float64Array(TAPS_PER_PHASE * 2)

        #write: int = 0

        reset(): void {
            this.#history.fill(0.0)
            this.#write = 0
        }

        /** Returns the true peak (linear) of the interpolated signal ending with samples[from..to). */
        process(samples: Float32Array, from: int, to: int): number {
            const [p1, p2, p3] = phases
            const history = this.#history
            let write = this.#write
            let peak = 0.0
            for (let i = from; i < to; i++) {
                const x = samples[i]
                history[write] = x
                history[write + TAPS_PER_PHASE] = x
                write = (write + 1) % TAPS_PER_PHASE
                let y1 = 0.0, y2 = 0.0, y3 = 0.0
                for (let j = 0; j < TAPS_PER_PHASE; j++) {
                    const value = history[write + j]
                    y1 += p1[j] * value
                    y2 += p2[j] * value
                    y3 += p3[j] * value
                }
                const local = Math.max(Math.abs(x), Math.abs(y1), Math.abs(y2), Math.abs(y3))
                if (local > peak) {peak = local}
            }
            this.#write = write
            return peak
        }
    }
}

/**
 * Streaming ITU-R BS.1770-4 / EBU R128 meter for stereo input. Momentary (400 ms) and short-term (3 s) windows
 * advance in 100 ms steps (75% overlap gating blocks). Integrated and LRA use energy-weighted 0.1 LU histograms.
 */
export class LoudnessMeter {
    static readonly #ABSOLUTE_GATE = -70.0
    static readonly #HIST_MIN = -70.0
    static readonly #HIST_STEP = 0.1
    static readonly #HIST_BINS = 800
    static readonly #MOMENTARY_BLOCKS = 4
    static readonly #SHORT_TERM_BLOCKS = 30

    readonly #filterL: KWeightingFilter
    readonly #filterR: KWeightingFilter
    readonly #peakL: TruePeak.Detector = new TruePeak.Detector()
    readonly #peakR: TruePeak.Detector = new TruePeak.Detector()
    readonly #subBlocks: Float64Array = new Float64Array(LoudnessMeter.#SHORT_TERM_BLOCKS)
    readonly #integratedCount: Float64Array = new Float64Array(LoudnessMeter.#HIST_BINS)
    readonly #integratedEnergy: Float64Array = new Float64Array(LoudnessMeter.#HIST_BINS)
    readonly #shortTermCount: Float64Array = new Float64Array(LoudnessMeter.#HIST_BINS)
    readonly #blockSamples: int

    #subBlockWrite: int = 0
    #subBlockCount: int = 0
    #accum = 0.0
    #accumCount: int = 0
    #truePeak = 0.0

    constructor(sampleRate: number) {
        this.#filterL = new KWeightingFilter(sampleRate)
        this.#filterR = new KWeightingFilter(sampleRate)
        this.#blockSamples = Math.max(1, Math.round(sampleRate * 0.1))
    }

    reset(): void {
        this.#filterL.reset()
        this.#filterR.reset()
        this.#peakL.reset()
        this.#peakR.reset()
        this.#subBlocks.fill(0.0)
        this.#integratedCount.fill(0.0)
        this.#integratedEnergy.fill(0.0)
        this.#shortTermCount.fill(0.0)
        this.#subBlockWrite = this.#subBlockCount = this.#accumCount = 0
        this.#accum = this.#truePeak = 0.0
    }

    process(left: Float32Array, right: Float32Array): void {
        const n = left.length
        this.#truePeak = Math.max(this.#truePeak, this.#peakL.process(left, 0, n), this.#peakR.process(right, 0, n))
        let from = 0
        while (from < n) {
            const to = Math.min(n, from + this.#blockSamples - this.#accumCount)
            this.#accum += this.#filterL.sumSquares(left, from, to) + this.#filterR.sumSquares(right, from, to)
            this.#accumCount += to - from
            from = to
            if (this.#accumCount >= this.#blockSamples) {
                this.#pushSubBlock(this.#accum / this.#accumCount)
                this.#accum = 0.0
                this.#accumCount = 0
            }
        }
    }

    get momentary(): number {return KWeightingFilter.loudnessOf(this.#windowMean(LoudnessMeter.#MOMENTARY_BLOCKS))}
    get shortTerm(): number {return KWeightingFilter.loudnessOf(this.#windowMean(LoudnessMeter.#SHORT_TERM_BLOCKS))}
    get integrated(): number {
        const absMean = LoudnessMeter.#energyMean(this.#integratedCount, this.#integratedEnergy, LoudnessMeter.#ABSOLUTE_GATE)
        if (absMean <= 0.0) {return SILENCE_DB}
        const relMean = LoudnessMeter.#energyMean(this.#integratedCount, this.#integratedEnergy,
            KWeightingFilter.loudnessOf(absMean) - 10.0)
        return KWeightingFilter.loudnessOf(relMean)
    }
    get loudnessRange(): number {
        const hist = this.#shortTermCount
        let energy = 0.0, count = 0.0
        for (let i = 0; i < LoudnessMeter.#HIST_BINS; i++) {
            energy += hist[i] * KWeightingFilter.meanSquareOf(LoudnessMeter.#loudnessAtBin(i))
            count += hist[i]
        }
        if (count <= 0.0) {return 0.0}
        const relThreshold = KWeightingFilter.loudnessOf(energy / count) - 20.0
        const low = LoudnessMeter.#percentile(hist, relThreshold, 0.1)
        const high = LoudnessMeter.#percentile(hist, relThreshold, 0.95)
        return Math.max(0.0, high - low)
    }
    get truePeakDbtp(): number {return this.#truePeak > 1e-6 ? 20.0 * Math.log10(this.#truePeak) : SILENCE_DB}

    /** out = [momentary LUFS, short-term LUFS, integrated LUFS, LRA LU, true peak dBTP] */
    fill(out: Float32Array): void {
        out[0] = this.momentary
        out[1] = this.shortTerm
        out[2] = this.integrated
        out[3] = this.loudnessRange
        out[4] = this.truePeakDbtp
    }

    #windowMean(blocks: int): number {
        const ring = this.#subBlocks
        let sum = 0.0
        for (let i = 1; i <= blocks; i++) {sum += ring[(this.#subBlockWrite - i + ring.length) % ring.length]}
        return sum / blocks
    }

    #pushSubBlock(meanSquare: number): void {
        this.#subBlocks[this.#subBlockWrite] = meanSquare
        this.#subBlockWrite = (this.#subBlockWrite + 1) % this.#subBlocks.length
        this.#subBlockCount++
        if (this.#subBlockCount >= LoudnessMeter.#MOMENTARY_BLOCKS) {
            const energy = this.#windowMean(LoudnessMeter.#MOMENTARY_BLOCKS)
            const loudness = KWeightingFilter.loudnessOf(energy)
            if (loudness >= LoudnessMeter.#ABSOLUTE_GATE) {
                const bin = LoudnessMeter.#binOf(loudness)
                this.#integratedCount[bin] += 1.0
                this.#integratedEnergy[bin] += energy
            }
        }
        if (this.#subBlockCount >= LoudnessMeter.#SHORT_TERM_BLOCKS) {
            const loudness = KWeightingFilter.loudnessOf(this.#windowMean(LoudnessMeter.#SHORT_TERM_BLOCKS))
            if (loudness >= LoudnessMeter.#ABSOLUTE_GATE) {this.#shortTermCount[LoudnessMeter.#binOf(loudness)] += 1.0}
        }
    }

    static #binOf(loudness: number): int {
        const index = Math.floor((loudness - LoudnessMeter.#HIST_MIN) / LoudnessMeter.#HIST_STEP)
        return Math.max(0, Math.min(LoudnessMeter.#HIST_BINS - 1, index))
    }

    static #loudnessAtBin(index: int): number {return LoudnessMeter.#HIST_MIN + (index + 0.5) * LoudnessMeter.#HIST_STEP}

    static #energyMean(counts: Float64Array, energies: Float64Array, threshold: number): number {
        let energy = 0.0, count = 0.0
        for (let i = LoudnessMeter.#binOf(threshold); i < LoudnessMeter.#HIST_BINS; i++) {
            energy += energies[i]
            count += counts[i]
        }
        return count > 0.0 ? energy / count : 0.0
    }

    static #percentile(hist: Float64Array, threshold: number, fraction: number): number {
        const from = LoudnessMeter.#binOf(threshold)
        let total = 0.0
        for (let i = from; i < LoudnessMeter.#HIST_BINS; i++) {total += hist[i]}
        if (total <= 0.0) {return LoudnessMeter.#HIST_MIN}
        const target = total * fraction
        let running = 0.0
        for (let i = from; i < LoudnessMeter.#HIST_BINS; i++) {
            running += hist[i]
            if (running >= target) {return LoudnessMeter.#loudnessAtBin(i)}
        }
        return LoudnessMeter.#loudnessAtBin(LoudnessMeter.#HIST_BINS - 1)
    }
}
