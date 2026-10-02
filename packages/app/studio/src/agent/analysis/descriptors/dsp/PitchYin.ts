import {clamp, int, isDefined, Optional} from "@opendaw/lib-std"
import {BiquadCoeff, BiquadMono} from "@opendaw/lib-dsp"
import {FftCache} from "./FftCache"

/** YIN pitch estimation: coarse search on a decimated copy (FFT difference function), refined on the full-rate signal. */
export namespace PitchYin {
    export const MinHz = 30.0
    export const MaxHz = 2000.0
    /** Below this periodicity (1 - YIN aperiodicity) a frame counts as unpitched (noise, drums). */
    export const VoicedPeriodicity = 0.7

    export type Estimate = { readonly hz: number, readonly periodicity: number }

    const Threshold = 0.15
    const RefineBelowLag = 48

    const parabola = (left: number, center: number, right: number): number => {
        const denominator = left - 2.0 * center + right
        return Math.abs(denominator) > 1e-12 ? clamp(0.5 * (left - right) / denominator, -0.5, 0.5) : 0.0
    }

    /** The most periodic estimate of a signal (check periodicity against VoicedPeriodicity before trusting hz). */
    export const estimate = (signal: Float32Array, sampleRate: number, minHz: number = MinHz, maxHz: number = MaxHz): Optional<Estimate> =>
        new Tracker(signal, sampleRate, minHz, maxHz).probe()

    export class Tracker {
        readonly #full: Float32Array
        readonly #sampleRate: number
        readonly #factor: int
        readonly #low: Float32Array
        readonly #rate: number
        readonly #minHz: number
        readonly #maxHz: number

        constructor(mono: Float32Array, sampleRate: number, minHz: number = MinHz, maxHz: number = MaxHz) {
            this.#full = mono
            this.#sampleRate = sampleRate
            this.#minHz = minHz
            this.#maxHz = maxHz
            this.#factor = Math.max(1, Math.floor(sampleRate / Math.max(12000, 5 * maxHz)))
            this.#rate = sampleRate / this.#factor
            const filtered = new Float32Array(mono.length)
            if (this.#factor > 1) {
                const coeff = new BiquadCoeff().setLowpassParams(0.4 * this.#rate / sampleRate)
                new BiquadMono().process(coeff, mono, filtered, 0, mono.length)
                new BiquadMono().process(coeff, filtered, filtered, 0, mono.length)
            } else {
                filtered.set(mono)
            }
            this.#low = new Float32Array(Math.floor(mono.length / this.#factor))
            for (let index = 0; index < this.#low.length; index++) {this.#low[index] = filtered[index * this.#factor]}
        }

        get length(): int {return this.#full.length}

        windowFrames(maxPeriodSeconds: number): int {
            return 2 * Math.ceil(Math.min(maxPeriodSeconds, 1.0 / this.#minHz) * this.#rate) * this.#factor
        }

        /** The most periodic of a few estimates across the signal (the middle one suffices when clearly pitched). */
        probe(): Optional<Estimate> {
            let best: Optional<Estimate> = undefined
            for (const fraction of [0.5, 0.3, 0.7]) {
                const estimate = this.estimate(Math.round(fraction * this.#full.length))
                if (isDefined(estimate) && estimate.periodicity > (best?.periodicity ?? -1.0)) {best = estimate}
                if ((best?.periodicity ?? 0.0) > 0.9) {break}
            }
            return best
        }

        estimate(centerFrame: int, maxPeriodSeconds: number = Number.POSITIVE_INFINITY): Optional<Estimate> {
            const low = this.#low
            const minLag = Math.max(2, Math.floor(this.#rate / this.#maxHz))
            let maxLag = Math.ceil(Math.min(maxPeriodSeconds, 1.0 / this.#minHz) * this.#rate)
            if (2 * maxLag > low.length) {maxLag = Math.floor(low.length / 2)}
            if (maxLag < 2 * minLag) {return undefined}
            const width = maxLag
            const span = width + maxLag
            const start = Math.max(0, Math.min(low.length - span, Math.round(centerFrame / this.#factor - span / 2)))
            const size = FftCache.ceilPow2(span)
            const packedReal = new Float32Array(size), packedImag = new Float32Array(size)
            const realB = new Float32Array(size), imagB = new Float32Array(size)
            for (let index = 0; index < span; index++) {
                const value = low[start + index]
                if (index < width) {packedReal[index] = value}
                packedImag[index] = value
            }
            const fft = FftCache.fft(size)
            fft.process(packedReal, packedImag)
            for (let index = 0, mask = size - 1; index < size; index++) {
                const mirror = (size - index) & mask
                const real = packedReal[index], imag = packedImag[index]
                const mirrorReal = packedReal[mirror], mirrorImag = packedImag[mirror]
                const realA = 0.5 * (real + mirrorReal), imagA = 0.5 * (imag - mirrorImag)
                const realOfB = 0.5 * (imag + mirrorImag), imagOfB = 0.5 * (mirrorReal - real)
                realB[index] = realA * realOfB + imagA * imagOfB
                imagB[index] = realA * imagOfB - imagA * realOfB
            }
            fft.inverse(realB, imagB)
            const prefix = new Float64Array(span + 1)
            for (let index = 0; index < span; index++) {prefix[index + 1] = prefix[index] + low[start + index] * low[start + index]}
            const energy = prefix[width]
            if (energy < 1e-10 * width) {return undefined}
            const normalized = new Float32Array(maxLag + 1)
            normalized[0] = 1.0
            let sum = 0.0
            for (let lag = 1; lag <= maxLag; lag++) {
                const difference = Math.max(0.0, energy + prefix[lag + width] - prefix[lag] - 2.0 * realB[lag])
                sum += difference
                normalized[lag] = sum > 0.0 ? difference * lag / sum : 1.0
            }
            let best = -1
            for (let lag = minLag; lag < maxLag; lag++) {
                if (normalized[lag] < Threshold) {
                    while (lag + 1 < maxLag && normalized[lag + 1] < normalized[lag]) {lag++}
                    best = lag
                    break
                }
            }
            if (best < 0) {
                best = minLag
                for (let lag = minLag; lag < maxLag; lag++) {if (normalized[lag] < normalized[best]) {best = lag}}
            }
            const periodicity = clamp(1.0 - normalized[best], 0.0, 1.0)
            const coarse = best + parabola(normalized[best - 1], normalized[best], normalized[best + 1])
            const fullLag = coarse < RefineBelowLag ? this.#refine(coarse * this.#factor, start * this.#factor, width * this.#factor)
                : coarse * this.#factor
            return {hz: this.#sampleRate / fullLag, periodicity}
        }

        #refine(lag: number, start: int, width: int): number {
            const full = this.#full
            const factor = this.#factor
            if (factor === 1) {return lag}
            const center = Math.round(lag)
            const from = Math.max(2, center - factor - 1), to = center + factor + 1
            if (start + width + to + 1 > full.length) {return lag}
            const differences = new Float64Array(to - from + 3)
            for (let candidate = from - 1; candidate <= to + 1; candidate++) {
                let sum = 0.0
                for (let index = start; index < start + width; index++) {
                    const delta = full[index] - full[index + candidate]
                    sum += delta * delta
                }
                differences[candidate - from + 1] = sum
            }
            let best = 1
            for (let index = 1; index < differences.length - 1; index++) {if (differences[index] < differences[best]) {best = index}}
            return from - 1 + best + parabola(differences[best - 1], differences[best], differences[best + 1])
        }
    }
}
