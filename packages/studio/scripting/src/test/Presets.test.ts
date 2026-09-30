import {describe, expect, it} from "vitest"
import {Box} from "@opendaw/lib-box"
import {PresetEncoder, PresetHeader, TubularPreset} from "@opendaw/studio-adapters"
import {TubularDeviceBox} from "@opendaw/studio-boxes"
import {createFixture} from "./Fixture"
import {InstrumentAudioUnit, Vaporisateur} from "../Api"
import {InstrumentAudioUnitImpl} from "../impl/AudioUnits"
import {Facade} from "../impl/Common"

const boxOf = (facade: unknown): Box => (facade as Facade).box

// Builds preset bytes the same way the studio does, from a scratch project made with the scripting API
const makePresets = () => {
    const {project} = createFixture()
    const unit = project.addInstrumentUnit("Vaporisateur", {label: "Source"}, {cutoff: 1234})
    const instrument = PresetEncoder.encode((unit as InstrumentAudioUnitImpl).box) as ArrayBuffer
    const delay = unit.addAudioEffect("Delay", {feedback: 0.8})
    const effect = PresetEncoder.encodeEffects([boxOf(delay)], PresetHeader.ChainKind.Audio) as ArrayBuffer
    return {instrument, effect}
}

describe("Presets", () => {
    it("replaces the instrument and keeps the unit's effects", async () => {
        const {api, host, project} = createFixture()
        const {instrument} = makePresets()
        host.presets.set("vapo", {uuid: "vapo", name: "Vapo", category: "instrument", buffer: instrument})
        const unit = project.addInstrumentUnit("Nano", {label: "Target"})
        unit.addAudioEffect("Reverb")
        const device = await api.applyPreset(unit, "vapo")
        expect(device.key).toBe("Vaporisateur")
        expect((unit as InstrumentAudioUnit).instrument.key).toBe("Vaporisateur")
        expect(((unit as InstrumentAudioUnit).instrument as Vaporisateur).cutoff).toBeCloseTo(1234)
        expect(unit.audioEffects.map(effect => effect.key)).toEqual(["Reverb"])
    })

    it("replaces an effect in place and appends to a unit", async () => {
        const {api, host, project} = createFixture()
        const {effect} = makePresets()
        host.presets.set("delay", {uuid: "delay", name: "Dly", category: "audio-effect", buffer: effect})
        const unit = project.addInstrumentUnit("Vaporisateur")
        const reverb = unit.addAudioEffect("Reverb")
        unit.addAudioEffect("Crusher")
        const created = await api.applyPreset(reverb, "delay")
        expect(created.key).toBe("Delay")
        expect(unit.audioEffects.map(entry => [entry.key, entry.index])).toEqual([["Delay", 0], ["Crusher", 1]])
        await api.applyPreset(unit, "delay")
        expect(unit.audioEffects.map(entry => entry.key)).toEqual(["Delay", "Crusher", "Delay"])
    })

    it("records preset edits for the studio", async () => {
        const {api, host, project} = createFixture()
        const {instrument} = makePresets()
        host.presets.set("vapo", {uuid: "vapo", name: "Vapo", category: "instrument", buffer: instrument})
        project.addInstrumentUnit("Nano", {label: "Target"})
        project.openInStudio()
        const loaded = await api.getProject()
        await api.applyPreset(loaded.instrumentUnits[0], "vapo")
        loaded.openInStudio()
        expect(host.applied.length).toBe(1)
        const reloaded = await api.getProject()
        expect(reloaded.instrumentUnits[0].instrument.key).toBe("Vaporisateur")
    })

    it("rejects unknown targets and presets", async () => {
        const {api, project} = createFixture()
        const unit = project.addInstrumentUnit("Vaporisateur")
        await expect(api.applyPreset({} as InstrumentAudioUnit, "x")).rejects.toThrow(TypeError)
        await expect(api.applyPreset(unit, "missing")).rejects.toThrow("Unknown preset")
    })

    it("loads a Tubular voice", async () => {
        const {api, host, project} = createFixture()
        const source = project.addInstrumentUnit("Tubular").instrument
        source.algorithm = 17
        source.label = "BRASS 1"
        host.voices.set("Cart/3", TubularPreset.read(boxOf(source) as TubularDeviceBox))
        const target = project.addInstrumentUnit("Tubular").instrument
        await api.loadTubularVoice(target, "Cart", 3)
        expect(target.algorithm).toBe(17)
        expect(target.label).toBe("BRASS 1")
        await expect(api.loadTubularVoice(project.addInstrumentUnit("Nano").instrument as never, "Cart", 3)).rejects.toThrow(TypeError)
    })
})
