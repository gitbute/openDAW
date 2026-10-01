import {describe, expect, it} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioBusFactory, InstrumentFactories, ProjectSkeleton} from "@opendaw/studio-adapters"
import {
    AuxSendBox,
    CompressorDeviceBox,
    MarkerBox,
    SignatureEventBox,
    WerkstattParameterBox
} from "@opendaw/studio-boxes"
import {AudioSendRouting, AudioUnitType, Colors} from "@opendaw/studio-enums"
import type {AgentToolResult, JsonObject} from "@opendaw/studio-codex"

if (!isDefined(Reflect.get(globalThis, "AudioWorkletNode"))) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}

const sampleManager = () => ({
    getOrCreate: (uuid: UUID.Bytes) => ({
        get data() {return Option.None}, get peaks() {return Option.None}, get uuid() {return uuid},
        get state() {return {type: "idle"} as const}, invalidate() {}, subscribe: () => Terminable.Empty
    }), record: () => {}, invalidate: () => {}, remove: () => {}, register: () => Terminable.Empty
})

const Bar = PPQN.Bar
const Sixteenth = PPQN.SemiQuaver

const setup = async () => {
    const {Project, EffectFactories} = await import("@opendaw/studio-core")
    const {createInspectProjectTool} = await import("./InspectProject")
    const {createInspectNotesTool} = await import("./InspectNotes")
    const skeleton = ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false})
    const project = Project.fromSkeleton({
        audioContext: undefined, audioWorklets: undefined, sampleManager: sampleManager(),
        soundfontManager: undefined, sampleService: undefined, soundfontService: undefined
    } as never, skeleton)
    const {api, boxGraph, timelineBox} = project
    project.editing.modify(() => {
        timelineBox.bpm.setValue(124)
        timelineBox.durationInPulses.setValue(Bar * 8)
        MarkerBox.create(boxGraph, UUID.generate(), box => {
            box.position.setValue(Bar * 4)
            box.label.setValue("Drop")
            box.track.refer(timelineBox.markerTrack.markers)
        })
        const drums = api.createInstrument(InstrumentFactories.Vaporisateur, {name: "Drums"})
        const bass = api.createInstrument(InstrumentFactories.Vaporisateur, {name: "Bass"})
        const bass2 = api.createInstrument(InstrumentFactories.Vaporisateur, {name: "Bass"})
        bass2.instrumentBox.label.setValue("Bass")
        const script = api.createInstrument(InstrumentFactories.Apparat, {name: "Lead"})
        script.instrumentBox.code.setValue("// @param cutoff 0.5\n// @param drive\nclass Processor {}")
        WerkstattParameterBox.create(boxGraph, UUID.generate(), box => {
            box.owner.refer(script.instrumentBox.parameters)
            box.label.setValue("cutoff")
            box.value.setValue(0.25)
        })
        api.insertEffect(bass.audioUnitBox.audioEffects, EffectFactories.Delay)
        const compressor = api.insertEffect(bass2.audioUnitBox.audioEffects, EffectFactories.Compressor)
        if (compressor instanceof CompressorDeviceBox) {compressor.sideChain.refer(drums.audioUnitBox)}
        const reverb = AudioBusFactory.create(project.skeleton, "Reverb", "AudioBus", AudioUnitType.Aux, Colors.blue)
        AuxSendBox.create(boxGraph, UUID.generate(), box => {
            box.routing.setValue(AudioSendRouting.Pre)
            box.sendGain.setValue(-6)
            box.audioUnit.refer(bass.audioUnitBox.auxSends)
            box.targetBus.refer(reverb.input)
        })
        bass.audioUnitBox.mute.setValue(true)
        const region = api.createNoteRegion({trackBox: bass.trackBox, position: 0, duration: Bar * 2, loopDuration: Bar, name: "Riff"})
        api.createNoteEvent({owner: region, position: 0, duration: Sixteenth, pitch: 36})
        api.createNoteEvent({owner: region, position: Sixteenth * 4, duration: Sixteenth * 3, pitch: 36, velocity: 0.5})
        api.createNoteEvent({owner: region, position: Sixteenth * 8, duration: Sixteenth, pitch: 43, velocity: 0.8})
        const drumRegion = api.createNoteRegion({trackBox: drums.trackBox, position: Bar * 4, duration: Bar})
        api.createNoteEvent({owner: drumRegion, position: 0, duration: Sixteenth, pitch: 36})
        api.createNoteEvent({owner: drumRegion, position: Sixteenth * 2 + 10, duration: Sixteenth, pitch: 42})
    })
    return {project, createInspectProjectTool, createInspectNotesTool}
}

