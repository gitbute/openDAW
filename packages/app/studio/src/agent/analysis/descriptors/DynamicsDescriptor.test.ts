import {describe, expect, it} from "vitest"
import type {JsonObject} from "@opendaw/studio-codex"
import type {SoundTarget} from "../SoundTarget"
import {DynamicsDescriptor} from "./DynamicsDescriptor"

const sampleRate = 48_000

const target = (channels: ReadonlyArray<Float32Array>, overrides: Partial<SoundTarget> = {}): SoundTarget => ({
    label: "test", channels, sampleRate, notes: [], bpm: 120, stepSeconds: 0.125, focused: false, offsetSeconds: 0,
    loudness: undefined, ...overrides
})

const describeObject = (soundTarget: SoundTarget): JsonObject => DynamicsDescriptor.describe(soundTarget) as JsonObject

const sine = (seconds: number, hz: number, peak: number, offset: number = 0): Float32Array =>
    Float32Array.from({length: seconds * sampleRate}, (_value, index) => peak * Math.sin(2 * Math.PI * hz * index / sampleRate) + offset)

describe("DynamicsDescriptor", () => {
    it("measures PLR and PSR of a steady sine at -12 dBFS", () => {
        // mono counts as one channel: a 997 Hz sine reads LUFS = peak dBFS - 3.01, so PLR = PSR = 3.0
        const result = describeObject(target([sine(5, 997, 10 ** (-12 / 20))]))
        expect(result.plrDb as number).toBeCloseTo(3.0, 0)
        expect(result.psrDb as number).toBeCloseTo(3.0, 0)
        expect((result.rms300msDb as JsonObject).p50 as number).toBeCloseTo(-15, 0)
        expect(result.spreadDb as number).toBeLessThan(0.5)
        expect(result.nearPeakShare).toBe(1)
        expect(result.clippedSamples).toBe(0)
        expect(result.longestPeakRun).toBeUndefined()
    })
    it("detects clipping and flat tops of a hard-clipped sine", () => {
        const clipped = sine(2, 100, 2).map(value => Math.max(-1, Math.min(1, value)))
        const result = describeObject(target([clipped, clipped]))
        expect(result.clippedSamples as number).toBeGreaterThan(100_000)
        // |2 sin| >= 1 for 2/3 of each 240-sample half cycle
        expect(result.longestClipRun as number).toBeGreaterThan(150)
        expect(result.longestPeakRun as number).toBeGreaterThan(150)
    })
    it("reports DC offset", () => {
        expect(describeObject(target([sine(2, 440, 0.5, 0.01)])).dcOffsetDb as number).toBeCloseTo(-40, 0)
    })
    it("tells dense from sparse material", () => {
        const dense = describeObject(target([sine(6, 220, 0.5)]))
        const hits = Float32Array.from({length: 6 * sampleRate}, (_value, index) =>
            0.8 * Math.exp(-(index % (2 * sampleRate)) / (sampleRate * 0.3)) * Math.sin(2 * Math.PI * 220 * index / sampleRate))
        const sparse = describeObject(target([hits], {focused: true}))
        expect(dense.nearPeakShare as number).toBeGreaterThan(0.95)
        expect(sparse.nearPeakShare as number).toBeLessThan(0.2)
        expect(sparse.spreadDb as number).toBeGreaterThan(10)
        expect(sparse.rms300msDbCurve).toHaveLength(16)
    })
    it("returns small objects for silence and too-short audio", () => {
        expect(DynamicsDescriptor.describe(target([new Float32Array(sampleRate)]))).toEqual({silent: true})
        expect(DynamicsDescriptor.describe(target([new Float32Array(100)]))).toEqual({tooShort: true})
    })
})
