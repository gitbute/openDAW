import {describe, expect, it} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioBusFactory, ExportConfiguration, InstrumentFactories, ProjectSkeleton} from "@opendaw/studio-adapters"
import {AudioSinkDeviceBox, AuxSendBox} from "@opendaw/studio-boxes"
import {AudioUnitType, Colors, IconSymbol} from "@opendaw/studio-enums"
import type {Project, ProjectEnv} from "@opendaw/studio-core"
import type {AgentRenderEngine} from "./AgentRenderer"

// The real offline engine needs a Worker + wasm (browser only), so these tests inject a fake engine and check
// everything around it: labels, the stem configuration, the render window, the untouched live project and warnings.

if (!isDefined(Reflect.get(globalThis, "AudioWorkletNode"))) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}

const createEnv = (): ProjectEnv => ({
    audioContext: undefined, audioWorklets: undefined, soundfontManager: undefined, sampleService: undefined,
    soundfontService: undefined,
    sampleManager: {
        getOrCreate: (uuid: UUID.Bytes) => ({
            get data() {return Option.None},
            get peaks() {return Option.None},
            get uuid() {return uuid},
            get state() {return {type: "idle"} as const},
            invalidate() {},
            subscribe: () => Terminable.Empty
        }),
        record: () => {}, invalidate: () => {}, remove: () => {}, register: () => Terminable.Empty
    }
}) as unknown as ProjectEnv

const createProject = async (): Promise<Project> => {
    const {Project} = await import("@opendaw/studio-core")
    const project = Project.fromSkeleton(createEnv(), ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false}))
    project.editing.modify(() => {
        ;["Bass", "Keys", "Bass"].forEach((label, index) => {
            const {instrumentBox, trackBox} = project.api.createAnyInstrument(InstrumentFactories.Vaporisateur)
            instrumentBox.label.setValue(label)
            if (index < 2) {project.api.createNoteRegion({trackBox, position: 0, duration: 4 * PPQN.Bar})}
        })
        project.timelineBox.loopArea.enabled.setValue(true)
        project.timelineBox.bpm.setValue(120)
    })
    return project
}

type Captured = { configuration: ExportConfiguration, startPpqn: number, frames: number, loopEnabled: boolean }

const fakeEngine = (captured: Array<Captured>, level: (stemIndex: number) => number,
                    message?: (source: Project) => [string, string]): AgentRenderEngine =>
    async (source, configuration, startPpqn, numberOfFrames, _sampleRate, _abort, onDeviceMessage) => {
        captured.push({configuration, startPpqn, frames: numberOfFrames, loopEnabled: source.timelineBox.loopArea.enabled.getValue()})
        if (isDefined(message)) {onDeviceMessage(...message(source))}
        const pairs = Object.keys(configuration.stems ?? {}).length
        return Array.from({length: pairs * 2}, (_value, index) => new Float32Array(numberOfFrames).fill(level(Math.floor(index / 2))))
    }

// studio-core extends AudioWorkletNode at module load, so it is imported after the stub above
const {AgentRenderer} = await import("./AgentRenderer")

