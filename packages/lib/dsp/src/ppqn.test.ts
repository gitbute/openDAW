import {describe, expect, it} from "vitest"
import {PPQN} from "./ppqn"

describe("PPQN", () => {
    it("should convert", () => {
        expect(PPQN.pulsesToSeconds(PPQN.Quarter, 60)).toBe(1)
        expect(PPQN.pulsesToSeconds(PPQN.Quarter, 120)).toBe(0.5)
        expect(PPQN.secondsToPulses(1, 60)).toBe(PPQN.Quarter)
        expect(PPQN.secondsToPulses(0.5, 60)).toBe(PPQN.Quarter / 2)
    })

    it("keeps canonical musical distances independent of tempo", () => {
        expect(PPQN.Crotchet).toBe(960)
        expect(PPQN.Quaver).toBe(480)
        expect(PPQN.SemiQuaver).toBe(240)
        expect(PPQN.pulsesToSeconds(PPQN.Crotchet, 120)).not.toBe(
            PPQN.pulsesToSeconds(PPQN.Crotchet, 145))
        expect(PPQN.Crotchet).toBe(PPQN.secondsToPulses(
            PPQN.pulsesToSeconds(PPQN.Crotchet, 145), 145))
        expect(PPQN.fromParts({bars: 0, beats: 0, semiquavers: 0, ticks: 0})).toBe(0)
        expect(PPQN.fromParts({bars: 0, beats: 1, semiquavers: 0, ticks: 0})).toBe(960)
        expect(PPQN.fromParts({bars: 0, beats: 0, semiquavers: 1, ticks: 0})).toBe(240)
    })

    it("derives non-four-four bar lengths from the signature", () => {
        expect(PPQN.fromSignature(3, 4)).toBe(2880)
        expect(PPQN.fromSignature(6, 8)).toBe(2880)
        expect(PPQN.fromParts({bars: 1, beats: 0, semiquavers: 0, ticks: 0}, 3, 4)).toBe(2880)
        expect(PPQN.toParts(2880, 3, 4)).toEqual({
            bars: 1,
            beats: 0,
            semiquavers: 0,
            ticks: 0
        })
    })

    it("resolves canonical dotted and triplet note lengths", () => {
        expect(PPQN.Dotted(PPQN.Quaver)).toBe(720)
        expect(PPQN.Triplet(PPQN.Quaver)).toBe(320)
        expect(PPQN.Dotted(PPQN.Crotchet)).toBe(1440)
        expect(PPQN.Triplet(PPQN.Crotchet)).toBe(640)
    })
})
it("should handle 1 quarter note (960 ppqn) correctly", () => {
    const result = PPQN.toParts(PPQN.Quarter)
    expect(result).toEqual({
        bars: 0,
        beats: 1,
        semiquavers: 0,
        ticks: 0
    })
})
it("should handle 1 bar in 4/4 (3840 ppqn) correctly", () => {
    const result = PPQN.toParts(PPQN.Bar)
    expect(result).toEqual({
        bars: 1,
        beats: 0,
        semiquavers: 0,
        ticks: 0
    })
})
it("should handle 1 beat and 2 semiquavers correctly", () => {
    const result = PPQN.toParts(PPQN.Quarter + PPQN.SemiQuaver * 2)
    expect(result).toEqual({
        bars: 0,
        beats: 1,
        semiquavers: 2,
        ticks: 0
    })
})
it("should handle remaining ticks after semiquavers correctly", () => {
    const result = PPQN.toParts(PPQN.Quarter + PPQN.SemiQuaver * 2 + 100)
    expect(result).toEqual({
        bars: 0,
        beats: 1,
        semiquavers: 2,
        ticks: 100
    })
})
it("should handle composite", () => {
    const bars = 113
    const beats = 3
    const semiquavers = 1
    const ticks = 111
    const result = PPQN.toParts(PPQN.Bar * bars + PPQN.Quarter * beats + PPQN.SemiQuaver * semiquavers + ticks)
    expect(result).toEqual({
        bars,
        beats,
        semiquavers,
        ticks
    })
})
it("should handle composite (overflow beats)", () => {
    const bars = 113
    const beats = 4
    const semiquavers = 1
    const ticks = 111
    const result = PPQN.toParts(PPQN.Bar * bars + PPQN.Quarter * beats + PPQN.SemiQuaver * semiquavers + ticks)
    expect(result).toEqual({
        bars: bars + 1,
        beats: 0,
        semiquavers,
        ticks
    })
})
