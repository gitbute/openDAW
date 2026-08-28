import {describe, expect, it} from "vitest"
import {InstrumentSemantics, SupportedInstrumentBoxNames} from "./InstrumentSemantics"
import {SemanticFields} from "./SemanticFields"
import {AudioUnitFactory} from "../factories/AudioUnitFactory"
import {InstrumentFactories} from "../factories/InstrumentFactories"
import type {InstrumentBox} from "../factories/InstrumentBox"
import type {InstrumentFactory} from "../factories/InstrumentFactory"
import {NeonDeviceBox, VaporisateurDeviceBox} from "@opendaw/studio-boxes"
import {AudioUnitType, IconSymbol} from "@opendaw/studio-enums"
import {Option} from "@opendaw/lib-std"
import {ProjectSkeleton} from "../project/ProjectSkeleton"

const createInstrument = <ATTACHMENT, BOX extends InstrumentBox>(factory: InstrumentFactory<ATTACHMENT, BOX>): BOX => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = skeleton
    boxGraph.beginTransaction()
    const audioUnit = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, Option.None)
    const instrument = factory.create(boxGraph, audioUnit.input, factory.defaultName, factory.defaultIcon)
    boxGraph.endTransaction()
    return instrument
}

const createNeon = (): NeonDeviceBox => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = skeleton
    boxGraph.beginTransaction()
    const audioUnit = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, Option.None)
    const neon = InstrumentFactories.Neon.create(
        boxGraph, audioUnit.input, "Neon", IconSymbol.Neon)
    boxGraph.endTransaction()
    return neon
}

const createVaporisateur = (): VaporisateurDeviceBox => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = skeleton
    boxGraph.beginTransaction()
    const audioUnit = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, Option.None)
    const vaporisateur = InstrumentFactories.Vaporisateur.create(
        boxGraph, audioUnit.input, "Vaporisateur", IconSymbol.Vaporisateur)
    boxGraph.endTransaction()
    return vaporisateur
}

