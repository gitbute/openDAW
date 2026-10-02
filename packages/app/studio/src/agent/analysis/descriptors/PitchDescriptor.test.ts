import {describe, expect, it} from "vitest"
import {analysePitch, detectVibrato, harmonicLock, PitchDescriptor} from "./PitchDescriptor"
import {TestSignals} from "./test/TestSignals"

const {tone, noise, shape, single, target, note, SampleRate} = TestSignals

const pitchOf = (signal: Float32Array, pitch?: number) =>
    analysePitch(single(signal, undefined, pitch), note(1, 0.0, signal.length / SampleRate, undefined, pitch))!

describe("PitchDescriptor", () => {
    it("finds a 110 Hz sine as A1 (C3 = MIDI 60)", () => {
        const result = pitchOf(tone("sine", 110, 0.5))
        expect(result.pitched).toBe(true)
        expect(result.hz).toBeCloseTo(110, 1)
        expect(Math.abs(result.centsOff)).toBeLessThan(2)
        expect(result.stabilityCents).toBeLessThan(2)
        expect(Math.abs(result.glideCents)).toBeLessThan(5)
        expect(result.vibrato).toBeNull()
        const json = PitchDescriptor.describe(single(tone("sine", 110, 0.5), undefined, 45)) as Record<string, unknown>
        expect(json.range).toBe("A2/45")
        expect(json.hz).toBeCloseTo(110, 0)
    })
    it("measures +30 cents of detune, also against the requested pitch", () => {
        const result = pitchOf(tone("saw", 220 * Math.pow(2, 30 / 1200), 0.4), 57)
        expect(result.centsOff).toBeGreaterThan(27)
        expect(result.centsOff).toBeLessThan(33)
        expect(result.vsRequestedCents!).toBeGreaterThan(27)
        expect(result.vsRequestedCents!).toBeLessThan(33)
    })
    it("tracks low bass (60 Hz, 35 Hz) and high leads (1500 Hz)", () => {
        expect(pitchOf(tone("sine", 60, 0.5)).hz).toBeCloseTo(60, 1)
        const sub = pitchOf(tone("sine", 35, 0.6))
        expect(Math.abs(1200 * Math.log2(sub.hz / 35))).toBeLessThan(5)
        const saw = pitchOf(tone("saw", 41.2, 0.5))
        expect(Math.abs(1200 * Math.log2(saw.hz / 41.2))).toBeLessThan(5)
        const lead = pitchOf(tone("saw", 1500, 0.3))
        expect(Math.abs(1200 * Math.log2(lead.hz / 1500))).toBeLessThan(5)
    })
    it("reports noise as unpitched", () => {
        const result = pitchOf(noise(0.4))
        expect(result.pitched).toBe(false)
        const json = PitchDescriptor.describe(single(noise(0.4))) as Record<string, unknown>
        expect(json.unpitched).toBe(1)
        expect(json.hz).toBeUndefined()
        expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity/)
    })
    it("detects 5 Hz vibrato of +-20 cents", () => {
        const result = pitchOf(tone("sine", 220, 1.5, 0.5, time => 20 * Math.sin(2 * Math.PI * 5 * time)))
        expect(result.vibrato).not.toBeNull()
        expect(result.vibrato!.hz).toBeGreaterThan(4.5)
        expect(result.vibrato!.hz).toBeLessThan(5.5)
        expect(result.vibrato!.cents).toBeGreaterThan(15)
        expect(result.vibrato!.cents).toBeLessThan(25)
        expect(detectVibrato(Array.from({length: 50}, () => 0), 0.01)).toBeNull()
    })
    it("measures vibrato on long notes (saw 220 Hz, +-40 cents)", () => {
        for (const seconds of [1.5, 3, 6]) {
            for (const rate of [5.5, 7]) {
                const result = pitchOf(tone("saw", 220, seconds, 0.4, time => 40 * Math.sin(2 * Math.PI * rate * time)), 57)
                expect(result.vibrato, `${seconds} s at ${rate} Hz`).not.toBeNull()
                expect(Math.abs(result.vibrato!.hz - rate), `${seconds} s at ${rate} Hz`).toBeLessThan(0.3)
                expect(result.vibrato!.cents, `${seconds} s at ${rate} Hz`).toBeGreaterThan(32)
                expect(result.vibrato!.cents, `${seconds} s at ${rate} Hz`).toBeLessThan(48)
                expect(Math.abs(result.vsRequestedCents!)).toBeLessThan(5)
            }
        }
    })
    it("measures a glide up into the note", () => {
        const result = pitchOf(tone("sine", 110, 0.5, 0.5, time => time < 0.08 ? -300 * (1 - time / 0.08) : 0))
        expect(Math.abs(result.centsOff)).toBeLessThan(3)
        expect(result.glideCents).toBeLessThan(-80)
    })
    it("does not report an octave error at the onset as a glide", () => {
        const signal = tone("sine", 65.4, 0.5)
        const octaveUp = tone("sine", 130.8, 0.025)
        signal.set(octaveUp, 0)
        expect(Math.abs(pitchOf(signal).glideCents)).toBeLessThan(80)
    })
    it("corrects a lock onto a harmonic when the fundamental is weak and the played pitch is known", () => {
        const length = Math.round(0.5 * SampleRate)
        const signal = new Float32Array(length)
        const f0 = 87.31
        for (let index = 0; index < length; index++) {
            const time = index / SampleRate
            for (let harmonic = 1; harmonic <= 12; harmonic++) {
                const formant = harmonic === 1 ? 0.01 : Math.exp(-Math.pow((harmonic - 5) / 0.8, 2))
                signal[index] += 0.5 * formant * Math.sin(2 * Math.PI * harmonic * f0 * time)
            }
        }
        const result = pitchOf(signal, 41)
        expect(result.harmonic === 1 || result.harmonic === 5).toBe(true)
        expect(Math.abs(result.vsRequestedCents ?? 9999)).toBeLessThan(30)
        expect(harmonicLock(41 + 12 * Math.log2(5), 41)).toBe(5)
        expect(harmonicLock(41 + 12 * Math.log2(3.02), 41)).toBe(3)
        expect(harmonicLock(53, 41), "an octave up may be real").toBe(1)
        expect(harmonicLock(41 + 12 * Math.log2(5.3), 41)).toBe(1)
        expect(harmonicLock(60, undefined)).toBe(1)
    })
    it("summarises a bassline and lists notes only when focused", () => {
        const pitches = [33, 36, 40, 45]
        const signal = new Float32Array(SampleRate * 2)
        const notes = pitches.map((pitch, index) => note(index + 1, index * 0.5, index * 0.5 + 0.5, index * 0.5 + 0.4, pitch))
        notes.forEach(({startFrame, pitch}) => signal.set(shape(tone("saw", 440 * Math.pow(2, (pitch! - 69) / 12), 0.5), time => time < 0.4 ? 1 : 0), startFrame))
        const compact = PitchDescriptor.describe(target([signal, signal], notes, false)) as Record<string, unknown>
        expect(compact.count).toBe(4)
        expect(compact.range).toBe("A1/33..A2/45")
        expect(compact.perNote).toBeUndefined()
        const focused = PitchDescriptor.describe(target([signal, signal], notes, true)) as Record<string, unknown>
        const table = focused.perNote as {columns: Array<string>, rows: Array<Array<unknown>>}
        expect(table.rows.length).toBe(4)
        expect(table.rows[0][table.columns.indexOf("name")]).toBe("A1/33")
        console.log(JSON.stringify(compact))
    })
    it("never throws on silence or empty input", () => {
        expect(PitchDescriptor.describe(single(new Float32Array(SampleRate)))).toEqual({count: 0})
        expect(PitchDescriptor.describe(target([new Float32Array(100)], [note(1, 0, 0.001)]))).toEqual({count: 0})
    })
    it("stays fast on 10 s of stereo with 32 notes", () => {
        const bassline = TestSignals.bassline(10, 32)
        PitchDescriptor.describe(bassline)
        const start = performance.now()
        const json = PitchDescriptor.describe(bassline)
        expect(performance.now() - start).toBeLessThan(500)
        expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity/)
    })
})
