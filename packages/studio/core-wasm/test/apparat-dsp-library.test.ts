// End to end: Apparat devices whose code is linked with the DSP library (ScriptDsp.link) compile through the
// ScriptCompiler wrapper, run inside the real WASM engine via the script bridge and render non-silent, finite audio.
// The growl example also receives a wavetable through its // @sample slot (the engine's synthetic 0.5 s PCM, 11
// frames of 2048 samples), which exercises WavetableSlot on the bridge's per-block sample views.
import {describe, expect, it} from "vitest"
import {UUID} from "@opendaw/lib-std"
import {ApparatDeviceBox, AudioFileBox, AudioUnitBox, NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox, WerkstattSampleBox} from "@opendaw/studio-boxes"
import {ProjectSkeleton, ScriptCompiler, ScriptDsp, TrackType} from "@opendaw/studio-adapters"
import {loadFullEngine} from "./helpers/load-full-engine"
import {connectSyncToEngine} from "./helpers/connect-sync"

const Config = {headerTag: "apparat", registryName: "apparatProcessors", functionName: "apparat"}

const renderExample = async (code: string, pitches: ReadonlyArray<number>, withSample: boolean) => {
    const {boxGraph: source, mandatoryBoxes: {rootBox, primaryAudioBusBox}} =
        ProjectSkeleton.empty({createOutputMaximizer: false, createDefaultUser: false})
    const linked = ScriptDsp.link(code)
    source.beginTransaction()
    const unit = AudioUnitBox.create(source, UUID.generate(), box => {
        box.collection.refer(rootBox.audioUnits)
        box.output.refer(primaryAudioBusBox.input)
        box.index.setValue(1)
    })
    const apparat = ApparatDeviceBox.create(source, UUID.generate(), box => {
        box.host.refer(unit.input)
        box.code.setValue("// @apparat js 1 1\n" + linked)
    })
    if (withSample) {
        const file = AudioFileBox.create(source, UUID.generate(), box => {
            box.startInSeconds.setValue(0.0)
            box.endInSeconds.setValue(0.5)
            box.fileName.setValue("synthetic-wavetable")
        })
        WerkstattSampleBox.create(source, UUID.generate(), box => {
            box.owner.refer(apparat.samples)
            box.label.setValue("wavetable")
            box.index.setValue(0)
            box.file.refer(file)
        })
    }
    const track = TrackBox.create(source, UUID.generate(), box => {
        box.type.setValue(TrackType.Notes)
        box.enabled.setValue(true)
        box.index.setValue(0)
        box.target.refer(unit)
        box.tracks.refer(unit.tracks)
    })
    const events = NoteEventCollectionBox.create(source, UUID.generate())
    pitches.forEach(pitch => NoteEventBox.create(source, UUID.generate(), box => {
        box.events.refer(events.events)
        box.position.setValue(0)
        box.duration.setValue(1920)
        box.pitch.setValue(pitch)
        box.velocity.setValue(0.9)
        box.cent.setValue(0)
    }))
    NoteRegionBox.create(source, UUID.generate(), box => {
        box.regions.refer(track.regions)
        box.events.refer(events.owners)
        box.position.setValue(0)
        box.duration.setValue(7680)
        box.loopDuration.setValue(7680)
    })
    source.endTransaction()
    new Function(ScriptCompiler.wrap(Config, UUID.toString(apparat.address.uuid), 1, linked))()
    const messages: Array<string> = []
    const {engine, memory, drainSamples} = await loadFullEngine(48000, (_uuid, message) => messages.push(message))
    const sync = connectSyncToEngine(engine, memory, source)
    await sync.settle()
    engine.bind()
    await sync.settle()
    if (withSample) {expect(drainSamples()).toBe(1)}
    engine.set_metronome_enabled(0)
    const length = engine.output_len() >>> 0
    engine.stop()
    engine.play()
    let peak = 0, finite = true, tail = 0
    const quanta = 600
    for (let quantum = 0; quantum < quanta; quantum++) {
        engine.render()
        const output = new Float32Array(memory.buffer, engine.output_ptr(), length)
        for (let index = 0; index < length; index++) {
            const value = output[index]
            finite = finite && Number.isFinite(value)
            peak = Math.max(peak, Math.abs(value))
            if (quantum === quanta - 1) {tail = Math.max(tail, Math.abs(value))}
        }
    }
    return {peak, finite, tail, messages}
}

describe("Apparat with the DSP library", () => {
    ScriptDsp.examples.filter(example => example.device === "Apparat").forEach(example => {
        it(`${example.name} renders through the WASM engine`, async () => {
            const withSample = example.code.includes("// @sample wavetable")
            const pitches = example.name.includes("Supersaw") ? [60, 64, 67, 71] : [36]
            const {peak, finite, tail, messages} = await renderExample(example.code, pitches, withSample)
            console.info(`${example.name}: peak ${peak.toFixed(3)}, tail ${tail.toExponential(1)}${withSample ? ", wavetable from // @sample" : ""}`)
            expect(messages).toEqual([])
            expect(finite).toBe(true)
            expect(peak).toBeGreaterThan(0.02)
            expect(peak).toBeLessThan(1.5)
            expect(tail).toBeLessThan(1e-3)
        }, 60000)
    })
})