describe("InstrumentSemantics", () => {
    it("resolves every Neon envelope group and its live fields", () => {
        const neon = createNeon()
        const semantics = InstrumentSemantics.forBox(neon)
        expect(semantics?.type).toBe("Neon")
        if (semantics === null) {throw new Error("Missing Neon semantics")}

        expect(semantics.groups).toEqual([
            {prefix: "envelopes.0", label: "Line 1 Pitch Envelope"},
            {prefix: "envelopes.1", label: "Line 1 DCW Envelope"},
            {prefix: "envelopes.2", label: "Line 1 DCA Envelope"},
            {prefix: "envelopes.3", label: "Line 2 Pitch Envelope"},
            {prefix: "envelopes.4", label: "Line 2 DCW Envelope"},
            {prefix: "envelopes.5", label: "Line 2 DCA Envelope"}
        ])
        expect(SemanticFields.resolve(semantics.spec, "envelopes.0.rate1"))
            .toBe(neon.envelopes.fields()[0].rate1)
        expect(SemanticFields.resolve(semantics.spec, "envelopes.1.level8"))
            .toBe(neon.envelopes.fields()[1].level8)
        expect(SemanticFields.resolve(semantics.spec, "envelopes.2.sustain"))
            .toBe(neon.envelopes.fields()[2].sustain)
        expect(SemanticFields.resolve(semantics.spec, "envelopes.3.end"))
            .toBe(neon.envelopes.fields()[3].end)
        expect(SemanticFields.resolve(semantics.spec, "envelopes.4.rate2"))
            .toBe(neon.envelopes.fields()[4].rate2)
        expect(SemanticFields.resolve(semantics.spec, "envelopes.5.level7"))
            .toBe(neon.envelopes.fields()[5].level7)
        expect(SemanticFields.resolve(semantics.spec, "lines.0.wave1")).toBe(neon.lines.fields()[0].wave1)
        expect(SemanticFields.resolve(semantics.spec, "vibrato.rate")).toBe(neon.vibrato.rate)
        expect(SemanticFields.paths(semantics.spec)).toContain("envelopes.5.level8")
    })

    it("resolves Vaporisateur oscillator, LFO, and noise paths", () => {
        const vaporisateur = createVaporisateur()
        const semantics = InstrumentSemantics.forBox(vaporisateur)
        if (semantics === null) {throw new Error("Missing Vaporisateur semantics")}

        expect(SemanticFields.resolve(semantics.spec, "cutoff")).toBe(vaporisateur.cutoff)
        expect(SemanticFields.resolve(semantics.spec, "lfo.rate")).toBe(vaporisateur.lfo.rate)
        expect(SemanticFields.resolve(semantics.spec, "oscillators.0.waveform"))
            .toBe(vaporisateur.oscillators.fields()[0].waveform)
        expect(SemanticFields.resolve(semantics.spec, "oscillators.1.volume"))
            .toBe(vaporisateur.oscillators.fields()[1].volume)
        expect(SemanticFields.resolve(semantics.spec, "noise.release")).toBe(vaporisateur.noise.release)
    })

    it("covers every instrument with an existing canonical primitive mapping", () => {
        const neon = createNeon()
        const cases = [
            {
                name: "CubedDeviceBox",
                box: createInstrument(InstrumentFactories.Cubed),
                paths: ["tuning", "cutoff", "resonance", "envMod", "decay", "accent", "volume", "waveform", "patternIndex"]
            },
            {
                name: "MIDIOutputDeviceBox",
                box: createInstrument(InstrumentFactories.MIDIOutput),
                paths: ["channel"]
            },
            {
                name: "NanoDeviceBox",
                box: createInstrument(InstrumentFactories.Nano),
                paths: ["volume", "release"]
            },
            {
                name: "NeonDeviceBox",
                box: neon,
                paths: InstrumentSemantics.paths(neon)
            },
            {
                name: "SoundfontDeviceBox",
                box: createInstrument(InstrumentFactories.Soundfont),
                paths: ["presetIndex"]
            },
            {
                name: "TapeDeviceBox",
                box: createInstrument(InstrumentFactories.Tape),
                paths: ["flutter", "wow", "noise", "saturation"]
            },
            {
                name: "VaporisateurDeviceBox",
                box: createVaporisateur(),
                paths: [
                    "cutoff", "resonance", "filterOrder", "attack", "decay", "sustain", "release",
                    "filterEnvelope", "filterKeyboard", "voicingMode", "glideTime", "unisonCount",
                    "unisonDetune", "unisonStereo", "lfo.waveform", "lfo.rate", "lfo.sync",
                    "lfo.targetTune", "lfo.targetCutoff", "lfo.targetVolume", "oscillators.0.waveform",
                    "oscillators.0.volume", "oscillators.0.octave", "oscillators.0.tune", "oscillators.1.waveform",
                    "oscillators.1.volume", "oscillators.1.octave", "oscillators.1.tune", "noise.attack",
                    "noise.hold", "noise.release", "noise.volume"
                ]
            }
        ] as const

        expect(SupportedInstrumentBoxNames).toEqual(cases.map(({name}) => name))
        cases.forEach(({box, paths}) => {
            const semantics = InstrumentSemantics.forBox(box)
            expect(semantics).not.toBeNull()
            expect(SemanticFields.paths(semantics!.spec)).toEqual(paths)
        })
    })

    it("keeps every scripting Vaporisateur field path in the shared mapping", () => {
        const vaporisateur = createVaporisateur()
        const semantics = InstrumentSemantics.forBox(vaporisateur)
        if (semantics === null) {throw new Error("Missing Vaporisateur semantics")}

        const scriptingPaths = [
            "cutoff", "resonance", "filterOrder", "filterEnvelope", "filterKeyboard", "attack", "decay",
            "sustain", "release", "voicingMode", "glideTime", "unisonCount", "unisonDetune", "unisonStereo",
            "lfo.waveform", "lfo.rate", "lfo.sync", "lfo.targetTune", "lfo.targetVolume", "lfo.targetCutoff",
            "oscillators.0.waveform", "oscillators.0.volume", "oscillators.0.octave", "oscillators.0.tune",
            "oscillators.1.waveform", "oscillators.1.volume", "oscillators.1.octave", "oscillators.1.tune",
            "noise.attack", "noise.hold", "noise.release", "noise.volume"
        ]
        expect(scriptingPaths.every(path => SemanticFields.paths(semantics.spec).includes(path))).toBe(true)
    })

    it("shares primitive constraint validation without mutating fields", () => {
        const neon = createNeon()
        const semantics = InstrumentSemantics.forBox(neon)
        if (semantics === null) {throw new Error("Missing Neon semantics")}
        const field = SemanticFields.resolve(semantics.spec, "envelopes.0.rate1")!
        expect(SemanticFields.coerceValue(field, 73, "envelopes.0.rate1")).toBe(73)
        expect(() => SemanticFields.coerceValue(field, 100, "envelopes.0.rate1"))
            .toThrow("envelopes.0.rate1: value must be between 0 and 99")
        expect(field.getValue()).toBe(0)
    })
})
