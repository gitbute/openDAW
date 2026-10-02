import {describe, expect, it} from "vitest"
import {BiquadCoeff, BiquadMono} from "@opendaw/lib-dsp"
import {analyseTimbre, TimbreDescriptor} from "./TimbreDescriptor"
import {TestSignals} from "./test/TestSignals"

const {tone, noise, single, target, note, SampleRate} = TestSignals

const timbreOf = (signal: Float32Array) => analyseTimbre(single(signal), note(1, 0.0, signal.length / SampleRate))!

describe("TimbreDescriptor", () => {
    it("profiles a saw: many harmonics, odd about even, H2 -6 dB, H3 -9.5 dB", () => {
        const result = timbreOf(tone("saw", 110, 0.5))
        const overtones = result.overtones!
        expect(overtones).not.toBeNull()
        expect(overtones.harmonics).toBeGreaterThan(60)
        expect(Math.abs(overtones.oddEvenDb!)).toBeLessThan(1.5)
        expect(overtones.levelsDb[0]).toBeCloseTo(0, 0)
        expect(overtones.levelsDb[1]).toBeCloseTo(-6.0, 0)
        expect(overtones.levelsDb[2]).toBeCloseTo(-9.5, 0)
        expect(overtones.inharmonicCents!).toBeLessThan(3)
        expect(overtones.hnrDb).toBeGreaterThan(30)
        expect(result.flatness).toBeLessThan(0.2)
    })
    it("profiles a square: odd harmonics dominate", () => {
        const overtones = timbreOf(tone("square", 110, 0.5)).overtones!
        expect(overtones.oddEvenDb!).toBeGreaterThan(30)
        expect(overtones.levelsDb[1]).toBeLessThan(-40)
        expect(overtones.levelsDb[2]).toBeCloseTo(-9.5, 0)
    })
    it("resolves the harmonics of a 41 Hz bass", () => {
        const overtones = timbreOf(tone("saw", 41.2, 0.6)).overtones!
        expect(overtones.levelsDb[1]).toBeCloseTo(-6.0, 0)
        expect(Math.abs(overtones.oddEvenDb!)).toBeLessThan(2)
    })
    it("puts a sine's centroid on its frequency", () => {
        const result = timbreOf(tone("sine", 1000, 0.3))
        expect(Math.abs(result.centroidHz - 1000)).toBeLessThan(30)
        expect(result.flatness).toBeLessThan(0.05)
        expect(result.overtones!.harmonics).toBe(1)
    })
    it("measures white noise as flat and unpitched", () => {
        const result = timbreOf(noise(0.5))
        expect(result.flatness).toBeGreaterThan(0.8)
        expect(result.overtones).toBeNull()
        expect(result.centroidHz).toBeGreaterThan(7000)
        expect(result.resonancesHz.length).toBeLessThanOrEqual(1)
    })
    it("finds a resonant peak", () => {
        const source = noise(0.5)
        const filtered = new Float32Array(source.length)
        new BiquadMono().process(new BiquadCoeff().setBandpassParams(1200 / SampleRate, 2), source, filtered, 0, source.length)
        const result = timbreOf(filtered)
        expect(result.resonancesHz.length).toBeGreaterThan(0)
        expect(Math.abs(result.resonancesHz[0] / 1200 - 1)).toBeLessThan(0.15)
    })
    it("finds the resonance of a filtered saw, none on a plain saw", () => {
        expect(timbreOf(tone("saw", 110, 0.5)).resonancesHz).toEqual([])
        const source = tone("saw", 110, 0.5)
        const filtered = new Float32Array(source.length)
        new BiquadMono().process(new BiquadCoeff().setLowpassParams(1500 / SampleRate, 8), source, filtered, 0, source.length)
        const result = timbreOf(filtered)
        expect(Math.abs(result.resonancesHz[0] / 1500 - 1)).toBeLessThan(0.1)
    })
    it("summarises notes and lists them only when focused", () => {
        const signal = new Float32Array(SampleRate * 2)
        const notes = [0, 1, 2, 3].map(index => note(index + 1, index * 0.5, index * 0.5 + 0.5))
        notes.forEach(({startFrame}) => signal.set(tone("saw", 110, 0.5), startFrame))
        const compact = TimbreDescriptor.describe(target([signal, signal], notes, false)) as Record<string, unknown>
        expect(compact.count).toBe(4)
        expect(compact.pitched).toBeUndefined()
        expect((compact.harmonicsDb as Array<number>).length).toBe(8)
        expect(compact.perNote).toBeUndefined()
        expect(JSON.stringify(compact)).not.toMatch(/NaN|Infinity/)
        const focused = TimbreDescriptor.describe(target([signal, signal], notes, true)) as Record<string, unknown>
        expect((focused.perNote as {rows: Array<unknown>}).rows.length).toBe(4)
        console.log(JSON.stringify(compact))
    })
    it("never throws on silence or empty input", () => {
        expect(TimbreDescriptor.describe(single(new Float32Array(SampleRate)))).toEqual({count: 0})
        expect(TimbreDescriptor.describe(target([new Float32Array(100)], []))).toEqual({count: 0})
        const json = TimbreDescriptor.describe(single(noise(0.2)))
        expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity/)
    })
    it("stays fast on 10 s of stereo with 32 notes", () => {
        const bassline = TestSignals.bassline(10, 32)
        TimbreDescriptor.describe(bassline)
        const start = performance.now()
        const json = TimbreDescriptor.describe(bassline)
        expect(performance.now() - start).toBeLessThan(500)
        expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity/)
    })
})