const textOf = (result: AgentToolResult): string =>
    result.content.map(item => item.type === "inputText" ? item.text : "").join("")

const jsonOf = (result: AgentToolResult): JsonObject => JSON.parse(textOf(result))

describe("inspect_project", () => {
    it("summarises timeline, units, chains, mixer and regions", async () => {
        const {project, createInspectProjectTool} = await setup()
        const tool = createInspectProjectTool(() => project)
        const result = await tool.execute({})
        expect(result.ok).toBe(true)
        const snapshot = jsonOf(result)
        expect(snapshot).toMatchObject({
            bpm: 124, signature: "4/4", lengthBars: 8,
            loop: {enabled: false, from: "1.1", to: "5.1"},
            markers: [{at: "5.1", label: "Drop"}]
        })
        const units = snapshot.units as ReadonlyArray<JsonObject>
        expect(units.map(unit => unit.label)).toEqual(["Drums", "Bass", "Bass #2", "Lead", "Reverb", "Output"])
        expect(units.map(unit => unit.kind)).toEqual(["instrument", "instrument", "instrument", "instrument", "aux", "output"])
        const [drums, bass, bass2, lead] = units
        expect(bass).toMatchObject({
            instrument: {type: "Vaporisateur"},
            audioFx: [{type: "Delay"}],
            mixer: {volumeDb: 0, pan: 0, mute: true, sends: [{to: "Reverb", levelDb: -6, routing: "pre"}]},
            tracks: [{type: "notes", regions: [{at: "1.1", len: "2.0", label: "Riff", notes: 3, loop: "1.0"}]}]
        })
        expect(bass2).toMatchObject({audioFx: [{type: "Compressor", sidechain: ["Drums"]}]})
        expect(drums).toMatchObject({tracks: [{regions: [{at: "5.1", len: "1.0", notes: 2}]}]})
        expect(lead).toMatchObject({instrument: {type: "Apparat", script: {params: {cutoff: expect.any(String), drive: 0}}}})
        expect(JSON.stringify(snapshot).includes("params\":{\"")).toBe(true)
        expect(textOf(result).length).toBeLessThan(6000)
    })

    it("summarizes regions per track in large projects and keeps focus detailed", async () => {
        const {project, createInspectProjectTool} = await setup()
        project.editing.modify(() => {
            Array.from({length: 8}, (_, unitIndex) => {
                const {trackBox} = project.api.createInstrument(InstrumentFactories.Vaporisateur, {name: `Synth ${unitIndex}`})
                Array.from({length: 40}, (_, index) => project.api.createNoteRegion({
                    trackBox, position: Bar * index, duration: Bar, name: index % 2 === 0 ? "Verse" : `Fill ${index}`
                }))
            })
        })
        const tool = createInspectProjectTool(() => project)
        const text = textOf(await tool.execute({}))
        expect(text.length).toBeLessThanOrEqual(8_100)
        const snapshot = JSON.parse(text)
        expect(snapshot.note).toContain("focus=")
        const synth = (snapshot.units as ReadonlyArray<JsonObject>).find(unit => unit.label === "Synth 0")
        const [track] = synth?.tracks as ReadonlyArray<JsonObject>
        expect(track.regions).toEqual({count: 40, span: "1.1-41.1", labels: ["Verse", "Fill 1", "Fill 3", "Fill 5", "Fill 7", "Fill 9", "Fill 11", "Fill 13"], moreLabels: 13})
        const focused = jsonOf(await tool.execute({focus: "Synth 0"}))
        const [unit] = focused.units as ReadonlyArray<JsonObject>
        const [focusedTrack] = unit.tracks as ReadonlyArray<JsonObject>
        expect(focusedTrack.regions).toHaveLength(40)
    })

    it("includes all device parameters for a focused unit", async () => {
        const {project, createInspectProjectTool} = await setup()
        const tool = createInspectProjectTool(() => project)
        const snapshot = jsonOf(await tool.execute({focus: "bass #2"}))
        const units = snapshot.units as ReadonlyArray<JsonObject>
        expect(units).toHaveLength(1)
        const [unit] = units
        expect(unit.label).toBe("Bass #2")
        const [compressor] = unit.audioFx as ReadonlyArray<JsonObject>
        expect(Object.keys(compressor.params as JsonObject).length).toBeGreaterThan(3)
        const instrument = unit.instrument as JsonObject
        expect(Object.keys(instrument.params as JsonObject).length).toBeGreaterThan(3)
    })

    it("fails on unknown focus and reports signature changes", async () => {
        const {project, createInspectProjectTool} = await setup()
        const tool = createInspectProjectTool(() => project)
        const failure = await tool.execute({focus: "Nope"})
        expect(failure.ok).toBe(false)
        expect(textOf(failure)).toContain("Bass #2")
        project.editing.modify(() => SignatureEventBox.create(project.boxGraph, UUID.generate(), box => {
            box.events.refer(project.timelineBox.signatureTrack.events)
            box.relativePosition.setValue(2)
            box.nominator.setValue(7)
            box.denominator.setValue(8)
            box.index.setValue(0)
        }))
        const snapshot = jsonOf(await tool.execute({}))
        expect(snapshot.signatureChanges).toEqual([{bar: 3, signature: "7/8"}])
    })
})

