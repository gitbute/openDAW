import {describe, expect, it} from "vitest"
import {KWeightingFilter, LoudnessMeter, SILENCE_DB, TruePeak} from "./loudness"
import {AudioMetrics} from "./audio-metrics"

const SR = 48000

const sine = (frequency: number, dbfs: number, seconds: number, sampleRate: number = SR, phase: number = 0.0): Float32Array => {
    const amplitude = Math.pow(10.0, dbfs / 20.0)
    const out = new Float32Array(Math.round(seconds * sampleRate))
    for (let i = 0; i < out.length; i++) {out[i] = amplitude * Math.sin(2.0 * Math.PI * frequency * i / sampleRate + phase)}
    return out
}

const concat = (...parts: ReadonlyArray<Float32Array>): Float32Array => {
    const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

// raised-cosine fades avoid the (real) Gibbs overshoot of an abrupt start from dominating true-peak tests
const faded = (signal: Float32Array, seconds: number = 0.02): Float32Array => {
    const length = Math.min(signal.length >> 1, Math.round(seconds * SR))
    for (let i = 0; i < length; i++) {
        const gain = 0.5 - 0.5 * Math.cos(Math.PI * i / length)
        signal[i] *= gain
        signal[signal.length - 1 - i] *= gain
    }
    return signal
}

const stereo = (mono: Float32Array): ReadonlyArray<Float32Array> => [mono, mono.slice()]

const feedMeter = (meter: LoudnessMeter, channels: ReadonlyArray<Float32Array>, quantum: number = 128): void => {
    const [left, right] = channels
    for (let offset = 0; offset < left.length; offset += quantum) {
        const end = Math.min(left.length, offset + quantum)
        meter.process(left.subarray(offset, end), right.subarray(offset, end))
    }
}

describe("KWeightingFilter", () => {
    it("matches the ITU-R BS.1770-4 48 kHz coefficients", () => {
        const expected = [
            1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585,
            1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]
        new KWeightingFilter(48000).coefficients.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 8))
    })
    it("adds ~+0.69 dB at 1 kHz so that a 0 dBFS 1 kHz sine on one channel reads -3.01 LUFS", () => {
        const result = AudioMetrics.loudness([sine(997, 0.0, 10.0)], SR)
        expect(result.integratedLufs).toBeCloseTo(-3.01, 1)
    })
})

describe("AudioMetrics.loudness (EBU Tech 3341 / 3342 cases)", () => {
    it("stereo 1 kHz sine at -23 dBFS reads -23 LUFS integrated, momentary and short-term", () => {
        const result = AudioMetrics.loudness(stereo(sine(997, -23.0, 20.0)), SR)
        expect(result.silent).toBe(false)
        expect(Math.abs(result.integratedLufs + 23.0)).toBeLessThan(0.1)
        expect(Math.abs(result.maxMomentaryLufs + 23.0)).toBeLessThan(0.1)
        expect(Math.abs(result.maxShortTermLufs + 23.0)).toBeLessThan(0.1)
        expect(result.loudnessRangeLu).toBeLessThan(0.1)
        expect(result.samplePeakDbfs).toBeCloseTo(-23.0, 2)
        expect(result.rmsDbfs).toBeCloseTo(-26.01, 2)
        expect(result.crestDb).toBeCloseTo(3.01, 2)
    })
    it("relative gate: -36 / -23 / -36 dBFS sections read -23 LUFS", () => {
        const signal = concat(sine(997, -36.0, 10.0), sine(997, -23.0, 60.0), sine(997, -36.0, 10.0))
        expect(Math.abs(AudioMetrics.loudness(stereo(signal), SR).integratedLufs + 23.0)).toBeLessThan(0.1)
    })
    it("absolute gate: digital silence between tones is ignored", () => {
        const silence = new Float32Array(10 * SR)
        const signal = concat(silence, sine(997, -23.0, 20.0), silence, sine(997, -23.0, 20.0), silence)
        expect(Math.abs(AudioMetrics.loudness(stereo(signal), SR).integratedLufs + 23.0)).toBeLessThan(0.1)
    })
    it("loudness range: 20 s at -20 then 20 s at -30 dBFS reads 10 LU ±1", () => {
        const result = AudioMetrics.loudness(stereo(concat(sine(997, -20.0, 20.0), sine(997, -30.0, 20.0))), SR)
        expect(Math.abs(result.loudnessRangeLu - 10.0)).toBeLessThan(1.0)
    })
    it("silence is finite and flagged", () => {
        const result = AudioMetrics.loudness(stereo(new Float32Array(SR * 2)), SR)
        expect(result.silent).toBe(true)
        expect(result.integratedLufs).toBe(SILENCE_DB)
        Object.values(result).forEach(value => {if (typeof value === "number") {expect(Number.isFinite(value)).toBe(true)}})
        expect(AudioMetrics.loudness([], SR).silent).toBe(true)
    })
    it("activeFraction is the share of time above the absolute gate", () => {
        const result = AudioMetrics.loudness(stereo(concat(sine(997, -20.0, 2.0), new Float32Array(SR * 6))), SR)
        expect(result.activeFraction).toBeCloseTo(0.25, 1)
        expect(Math.abs(result.integratedLufs + 20.0)).toBeLessThan(0.5)
    })
    it("very short input still measures", () => {
        const result = AudioMetrics.loudness(stereo(sine(997, -23.0, 0.05)), SR)
        expect(Math.abs(result.integratedLufs + 23.0)).toBeLessThan(0.5)
    })
})

