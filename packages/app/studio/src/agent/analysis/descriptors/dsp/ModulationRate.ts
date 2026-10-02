import {int, Option, Optional} from "@opendaw/lib-std"
import {MeasureMath} from "./MeasureMath"

/** Periodic modulation (LFO, wobble, tremolo, vibrato) and one-shot trends in a feature curve sampled at frameRate. */
export namespace ModulationRate {
    export type Trend = { readonly slopePerSecond: number, readonly change: number, readonly r2: number, readonly residual: Float64Array }
    export type Periodicity = { readonly rateHz: number, readonly strength: number }

    export const trend = (curve: ArrayLike<number>, frameRate: number): Trend => {
        const count = curve.length
        const residual = new Float64Array(count)
        if (count < 3) {return {slopePerSecond: 0, change: 0, r2: 0, residual}}
        const {slope, intercept, r2} = MeasureMath.linearFit(curve)
        for (let index = 0; index < count; index++) {residual[index] = curve[index] - intercept - slope * index}
        return {slopePerSecond: slope * frameRate, change: slope * (count - 1), r2, residual}
    }

    const autocorrelation = (values: ArrayLike<number>, maxLag: int): Float64Array => {
        const count = values.length
        const prefix = new Float64Array(count + 1)
        for (let index = 0; index < count; index++) {prefix[index + 1] = prefix[index] + values[index] * values[index]}
        const result = new Float64Array(maxLag + 1)
        for (let lag = 0; lag <= maxLag; lag++) {
            let sum = 0
            for (let index = 0; index + lag < count; index++) {sum += values[index] * values[index + lag]}
            const norm = Math.sqrt(prefix[count - lag] * (prefix[count] - prefix[lag]))
            result[lag] = norm > 1e-18 ? sum / norm : 0
        }
        return result
    }

    const spectralPeak = (values: ArrayLike<number>, frameRate: number, guessHz: number): number => {
        let bestHz = guessHz, bestAmplitude = -1
        for (let step = -60; step <= 60; step++) {
            const hz = guessHz * (1 + step * 0.001)
            const {amplitude} = MeasureMath.sine(values, frameRate, hz)
            if (amplitude > bestAmplitude) {
                bestAmplitude = amplitude
                bestHz = hz
            }
        }
        return bestHz
    }

    /** Rate of a detrended curve: the first autocorrelation peak within 85% of the strongest, refined by a fine DFT scan. */
    export const periodicity = (residual: ArrayLike<number>, frameRate: number, minHz: number, maxHz: number,
                                minStrength: number = 0.5): Option<Periodicity> => {
        const count = residual.length
        const minLag = Math.max(2, Math.floor(frameRate / maxHz))
        const maxLag = Math.min(Math.floor(count / 2), Math.ceil(frameRate / minHz))
        if (maxLag <= minLag + 1) {return Option.None}
        const correlation = autocorrelation(residual, Math.min(count - 1, maxLag + 1))
        let start = 1
        while (start < maxLag && correlation[start] > 0) {start++}
        const from = Math.max(start, minLag)
        let strongest = 0
        for (let lag = from; lag <= maxLag; lag++) {strongest = Math.max(strongest, correlation[lag])}
        if (strongest < minStrength) {return Option.None}
        for (let lag = from; lag <= maxLag; lag++) {
            const value = correlation[lag]
            const next = lag + 1 < correlation.length ? correlation[lag + 1] : -1
            if (value < 0.85 * strongest || value < correlation[lag - 1] || value < next) {continue}
            const previous = correlation[lag - 1]
            const curvature = previous - 2 * value + next
            const offset = lag + 1 < correlation.length && curvature < 0 ? 0.5 * (previous - next) / curvature : 0
            const rateHz = spectralPeak(residual, frameRate, frameRate / (lag + offset))
            return rateHz >= minHz * 0.97 && rateHz <= maxHz * 1.03 ? Option.wrap({rateHz, strength: value}) : Option.None
        }
        return Option.None
    }

    /** Peak-to-peak of the curve folded onto one cycle (phase-binned average), robust against noise. */
    export const depth = (residual: ArrayLike<number>, frameRate: number, rateHz: number, bins: int = 12): number => {
        const sums = new Float64Array(bins), counts = new Float64Array(bins)
        for (let index = 0; index < residual.length; index++) {
            const phase = index * rateHz / frameRate
            const bin = Math.min(bins - 1, Math.floor((phase - Math.floor(phase)) * bins))
            sums[bin] += residual[index]
            counts[bin]++
        }
        let min = Infinity, max = -Infinity
        for (let bin = 0; bin < bins; bin++) {
            if (counts[bin] === 0) {continue}
            const mean = sums[bin] / counts[bin]
            min = Math.min(min, mean)
            max = Math.max(max, mean)
        }
        return max > min ? max - min : 0
    }

    const Divisions: ReadonlyArray<readonly [string, number]> = [
        ["4/1", 0.25], ["2/1", 0.5], ["1/1", 1], ["1/2", 2], ["1/4", 4], ["1/8", 8], ["1/16", 16], ["1/32", 32], ["1/64", 64]]
    const Feels: ReadonlyArray<readonly [string, number]> = [["", 1], ["T", 1.5], [".", 2 / 3]]

    /** Note value one cycle lasts at bpm ("2/1", "1/1", "1/8", "1/16T", "1/4."), when rateHz is within tolerance of it. */
    export const tempoSync = (rateHz: number, bpm: number, tolerance: number = 0.03): Optional<string> => {
        if (!(bpm > 0) || !(rateHz > 0)) {return undefined}
        let best: Optional<string> = undefined, bestError = tolerance
        for (const [label, division] of Divisions) {
            const straight = bpm / 60 * division / 4
            for (const [suffix, factor] of Feels) {
                const error = Math.abs(rateHz / (straight * factor) - 1)
                if (error < bestError) {
                    bestError = error
                    best = label + suffix
                }
            }
        }
        return best
    }
}
