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
