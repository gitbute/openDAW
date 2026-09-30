// The agent renderer derives the MIX from a stems render by exporting the OUTPUT unit as the first stem.
// This proves that tap equals the master output (no metronome) quantum by quantum,
// so mix + per-unit stems come out of one pass.
import {describe, expect, it} from "vitest"
import {UUID} from "@opendaw/lib-std"
import {ApparatDeviceBox, AudioUnitBox, CaptureMidiBox, NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {ProjectSkeleton, ScriptCompiler, TrackType} from "@opendaw/studio-adapters"
import {loadFullEngine} from "./helpers/load-full-engine"
import {connectSyncToEngine} from "./helpers/connect-sync"

const QUANTUM = 128
const SYNTH = `class Processor {
    voices = []
    noteOn(pitch, velocity, cent, id) { this.voices.push({id, phase: 0, freq: 220 * Math.pow(2, (pitch - 69) / 12)}) }
    noteOff(id) { this.voices = this.voices.filter(voice => voice.id !== id) }
    process(output, block) {
        const [left, right] = output
        for (const voice of this.voices) {
            for (let i = block.s0; i < block.s1; i++) {
                const value = Math.sin(voice.phase * Math.PI * 2) * 0.9
                left[i] += value; right[i] += value
                voice.phase += voice.freq / sampleRate
            }
        }
    }
}`

const build = (numUnits: number) => {
    const {boxGraph: source, mandatoryBoxes: {rootBox, primaryAudioBusBox, primaryAudioUnitBox}} =
        ProjectSkeleton.empty({createOutputMaximizer: true, createDefaultUser: false})
    source.beginTransaction()
    const units: Array<AudioUnitBox> = []
    for (let index = 0; index < numUnits; index++) {
        const unit = AudioUnitBox.create(source, UUID.generate(), box => {
            box.collection.refer(rootBox.audioUnits); box.output.refer(primaryAudioBusBox.input); box.index.setValue(index + 1)
        })
        unit.capture.refer(CaptureMidiBox.create(source, UUID.generate()))
        const apparat = ApparatDeviceBox.create(source, UUID.generate(), box => {
            box.host.refer(unit.input); box.code.setValue("// @apparat js 1 1\n" + SYNTH)
        })
        const track = TrackBox.create(source, UUID.generate(), box => {
            box.type.setValue(TrackType.Notes); box.enabled.setValue(true); box.index.setValue(0); box.target.refer(unit); box.tracks.refer(unit.tracks)
        })
        const events = NoteEventCollectionBox.create(source, UUID.generate())
        NoteEventBox.create(source, UUID.generate(), box => {
            box.events.refer(events.events); box.position.setValue(0); box.duration.setValue(100_000); box.pitch.setValue(48 + index * 7); box.velocity.setValue(1.0); box.cent.setValue(0)
        })
        NoteRegionBox.create(source, UUID.generate(), box => {
            box.regions.refer(track.regions); box.events.refer(events.owners); box.position.setValue(0); box.duration.setValue(100_000); box.loopDuration.setValue(100_000)
        })
        new Function(ScriptCompiler.wrap({headerTag: "apparat", registryName: "apparatProcessors", functionName: "apparat"}, UUID.toString(apparat.address.uuid), 1, SYNTH))()
        units.push(unit)
    }
    source.endTransaction()
    return {source, units, master: primaryAudioUnitBox}
}

describe("master stem", () => {
    it("the output unit's stem tap equals the master output", async () => {
        const {source, units, master} = build(2)
        const {engine, memory} = await loadFullEngine()
        const sync = connectSyncToEngine(engine, memory, source)
        await sync.settle()
        const stems = [master, ...units]
        const pointer = engine.input_reserve(stems.length * 20)
        const view = new DataView(memory.buffer, pointer, stems.length * 20)
        stems.forEach((unit, index) => {
            new Uint8Array(memory.buffer, pointer + index * 20, 16).set(unit.address.uuid)
            view.setUint32(index * 20 + 16, 1 | 2, true)
        })
        engine.set_stem_export(stems.length, 0)
        engine.bind()
        await sync.settle()
        engine.set_metronome_enabled(0)
        engine.stop(); engine.play()
        let maxDifference = 0
        let masterPeak = 0
        let unitPeak = 0
        for (let quantum = 0; quantum < 256; quantum++) {
            engine.render()
            const buffer = memory.buffer
            const output = new Float32Array(buffer, engine.output_ptr(), 2 * QUANTUM)
            const staging = new Float32Array(buffer, engine.stem_output_ptr(), stems.length * 2 * QUANTUM)
            for (let index = 0; index < 2 * QUANTUM; index++) {
                maxDifference = Math.max(maxDifference, Math.abs(output[index] - staging[index]))
                masterPeak = Math.max(masterPeak, Math.abs(staging[index]))
                unitPeak = Math.max(unitPeak, Math.abs(staging[2 * QUANTUM + index]))
            }
        }
        expect(masterPeak, "the mix is audible").toBeGreaterThan(0.1)
        expect(unitPeak, "the unit stem is audible").toBeGreaterThan(0.1)
        expect(maxDifference).toBeLessThan(1e-7)
        sync.close()
    }, 60000)
})
