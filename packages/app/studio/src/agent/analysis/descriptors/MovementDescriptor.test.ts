import {describe, expect, it} from "vitest"
import {BiquadCoeff, BiquadMono} from "@opendaw/lib-dsp"
import type {JsonObject} from "@opendaw/studio-codex"
import type {SoundNote, SoundTarget} from "../SoundTarget"
import {MovementDescriptor} from "./MovementDescriptor"
import {ModulationRate} from "./dsp/ModulationRate"

const sampleRate = 48_000

const target = (channels: ReadonlyArray<Float32Array>, overrides: Partial<SoundTarget> = {}): SoundTarget => ({
    label: "test", channels, sampleRate, notes: [], bpm: 120, stepSeconds: 0.125, focused: false, offsetSeconds: 0,
    loudness: undefined, ...overrides
})

const describeObject = (soundTarget: SoundTarget): JsonObject => MovementDescriptor.describe(soundTarget) as JsonObject

// sine whose level in dB follows depthDb * sin(2 pi rateHz t), i.e. peak-to-peak 2 * depthDb
const tremolo = (seconds: number, rateHz: number, depthDb: number): Float32Array =>
    Float32Array.from({length: seconds * sampleRate}, (_value, index) => {
        const time = index / sampleRate
        return 0.3 * 10 ** (depthDb * Math.sin(2 * Math.PI * rateHz * time) / 20) * Math.sin(2 * Math.PI * 440 * time)
    })

// 55 Hz saw through a lowpass whose cutoff (Hz) follows cutoffAt(time)
const filteredSaw = (seconds: number, cutoffAt: (time: number) => number): Float32Array => {
    const saw = Float32Array.from({length: seconds * sampleRate}, (_value, index) => 0.5 * (((index * 55 / sampleRate) % 1) * 2 - 1))
    const out = new Float32Array(saw.length)
    const coeff = new BiquadCoeff(), filter = new BiquadMono()
    for (let from = 0; from < saw.length; from += 32) {
        coeff.setLowpassParams(cutoffAt(from / sampleRate) / sampleRate, 2)
        filter.process(coeff, saw, out, from, Math.min(saw.length, from + 32))
    }
    return out
}

describe("MovementDescriptor", () => {
    it("measures a 4 Hz tremolo of 12 dB peak-to-peak and syncs it to 1/8 at 120 bpm", () => {
        const result = describeObject(target([tremolo(4, 4, 6)]))
        const ampMod = result.ampMod as JsonObject
        expect(ampMod.rateHz as number).toBeCloseTo(4, 1)
        expect(ampMod.sync).toBe("1/8")
        expect(ampMod.depthDb as number).toBeGreaterThan(11)
        expect(ampMod.depthDb as number).toBeLessThan(13)
        expect((result.brightMod as JsonObject).shape).toBe("static")
    })
    it("finds a 2 Hz filter wobble in the centroid", () => {
        const wobble = filteredSaw(4, time => 300 * 2 ** (2.5 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * time))))
        const brightMod = describeObject(target([wobble])).brightMod as JsonObject
        expect(brightMod.shape).toBe("periodic")
        expect(brightMod.rateHz as number).toBeCloseTo(2, 1)
        expect(brightMod.sync).toBe("1/4")
        expect(brightMod.depthOct as number).toBeGreaterThan(0.5)
    })
    it("reads a rising filter as a sweep up, not periodic", () => {
        const sweep = filteredSaw(3, time => 200 * 2 ** (5 * time / 3))
        const result = describeObject(target([sweep]))
        const brightMod = result.brightMod as JsonObject
        expect(brightMod.shape).toBe("sweep up")
        expect(brightMod.sweepOct as number).toBeGreaterThan(1)
        expect(brightMod.rateHz).toBeUndefined()
        const brightness = result.brightnessHz as JsonObject
        expect(brightness.end as number).toBeGreaterThan(brightness.start as number)
    })
    it("reports a steady tone as static without modulation", () => {
        const tone = Float32Array.from({length: 2 * sampleRate}, (_value, index) => 0.5 * Math.sin(2 * Math.PI * 220 * index / sampleRate))
        const result = describeObject(target([tone]))
        expect(result.ampMod).toBe("none")
        expect((result.brightMod as JsonObject).shape).toBe("static")
        expect(result.fluxMean as number).toBeLessThan(0.02)
    })
    it("does not mistake the pitch period of a low saw for modulation", () => {
        for (const hz of [41, 55]) {
            const saw = Float32Array.from({length: 4 * sampleRate}, (_value, index) => 0.5 * (((index * hz / sampleRate) % 1) * 2 - 1))
            const result = describeObject(target([saw]))
            expect(result.ampMod).toBe("none")
            expect((result.brightMod as JsonObject).shape).toBe("static")
        }
    })
    it("compensates the envelope smoothing at faster rates", () => {
        const ampMod = describeObject(target([tremolo(4, 12, 6)])).ampMod as JsonObject
        expect(ampMod.rateHz as number).toBeCloseTo(12, 1)
        expect(ampMod.sync).toBe("1/16T")
        expect(ampMod.depthDb as number).toBeGreaterThan(10.5)
        expect(ampMod.depthDb as number).toBeLessThan(14.5)
    })
    it("analyses per note and adds a curve when focused", () => {
        const signal = tremolo(3, 4, 6)
        const notes: ReadonlyArray<SoundNote> = [
            {index: 1, startFrame: 0, endFrame: sampleRate, offFrame: sampleRate, pitch: 69},
            {index: 2, startFrame: 1.5 * sampleRate, endFrame: 3 * sampleRate, offFrame: 3 * sampleRate, pitch: 69}]
        const result = describeObject(target([signal], {notes, focused: true}))
        expect(result.scope).toBe("notes")
        const perNote = result.perNote as {columns: Array<string>, rows: Array<Array<unknown>>}
        expect(perNote.rows.length).toBe(2)
        expect(perNote.rows[1][perNote.columns.indexOf("ampSync")]).toBe("1/8")
        expect((result.brightnessCurveHz as ReadonlyArray<unknown>).length).toBe(16)
    })
    it("returns small objects for silence and too-short audio", () => {
        expect(MovementDescriptor.describe(target([new Float32Array(sampleRate)]))).toEqual({silent: true})
        expect(MovementDescriptor.describe(target([new Float32Array(500)]))).toEqual({tooShort: true})
    })
    it("labels tempo-synced rates", () => {
        expect(ModulationRate.tempoSync(4, 120)).toBe("1/8")
        expect(ModulationRate.tempoSync(6, 120)).toBe("1/8T")
        expect(ModulationRate.tempoSync(4 / 3, 120)).toBe("1/4.")
        expect(ModulationRate.tempoSync(0.5, 120)).toBe("1/1")
        expect(ModulationRate.tempoSync(4.5, 120)).toBeUndefined()
    })
})
