import {describe, expect, it} from "vitest"
import {dbToGain} from "@opendaw/lib-dsp"
import {AgentRender} from "./AgentRender"

describe("AgentRender labels", () => {
    it("selects stems by label in unit order", () => {
        const labels = ["Drums", "Bass", "Bass #2"]
        expect(AgentRender.selectStems(labels, "none")).toEqual({indices: [], unknown: []})
        expect(AgentRender.selectStems(labels, "all")).toEqual({indices: [0, 1, 2], unknown: []})
        expect(AgentRender.selectStems(labels, ["Bass #2", "drums", "Bass #2", "Keys"]))
            .toEqual({indices: [0, 2], unknown: ["Keys"]})
    })
})

describe("AgentRender silence", () => {
    const tone = (gain: number): ReadonlyArray<Float32Array> => {
        const channel = new Float32Array(1000)
        channel[500] = gain
        return [channel, new Float32Array(1000)]
    }
    it("treats a peak below -90 dBFS as silent", () => {
        expect(AgentRender.isSilent([new Float32Array(10), new Float32Array(10)])).toBe(true)
        expect(AgentRender.isSilent(tone(dbToGain(-95)))).toBe(true)
        expect(AgentRender.isSilent(tone(dbToGain(-85)))).toBe(false)
        expect(AgentRender.isSilent(tone(-0.5))).toBe(false)
    })
    it("measures the peak over all channels", () => {
        expect(AgentRender.peakDb(tone(0.5))).toBeCloseTo(-6.02, 2)
    })
})

describe("AgentRender crop", () => {
    // 4 bars of 1000 frames each (bars 5-8), the last 500 frames are tail
    const render: AgentRender = {
        sampleRate: 1000, mix: [Float32Array.from({length: 4500}, (_value, index) => index)], stems: [],
        bars: {from: 5, to: 8}, startSeconds: 10, durationSeconds: 4.5, tailSeconds: 0.5,
        barStartFrames: [0, 1000, 2000, 3000], stepSeconds: 0.125, bpm: 240, signature: [4, 4], warnings: []
    }
    it("keeps the bar starts inside the window and numbers them from the original bars", () => {
        const cropped = AgentRender.crop(render, {startFrame: 1500, endFrame: 3200})
        expect(cropped.mix[0][0]).toBe(1500)
        expect(cropped.barStartFrames).toEqual([500, 1500])
        expect(cropped.bars).toEqual({from: 7, to: 8})
        expect([cropped.startSeconds, cropped.offsetSeconds, cropped.durationSeconds, cropped.tailSeconds]).toEqual([11.5, 1.5, 1.7, 0])
        const inTail = AgentRender.crop(render, {startFrame: 3800, endFrame: 4500})
        expect(inTail.bars).toEqual({from: 8, to: 8})
        expect(inTail.tailSeconds).toBeCloseTo(0.5, 6)
        expect(AgentRender.crop(cropped, {startFrame: 100, endFrame: 200}).offsetSeconds).toBeCloseTo(1.6, 6)
    })
})
