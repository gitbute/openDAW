import {describe, expect, it} from "vitest"
import {Random} from "@opendaw/lib-std"
import {AudioMetrics} from "./audio-metrics"
import {SILENCE_DB} from "./loudness"

const SR = 48000

const sine = (frequency: number, dbfs: number, seconds: number, sampleRate: number = SR): Float32Array => {
    const amplitude = Math.pow(10.0, dbfs / 20.0)
    const out = new Float32Array(Math.round(seconds * sampleRate))
    for (let i = 0; i < out.length; i++) {out[i] = amplitude * Math.sin(2.0 * Math.PI * frequency * i / sampleRate)}
    return out
}

const white = (seconds: number, seed: number, gain: number = 0.25, sampleRate: number = SR): Float32Array => {
    const random = Random.create(seed)
    const out = new Float32Array(Math.round(seconds * sampleRate))
    for (let i = 0; i < out.length; i++) {out[i] = (random.uniform() * 2.0 - 1.0) * gain}
    return out
}

// Paul Kellet's refined pink filter (±0.05 dB above 9.2 Hz at 44.1 kHz)
const pink = (seconds: number, seed: number, sampleRate: number): Float32Array => {
    const source = white(seconds, seed, 1.0, sampleRate)
    let b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0, b4 = 0.0, b5 = 0.0, b6 = 0.0
    for (let i = 0; i < source.length; i++) {
        const w = source[i]
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        source[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.05
        b6 = w * 0.115926
    }
    return source
}

const add = (target: Float32Array, source: Float32Array, at: number = 0): Float32Array => {
    for (let i = 0; i < source.length && at + i < target.length; i++) {target[at + i] += source[i]}
    return target
}

const click = (seconds: number = 0.03): Float32Array => {
    const out = new Float32Array(Math.round(seconds * SR))
    for (let i = 0; i < out.length; i++) {out[i] = 0.5 * Math.exp(-i / (0.005 * SR)) * Math.sin(2.0 * Math.PI * 2000 * i / SR)}
    return out
}

const kickHit = (seconds: number = 0.25): Float32Array => {
    const out = new Float32Array(Math.round(seconds * SR))
    let phase = 0.0
    for (let i = 0; i < out.length; i++) {
        phase += 2.0 * Math.PI * (50 + 100 * Math.exp(-i / (0.01 * SR))) / SR
        out[i] = 0.8 * Math.exp(-i / (0.12 * SR)) * Math.sin(phase)
    }
    return out
}

const powerSum = (bands: ReadonlyArray<AudioMetrics.Band>): number =>
    10.0 * Math.log10(bands.reduce((sum, band) => sum + Math.pow(10.0, band.db / 10.0), 0.0))

const bandAt = (bands: ReadonlyArray<AudioMetrics.Band>, centerHz: number): AudioMetrics.Band => {
    const band = bands.find(entry => entry.centerHz === centerHz)
    if (band === undefined) {throw new Error(`no band ${centerHz}`)}
    return band
}

const loudest = (bands: ReadonlyArray<AudioMetrics.Band>): AudioMetrics.Band =>
    bands.reduce((max, band) => band.db > max.db ? band : max)

describe("AudioMetrics.spectrum", () => {
    it("has 31 1/3-octave bands from 20 Hz to 20 kHz", () => {
        const bands = AudioMetrics.spectrum([sine(1000, -20, 1.0)], SR)
        expect(bands.length).toBe(31)
        expect(bands[0].centerHz).toBe(20)
        expect(bands[30].centerHz).toBe(20000)
        expect(bands[0].lowHz).toBeCloseTo(17.54, 1)
        bands.forEach(band => expect(Number.isFinite(band.db)).toBe(true))
    })
    it("puts a 30 Hz sine into the 25/31.5 Hz bands and preserves its power", () => {
        const bands = AudioMetrics.spectrum([sine(30, -6.0, 10.0)], SR)
        expect([25, 31.5]).toContain(loudest(bands).centerHz)
        expect(bandAt(bands, 31.5).db).toBeGreaterThan(-12.0)
        expect(bandAt(bands, 25).db).toBeGreaterThan(-20.0)
        expect(Math.abs(powerSum(bands) + 6.0)).toBeLessThan(0.1)
        expect(bandAt(bands, 1000).db).toBeLessThan(-100.0)
    })
    it("reads a -10 dBFS 5 kHz sine as -10 dB in the 5 kHz band", () => {
        const bands = AudioMetrics.spectrum([sine(5000, -10.0, 5.0)], SR)
        expect(loudest(bands).centerHz).toBe(5000)
        expect(Math.abs(bandAt(bands, 5000).db + 10.0)).toBeLessThan(0.1)
        expect(bandAt(bands, 4000).db).toBeLessThan(-60.0)
    })
    it("measures mid = (L + R) / 2", () => {
        const tone = sine(1000, -6.0, 2.0)
        const hardLeft = AudioMetrics.spectrum([tone, new Float32Array(tone.length)], SR)
        expect(Math.abs(bandAt(hardLeft, 1000).db + 12.0)).toBeLessThan(0.1)
        const mono = AudioMetrics.spectrum([tone], SR)
        expect(Math.abs(bandAt(mono, 1000).db + 6.0)).toBeLessThan(0.1)
    })
    it("is stable for a stationary signal (halves agree within 1 dB)", () => {
        const noise = white(20.0, 7)
        const first = AudioMetrics.spectrum([noise.subarray(0, noise.length / 2)], SR)
        const second = AudioMetrics.spectrum([noise.subarray(noise.length / 2)], SR)
        first.forEach((band, index) => expect(Math.abs(band.db - second[index].db)).toBeLessThan(1.0))
    })
    it("reads pink noise flat per 1/3 octave (±2 dB)", () => {
        const sampleRate = 44100
        const bands = AudioMetrics.spectrum([pink(30.0, 3, sampleRate)], sampleRate)
            .filter(band => band.centerHz >= 25 && band.centerHz <= 16000)
        const mean = bands.reduce((sum, band) => sum + band.db, 0.0) / bands.length
        bands.forEach(band => expect(Math.abs(band.db - mean), `${band.centerHz} Hz`).toBeLessThan(2.0))
    })
    it("reads silence as the finite floor", () => {
        AudioMetrics.spectrum([new Float32Array(SR)], SR).forEach(band => expect(band.db).toBe(SILENCE_DB))
        AudioMetrics.spectrum([], SR).forEach(band => expect(band.db).toBe(SILENCE_DB))
    })
    it("handles input shorter than the FFT", () => {
        const bands = AudioMetrics.spectrum([sine(1000, -6.0, 0.05)], SR)
        expect(loudest(bands).centerHz).toBe(1000)
        expect(Math.abs(powerSum(bands) + 6.0)).toBeLessThan(0.5)
    })
})

describe("AudioMetrics.stereoBands", () => {
    const noise = white(5.0, 11)
    const at = (bands: ReadonlyArray<AudioMetrics.StereoBand>, centerHz: number) => {
        const band = bands.find(entry => entry.centerHz === centerHz)
        if (band === undefined) {throw new Error(`no band ${centerHz}`)}
        return band
    }
    it("identical channels correlate at 1 with minimal width", () => {
        const bands = AudioMetrics.stereoBands([noise, noise.slice()], SR)
        expect(bands.length).toBe(10)
        bands.forEach(band => {
            expect(band.correlation).toBeGreaterThan(0.999)
            expect(band.widthDb).toBeLessThan(-60.0)
        })
    })
    it("mono input correlates at 1", () => {
        AudioMetrics.stereoBands([noise], SR).forEach(band => expect(band.correlation).toBeGreaterThan(0.999))
    })
    it("inverted channels correlate at -1 with side dominating", () => {
        const bands = AudioMetrics.stereoBands([noise, noise.map(value => -value)], SR)
        bands.forEach(band => {
            expect(band.correlation).toBeLessThan(-0.999)
            expect(band.widthDb).toBeGreaterThan(60.0)
        })
    })
    it("hard-panned signal has correlation 0 and equal mid and side", () => {
        const bands = AudioMetrics.stereoBands([noise, new Float32Array(noise.length)], SR)
        bands.forEach(band => {
            expect(Math.abs(band.correlation)).toBeLessThan(0.01)
            expect(Math.abs(band.widthDb)).toBeLessThan(0.1)
        })
    })
    it("independent noise is uncorrelated; a wide band is reported per octave", () => {
        const other = white(5.0, 12)
        AudioMetrics.stereoBands([noise, other], SR).forEach(band => expect(Math.abs(band.correlation)).toBeLessThan(0.15))
        const lowOnly = sine(100, -12.0, 5.0)
        const wideHigh = white(5.0, 13, 0.1)
        const left = add(add(new Float32Array(noise.length), lowOnly), wideHigh)
        const right = add(new Float32Array(noise.length), lowOnly)
        const bands = AudioMetrics.stereoBands([left, right], SR)
        expect(at(bands, 125).correlation).toBeGreaterThan(0.95)
        expect(at(bands, 8000).correlation).toBeLessThan(0.05)
    })
    it("silent bands are finite", () => {
        AudioMetrics.stereoBands([new Float32Array(SR), new Float32Array(SR)], SR).forEach(band => {
            expect(band.correlation).toBe(1.0)
            expect(band.widthDb).toBe(SILENCE_DB)
            expect(band.db).toBe(SILENCE_DB)
        })
    })
})

describe("AudioMetrics.onsets / timing", () => {
    const secondsPerStep = 60.0 / 120.0 / 4.0
    const pattern = (swing: number, steps: number = 64): {signal: Float32Array, truth: ReadonlyArray<number>} => {
        const signal = white((steps + 1) * secondsPerStep, 5, 0.003)
        const truth: Array<number> = []
        for (let step = 0; step < steps; step++) {
            const seconds = step * secondsPerStep + (step % 2 === 1 ? (swing - 0.5) * 2.0 * secondsPerStep : 0.0)
            add(signal, click(), Math.round(seconds * SR))
            truth.push(Math.round(seconds * SR) / SR)
        }
        return {signal, truth}
    }
    it("detects 16th clicks at 120 BPM within 1 ms and reports near-zero deviation", () => {
        const {signal, truth} = pattern(0.5)
        const onsets = AudioMetrics.onsets([signal, signal], SR)
        expect(onsets.length).toBe(truth.length)
        onsets.forEach((seconds, index) => expect(Math.abs(seconds - truth[index])).toBeLessThan(0.001))
        const timing = AudioMetrics.timing(onsets, secondsPerStep)
        expect(timing.count).toBe(64)
        expect(timing.meanAbsDeviationMs).toBeLessThan(1.0)
        expect(timing.maxDeviationMs).toBeLessThan(1.0)
        expect(timing.fractionOnGrid).toBe(1.0)
        expect(timing.swingEstimate).toBeDefined()
        expect(Math.abs((timing.swingEstimate ?? 0.0) - 0.5)).toBeLessThan(0.01)
    })
    it("estimates swing", () => {
        const {signal} = pattern(0.62)
        const timing = AudioMetrics.timing(AudioMetrics.onsets([signal], SR), secondsPerStep)
        expect(Math.abs((timing.swingEstimate ?? 0.0) - 0.62)).toBeLessThan(0.02)
        expect(timing.fractionOnGrid).toBeCloseTo(0.5, 1)
    })
    it("detects kicks under 16th hats", () => {
        const signal = white(4.5, 9, 0.002)
        for (let step = 0; step < 32; step++) {
            const at = Math.round(step * secondsPerStep * SR)
            add(signal, click(0.02).map(value => value * 0.3), at)
            if (step % 4 === 0) {add(signal, kickHit(), at)}
        }
        const timing = AudioMetrics.timing(AudioMetrics.onsets([signal], SR), secondsPerStep)
        expect(timing.count).toBe(32)
        expect(timing.maxDeviationMs).toBeLessThan(2.0)
    })
    it("reports late playing and offsets", () => {
        const timing = AudioMetrics.timing([0.015, 0.14, 0.265, 0.39], secondsPerStep)
        expect(timing.meanDeviationMs).toBeCloseTo(15.0, 5)
        expect(timing.fractionOnGrid).toBe(0.0)
        expect(AudioMetrics.timing([0.015, 0.14, 0.265, 0.39], secondsPerStep, 0.015).maxDeviationMs).toBeCloseTo(0.0, 5)
    })
    it("is finite on silence and empty input", () => {
        expect(AudioMetrics.onsets([new Float32Array(SR)], SR)).toEqual([])
        const timing = AudioMetrics.timing([], secondsPerStep)
        expect(timing.count).toBe(0)
        expect(timing.swingEstimate).toBeUndefined()
    })
})

describe("AudioMetrics.masking", () => {
    const seconds = 4.0
    const kick = new Float32Array(seconds * SR)
    for (let beat = 0; beat < 8; beat++) {add(kick, kickHit(0.4), Math.round(beat * 0.5 * SR))}
    const bass = add(sine(55, -10.0, seconds), sine(110, -22.0, seconds))
    const hat = new Float32Array(seconds * SR)
    const noise = white(seconds, 21, 0.3)
    for (let i = 2; i < hat.length; i++) {hat[i] = noise[i] - 2.0 * noise[i - 1] + noise[i - 2]}
    const kickBands = AudioMetrics.spectrum([kick], SR)
    const bassBands = AudioMetrics.spectrum([bass], SR)
    const hatBands = AudioMetrics.spectrum([hat], SR)
    it("kick and bass overlap strongly", () => {
        const result = AudioMetrics.masking(kickBands, bassBands)
        expect(result.score).toBeGreaterThan(0.5)
        expect(result.bands.find(band => band.centerHz === 50)?.score ?? 0.0).toBeGreaterThan(0.5)
    })
    it("bass and hi-hat barely overlap", () => {
        const result = AudioMetrics.masking(bassBands, hatBands)
        expect(result.score).toBeLessThan(0.1)
        result.bands.forEach(band => expect(Number.isFinite(band.overlapDb)).toBe(true))
    })
    it("a source fully masks itself", () => {
        expect(AudioMetrics.masking(bassBands, bassBands).score).toBeCloseTo(1.0, 5)
    })
})

describe("AudioMetrics.noteSpans", () => {
    it("ends a note at its release or at the next onset", () => {
        // 0.2 s tone, 0.3 s silence, then a 0.5 s tone that runs into a third onset at 0.8 s
        const signal = new Float32Array(SR)
        signal.set(sine(220, -6.0, 0.2), 0)
        signal.set(sine(220, -6.0, 0.5), Math.round(0.5 * SR))
        const spans = AudioMetrics.noteSpans([signal], SR, [0.0, 0.5, 0.8])
        expect(spans).toHaveLength(3)
        expect(spans[0].startFrame).toBe(0)
        expect(spans[0].endFrame / SR).toBeCloseTo(0.2, 2)
        expect(spans[1].endFrame).toBe(Math.round(0.8 * SR))
        expect(spans[2].endFrame).toBe(SR)
    })
    it("returns nothing without onsets", () => {
        expect(AudioMetrics.noteSpans([sine(220, -6.0, 0.5)], SR, [])).toEqual([])
    })
})

describe("AudioMetrics.loudnessPerSegment", () => {
    it("measures two halves at different levels", () => {
        const signal = new Float32Array(10 * SR)
        signal.set(sine(997, -20.0, 5.0), 0)
        signal.set(sine(997, -30.0, 5.0), 5 * SR)
        const segments = AudioMetrics.loudnessPerSegment([signal, signal], SR, [5 * SR, 0, 5 * SR])
        expect(segments.length).toBe(2)
        expect(segments[0].startFrame).toBe(0)
        expect(segments[0].endFrame).toBe(5 * SR)
        expect(segments[1].endFrame).toBe(10 * SR)
        expect(Math.abs(segments[0].lufs + 20.0)).toBeLessThan(0.1)
        expect(Math.abs(segments[1].lufs + 30.0)).toBeLessThan(0.1)
        expect(segments[0].peakDbfs).toBeCloseTo(-20.0, 2)
        expect(segments[1].peakDbfs).toBeCloseTo(-30.0, 2)
        expect(segments[1].silent).toBe(false)
    })
    it("flags silent segments with a finite floor", () => {
        const segments = AudioMetrics.loudnessPerSegment([new Float32Array(SR)], SR, [0, SR / 2])
        segments.forEach(segment => {
            expect(segment.silent).toBe(true)
            expect(segment.lufs).toBe(SILENCE_DB)
        })
    })
})

describe("AudioMetrics.analyse", () => {
    it("handles 60 s of stereo 48 kHz in about half a second", () => {
        const seconds = 60.0
        const left = add(pink(seconds, 31, SR), sine(55, -12.0, seconds))
        const right = add(pink(seconds, 32, SR), sine(55, -12.0, seconds))
        for (let beat = 0; beat < 120; beat++) {
            add(left, kickHit(), Math.round(beat * 0.5 * SR))
            add(right, kickHit(), Math.round(beat * 0.5 * SR))
        }
        const channels = [left, right]
        AudioMetrics.analyse([left.subarray(0, SR), right.subarray(0, SR)], SR)
        const start = performance.now()
        const result = AudioMetrics.analyse(channels, SR)
        const bars = AudioMetrics.loudnessPerSegment(channels, SR, Array.from({length: 30}, (entry, bar) => bar * 2 * SR))
        const elapsed = performance.now() - start
        console.info(`analyse + 30 segments on 60 s stereo 48 kHz: ${elapsed.toFixed(0)} ms`)
        expect(elapsed).toBeLessThan(1500) // ~0.4-0.7 s measured; headroom for loaded CI machines
        expect(result.onsets.length).toBeGreaterThanOrEqual(115)
        expect(bars.length).toBe(30)
        expect(result.loudness.silent).toBe(false)
    })
})
