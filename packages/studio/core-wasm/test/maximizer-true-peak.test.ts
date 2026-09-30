// Verification: a hot, harmonically rich signal through the Maximizer at threshold -6 dB. The makeup lifts the
// signal back to the ceiling (just below 0 dBFS); with look-ahead the SAMPLE peak is hard-clamped at 0 dBFS, but
// the limiter is not oversampled, so inter-sample (true) peaks may exceed 0 dBTP.
import {describe, expect, it} from "vitest"
import {UUID} from "@opendaw/lib-std"
import {AudioMetrics, RenderQuantum} from "@opendaw/lib-dsp"
import {MaximizerDeviceBox} from "@opendaw/studio-boxes"
import {buildEffectProject, renderEffect} from "./helpers/effect-harness"

const hot = `class Processor {
    voices = []
    noteOn(pitch, velocity, cent, id) { this.voices.push({id, phase: 0, t: 0}) }
    noteOff(id) { this.voices = this.voices.filter(v => v.id !== id) }
    process(output, block) {
        const [l, r] = output
        for (const voice of this.voices) {
            for (let i = block.s0; i < block.s1; i++) {
                const beat = (voice.t % (sampleRate / 4)) / sampleRate
                const kick = Math.sin(2 * Math.PI * 55 * beat) * Math.exp(-beat * 20) * 0.6
                const saw = (voice.phase * 2 - 1) * 0.35
                const hat = Math.sin(2 * Math.PI * 11025 * voice.t / sampleRate + 0.7) * Math.exp(-((voice.t + sampleRate / 8) % (sampleRate / 4)) / sampleRate * 200) * 0.25
                const s = kick + saw + hat
                l[i] += s; r[i] += s
                voice.phase = (voice.phase + 220 / sampleRate) % 1
                voice.t++
            }
        }
    }
}`

const split = (interleaved: Float32Array): ReadonlyArray<Float32Array> => {
    const stride = RenderQuantum * 2, quanta = (interleaved.length / stride) | 0
    const left = new Float32Array(quanta * RenderQuantum), right = new Float32Array(quanta * RenderQuantum)
    for (let q = 0; q < quanta; q++) {
        left.set(interleaved.subarray(q * stride, q * stride + RenderQuantum), q * RenderQuantum)
        right.set(interleaved.subarray(q * stride + RenderQuantum, (q + 1) * stride), q * RenderQuantum)
    }
    return [left, right]
}

const measure = async (threshold: number, lookahead: boolean, enabled = true) => {
    const source = buildEffectProject(1.0, (graph, unit) => MaximizerDeviceBox.create(graph, UUID.generate(), box => {
        box.host.refer(unit.audioEffects)
        box.index.setValue(0)
        box.threshold.setValue(threshold)
        box.lookahead.setValue(lookahead)
        box.enabled.setValue(enabled)
    }), hot)
    const channels = split(await renderEffect(source, 375)).map(channel => channel.slice(4800))
    const {samplePeakDbfs, truePeakDbtp, integratedLufs} = AudioMetrics.loudness(channels, 48_000)
    return {samplePeakDbfs, truePeakDbtp, integratedLufs}
}

describe("maximizer true peak", () => {
    // Measured: bypass -0.9 dBFS / -0.1 dBTP; look-ahead -0.0 dBFS / +0.8 dBTP; no look-ahead +1.5 dBFS / +2.2 dBTP
    it("clamps the sample peak with look-ahead; true peak is not limited, no look-ahead overshoots", async () => {
        const bypass = await measure(-6.0, true, false)
        const limited = await measure(-6.0, true)
        const noLookahead = await measure(-6.0, false)
        expect(bypass.truePeakDbtp).toBeLessThan(0.0)
        expect(limited.integratedLufs).toBeGreaterThan(bypass.integratedLufs + 3.0)
        expect(limited.samplePeakDbfs).toBeLessThanOrEqual(0.0)
        expect(limited.truePeakDbtp).toBeGreaterThan(0.0)
        expect(noLookahead.samplePeakDbfs).toBeGreaterThan(0.5)
        expect(noLookahead.truePeakDbtp).toBeGreaterThan(limited.truePeakDbtp)
    }, 60000)
})
