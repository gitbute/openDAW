import {describe, expect, it} from "vitest"
import {Box, BoxGraph} from "@opendaw/lib-box"
import {Option, UUID} from "@opendaw/lib-std"
import {AudioUnitType} from "@opendaw/studio-enums"
import {BoxIO, NeonDeviceBox, VaporisateurDeviceBox} from "@opendaw/studio-boxes"
import {AudioUnitFactory} from "../factories/AudioUnitFactory"
import {InstrumentFactories} from "../factories/InstrumentFactories"
import type {InstrumentBox} from "../factories/InstrumentBox"
import type {InstrumentFactory} from "../factories/InstrumentFactory"
import {ProjectSkeleton} from "../project/ProjectSkeleton"
import {DeviceSemantics} from "./DeviceSemantics"
import {SemanticFields} from "./SemanticFields"

const createInstrument = <ATTACHMENT, BOX extends InstrumentBox>(
    factory: InstrumentFactory<ATTACHMENT, BOX>): BOX => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = skeleton
    boxGraph.beginTransaction()
    const audioUnit = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, Option.None)
    const instrument = factory.create(boxGraph, audioUnit.input, factory.defaultName, factory.defaultIcon)
    boxGraph.endTransaction()
    return instrument
}

const createBox = (name: keyof BoxIO.TypeMap): Box => {
    const graph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
    graph.beginTransaction()
    const box = BoxIO.create(name, graph, UUID.generate())
    graph.abortTransaction()
    return box
}

describe("DeviceSemantics", () => {
    it("maps representative Neon fields and all six envelope groups", () => {
        const neon = createInstrument(InstrumentFactories.Neon)
        expect(neon).toBeInstanceOf(NeonDeviceBox)
        const semantics = DeviceSemantics.forBox(neon)
        expect(semantics?.type).toBe("Neon")
        expect(semantics?.groups).toHaveLength(6)
        expect(SemanticFields.resolve(semantics!.spec, "vibrato.rate")).toBe(neon.vibrato.rate)
        expect(SemanticFields.resolve(semantics!.spec, "lines.0.wave1")).toBe(neon.lines.fields()[0].wave1)
        expect(SemanticFields.resolve(semantics!.spec, "envelopes.5.level8"))
            .toBe(neon.envelopes.fields()[5].level8)
        expect(semantics?.groups[0]).toEqual({prefix: "envelopes.0", label: "Line 1 Pitch Envelope"})
        expect(semantics?.groups[5]).toEqual({prefix: "envelopes.5", label: "Line 2 DCA Envelope"})
    })

    it("maps representative Vaporisateur fields", () => {
        const vaporisateur = createInstrument(InstrumentFactories.Vaporisateur)
        expect(vaporisateur).toBeInstanceOf(VaporisateurDeviceBox)
        const semantics = DeviceSemantics.forBox(vaporisateur)
        expect(SemanticFields.resolve(semantics!.spec, "cutoff")).toBe(vaporisateur.cutoff)
        expect(SemanticFields.resolve(semantics!.spec, "lfo.rate")).toBe(vaporisateur.lfo.rate)
        expect(SemanticFields.resolve(semantics!.spec, "oscillators.0.waveform"))
            .toBe(vaporisateur.oscillators.fields()[0].waveform)
        expect(SemanticFields.resolve(semantics!.spec, "oscillators.1.volume"))
            .toBe(vaporisateur.oscillators.fields()[1].volume)
        expect(SemanticFields.resolve(semantics!.spec, "noise.release")).toBe(vaporisateur.noise.release)
    })

    it("maps special device properties without duplicating generic parameters", () => {
        const neuralAmp = createBox("NeuralAmpDeviceBox")
        expect(SemanticFields.paths(DeviceSemantics.forBox(neuralAmp)!.spec)).toEqual(["mono"])
        for (const name of ["CompressorDeviceBox", "GateDeviceBox", "VocoderDeviceBox"] as const) {
            const semantics = DeviceSemantics.forBox(createBox(name))
            expect(SemanticFields.paths(semantics!.spec)).toEqual(["sideChain"])
        }
        expect(SemanticFields.paths(DeviceSemantics.forBox(createBox("DelayDeviceBox"))!.spec))
            .not.toContain("sideChain")
    })

    it("does not expose the intentionally internal Modular device", () => {
        expect(DeviceSemantics.forBox(createBox("ModularDeviceBox"))).toBeNull()
    })
})
