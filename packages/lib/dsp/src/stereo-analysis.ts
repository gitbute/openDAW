import {int} from "@opendaw/lib-std"

/** Realtime stereo meter. out = [correlation, side/(mid+side) energy, balance, mid RMS, side RMS] (first three smoothed). */
export class StereoAnalyser {
    #corr = 0.0
    #width = 0.0
    #balance = 0.0

    process(left: Float32Array, right: Float32Array, out: Float32Array): void {
        const n = left.length
        let sumLR = 0.0, sumLL = 0.0, sumRR = 0.0, sumMid = 0.0, sumSide = 0.0
        for (let i = 0; i < n; i++) {
            const l = left[i]
            const r = right[i]
            sumLR += l * r
            sumLL += l * l
            sumRR += r * r
            const mid = (l + r) * 0.5
            const side = (l - r) * 0.5
            sumMid += mid * mid
            sumSide += side * side
        }
        const corr = sumLL > 1e-12 && sumRR > 1e-12 ? sumLR / Math.sqrt(sumLL * sumRR) : 0.0
        const width = sumMid + sumSide > 1e-12 ? sumSide / (sumMid + sumSide) : 0.0
        const balance = sumLL + sumRR > 1e-12 ? (sumRR - sumLL) / (sumLL + sumRR) : 0.0
        this.#corr += (corr - this.#corr) * 0.1
        this.#width += (width - this.#width) * 0.1
        this.#balance += (balance - this.#balance) * 0.1
        out[0] = this.#corr
        out[1] = this.#width
        out[2] = this.#balance
        out[3] = Math.sqrt(sumMid / Math.max(1, n))
        out[4] = Math.sqrt(sumSide / Math.max(1, n))
    }
}

/** Interleaved L/R ring for a goniometer. `out` length is pairs * 2. */
export class GonioCapture {
    readonly #pairs: int

    #write: int = 0

    constructor(pairs: int) {this.#pairs = pairs}

    process(left: Float32Array, right: Float32Array, out: Float32Array): void {
        const n = left.length
        for (let i = 0; i < n; i++) {
            const base = this.#write * 2
            out[base] = left[i]
            out[base + 1] = right[i]
            this.#write = (this.#write + 1) % this.#pairs
        }
    }
}
