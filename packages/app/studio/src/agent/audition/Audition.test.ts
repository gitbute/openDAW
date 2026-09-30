import {describe, expect, it} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AgentToolResult, JsonObject, validateCodexToolboxes} from "@opendaw/studio-codex"
import {ApparatDeviceBox, NoteEventBox, ReverbDeviceBox, VaporisateurDeviceBox} from "@opendaw/studio-boxes"
import type {ScriptHostProtocol} from "@opendaw/studio-scripting"
import type {Project, ProjectEnv} from "@opendaw/studio-core"
import type {AgentRenderEngine} from "@/agent/listen/AgentRenderer"
import {AuditionSpec} from "./AuditionSpec"

// The real offline engine needs a Worker + wasm (browser only): these tests inject a fake engine that derives its
// output from the sandbox project it receives, so they check the sandbox, the variations, the analysis and errors.

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

const unavailable = (): Promise<never> => Promise.reject(new Error("not available in tests"))

const host: ScriptHostProtocol = {
    openProject: () => {}, applyUpdates: () => {}, hasProject: () => Promise.resolve(false), fetchProject: unavailable,
    showInfo: () => Promise.resolve(), addSample: unavailable, listSamples: unavailable, renderMixdown: unavailable,
    saveFile: unavailable, fetchPreset: unavailable, fetchTubularVoice: unavailable
}

type Captured = { frames: number, notes: number, cutoff: number, effects: ReadonlyArray<string>, apparatCode: string }

const boxesOf = <T>(source: Project, type: new (...args: never[]) => T): ReadonlyArray<T> =>
    source.boxGraph.boxes().filter((box): box is T & typeof box => box instanceof type)

// A sine whose amplitude is the Vaporisateur cutoff / 10000 (0.5 for anything else); Apparat code containing
// 'throw' reports a runtime error and renders silence, 'NaN' puts NaNs into the output.
const fakeEngine = (captured: Array<Captured>): AgentRenderEngine =>
    async (source, configuration, _startPpqn, numberOfFrames, sampleRate, _abort, onDeviceMessage) => {
        const cutoff = boxesOf(source, VaporisateurDeviceBox).at(0)?.cutoff.getValue() ?? 5000
        const apparat = boxesOf(source, ApparatDeviceBox).at(0)
        const apparatCode = apparat?.code.getValue() ?? ""
        captured.push({
            frames: numberOfFrames, notes: boxesOf(source, NoteEventBox).length, cutoff, apparatCode,
            effects: source.boxGraph.boxes().filter(box => box instanceof ReverbDeviceBox).map(box => box.name)
        })
        const throws = apparatCode.includes("throw")
        if (throws && isDefined(apparat)) {onDeviceMessage(UUID.toString(apparat.address.uuid), "Runtime error: Error: boom")}
        const amplitude = throws ? 0.0 : cutoff / 10000
        const pairs = Object.keys(configuration.stems ?? {}).length
        return Array.from({length: pairs * 2}, () => Float32Array.from({length: numberOfFrames}, (_value, index) =>
            apparatCode.includes("NaN") && index % 1000 === 0 ? NaN : amplitude * Math.sin(2 * Math.PI * 220 * index / sampleRate)))
    }

// studio-core extends AudioWorkletNode at module load, so the tool is imported after the stub above
const {createAuditionTool, AuditionTool} = await import("./AuditionTool")

const textOf = (result: AgentToolResult): string =>
    result.content.map(item => item.type === "inputText" ? item.text : "").join("")

const payloadOf = (result: AgentToolResult): JsonObject => JSON.parse(textOf(result))

const variationsOf = (result: AgentToolResult): ReadonlyArray<JsonObject> => {
    const {variations} = payloadOf(result)
    return Array.isArray(variations) ? variations.filter((entry): entry is JsonObject =>
        typeof entry === "object" && isDefined(entry) && !Array.isArray(entry)) : []
}

