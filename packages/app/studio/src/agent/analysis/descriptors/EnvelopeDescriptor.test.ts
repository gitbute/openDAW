import {describe, expect, it} from "vitest"
import {analyseEnvelope, EnvelopeDescriptor} from "./EnvelopeDescriptor"
import {TestSignals} from "./test/TestSignals"

const {tone, noise, shape, adsr, single, target, note, SampleRate} = TestSignals

describe("EnvelopeDescriptor", () => {
    it("measures a linear ADSR (attack 50 ms, decay 100 ms to -6 dB, release 200 ms)", () => {
        const signal = shape(tone("sine", 220, 1.0, 0.8), adsr(0.05, 0.1, 0.5, 0.5, 0.2))
        const envelope = analyseEnvelope(single(signal, 0.5, 57), TestSignals.note(1, 0.0, 1.0, 0.5, 57))
        expect(envelope).not.toBeNull()
        // 10..90% of a 50 ms linear ramp is 40 ms
        expect(envelope!.attackMs).toBeGreaterThan(35)
        expect(envelope!.attackMs).toBeLessThan(46)
        expect(envelope!.peakDbfs).toBeCloseTo(-1.9, 0)
        expect(envelope!.sustainDb!).toBeCloseTo(-6.0, 0)
        expect(envelope!.decayMs!).toBeGreaterThan(70)
        expect(envelope!.decayMs!).toBeLessThan(110)
        // a linear ramp reaches -40 dB (1%) after 198 ms
        expect(envelope!.releaseMs!).toBeGreaterThan(180)
        expect(envelope!.releaseMs!).toBeLessThan(215)
        expect(envelope!.releaseCut).toBe(false)
        expect(envelope!.gates).toBe(0)
        expect(envelope!.amDepthDb!).toBeLessThan(3)
    })
    it("measures a fast attack on a low bass (resolution is about a quarter period)", () => {
        const signal = shape(tone("sine", 41.2, 0.8, 0.8), adsr(0.002, 0.05, 0.7, 0.5, 0.05))
        const envelope = analyseEnvelope(single(signal, 0.5, 28), note(1, 0.0, 0.8, 0.5, 28))!
        expect(envelope.attackMs).toBeLessThan(9)
        expect(envelope.sustainDb!).toBeCloseTo(-3.1, 0)
        expect(envelope.transientDb!).toBeGreaterThan(0)
    })
    it("reports the tail decay rate when note-off is unknown", () => {
        const signal = shape(tone("sine", 110, 1.0), time => Math.exp(-time / 0.1))
        const envelope = analyseEnvelope(single(signal), note(1, 0.0, 1.0))!
        expect(envelope.releaseMs).toBeNull()
        // exp(-t / 0.1) falls 86.9 dB per second
        expect(envelope.tailDbPerS!).toBeGreaterThan(-95)
        expect(envelope.tailDbPerS!).toBeLessThan(-80)
        expect(envelope.attackMs).toBeLessThan(3)
    })
    it("flags a release cut short by the end of the note", () => {
        // exponential release (tau 150 ms) reaches -40 dB after 691 ms, the note ends 200 ms after note-off
        const signal = shape(tone("sine", 220, 0.6), time => time < 0.4 ? Math.min(1.0, time / 0.01) : Math.exp(-(time - 0.4) / 0.15))
        const envelope = analyseEnvelope(single(signal, 0.4, 57), note(1, 0.0, 0.6, 0.4, 57))!
        expect(envelope.releaseCut).toBe(true)
        expect(envelope.releaseMs!).toBeGreaterThan(600)
        expect(envelope.releaseMs!).toBeLessThan(800)
    })
    it("detects a gated (choppy) note", () => {
        const gate = (time: number) => Math.floor(time * 16) % 2 === 0 ? 1.0 : 0.0
        const signal = shape(tone("saw", 110, 1.0), gate)
        const envelope = analyseEnvelope(single(signal, 1.0, 45), note(1, 0.0, 1.0, 1.0, 45))!
        expect(envelope.gates).toBeGreaterThanOrEqual(6)
        const json = EnvelopeDescriptor.describe(single(signal, 1.0, 45)) as Record<string, unknown>
        expect(json.gatedNotes).toBe(1)
    })
    it("summarises many notes compactly and lists them only when focused", () => {
        const signal = new Float32Array(SampleRate * 4)
        const notes = Array.from({length: 8}, (_unused, index) => note(index + 1, index * 0.5, index * 0.5 + 0.5, index * 0.5 + 0.3, 45))
        notes.forEach(({startFrame}) => signal.set(shape(tone("saw", 110, 0.5), adsr(0.01, 0.05, 0.6, 0.3, 0.1)), startFrame))
        const compact = EnvelopeDescriptor.describe(target([signal, signal], notes, false)) as Record<string, unknown>
        expect(compact.count).toBe(8)
        expect(compact.perNote).toBeUndefined()
        expect(compact.attackMs).toBeDefined()
        expect(JSON.stringify(compact)).not.toMatch(/NaN|Infinity/)
        const focused = EnvelopeDescriptor.describe(target([signal, signal], notes, true)) as Record<string, unknown>
        const table = focused.perNote as {columns: Array<string>, rows: Array<Array<unknown>>}
        expect(table.columns[0]).toBe("note")
        expect(table.rows.map(row => row[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
        console.log(JSON.stringify(compact))
    })
    it("never throws on silence, noise or no notes", () => {
        expect(EnvelopeDescriptor.describe(single(new Float32Array(SampleRate)))).toEqual({count: 0})
        expect(EnvelopeDescriptor.describe(target([tone("sine", 100, 0.5)], []))).toEqual({count: 0})
        const hit = shape(noise(0.4), time => Math.exp(-time / 0.05))
        const json = EnvelopeDescriptor.describe(single(hit)) as Record<string, unknown>
        expect(json.count).toBe(1)
        expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity/)
        console.log(JSON.stringify(json))
    })
    it("stays fast on 10 s of stereo with 32 notes", () => {
        const bassline = TestSignals.bassline(10, 32)
        EnvelopeDescriptor.describe(bassline)
        const start = performance.now()
        const json = EnvelopeDescriptor.describe(bassline)
        expect(performance.now() - start).toBeLessThan(500)
        expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity/)
    })
})
