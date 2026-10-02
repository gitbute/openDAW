import {Window} from "@opendaw/lib-dsp"
import {FftCache} from "./FftCache"
import {MeasureMath} from "./MeasureMath"

/** L/R auto and cross power per frequency band (default low < 150 Hz, mid, high > 4 kHz), overall and per ~250 ms block. */
export namespace StereoBands {
    export const Names: ReadonlyArray<string> = ["low", "mid", "high"]
    export const EdgesHz: ReadonlyArray<number> = [150, 4000]

    const FftSize = 2048
    const BlockSeconds = 0.25

    /** Mean-square level of left, right and their cross product (powerDb(ll) is the left level in dBFS). */
    export type Power = { ll: number, rr: number, lr: number }

    /** One Power per band (edgesHz.length + 1 bands) and one broadband Power per block. */
    export type Analysis = {
        readonly bands: ReadonlyArray<Power>
        readonly blocks: ReadonlyArray<Power>
        readonly blockSeconds: number
    }

    const zero = (): Power => ({ll: 0, rr: 0, lr: 0})

    const scale = (power: Power, factor: number): void => {
        power.ll *= factor
        power.rr *= factor
        power.lr *= factor
    }

    export const total = ({ll, rr}: Power): number => ll + rr

    export const sum = (powers: ReadonlyArray<Power>): Power => powers.reduce((result, power) =>
        ({ll: result.ll + power.ll, rr: result.rr + power.rr, lr: result.lr + power.lr}), zero())

    export const correlation = ({ll, rr, lr}: Power): number =>
        ll > 1e-18 && rr > 1e-18 ? Math.max(-1, Math.min(1, lr / Math.sqrt(ll * rr))) : 0

    /** Side energy against mid energy, ±60 dB (-60: mono, 0: uncorrelated, +60: anti-phase). */
    export const sideDb = ({ll, rr, lr}: Power): number =>
        MeasureMath.ratioDb(Math.max(0, ll + rr - 2 * lr), Math.max(0, ll + rr + 2 * lr))

    /** Level of the mono sum (L + R) / 2 against the mean channel level (0: no loss, -3: uncorrelated). */
    export const monoDb = ({ll, rr, lr}: Power): number =>
        MeasureMath.ratioDb(Math.max(0, ll + rr + 2 * lr) / 4, (ll + rr) / 2)

    export const balanceDb = ({ll, rr}: Power): number => MeasureMath.ratioDb(rr, ll)

    /** Hann frames without overlap. */
    export const analyse = (left: Float32Array, right: Float32Array, sampleRate: number,
                            edgesHz: ReadonlyArray<number> = EdgesHz): Analysis => {
        const numFrames = Math.min(left.length, right.length)
        const windowLength = Math.min(FftSize, numFrames)
        const count = numFrames >= FftSize ? Math.floor((numFrames - FftSize) / FftSize) + 1 : numFrames > 1 ? 1 : 0
        const framesPerBlock = Math.max(1, Math.round(BlockSeconds * sampleRate / FftSize))
        const bands = Array.from({length: edgesHz.length + 1}, zero)
        const blocks: Array<Power> = []
        const blockSeconds = framesPerBlock * FftSize / sampleRate
        if (count === 0) {return {bands, blocks, blockSeconds}}
        const window = windowLength === FftSize
            ? FftCache.window(Window.Type.Hanning, FftSize) : Window.create(Window.Type.Hanning, windowLength)
        const fft = FftCache.fft(FftSize)
        const real = new Float32Array(FftSize), imag = new Float32Array(FftSize)
        const half = FftSize >> 1, mask = FftSize - 1
        const binHz = sampleRate / FftSize
        const bandOfBin = new Uint8Array(half + 1)
        for (let bin = 1, band = 0; bin <= half; bin++) {
            while (band < edgesHz.length && bin >= Math.ceil(edgesHz[band] / binHz)) {band++}
            bandOfBin[bin] = band
        }
        let windowPower = 0
        for (let index = 0; index < windowLength; index++) {windowPower += window[index] * window[index]}
        for (let frame = 0; frame < count; frame++) {
            const offset = frame * FftSize
            real.fill(0)
            imag.fill(0)
            for (let index = 0; index < windowLength; index++) {
                real[index] = left[offset + index] * window[index]
                imag[index] = right[offset + index] * window[index]
            }
            fft.process(real, imag)
            const blockIndex = Math.floor(frame / framesPerBlock)
            if (blockIndex >= blocks.length) {blocks.push(zero())}
            const block = blocks[blockIndex]
            for (let bin = 1; bin <= half; bin++) {
                const mirror = (FftSize - bin) & mask
                const re = real[bin], im = imag[bin], mirrorRe = real[mirror], mirrorIm = imag[mirror]
                const leftRe = re + mirrorRe, leftIm = im - mirrorIm
                const rightRe = im + mirrorIm, rightIm = mirrorRe - re
                const ll = leftRe * leftRe + leftIm * leftIm
                const rr = rightRe * rightRe + rightIm * rightIm
                const lr = leftRe * rightRe + leftIm * rightIm
                const band = bands[bandOfBin[bin]]
                band.ll += ll
                band.rr += rr
                band.lr += lr
                block.ll += ll
                block.rr += rr
                block.lr += lr
            }
        }
        const perFrame = 0.5 / (FftSize * windowPower)
        bands.forEach(band => scale(band, perFrame / count))
        blocks.forEach((block, index) => scale(block, perFrame / Math.min(framesPerBlock, count - index * framesPerBlock)))
        return {bands, blocks, blockSeconds}
    }

    export const isMono = (left: Float32Array, right: Float32Array): boolean => {
        const numFrames = Math.min(left.length, right.length)
        let difference = 0, sum = 0
        for (let index = 0; index < numFrames; index++) {
            const delta = left[index] - right[index]
            difference += delta * delta
            sum += left[index] * left[index] + right[index] * right[index]
        }
        return difference <= sum * 1e-8
    }
}