const ValidApparat = [
    "// @param gain 0.5 0 1",
    "class Processor {",
    "    noteOn(pitch, velocity, cent, id) {}",
    "    noteOff(id) {}",
    "    process(output, block) {}",
    "}"
].join("\n")

const createTool = (captured: Array<Captured>, renderView?: (title: string) => Promise<string>, supportsImages = true) =>
    createAuditionTool({
        host, env: createEnv, engine: fakeEngine(captured), supportsImages: () => supportsImages,
        renderView: isDefined(renderView) ? (_render, title) => renderView(title) : undefined
    })

describe("audition schema and arguments", () => {
    it("passes the Codex schema rules, runs concurrently and explains images from code cells", () => {
        const tool = createTool([])
        expect(() => validateCodexToolboxes([{namespace: "daw", description: "test", tools: [tool]}])).not.toThrow()
        expect(tool.concurrent).toBe(true)
        expect(tool.description).toContain("image(line)")
    })
    it("fills defaults: the base sound alone, 2 bars of quarters at 120 bpm", () => {
        const parsed = AuditionSpec.parseArguments({sound: {device: "Nano"}}).result()
        expect(parsed.variations).toEqual([{label: "base", sound: {device: "Nano", preset: undefined, code: undefined, params: []}}])
        expect([parsed.bpm, parsed.bars, parsed.pattern, parsed.views]).toEqual([120, 2, "quarters", []])
        expect(parsed.notes.map(note => note.position)).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
        expect(parsed.notes.every(note => note.pitch === 48)).toBe(true)
    })
    it("merges variation params over the base, replaces code and restarts on another device", () => {
        const parsed = AuditionSpec.parseArguments({
            sound: {device: "Apparat", code: "A", params: [{path: "gain", value: 0.5}, {path: "drive", value: 2}]},
            variations: [
                {label: "hot", params: [{path: "drive", value: 8}]},
                {label: "alt", code: "B"},
                {label: "vapo", device: "Vaporisateur", params: [{path: "cutoff", value: 900}]}
            ]
        }).result()
        const [hot, alt, vapo] = parsed.variations
        expect(hot.sound).toEqual({device: "Apparat", preset: undefined, code: "A", params: [{path: "gain", value: 0.5}, {path: "drive", value: 8}]})
        expect(alt.sound.code).toBe("B")
        expect(alt.sound.params).toHaveLength(2)
        expect(vapo.sound).toEqual({device: "Vaporisateur", preset: undefined, code: undefined, params: [{path: "cutoff", value: 900}]})
    })
    it("converts notes in 16th steps and builds the patterns inside the rendered bars", () => {
        const parsed = AuditionSpec.parseArguments({sound: {device: "Nano"}, bars: 1, notes: [{pitch: 36, position: 2.5, duration: 1}]}).result()
        expect(parsed.notes).toEqual([{pitch: 36, position: 2.5, duration: 1, velocity: 0.8}])
        expect(parsed.pattern).toBeUndefined()
        const sustain = AuditionSpec.patternNotes("sustain", 36, 2)
        expect(sustain).toEqual([{pitch: 36, position: 0, duration: 24, velocity: 0.8}])
        expect(AuditionSpec.patternNotes("16ths", 36, 2)).toHaveLength(32)
        expect(AuditionSpec.patternNotes("chords", 36, 2).filter(note => note.position === 16).map(note => note.pitch)).toEqual([48, 51, 55, 58])
        AuditionSpec.Patterns.forEach(pattern => AuditionSpec.patternNotes(pattern, 60, 4)
            .forEach(note => expect(note.position + note.duration, pattern).toBeLessThanOrEqual(64)))
    })
    it("rejects invalid requests with a helpful message", () => {
        const failure = (args: JsonObject): string => AuditionSpec.parseArguments(args).failureReason()
        expect(failure({})).toMatch(/'sound' is required/)
        expect(failure({sound: {}})).toMatch(/neither a 'device' nor a 'preset'/)
        expect(failure({sound: {device: "Tape"}})).toMatch(/cannot be auditioned/)
        expect(failure({sound: {device: "Nano"}, bars: 5})).toMatch(/'bars' must be an integer 1..4/)
        expect(failure({sound: {device: "Nano"}, pattern: "16ths", notes: [{pitch: 60, position: 0, duration: 1}]})).toMatch(/either 'notes' or 'pattern'/)
        expect(failure({sound: {device: "Nano"}, pattern: "polka"})).toMatch(/'pattern' must be one of/)
        expect(failure({sound: {device: "Nano"}, bars: 1, notes: [{pitch: 60, position: 16, duration: 1}]})).toMatch(/after the 1 rendered bar/)
        expect(failure({sound: {device: "Nano"}, variations: [{label: "a"}, {label: "a"}]})).toMatch(/Duplicate variation label 'a'/)
        expect(failure({sound: {device: "Nano"}, variations: Array.from({length: 5}, (_value, index) => ({label: `v${index}`}))}))
            .toMatch(/at most 4/)
        expect(failure({sound: {device: "Nano", params: [{path: "release", value: {}}]}})).toMatch(/number, boolean or string 'value'/)
    })
})