describe("TruePeak", () => {
    it("finds the inter-sample peak of an fs/4 sine phase-shifted by 45°", () => {
        const signal = faded(sine(SR / 4, 0.0, 1.0, SR, Math.PI / 4))
        const result = AudioMetrics.loudness([signal], SR)
        expect(result.samplePeakDbfs).toBeCloseTo(-3.01, 2)
        expect(Math.abs(result.truePeakDbtp)).toBeLessThan(0.05)
        const detector = new TruePeak.Detector()
        expect(Math.abs(20.0 * Math.log10(detector.process(signal, 0, signal.length)))).toBeLessThan(0.05)
    })
    it("equals the sample peak for well-sampled low frequencies", () => {
        const result = AudioMetrics.loudness([sine(997, -6.0, 1.0)], SR)
        expect(Math.abs(result.truePeakDbtp + 6.0)).toBeLessThan(0.02)
    })
    it("tracks high-frequency inter-sample overs within 0.1 dB", () => {
        for (const frequency of [5000, 11025, 15000, 18000]) {
            let maxTrue = 0.0
            for (let phase = 0; phase < 8; phase++) {
                const signal = faded(sine(frequency, 0.0, 0.25, SR, phase * Math.PI / 16))
                maxTrue = Math.max(maxTrue, TruePeak.measure([signal]))
            }
            expect(Math.abs(20.0 * Math.log10(maxTrue))).toBeLessThan(0.1)
        }
    })
})

describe("LoudnessMeter (streaming)", () => {
    it("reads -23 LUFS for a stereo -23 dBFS sine in 128-frame quanta", () => {
        const meter = new LoudnessMeter(SR)
        feedMeter(meter, stereo(sine(997, -23.0, 20.0)))
        const out = new Float32Array(5)
        meter.fill(out)
        expect(Math.abs(out[0] + 23.0)).toBeLessThan(0.1)
        expect(Math.abs(out[1] + 23.0)).toBeLessThan(0.1)
        expect(Math.abs(out[2] + 23.0)).toBeLessThan(0.1)
        expect(out[3]).toBeLessThan(0.2)
        expect(Math.abs(out[4] + 23.0)).toBeLessThan(0.05)
    })
    it("agrees with the offline measurement on gating and LRA", () => {
        const channels = stereo(concat(sine(997, -36.0, 5.0), sine(997, -20.0, 20.0), sine(997, -30.0, 20.0)))
        const meter = new LoudnessMeter(SR)
        feedMeter(meter, channels, 100)
        const offline = AudioMetrics.loudness(channels, SR)
        expect(Math.abs(meter.integrated - offline.integratedLufs)).toBeLessThan(0.1)
        expect(Math.abs(meter.loudnessRange - offline.loudnessRangeLu)).toBeLessThan(0.3)
        expect(Math.abs(meter.loudnessRange - 10.0)).toBeLessThan(1.0)
    })
    it("reports true peak, not sample peak", () => {
        const meter = new LoudnessMeter(SR)
        const signal = faded(sine(SR / 4, 0.0, 0.5, SR, Math.PI / 4))
        feedMeter(meter, [signal, signal])
        expect(Math.abs(meter.truePeakDbtp)).toBeLessThan(0.05)
    })
    it("is silent until fed and after reset", () => {
        const meter = new LoudnessMeter(SR)
        expect(meter.integrated).toBe(SILENCE_DB)
        feedMeter(meter, stereo(sine(997, -23.0, 2.0)))
        meter.reset()
        expect(meter.integrated).toBe(SILENCE_DB)
        expect(meter.truePeakDbtp).toBe(SILENCE_DB)
    })
})
