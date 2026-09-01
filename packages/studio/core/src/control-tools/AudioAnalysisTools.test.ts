import {AudioData} from "@opendaw/lib-dsp"
import {describe, expect, it} from "vitest"
import {summarizeAudio} from "./AudioAnalysisTools"

const createAudio = (numberOfFrames: number, fill: (index: number) => number): AudioData => {
    const audio = AudioData.create(48_000, numberOfFrames, 2)
    for (let index = 0; index < numberOfFrames; index++) {
        audio.frames[0][index] = fill(index)
    }
    return audio
}

const expectFinite = (value: unknown): void => {
    if (typeof value === "number") {
        expect(Number.isFinite(value)).toBe(true)
        return
    }
    if (Array.isArray(value)) {
        value.forEach(expectFinite)
        return
    }
    if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(expectFinite)
    }
}

describe("AudioAnalysisTools PCM summary", () => {
    it("reports level and a compact envelope for an impulse", () => {
        const audio = createAudio(48_000, index => index === 12_345 ? 1 : 0)
        const summary = summarizeAudio(audio)

        expect(summary.level.peakDbfs).toBe(0)
        expect(summary.level.rmsDbfs).toBeLessThan(0)
        expect(summary.waveform).toHaveLength(64)
        expect(summary.spectrum).toHaveLength(10)
        expect(Math.max(...summary.waveform)).toBe(1)
    })

    it("places a sine wave in the broad band containing its frequency", () => {
        const frequency = 440
        const audio = createAudio(48_000, index => Math.sin(2 * Math.PI * frequency * index / 48_000))
        const summary = summarizeAudio(audio)
        const strongest = Math.max(...summary.spectrum.map(band => band.relativeDb))
        const band = summary.spectrum.find(candidate =>
            candidate.fromHz <= frequency && frequency < candidate.toHz)

        expect(band).toBeDefined()
        expect(band?.relativeDb).toBeCloseTo(0, 2)
        expect(strongest).toBeCloseTo(0, 2)
    })

    it("keeps silence finite and JSON-safe", () => {
        const summary = summarizeAudio(createAudio(0, () => 0))

        expectFinite(summary)
        expect(summary.level).toEqual({peakDbfs: -120, rmsDbfs: -120, crestDb: 0})
        expect(summary.spectrum.every(band => band.relativeDb === 0)).toBe(true)
        expect(summary.waveform.every(value => value === 0)).toBe(true)
    })
})