describe("audition rendering", () => {
    it("renders each variation in its own sandbox and reports loudness matched to the quietest", async () => {
        const captured: Array<Captured> = []
        const result = await createTool(captured).execute({
            sound: {device: "Vaporisateur", params: [{path: "cutoff", value: 2000}]},
            effects: [{device: "Reverb", params: [{path: "decay", value: 0.4}]}],
            pattern: "8ths", bars: 2, bpm: 120,
            variations: [{label: "dark", params: [{path: "cutoff", value: 1000}]}, {label: "mid"}, {label: "bright", params: [{path: "cutoff", value: 4000}]}]
        })
        expect(result.ok).toBe(true)
        expect(captured.map(entry => entry.cutoff).sort((left, right) => left - right)).toEqual([1000, 2000, 4000])
        expect(captured.every(entry => entry.frames === 5 * 48_000), "2 bars at 120 bpm plus the 1 s tail").toBe(true)
        expect(captured.every(entry => entry.notes === 16 && entry.effects.length === 1)).toBe(true)
        const [dark, mid, bright] = variationsOf(result)
        expect([dark.label, mid.label, bright.label]).toEqual(["dark", "mid", "bright"])
        expect(dark.gainToMatchDb).toBe(0)
        expect(Number(mid.gainToMatchDb)).toBeCloseTo(-6.0, 0)
        expect(Number(bright.gainToMatchDb)).toBeCloseTo(-12.0, 0)
        expect(Number(bright.lufs) - Number(dark.lufs)).toBeCloseTo(12.0, 0)
        expect(dark.silent).toBe(false)
        expect(payloadOf(result).loudnessMatch).toMatchObject({reference: "dark"})
        expect(result.content.filter(item => item.type === "inputImage")).toHaveLength(0)
    })
    it("reports an Apparat that does not compile without rendering it and one that throws at runtime", async () => {
        const captured: Array<Captured> = []
        const result = await createTool(captured).execute({
            sound: {device: "Apparat", code: ValidApparat},
            variations: [
                {label: "ok", params: [{path: "gain", value: 0.25}]},
                {label: "broken", code: "class Processor { process( {"},
                {label: "throws", code: `${ValidApparat}\nthrow new Error("boom")`}
            ]
        })
        expect(result.ok).toBe(true)
        expect(captured).toHaveLength(2)
        const [ok, broken, throws] = variationsOf(result)
        expect(ok.silent).toBe(false)
        expect(ok.deviceErrors).toBeUndefined()
        expect(String(broken.error)).toMatch(/^Apparat code does not compile: /)
        expect(throws.silent).toBe(true)
        expect(throws.lufs).toBeNull()
        expect(throws.deviceErrors).toEqual(["Sound: Runtime error: Error: boom"])
        expect(payloadOf(result).loudnessMatch).toMatchObject({reference: "ok"})
    })
    it("fails a variation on unknown params and lists what exists", async () => {
        const result = await createTool([]).execute({
            sound: {device: "Vaporisateur"},
            variations: [
                {label: "typo", params: [{path: "cutof", value: 100}]},
                {label: "apparat", device: "Apparat", code: ValidApparat, params: [{path: "gian", value: 1}]},
                {label: "nocode", device: "Apparat"},
                {label: "effect", device: "Nano", code: ValidApparat}
            ]
        })
        const [typo, apparat, nocode, effect] = variationsOf(result)
        expect(String(typo.error)).toMatch(/Setup failed: .*cutof: unknown property\. Paths of Vaporisateur: .*cutoff/)
        expect(String(apparat.error)).toMatch(/No parameter 'gian' declared\. Available: gain/)
        expect(String(nocode.error)).toMatch(/Apparat needs 'code'/)
        expect(String(effect.error)).toMatch(/'code' needs an Apparat instrument, the sound is Nano/)
        expect(payloadOf(result).loudnessMatch).toBeNull()
    })
    it("counts NaN samples and keeps the metrics finite", async () => {
        const result = await createTool([]).execute({sound: {device: "Apparat", code: `${ValidApparat}\n// NaN`}})
        const [base] = variationsOf(result)
        expect(Number(base.nonFiniteSamples)).toBeGreaterThan(0)
        expect(Number.isFinite(Number(base.lufs))).toBe(true)
    })
    it("attaches one matched-loudness spectrogram per audible variation", async () => {
        const titles: Array<string> = []
        const renderView = async (title: string): Promise<string> => {
            titles.push(title)
            return `data:image/png;base64,${titles.length}`
        }
        const result = await createTool([], renderView).execute({
            sound: {device: "Vaporisateur", params: [{path: "cutoff", value: 1000}]}, views: ["spectrogram"],
            variations: [{label: "quiet"}, {label: "loud", params: [{path: "cutoff", value: 2000}]},
                {label: "silent", device: "Apparat", code: `${ValidApparat}\nthrow 1`}]
        })
        const images = result.content.filter(item => item.type === "inputImage")
        expect(images).toHaveLength(2)
        expect(titles[0]).toBe("quiet (0.0 dB)")
        expect(titles[1]).toMatch(/^loud \(-6\.\d dB\)$/)
        expect(variationsOf(result).map(entry => entry.image)).toEqual([0, 1, undefined])
        const withoutImages = await createTool([], renderView, false).execute({sound: {device: "Nano"}, views: ["spectrogram"]})
        expect(withoutImages.content.filter(item => item.type === "inputImage")).toHaveLength(0)
        expect(payloadOf(withoutImages).notes).toEqual(["The current model does not accept images; views were skipped."])
    })
    it("renders the variations concurrently", async () => {
        let running = 0
        let maxRunning = 0
        const engine: AgentRenderEngine = async (source, configuration, startPpqn, frames, sampleRate, abort, onMessage) => {
            running++
            maxRunning = Math.max(maxRunning, running)
            await new Promise(resolve => setTimeout(resolve, 5))
            running--
            return fakeEngine([])(source, configuration, startPpqn, frames, sampleRate, abort, onMessage)
        }
        const tool = createAuditionTool({host, env: createEnv, engine})
        const result = await tool.execute({sound: {device: "Nano"}, variations: [{label: "a"}, {label: "b"}, {label: "c"}]})
        expect(result.ok).toBe(true)
        expect(maxRunning).toBe(3)
        expect(AuditionTool.countNonFinite([Float32Array.of(0, NaN, Infinity)])).toBe(2)
        expect(PPQN.SemiQuaver * 16).toBe(PPQN.Bar)
    })
})
