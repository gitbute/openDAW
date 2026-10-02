import {int} from "@opendaw/lib-std"

export namespace EnvelopeFollower {
    export type Envelope = { readonly values: Float32Array, readonly hopFrames: int, readonly hopSeconds: number }

    /** Peak envelope on a 1 ms grid: the lower of a trailing and a leading running max over one waveform period. */
    export const peak = (mono: Float32Array, sampleRate: number, periodSeconds: number): Envelope => {
        const hopFrames = Math.max(1, Math.round(sampleRate * 0.001))
        const count = Math.ceil(mono.length / hopFrames)
        const peaks = new Float32Array(count)
        for (let hop = 0; hop < count; hop++) {
            let max = 0.0
            const end = Math.min(mono.length, (hop + 1) * hopFrames)
            for (let index = hop * hopFrames; index < end; index++) {
                const value = Math.abs(mono[index])
                if (value > max) {max = value}
            }
            peaks[hop] = max
        }
        const width = Math.max(0, Math.ceil(periodSeconds * sampleRate / hopFrames))
        const values = new Float32Array(count)
        for (let hop = 0; hop < count; hop++) {
            let trailing = 0.0, leading = 0.0
            for (let offset = 0; offset <= width; offset++) {
                if (hop - offset >= 0 && peaks[hop - offset] > trailing) {trailing = peaks[hop - offset]}
                if (hop + offset < count && peaks[hop + offset] > leading) {leading = peaks[hop + offset]}
            }
            values[hop] = Math.min(trailing, leading)
        }
        return {values, hopFrames, hopSeconds: hopFrames / sampleRate}
    }
}