describe("inspect_notes", () => {
    it("renders looped region content as a 16th grid with merged bars", async () => {
        const {project, createInspectNotesTool} = await setup()
        const tool = createInspectNotesTool(() => project)
        const result = await tool.execute({unit: "Bass"})
        const lines = textOf(result).split("\n")
        expect(lines[0]).toContain("Bass · bars 1-2 · 4/4 · 6 notes")
        expect(lines.slice(1)).toEqual([
            "bars 1-2:",
            "G1/43   ........8.......",
            "C1/36   x...5--........."
        ])
    })

    it("lists notes with bar.beat.tick positions and marks off-grid onsets", async () => {
        const {project, createInspectNotesTool} = await setup()
        const tool = createInspectNotesTool(() => project)
        const list = textOf(await tool.execute({unit: "Drums", format: "list"})).split("\n")
        expect(list.slice(1)).toEqual(["5.1.0 36(C1) 240 1.00", "5.1.490 42(F#1) 240 1.00"])
        const grid = textOf(await tool.execute({unit: "Drums", bars: {from: 4, to: 5}})).split("\n")
        expect(grid.slice(1)).toEqual([
            "bar 4: rest",
            "bar 5:",
            "F#1/42  ..x-............",
            "C1/36   x...............",
            "(1 onsets off the 16th grid)"
        ])
    })

    it("shows several parts together with a shared onset row", async () => {
        const {project, createInspectNotesTool} = await setup()
        const tool = createInspectNotesTool(() => project)
        const lines = textOf(await tool.execute({units: ["Bass", "Drums"], bars: {from: 1, to: 5}})).split("\n")
        expect(lines[0]).toContain("Bass + Drums · bars 1-5")
        expect(lines[0]).toContain("all = which part starts a note")
        expect(lines.slice(1)).toEqual([
            "bars 1-2:",
            "[1 Bass]",
            "G1/43   ........8.......",
            "C1/36   x...5--.........",
            "[2 Drums] rest",
            "all     1...1...1.......",
            "bars 3-4: rest",
            "bar 5:",
            "[1 Bass] rest",
            "[2 Drums]",
            "F#1/42  ..x-............",
            "C1/36   x...............",
            "(1 onsets off the 16th grid)",
            "all     2.2............."
        ])
        expect((await tool.execute({units: ["Bass", "Nope"]})).ok).toBe(false)
        expect((await tool.execute({})).ok).toBe(false)
    })

    it("attaches a rendered piano roll and validates arguments", async () => {
        const {project, createInspectNotesTool} = await setup()
        const tool = createInspectNotesTool(() => project,
            async (notes, range) => `data:image/png;base64,${notes.length}-${range.to - range.from}`)
        const result = await tool.execute({unit: "Bass", bars: {from: 1, to: 1}, image: true})
        expect(result.content.at(-1)).toEqual({type: "inputImage", imageUrl: `data:image/png;base64,3-${Bar}`})
        expect((await tool.execute({unit: "Nope"})).ok).toBe(false)
        expect((await tool.execute({unit: "Bass", bars: {from: 3, to: 2}})).ok).toBe(false)
        expect((await tool.execute({unit: "Bass", format: "piano"})).ok).toBe(false)
        expect(textOf(await tool.execute({unit: "Reverb"}))).toBe("Reverb: no note regions")
    })
})
