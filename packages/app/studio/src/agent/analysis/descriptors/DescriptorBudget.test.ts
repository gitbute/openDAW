import {describe, expect, it} from "vitest"
import {AudioMetrics} from "@opendaw/lib-dsp"
import type {JsonObject} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundTarget} from "../SoundTarget"
import {EnvelopeDescriptor} from "./EnvelopeDescriptor"
import {PitchDescriptor} from "./PitchDescriptor"
import {TimbreDescriptor} from "./TimbreDescriptor"
import {MovementDescriptor} from "./MovementDescriptor"
import {SpaceDescriptor} from "./SpaceDescriptor"
import {DynamicsDescriptor} from "./DynamicsDescriptor"
import {TestSignals} from "./test/TestSignals"

const Families: ReadonlyArray<SoundDescriptor> =
    [EnvelopeDescriptor, PitchDescriptor, TimbreDescriptor, MovementDescriptor, SpaceDescriptor, DynamicsDescriptor]

const describeAll = (target: SoundTarget): JsonObject =>
    Object.fromEntries(Families.map(family => [family.key, family.describe(target)]))

describe("sound descriptor budget", () => {
    it("keeps the JSON of all six families small, focused or not", () => {
        const compact = JSON.stringify(describeAll(TestSignals.bassline(64, 64, false)))
        const focused = JSON.stringify(describeAll(TestSignals.bassline(64, 64, true)))
        console.log(`unfocused ${compact.length} B, focused ${focused.length} B`)
        console.log(focused)
        expect(compact).not.toMatch(/NaN|Infinity/)
        expect(focused).not.toMatch(/NaN|Infinity/)
        expect(compact.length).toBeLessThan(1500)
        expect(focused.length).toBeLessThan(4000)
    }, 30_000)
    it("describes 30 s of stereo with 60 notes fast (target 150 ms per 10 s, guard 400 ms per 10 s under parallel test load)", () => {
        const bassline = TestSignals.bassline(30, 60, true)
        const target = {...bassline, loudness: AudioMetrics.loudness(bassline.channels, bassline.sampleRate)}
        describeAll(target)
        const timings = Families.map(family => [family.key, Math.min(...[0, 1, 2].map(() => {
            const start = performance.now()
            family.describe(target)
            return performance.now() - start
        }))] as const)
        const total = timings.reduce((sum, [, ms]) => sum + ms, 0)
        console.log(timings.map(([key, ms]) => `${key} ${ms.toFixed(1)} ms`).join(", ") + `, total ${total.toFixed(1)} ms`)
        expect(total).toBeLessThan(1200)
    }, 30_000)
})
