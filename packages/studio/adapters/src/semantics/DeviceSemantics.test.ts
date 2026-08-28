import {describe, expect, it} from "vitest"
import {BoxGraph} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {Option, UUID} from "@opendaw/lib-std"
import {
    DeviceSemantics,
    SupportedAudioEffectBoxNames,
    SupportedDeviceBoxNames,
    SupportedMidiEffectBoxNames,
    SupportedPublicInstrumentBoxNames
} from "./DeviceSemantics"
import {SemanticFields} from "./SemanticFields"

describe("DeviceSemantics", () => {
    it("covers every public device type and excludes the internal Modular device", () => {
        const graph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
        graph.beginTransaction()
        SupportedDeviceBoxNames.forEach(name => {
            const box = BoxIO.create(name as keyof BoxIO.TypeMap, graph, UUID.generate())
            expect(DeviceSemantics.forBox(box)).not.toBeNull()
        })
        graph.abortTransaction()
        expect(SupportedDeviceBoxNames).not.toContain("ModularDeviceBox")
        expect(SupportedPublicInstrumentBoxNames).toHaveLength(9)
        expect(SupportedMidiEffectBoxNames).toHaveLength(5)
        expect(SupportedAudioEffectBoxNames).toHaveLength(20)
    })

    it("promotes the one non-generic NeuralAmp switch without duplicating generic parameters", () => {
        const graph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
        graph.beginTransaction()
        const box = BoxIO.create("NeuralAmpDeviceBox", graph, UUID.generate())
        const semantics = DeviceSemantics.forBox(box)
        expect(semantics?.category).toBe("audio-effect")
        expect(semantics?.type).toBe("NeuralAmp")
        expect(SemanticFields.paths(semantics!.spec)).toEqual(["mono"])
        graph.abortTransaction()
    })
})
