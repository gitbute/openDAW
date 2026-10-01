import {describe, expect, it} from "vitest"
import {ScriptDsp} from "@opendaw/studio-adapters"
import {createFixture, FakeHost} from "./Fixture"
import {ScriptGlobals} from "../ScriptRunner"
import {ApiImpl} from "../impl/ApiImpl"
import {DspLibraryImpl} from "../impl/DspLibraryImpl"

describe("Dsp global", () => {
    it("is available to scripts", () => {
        const globals = ScriptGlobals.create(new ApiImpl(new FakeHost()), {sampleRate: 48000, baseFrequency: 440})
        expect(globals.Dsp).toBe(DspLibraryImpl)
        expect(DspLibraryImpl.blocks).toEqual(ScriptDsp.blockNames)
        expect(DspLibraryImpl.version).toBe(ScriptDsp.version)
    })

    it("links device code that keeps its declarations and round-trips through the device", () => {
        const {project} = createFixture()
        const apparat = project.addInstrumentUnit("Apparat").instrument
        const code = "// @label Wobble\n// @param cutoff 2000 80 18000 exp Hz\n// @sample wavetable\n" +
            "class Processor { constructor() { this.osc = new Dsp.WavetableOsc(Dsp.Tables.fm()) } process() {} }"
        apparat.code = DspLibraryImpl.link(code)
        expect(apparat.label).toBe("Wobble")
        expect(apparat.parameters.map(parameter => parameter.label)).toEqual(["cutoff"])
        expect(apparat.samples.map(slot => slot.label)).toEqual(["wavetable"])
        expect(DspLibraryImpl.isLinked(apparat.code)).toBe(true)
        expect(DspLibraryImpl.strip(apparat.code)).toBe(code)
        expect(DspLibraryImpl.link(apparat.code)).toBe(apparat.code)
        expect(DspLibraryImpl.include("svf")).toContain("Dsp.Svf = class Svf")
    })

    it("links automatically when device code uses Dsp blocks, also from a collapsed example", () => {
        const {project} = createFixture()
        const unit = project.addInstrumentUnit("Apparat", {label: "Monster"})
        const plain = "class Processor { process() {} }"
        unit.instrument.code = plain
        expect(unit.instrument.code).toBe(plain)
        const collapsed = "// openDAW DSP library v1: core, svf (collapsed here, linked automatically when assigned to device.code)\n" +
            "// built with Dsp.link, see Dsp.include\nclass Processor { constructor() { this.filter = new Dsp.Svf() } process() {} }"
        unit.instrument.code = collapsed
        expect(DspLibraryImpl.isLinked(unit.instrument.code)).toBe(true)
        expect(unit.instrument.code).toContain("Dsp.Svf = class Svf")
        expect(unit.instrument.code).not.toContain("(collapsed")
        expect(unit.label).toBe("Monster")
    })

    it("rejects unknown members with the available names", () => {
        expect(() => DspLibraryImpl.link("new Dsp.Reverb()")).toThrow(/Unknown Dsp.Reverb/)
    })
})
