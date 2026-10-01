import {describe, expect, it} from "vitest"
import {ListenAnalysis} from "./ListenAnalysis"
import type {AgentRender} from "@/agent/listen/AgentRender"

const sampleRate = 48_000
const seconds = 8

const tone = (hz: number, gain: number, pulse: boolean): Float32Array => {
    const out = new Float32Array(sampleRate * seconds)
    const beat = sampleRate / 2
    for (let index = 0; index < out.length; index++) {
        const envelope = pulse ? Math.exp(-(index % beat) / (sampleRate * 0.05)) : 1.0
        out[index] = Math.sin(2.0 * Math.PI * hz * index / sampleRate) * gain * envelope
    }
    return out
}

const mixOf = (...channels: ReadonlyArray<Float32Array>): Float32Array => {
    const out = new Float32Array(channels[0].length)
    channels.forEach(channel => channel.forEach((value, index) => out[index] += value))
    return out
}

const render = (): AgentRender => {
    const kick = tone(50, 0.5, true)
    const bass = tone(55, 0.3, false)
    const silence = new Float32Array(sampleRate * seconds)
    const mix = mixOf(kick, bass)
    return {
        sampleRate, mix: [mix, mix],
        stems: [
            {label: "Kick", unitUuid: "a", channels: [kick, kick], silent: false, feeds: []},
            {label: "Bass", unitUuid: "b", channels: [bass, bass], silent: false, feeds: []},
            {label: "Lead", unitUuid: "c", channels: [silence, silence], silent: true, feeds: []}],
        bars: {from: 1, to: 4}, startSeconds: 0, durationSeconds: seconds, tailSeconds: 0,
        barStartFrames: [0, 2, 4, 6].map(second => second * sampleRate), stepSeconds: 0.125,
        bpm: 120, signature: [4, 4], warnings: []
    }
}

describe("ListenAnalysis", () => {
    it("summarises mix and stems compactly, flags silence and kick/bass masking", () => {
        const result = ListenAnalysis.analyze(render())
        const text = JSON.stringify(result)
        expect(text.length).toBeLessThan(6000)
        expect(JSON.parse(text).mix.lufsPerBar).toHaveLength(4)
        expect(JSON.parse(text).stems[2]).toEqual({label: "Lead", silent: true})
        expect(JSON.parse(text).stems[1].activeFraction).toBe(1)
        expect(JSON.parse(text).masking[0].pair).toEqual(["Kick", "Bass"])
        expect(JSON.parse(text).warnings).toContain("stem 'Lead' is silent")
        expect(JSON.parse(text).mix.spectrumRegionsDb.sub).toBeGreaterThan(JSON.parse(text).mix.spectrumRegionsDb.high)
    })

    it("counts a hit with a secondary transient inside it once (onset interval follows the 16th grid)", () => {
        const source = render()
        const hits = new Float32Array(sampleRate * seconds)
        const burst = (start: number, gain: number) => {
            for (let index = 0; index < sampleRate * 0.03; index++) {
                hits[start + index] += Math.sin(2.0 * Math.PI * 1000 * index / sampleRate) * gain * Math.exp(-index / (sampleRate * 0.005))
            }
        }
        for (let beat = 0; beat < seconds * 2; beat++) {
            burst(beat * sampleRate / 2, 0.3)
            burst(beat * sampleRate / 2 + Math.round(sampleRate * 0.04), 0.6)
        }
        const stems = [{label: "Snare", unitUuid: "s", channels: [hits, hits], silent: false, feeds: []}]
        const result = JSON.parse(JSON.stringify(ListenAnalysis.analyze({...source, stems})))
        expect(result.stems[0].timing.onsets).toBe(seconds * 2)
    })

    it("does not compare a bus or return with the units feeding it", () => {
        const source = render()
        const [kick, bass] = source.stems
        const bus = {...kick, label: "Low End", unitUuid: "d", feeds: []}
        const echo = {...bass, label: "Echo", unitUuid: "e", feeds: []}
        const stems = [{...kick, feeds: ["Low End"]}, {...bass, feeds: ["Low End", "Echo"]}, bus, echo]
        const pairs = ListenAnalysis.analyze({...source, stems}).masking
        const labels = Array.isArray(pairs) ? pairs.map(entry => JSON.stringify(entry)) : []
        expect(labels.some(entry => entry.includes("\"Kick\",\"Bass\""))).toBe(true)
        expect(labels.some(entry => entry.includes("Low End") && (entry.includes("\"Kick\"") || entry.includes("\"Bass\"")))).toBe(false)
        expect(labels.some(entry => entry.includes("\"Bass\",\"Echo\""))).toBe(false)
        expect(labels.some(entry => entry.includes("\"Kick\",\"Echo\""))).toBe(true)
    })
})
