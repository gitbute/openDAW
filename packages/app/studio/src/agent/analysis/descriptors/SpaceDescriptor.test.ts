import {describe, expect, it} from "vitest"
import {BiquadCoeff, BiquadMono} from "@opendaw/lib-dsp"
import type {JsonObject} from "@opendaw/studio-codex"
import type {SoundNote, SoundTarget} from "../SoundTarget"
import {SpaceDescriptor} from "./SpaceDescriptor"

const sampleRate = 48_000

const target = (channels: ReadonlyArray<Float32Array>, overrides: Partial<SoundTarget> = {}): SoundTarget => ({
    label: "test", channels, sampleRate, notes: [], bpm: 120, stepSeconds: 0.125, focused: false, offsetSeconds: 0,
    loudness: undefined, ...overrides
})

const describeObject = (soundTarget: SoundTarget): JsonObject => SpaceDescriptor.describe(soundTarget) as JsonObject

const noise = (seconds: number, seed: number): Float32Array => {
    let state = seed
    return Float32Array.from({length: Math.round(seconds * sampleRate)}, () => {
        state = (state * 1664525 + 1013904223) >>> 0
        return (state / 4294967296 - 0.5) * 0.5
    })
}

// white noise whose level falls 60 dB in rt60Seconds after holdSeconds
const decayingNoise = (seconds: number, holdSeconds: number, rt60Seconds: number, seed: number): Float32Array =>
    noise(seconds, seed).map((value, index) => {
        const time = index / sampleRate - holdSeconds
        return time <= 0 ? value : value * 10 ** (-3 * time / rt60Seconds)
    })

describe("SpaceDescriptor", () => {
    it("reads decorrelated noise as wide with correlation near 0", () => {
        const result = describeObject(target([noise(3, 1), noise(3, 2)]))
        expect(Math.abs(result.correlation as number)).toBeLessThan(0.1)
        const bands = result.bands as JsonObject
        for (const name of ["low", "mid", "high"]) {
            const band = bands[name] as JsonObject
            expect(Math.abs(band.correlation as number)).toBeLessThan(0.15)
            expect(Math.abs(band.sideDb as number)).toBeLessThan(1.5)
            expect(band.monoDb as number).toBeCloseTo(-3, 0)
        }
        expect(result.width).toBe("stable")
    })
    it("reports identical channels and single-channel input as mono", () => {
        const signal = noise(1, 3)
        expect(describeObject(target([signal, signal])).mono).toBe(true)
        expect(describeObject(target([signal])).mono).toBe(true)
    })
    it("separates a mono low end from a wide top", () => {
        const sub = Float32Array.from({length: 3 * sampleRate}, (_value, index) => 0.5 * Math.sin(2 * Math.PI * 60 * index / sampleRate))
        const highpass = (signal: Float32Array): Float32Array => {
            const out = new Float32Array(signal.length)
            new BiquadMono().process(new BiquadCoeff().setHighpassParams(6000 / sampleRate), signal, out, 0, signal.length)
            return out
        }
        const left = highpass(noise(3, 4)).map((value, index) => value + sub[index])
        const right = highpass(noise(3, 5)).map((value, index) => value + sub[index])
        const bands = describeObject(target([left, right])).bands as JsonObject
        expect((bands.low as JsonObject).correlation as number).toBeGreaterThan(0.95)
        expect((bands.low as JsonObject).monoDb as number).toBeGreaterThan(-0.5)
        expect(Math.abs((bands.high as JsonObject).correlation as number)).toBeLessThan(0.15)
    })
    it("notices width that changes over time", () => {
        const mono = noise(4, 6), other = noise(4, 7)
        const right = mono.map((value, index) => Math.floor(index / sampleRate) % 2 === 0 ? value : other[index])
        const result = describeObject(target([mono, right], {focused: true}))
        expect(result.width).toBe("moving")
        expect(result.sideDbRange as number).toBeGreaterThan(10)
        expect((result.sideDbCurve as ReadonlyArray<unknown>).length).toBe(16)
    })
    it("estimates the decay of an exponentially decaying burst (RT60 1.2 s)", () => {
        const left = decayingNoise(3, 0.05, 1.2, 8), right = decayingNoise(3, 0.05, 1.2, 9)
        const decay = describeObject(target([left, right])).decaySeconds as number
        expect(decay).toBeGreaterThan(1.2 * 0.85)
        expect(decay).toBeLessThan(1.2 * 1.15)
    })
    it("measures tails from note-offs", () => {
        const signal = decayingNoise(3.5, 1, 0.6, 10)
        const notes: ReadonlyArray<SoundNote> = [{index: 1, startFrame: 0, endFrame: 3.5 * sampleRate, offFrame: sampleRate, pitch: 60}]
        const result = describeObject(target([signal], {notes, focused: true}))
        expect(result.mono).toBe(true)
        expect(result.tailsFrom).toBe("note-offs")
        expect(result.decaySeconds as number).toBeGreaterThan(0.6 * 0.85)
        expect(result.decaySeconds as number).toBeLessThan(0.6 * 1.15)
        expect((result.perNote as JsonObject).rows).toHaveLength(1)
    })
    it("returns small objects for silence and too-short audio", () => {
        expect(SpaceDescriptor.describe(target([new Float32Array(sampleRate), new Float32Array(sampleRate)]))).toEqual({silent: true})
        expect(SpaceDescriptor.describe(target([new Float32Array(100)]))).toEqual({tooShort: true})
    })
})
