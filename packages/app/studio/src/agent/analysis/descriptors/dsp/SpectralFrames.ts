import {int} from "@opendaw/lib-std"
import {AudioMetrics, BiquadCoeff, BiquadMono, Window} from "@opendaw/lib-dsp"
import {FftCache} from "./FftCache"
import {MeasureMath} from "./MeasureMath"

/** Short-time features per hop: level (smoothed power envelope), spectral centroid and spectral flux of the mono mix. */
export namespace SpectralFrames {
    export const FftSize = 2048
    export const EnvelopeHz = 20

    /** Frame `index` covers samples [index * hop, index * hop + fftSize). */
    export type Frames = {
        readonly count: int
        readonly fftSize: int
        readonly hop: int
        readonly frameRate: number
        readonly powerDb: Float64Array
        /** Magnitude-weighted; inactive frames hold the nearest active value. */
        readonly centroidHz: Float64Array
        /** Rectified magnitude increase over the previous frame divided by the frame's magnitude sum (0: static). */
        readonly flux: Float64Array
        readonly active: Uint8Array
        readonly activeCount: int
    }

    /** Amplitude response of the envelope smoother at a modulation rate (two cascaded 2-pole Butterworth low-passes). */
    export const envelopeResponse = (rateHz: number): number => 1 / (1 + (rateHz / EnvelopeHz) ** 4)

    const envelope = (channels: AudioMetrics.Channels, sampleRate: number, numFrames: int): Float32Array => {
        const squares = new Float32Array(numFrames)
        for (const samples of channels) {
            for (let index = 0; index < numFrames; index++) {squares[index] += samples[index] * samples[index] / channels.length}
        }
        const coeff = new BiquadCoeff().setLowpassParams(EnvelopeHz / sampleRate)
        new BiquadMono().process(coeff, squares, squares, 0, numFrames)
        new BiquadMono().process(coeff, squares, squares, 0, numFrames)
        return squares
    }

    export const analyse = (channels: AudioMetrics.Channels, sampleRate: number, fftSize: int = FftSize,
                            hop: int = fftSize >> 1): Frames => {
        const signal = MeasureMath.mono(channels)
        const count = signal.length >= fftSize ? Math.floor((signal.length - fftSize) / hop) + 1 : 0
        const half = fftSize >> 1, mask = fftSize - 1
        const smoothed = envelope(channels, sampleRate, signal.length)
        const powerDb = new Float64Array(count), centroidHz = new Float64Array(count), flux = new Float64Array(count)
        const power = new Float64Array(count), active = new Uint8Array(count)
        const window = FftCache.window(Window.Type.Hanning, fftSize)
        const fft = FftCache.fft(fftSize)
        const real = new Float32Array(fftSize), imag = new Float32Array(fftSize)
        const previous = new Float32Array(half + 1)
        const binHz = sampleRate / fftSize
        const firstBin = Math.max(1, Math.ceil(20 / binHz))
        const consume = (frame: int, second: boolean): void => {
            let sumMagnitude = 0, weighted = 0, rise = 0
            for (let bin = firstBin; bin <= half; bin++) {
                const mirror = (fftSize - bin) & mask
                const re = second ? imag[bin] + imag[mirror] : real[bin] + real[mirror]
                const im = second ? real[mirror] - real[bin] : imag[bin] - imag[mirror]
                const magnitude = Math.sqrt(re * re + im * im)
                sumMagnitude += magnitude
                weighted += magnitude * bin
                const delta = magnitude - previous[bin]
                if (delta > 0) {rise += delta}
                previous[bin] = magnitude
            }
            centroidHz[frame] = sumMagnitude > 0 ? weighted / sumMagnitude * binHz : 0
            flux[frame] = sumMagnitude > 0 && frame > 0 ? Math.min(1, rise / sumMagnitude) : 0
            power[frame] = Math.max(0, smoothed[frame * hop + half])
        }
        for (let frame = 0; frame < count; frame += 2) {
            const paired = frame + 1 < count
            for (let index = 0; index < fftSize; index++) {
                real[index] = signal[frame * hop + index] * window[index]
                imag[index] = paired ? signal[(frame + 1) * hop + index] * window[index] : 0
            }
            fft.process(real, imag)
            consume(frame, false)
            if (paired) {consume(frame + 1, true)}
        }
        let loudest = 0
        for (let frame = 0; frame < count; frame++) {loudest = Math.max(loudest, power[frame])}
        const gate = Math.max(loudest * 1e-6, 1e-9)
        let activeCount = 0, lastActive = -1
        for (let frame = 0; frame < count; frame++) {
            powerDb[frame] = MeasureMath.powerDb(power[frame])
            if (power[frame] > gate) {
                active[frame] = 1
                activeCount++
                if (lastActive < frame - 1) {centroidHz.fill(centroidHz[frame], lastActive + 1, frame)}
                lastActive = frame
            }
        }
        if (lastActive >= 0) {centroidHz.fill(centroidHz[lastActive], lastActive + 1, count)}
        for (let frame = 1; frame < count; frame++) {if (active[frame - 1] === 0) {flux[frame] = 0}}
        return {count, fftSize, hop, frameRate: sampleRate / hop, powerDb, centroidHz, flux, active, activeCount}
    }
}
