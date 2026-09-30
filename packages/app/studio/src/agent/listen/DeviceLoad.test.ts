import {describe, expect, it} from "vitest"
import type {ScriptLoadReport} from "@opendaw/studio-adapters"
import {DeviceLoad} from "./DeviceLoad"

// 375 quanta of 128 frames at 48 kHz = exactly 1 s of rendered audio; one block = 128/48000 s
const report = (devices: ScriptLoadReport["devices"]): ScriptLoadReport =>
    ({sampleRate: 48_000, quantumFrames: 128, renderedQuanta: 375, measuredQuanta: 360, devices})

const identities: Record<string, {unitLabel: string, device: string}> = {
    sky: {unitLabel: "Sky Chords", device: "Sky Chords (Apparat)"},
    growl: {unitLabel: "Bass", device: "Growl (Werkstatt)"},
    arp: {unitLabel: "Keys", device: "Spielwerk"}
}
const identify = (uuid: string) => identities[uuid]
const blockSeconds = 128 / 48_000

describe("DeviceLoad", () => {
    it("computes load as script time over rendered audio time, sorted heaviest first", () => {
        const loads = DeviceLoad.entries(report([
            {uuid: "growl", processSeconds: 0.2, worstQuantumSeconds: blockSeconds * 0.5, overBudgetQuanta: 0},
            {uuid: "sky", processSeconds: 1.4, worstQuantumSeconds: blockSeconds * 2.0, overBudgetQuanta: 300}
        ]), identify)
        expect(loads.map(entry => entry.device)).toEqual(["Sky Chords (Apparat)", "Growl (Werkstatt)"])
        expect(loads[0].loadPercent).toBeCloseTo(140, 6)
        expect(loads[0].worstBlockPercent).toBeCloseTo(200, 6)
        expect(loads[0].overBudgetBlocksPercent).toBeCloseTo(300 / 360 * 100, 6)
        expect(loads[1].loadPercent).toBeCloseTo(20, 6)
        expect(DeviceLoad.totalPercent(loads)).toBeCloseTo(160, 6)
    })
    it("warns for overload, heavy devices, block spikes and the total", () => {
        const loads = DeviceLoad.entries(report([
            {uuid: "sky", processSeconds: 1.4, worstQuantumSeconds: blockSeconds * 2.0, overBudgetQuanta: 300},
            {uuid: "growl", processSeconds: 0.6, worstQuantumSeconds: blockSeconds * 0.9, overBudgetQuanta: 0},
            {uuid: "arp", processSeconds: 0.05, worstQuantumSeconds: blockSeconds * 1.5, overBudgetQuanta: 10}
        ]), identify)
        const warnings = DeviceLoad.warnings(loads)
        expect(warnings[0]).toBe("Sky Chords (Apparat) uses ~140% of the real-time budget: live playback will glitch and drop out. Optimise the script (real-time budget rules).")
        expect(warnings[1]).toContain("Growl (Werkstatt) on 'Bass' uses ~60% of the real-time budget on its own")
        expect(warnings[2]).toContain("Spielwerk on 'Keys' overruns a whole block in 2.8% of blocks (worst ~150% of a block)")
        expect(warnings[3]).toContain("Script devices together use ~205% of the real-time budget")
        expect(warnings).toHaveLength(4)
    })
    it("stays quiet for light scripts and isolated spikes", () => {
        const loads = DeviceLoad.entries(report([
            {uuid: "sky", processSeconds: 0.3, worstQuantumSeconds: blockSeconds * 1.2, overBudgetQuanta: 1},
            {uuid: "growl", processSeconds: 0.1, worstQuantumSeconds: blockSeconds * 0.3, overBudgetQuanta: 0}
        ]), identify)
        expect(DeviceLoad.warnings(loads)).toEqual([])
        const facts = DeviceLoad.facts(loads)
        expect(facts).toMatchObject({scriptLoad: {totalPercent: 40}})
        expect(facts.scriptLoad).toMatchObject({devices: [
            {unit: "Sky Chords", device: "Sky Chords (Apparat)", loadPercent: 30, worstBlockPercent: 120, overBudgetBlocksPercent: 0.28},
            {unit: "Bass", device: "Growl (Werkstatt)", loadPercent: 10}
        ]})
    })
    it("reports nothing without script devices", () => {
        expect(DeviceLoad.entries(report([]), identify)).toEqual([])
        expect(DeviceLoad.facts([])).toEqual({})
        expect(DeviceLoad.warnings([])).toEqual([])
    })
})
