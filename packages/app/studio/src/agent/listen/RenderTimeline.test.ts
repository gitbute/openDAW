import {describe, expect, it} from "vitest"
import {DefaultObservableValue, Observer, Subscription, Terminable} from "@opendaw/lib-std"
import {bpm, ConstantTempoMap, PPQN, ppqn, seconds, TempoMap} from "@opendaw/lib-dsp"
import type {SignatureEvent} from "@opendaw/studio-adapters"
import {RenderTimeline} from "./RenderTimeline"

const fourFour: ReadonlyArray<SignatureEvent> = [{index: -1, accumulatedPpqn: 0, accumulatedBars: 0, nominator: 4, denominator: 4}]

// 4/4 for 2 bars, then 7/8 for 3 bars, then 3/4 (what SignatureTrackAdapter.iterateAll yields)
const changing: ReadonlyArray<SignatureEvent> = [
    {index: -1, accumulatedPpqn: 0, accumulatedBars: 0, nominator: 4, denominator: 4},
    {index: 0, accumulatedPpqn: 2 * 3840, accumulatedBars: 2, nominator: 7, denominator: 8},
    {index: 1, accumulatedPpqn: 2 * 3840 + 3 * 3360, accumulatedBars: 5, nominator: 3, denominator: 4}
]

const constant = (tempo: bpm): TempoMap => new ConstantTempoMap(new DefaultObservableValue(tempo))

// 120 bpm until `switchAt`, 60 bpm afterwards: exercises that frames come from the tempo map integration
class SteppedTempoMap implements TempoMap {
    constructor(readonly switchAt: ppqn) {}
    subscribe(_observer: Observer<TempoMap>): Subscription {return Terminable.Empty}
    getTempoAt(position: ppqn): bpm {return position < this.switchAt ? 120 : 60}
    ppqnToSeconds(position: ppqn): seconds {return this.intervalToSeconds(0, position)}
    secondsToPPQN(_time: seconds): ppqn {return 0}
    intervalToSeconds(fromPPQN: ppqn, toPPQN: ppqn): seconds {
        const fast = Math.max(0, Math.min(toPPQN, this.switchAt) - Math.min(fromPPQN, this.switchAt))
        const slow = Math.max(0, Math.max(toPPQN, this.switchAt) - Math.max(fromPPQN, this.switchAt))
        return PPQN.pulsesToSeconds(fast, 120) + PPQN.pulsesToSeconds(slow, 60)
    }
    intervalToPPQN(_fromSeconds: seconds, _toSeconds: seconds): ppqn {return 0}
}

describe("RenderTimeline", () => {
    it("maps 1-based bars to ppqn in 4/4", () => {
        expect(RenderTimeline.barToPpqn(fourFour, 0)).toBe(0)
        expect(RenderTimeline.barToPpqn(fourFour, 4)).toBe(4 * PPQN.Bar)
    })
    it("maps bars across signature changes", () => {
        expect(RenderTimeline.barToPpqn(changing, 2)).toBe(2 * 3840)
        expect(RenderTimeline.barToPpqn(changing, 3)).toBe(2 * 3840 + 3360)
        expect(RenderTimeline.barToPpqn(changing, 5)).toBe(2 * 3840 + 3 * 3360)
        expect(RenderTimeline.barToPpqn(changing, 6)).toBe(2 * 3840 + 3 * 3360 + 2880)
        expect(RenderTimeline.signatureAtBar(changing, 3)).toEqual([7, 8])
        expect(RenderTimeline.signatureAtBar(changing, 7)).toEqual([3, 4])
    })
    it("counts the bars covering a position", () => {
        expect(RenderTimeline.barsCovering(fourFour, 0)).toBe(0)
        expect(RenderTimeline.barsCovering(fourFour, 1)).toBe(1)
        expect(RenderTimeline.barsCovering(fourFour, 4 * PPQN.Bar)).toBe(4)
        expect(RenderTimeline.barsCovering(fourFour, 4 * PPQN.Bar + 1)).toBe(5)
        expect(RenderTimeline.barsCovering(changing, 2 * 3840 + 3360 + 1)).toBe(4)
    })
    it("renders exactly the requested bars at 120 bpm in 4/4 (no implicit tail)", () => {
        const span = RenderTimeline.span(fourFour, constant(120), {from: 1, to: 8}, 48_000, 0)
        expect(span.startPpqn).toBe(0)
        expect(span.endPpqn).toBe(8 * PPQN.Bar)
        expect(span.musicalFrames).toBe(16 * 48_000)
        expect(span.totalFrames).toBe(16 * 48_000)
        expect(span.barStartFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(bar => bar * 2 * 48_000))
        expect(span.stepSeconds).toBeCloseTo(0.125, 10)
        expect(span.signature).toEqual([4, 4])
        expect(span.bpm).toBe(120)
    })
    it("adds only the explicit tail", () => {
        const span = RenderTimeline.span(fourFour, constant(120), {from: 3, to: 4}, 44_100, 1.5)
        expect(span.startSeconds).toBeCloseTo(4, 10)
        expect(span.musicalFrames).toBe(4 * 44_100)
        expect(span.totalFrames).toBe(4 * 44_100 + Math.round(1.5 * 44_100))
        expect(span.barStartFrames).toEqual([0, 2 * 44_100])
    })
    it("handles a 7/8 range at 90 bpm", () => {
        const span = RenderTimeline.span(changing, constant(90), {from: 3, to: 5}, 48_000, 0)
        // 3 bars of 7/8 = 10.5 quarters = 7 s at 90 bpm
        expect(span.startPpqn).toBe(2 * 3840)
        expect(span.endPpqn).toBe(2 * 3840 + 3 * 3360)
        expect(span.musicalFrames).toBe(7 * 48_000)
        expect(span.barStartFrames).toEqual([0, 7 / 3 * 48_000, 14 / 3 * 48_000].map(Math.round))
        expect(span.signature).toEqual([7, 8])
    })
    it("integrates tempo changes", () => {
        const span = RenderTimeline.span(fourFour, new SteppedTempoMap(2 * PPQN.Bar), {from: 1, to: 4}, 48_000, 0)
        // 2 bars at 120 (4 s) + 2 bars at 60 (8 s)
        expect(span.musicalFrames).toBe(12 * 48_000)
        expect(span.barStartFrames).toEqual([0, 2, 4, 8].map(second => second * 48_000))
    })
    it("rejects invalid ranges", () => {
        expect(() => RenderTimeline.span(fourFour, constant(120), {from: 0, to: 2}, 48_000, 0)).toThrow()
        expect(() => RenderTimeline.span(fourFour, constant(120), {from: 3, to: 2}, 48_000, 0)).toThrow()
        expect(() => RenderTimeline.span(fourFour, constant(120), {from: 1.5, to: 2}, 48_000, 0)).toThrow()
    })
})