describe("AgentRenderer", () => {
    it("renders mix and disambiguated stems in one pass over exactly the requested bars", async () => {
        const project = await createProject()
        const captured: Array<Captured> = []
        const render = await AgentRenderer.render(project, {bars: {from: 2, to: 3}, stems: "all"}, undefined,
            {engine: fakeEngine(captured, index => 0.1 * (index + 1)), sampleRate: 48_000})
        expect(captured).toHaveLength(1)
        const [{configuration, startPpqn, frames, loopEnabled}] = captured
        expect(startPpqn).toBe(PPQN.Bar)
        expect(frames).toBe(4 * 48_000)
        expect(loopEnabled, "the render copy has the loop area disabled").toBe(false)
        expect(project.timelineBox.loopArea.enabled.getValue(), "the live project is untouched").toBe(true)
        const keys = Object.keys(configuration.stems ?? {})
        expect(keys[0]).toBe(UUID.toString(project.primaryAudioUnitBox.address.uuid))
        expect(Object.values(configuration.stems ?? {}).map(stem => stem.fileName)).toEqual(["Mix", "Bass", "Keys", "Bass #2"])
        expect(render.mix[0][0]).toBeCloseTo(0.1, 6)
        expect(render.stems.map(stem => stem.label)).toEqual(["Bass", "Keys", "Bass #2"])
        expect(render.stems[2].channels[0][0]).toBeCloseTo(0.4, 6)
        expect(render.barStartFrames).toEqual([0, 2 * 48_000])
        expect(render.durationSeconds).toBe(4)
        expect(render.startSeconds).toBe(2)
        expect(render.bars).toEqual({from: 2, to: 3})
        expect(render.warnings).toEqual([])
        project.terminate()
    })
    it("renders only the mix for stems 'none' and the whole arrangement by default", async () => {
        const project = await createProject()
        const captured: Array<Captured> = []
        const render = await AgentRenderer.render(project, {}, undefined,
            {engine: fakeEngine(captured, () => 0.5), sampleRate: 48_000})
        expect(Object.keys(captured[0].configuration.stems ?? {})).toHaveLength(1)
        expect(render.bars).toEqual({from: 1, to: 4})
        expect(render.stems).toEqual([])
        project.terminate()
    })
    it("records which units feed which and warns about live mute and solo", async () => {
        const project = await createProject()
        project.editing.modify(() => {
            const group = AudioBusFactory.create(project.skeleton, "Group", IconSymbol.AudioBus, AudioUnitType.Bus, Colors.orange)
            const echo = AudioBusFactory.create(project.skeleton, "Echo", IconSymbol.AudioBus, AudioUnitType.Aux, Colors.blue)
            const [bass, keys] = project.rootBoxAdapter.audioUnits.adapters().filter(unit => !unit.isOutput)
            bass.box.output.refer(group.input)
            AuxSendBox.create(project.boxGraph, UUID.generate(), box => {
                box.audioUnit.refer(keys.box.auxSends)
                box.targetBus.refer(echo.input)
            })
            keys.box.mute.setValue(true)
            bass.box.solo.setValue(true)
        })
        const render = await AgentRenderer.render(project, {bars: {from: 1, to: 1}, stems: "all"}, undefined,
            {engine: fakeEngine([], index => index <= 1 ? 0.5 : 0), sampleRate: 48_000})
        const feeds = Object.fromEntries(render.stems.map(({label, feeds}) => [label, feeds]))
        expect(feeds).toEqual({Bass: ["Group"], Keys: ["Echo"], "Bass #2": [], Group: [], Echo: []})
        expect(render.warnings.some(warning => warning.includes("muted units: Keys"))).toBe(true)
        expect(render.warnings.some(warning => warning.includes("soloed units: Bass."))).toBe(true)
        expect(render.warnings.some(warning => warning.includes("is silent (peak")), "silenced units are expected to be silent").toBe(false)
        project.terminate()
    })
    it("treats units routed into a bus by a Sink device as feeding it, so masking skips the pair", async () => {
        const {ListenAnalysis} = await import("@/agent/analysis/ListenAnalysis")
        const project = await createProject()
        project.editing.modify(() => {
            const drumBus = AudioBusFactory.create(project.skeleton, "Drum Bus", IconSymbol.AudioBus, AudioUnitType.Bus, Colors.orange)
            const bassBus = AudioBusFactory.create(project.skeleton, "Bass Bus", IconSymbol.AudioBus, AudioUnitType.Bus, Colors.blue)
            const [kick, sub] = project.rootBoxAdapter.audioUnits.adapters().filter(unit => !unit.isOutput)
            kick.box.output.defer()
            AudioSinkDeviceBox.create(project.boxGraph, UUID.generate(), box => {
                box.host.refer(kick.box.audioEffects)
                box.index.setValue(0)
                box.targetBus.refer(drumBus.input)
            })
            sub.box.output.refer(bassBus.input)
        })
        const pulse = (numberOfFrames: number): Float32Array => Float32Array.from({length: numberOfFrames}, (_value, index) =>
            Math.sin(2.0 * Math.PI * 50 * index / 48_000) * Math.exp(-(index % 24_000) / 2_400) * 0.5)
        const engine: AgentRenderEngine = async (_source, configuration, _startPpqn, numberOfFrames) =>
            Array.from({length: Object.keys(configuration.stems ?? {}).length * 2}, () => pulse(numberOfFrames))
        const render = await AgentRenderer.render(project, {bars: {from: 1, to: 4}, stems: "all"}, undefined, {engine, sampleRate: 48_000})
        expect(Object.fromEntries(render.stems.map(({label, feeds}) => [label, feeds])))
            .toEqual({Bass: ["Drum Bus"], Keys: ["Bass Bus"], "Bass #2": [], "Drum Bus": [], "Bass Bus": []})
        const masking = ListenAnalysis.analyze(render).masking
        const pairs = Array.isArray(masking) ? masking.map(entry => JSON.stringify(entry)) : []
        expect(pairs.some(entry => entry.includes("\"Bass\",\"Keys\""))).toBe(true)
        expect(pairs.some(entry => entry.includes("\"Bass\",\"Drum Bus\""))).toBe(false)
        expect(pairs.some(entry => entry.includes("\"Keys\",\"Bass Bus\""))).toBe(false)
        project.terminate()
    })
    it("reports silent stems with content, script messages by unit and rejects unknown labels", async () => {
        const project = await createProject()
        const keysDevice = (source: Project): [string, string] => {
            const unit = source.rootBoxAdapter.audioUnits.adapters().find(adapter => adapter.label === "Keys")
            return [UUID.toString(unit?.input.adapter().unwrap().uuid ?? UUID.Lowest), "Runtime error: boom"]
        }
        const render = await AgentRenderer.render(project, {bars: {from: 1, to: 2}, stems: ["Keys", "Bass #2"]}, undefined,
            {engine: fakeEngine([], index => index === 0 ? 0.5 : 0), sampleRate: 48_000})
        expect(render.stems.map(stem => [stem.label, stem.silent])).toEqual([["Keys", true], ["Bass #2", true]])
        expect(render.warnings.some(warning => warning.startsWith("'Keys' is silent"))).toBe(true)
        expect(render.warnings.some(warning => warning.startsWith("'Bass #2' is silent")), "no regions, no warning").toBe(false)
        const withMessage = await AgentRenderer.render(project, {bars: {from: 1, to: 1}, stems: "none"}, undefined,
            {engine: fakeEngine([], () => 0.5, keysDevice), sampleRate: 48_000})
        expect(withMessage.warnings).toContain("Keys: Runtime error: boom")
        await expect(AgentRenderer.render(project, {stems: ["Drums"]}, undefined, {engine: fakeEngine([], () => 0)}))
            .rejects.toThrow(/Unknown stem\(s\): Drums\. Available: Bass, Keys, Bass #2/)
        project.terminate()
    })
})
