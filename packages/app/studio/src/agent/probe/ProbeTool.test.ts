import {describe, expect, it} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {AgentToolResult, JsonObject, validateCodexToolboxes} from "@opendaw/studio-codex"
import {ApparatDeviceBox, AudioUnitBox, ReverbDeviceBox, WerkstattDeviceBox, WerkstattParameterBox} from "@opendaw/studio-boxes"
import type {ScriptHostProtocol} from "@opendaw/studio-scripting"
import type {ProjectEnv} from "@opendaw/studio-core"
import type {AgentRenderEngine} from "@/agent/listen/AgentRenderer"
import type {ViewContext} from "@/agent/listen/ViewKit"
import {ProbeSignals} from "./ProbeSignals"
import {ProbeChart, ProbeViews} from "./ProbeViews"

// The real offline engine needs a Worker + wasm (browser only). This fake engine renders every requested unit by
// running the scripts the sandbox put into it: the generated Apparat test signal, the +12 dB Werkstatt and any
// Werkstatt in the chain (other devices pass the signal through). So the generator code, the sandbox layout and
// the measurements are exercised end to end; only real device DSP and the engine's block scheduling are not.

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

type ScriptProcessor = {
    noteOn?(pitch: number, velocity: number, cent: number, id: number): void
    paramChanged?(label: string, value: number): void
    process(first: unknown, block: { s0: number, s1: number }): void
}

type Captured = { units: number, frames: number, others: Array<string>, generatorPeak: number, werkstatts: number }

const Block = 128

const instantiate = (code: string, tag: string, sampleRate: number): ScriptProcessor => {
    const userCode = code.replace(new RegExp(`^// @${tag} \\w+ \\d+ \\d+\\n`), "")
    const create = new Function("sampleRate", `${userCode}\nreturn Processor`) as (rate: number) => new () => ScriptProcessor
    return new (create(sampleRate))()
}

const fakeEngine = (captured: Array<Captured>): AgentRenderEngine =>
    async (source, configuration, _startPpqn, frames, sampleRate) => {
        const record: Captured = {units: 0, frames, others: [], generatorPeak: 0, werkstatts: 0}
        captured.push(record)
        return Object.keys(configuration.stems ?? {}).flatMap(key => {
            const silence = [new Float32Array(frames), new Float32Array(frames)]
            const unit = source.boxGraph.boxes().find((box): box is AudioUnitBox => box instanceof AudioUnitBox && UUID.toString(box.address.uuid) === key)
            if (!isDefined(unit)) {return silence}
            const apparat = source.boxGraph.boxes().find((box): box is ApparatDeviceBox => box instanceof ApparatDeviceBox
                && box.host.targetVertex.mapOr(vertex => vertex.box === unit, false))
            if (!isDefined(apparat)) {return silence}
            record.units++
            const generator = instantiate(apparat.code.getValue(), "apparat", sampleRate)
            let channels = [new Float32Array(frames), new Float32Array(frames)]
            generator.noteOn?.(60, 1, 0, 1)
            for (let s0 = 0; s0 < frames; s0 += Block) {generator.process(channels, {s0, s1: Math.min(frames, s0 + Block)})}
            record.generatorPeak = Math.max(record.generatorPeak, ...channels.map(channel => channel.reduce((max, value) => Math.max(max, Math.abs(value)), 0)))
            const effects = unit.audioEffects.pointerHub.incoming().map(pointer => pointer.box)
            const werkstatts = effects.filter((box): box is WerkstattDeviceBox => box instanceof WerkstattDeviceBox)
                .sort((first, second) => first.index.getValue() - second.index.getValue())
            record.others.push(...effects.filter(box => !(box instanceof WerkstattDeviceBox))
                .map(box => box instanceof ReverbDeviceBox ? "Reverb" : box.name))
            record.werkstatts += werkstatts.length
            werkstatts.forEach(werkstatt => {
                const processor = instantiate(werkstatt.code.getValue(), "werkstatt", sampleRate)
                werkstatt.parameters.pointerHub.incoming().map(pointer => pointer.box)
                    .filter((box): box is WerkstattParameterBox => box instanceof WerkstattParameterBox)
                    .forEach(parameter => processor.paramChanged?.(parameter.label.getValue(), parameter.value.getValue()))
                const out = [new Float32Array(frames), new Float32Array(frames)]
                for (let s0 = 0; s0 < frames; s0 += Block) {processor.process({src: channels, out}, {s0, s1: Math.min(frames, s0 + Block)})}
                channels = out
            })
            return channels
        })
    }

const {createProbeTool, ProbeTool} = await import("./ProbeTool")

const createTool = (captured: Array<Captured>, supportsImages = true, plots: Array<string> = [], engine?: AgentRenderEngine,
                    charts: Array<ProbeChart> = []) =>
    createProbeTool({
        host, env: createEnv, engine: engine ?? fakeEngine(captured), supportsImages: () => supportsImages,
        plot: async chart => {
            plots.push(chart.title)
            charts.push(chart)
            return `data:image/png;base64,${plots.length}`
        }
    })

// records what the chart code draws (no canvas in node)
const createRecorder = () => {
    const texts: Array<string> = []
    const methods: Record<string, unknown> = {
        fillText: (text: string) => {texts.push(text)},
        measureText: (text: string) => ({width: text.length * 6})
    }
    const context = new Proxy(methods, {
        get: (target, key: string) => Reflect.has(target, key) ? target[key] : () => {},
        set: (target, key: string, value) => {
            target[key] = value
            return true
        }
    }) as unknown as ViewContext
    return {context, texts}
}

const textOf = (result: AgentToolResult): string => result.content.map(item => item.type === "inputText" ? item.text : "").join("")

const payloadOf = (result: AgentToolResult): JsonObject => JSON.parse(textOf(result))

const objectOf = (value: unknown): JsonObject => typeof value === "object" && isDefined(value) && !Array.isArray(value) ? value as JsonObject : {}

const chainsOf = (result: AgentToolResult): ReadonlyArray<JsonObject> => {
    const {chains} = payloadOf(result)
    return Array.isArray(chains) ? chains.map(objectOf) : []
}

const SoftClip = [
    "// @param drive 2 1 20 linear",
    "class Processor {",
    "    drive = 2",
    "    paramChanged(label, value) {if (label === \"drive\") this.drive = value}",
    "    process({src, out}, {s0, s1}) {",
    "        for (let channel = 0; channel < 2; channel++) {",
    "            for (let index = s0; index < s1; index++) {out[channel][index] = Math.tanh(src[channel][index] * this.drive) / this.drive}",
    "        }",
    "    }",
    "}"
].join("\n")

const FeedbackDelay = [
    "class Processor {",
    "    buffer = new Float32Array(Math.round(sampleRate * 0.25))",
    "    position = 0",
    "    process({src, out}, {s0, s1}) {",
    "        for (let index = s0; index < s1; index++) {",
    "            const delayed = this.buffer[this.position]",
    "            this.buffer[this.position] = src[0][index] + delayed * 0.5",
    "            this.position = (this.position + 1) % this.buffer.length",
    "            out[0][index] = src[0][index] + delayed",
    "            out[1][index] = src[1][index] + delayed",
    "        }",
    "    }",
    "}"
].join("\n")

// feed-forward: peak level with 5 ms decay, gain reduction smoothed in dB (10 ms attack, 100 ms release), -20 dBFS 4:1
const Compressor = [
    "class Processor {",
    "    level = 0",
    "    reduction = 0",
    "    process({src, out}, {s0, s1}) {",
    "        const attack = Math.exp(-1 / (0.01 * sampleRate))",
    "        const release = Math.exp(-1 / (0.1 * sampleRate))",
    "        const decay = Math.exp(-1 / (0.005 * sampleRate))",
    "        for (let index = s0; index < s1; index++) {",
    "            const input = Math.abs(src[0][index])",
    "            this.level = input > this.level ? input : this.level * decay",
    "            const peak = Math.max(this.level, 1e-9)",
    "            const over = 20 * Math.log10(peak) + 20",
    "            const target = over > 0 ? -over * 0.75 : 0",
    "            this.reduction = target < this.reduction ? target + (this.reduction - target) * attack : target + (this.reduction - target) * release",
    "            const gain = Math.pow(10, this.reduction / 20)",
    "            out[0][index] = src[0][index] * gain",
    "            out[1][index] = src[1][index] * gain",
    "        }",
    "    }",
    "}"
].join("\n")

// Schroeder reverb: four combs into two allpasses, plus the dry signal
const CombReverb = [
    "class Processor {",
    "    combs = [0.0297, 0.0371, 0.0411, 0.0437].map(seconds => ({buffer: new Float32Array(Math.round(seconds * sampleRate)), position: 0}))",
    "    allpasses = [0.005, 0.0017].map(seconds => ({buffer: new Float32Array(Math.round(seconds * sampleRate)), position: 0}))",
    "    process({src, out}, {s0, s1}) {",
    "        for (let index = s0; index < s1; index++) {",
    "            const input = src[0][index] * 0.25",
    "            let sum = 0",
    "            for (const comb of this.combs) {",
    "                const delayed = comb.buffer[comb.position]",
    "                comb.buffer[comb.position] = input + delayed * 0.84",
    "                comb.position = (comb.position + 1) % comb.buffer.length",
    "                sum += delayed",
    "            }",
    "            for (const allpass of this.allpasses) {",
    "                const delayed = allpass.buffer[allpass.position]",
    "                const value = sum + delayed * 0.5",
    "                allpass.buffer[allpass.position] = value",
    "                allpass.position = (allpass.position + 1) % allpass.buffer.length",
    "                sum = delayed - value * 0.5",
    "            }",
    "            out[0][index] = src[0][index] * 0.7 + sum",
    "            out[1][index] = src[1][index] * 0.7 + sum",
    "        }",
    "    }",
    "}"
].join("\n")

describe("probe schema and arguments", () => {
    it("passes the Codex schema rules and always runs concurrently", () => {
        const tool = createTool([])
        expect(() => validateCodexToolboxes([{namespace: "daw", description: "test", tools: [tool]}])).not.toThrow()
        expect(tool.concurrent).toBe(true)
        expect(tool.description).toContain("image(line)")
    })
    it("fills defaults and merges variation effects by index", () => {
        const parsed = ProbeTool.parseArguments({
            effects: [{device: "Werkstatt", code: SoftClip, params: [{path: "drive", value: 2}]}, {device: "Reverb"}],
            variations: [
                {label: "hot", effects: [{device: "Werkstatt", params: [{path: "drive", value: 8}]}]},
                {label: "swap", effects: [{device: "Werkstatt"}, {device: "Delay"}, {device: "Compressor"}]}
            ]
        }).result()
        expect(parsed.tests).toEqual(ProbeSignals.Tests)
        expect(parsed.views).toEqual([])
        expect([parsed.bpm, parsed.settings.sineHz, parsed.settings.imdLevelDb]).toEqual([120, 100, -6])
        const [hot, swap] = parsed.chains
        expect(hot.effects[0]).toEqual({device: "Werkstatt", code: SoftClip, params: [{path: "drive", value: 8}]})
        expect(hot.effects[1].device).toBe("Reverb")
        expect(swap.effects.map(effect => effect.device)).toEqual(["Werkstatt", "Delay", "Compressor"])
    })
    it("rejects invalid requests with a helpful message", () => {
        const failure = (args: JsonObject): string => ProbeTool.parseArguments(args).failureReason()
        expect(failure({})).toMatch(/'effects' is required/)
        expect(failure({effects: [{device: "Reverb"}], tests: ["loudness"]})).toMatch(/'tests' must be a list of/)
        expect(failure({effects: [{device: "Reverb"}], tests: ["impulse"], views: ["frequency"]})).toMatch(/not among the tests/)
        expect(failure({effects: [{params: []}]})).toMatch(/'effects\[0\].device'/)
        expect(failure({effects: [{device: "Reverb"}], variations: [{label: "a", effects: []}, {label: "a", effects: []}]})).toMatch(/Duplicate/)
        expect(failure({effects: [{device: "Reverb"}], variations: [{label: "b", effects: [{device: 3}]}]})).toMatch(/'variations\[0\].effects\[0\].device'/)
        expect(failure({effects: [{device: "Reverb"}], sineHz: 10})).toMatch(/'sineHz' must be a number 20..5000/)
    })
})

describe("probe rendering", () => {
    it("measures a soft clipper with every test: one sandbox for dry, one per chain, one unit per test", async () => {
        const captured: Array<Captured> = []
        const result = await createTool(captured).execute({
            effects: [{device: "Werkstatt", code: SoftClip}],
            variations: [{label: "soft", effects: [{device: "Werkstatt"}]}, {label: "hot", effects: [{device: "Werkstatt", params: [{path: "drive", value: 8}]}]}]
        })
        expect(result.ok).toBe(true)
        expect(captured).toHaveLength(3)
        expect(captured.every(entry => entry.units === 6 && entry.frames === 4 * 48_000), "2 bars at 120 bpm").toBe(true)
        expect(captured.every(entry => entry.generatorPeak < 1), "the Apparat output stays below its 0 dBFS limiter").toBe(true)
        expect(captured.map(entry => entry.werkstatts).sort((first, second) => first - second)).toEqual([6, 12, 12])
        const payload = payloadOf(result)
        expect(objectOf(payload.setup)).toMatchObject({sampleRate: 48_000, bpm: 120, tests: [...ProbeSignals.Tests]})
        const [soft, hot] = chainsOf(result)
        expect(soft.label).toBe("soft")
        const harmonics = objectOf(soft.harmonics)
        expect(harmonics.character).toBe("odd")
        const levels = Array.isArray(harmonics.levels) ? harmonics.levels.map(objectOf) : []
        expect(levels.map(level => level.inDb)).toEqual([-24, -12, -6, 0])
        expect(Number(levels[0].thdPct)).toBeLessThan(Number(levels[3].thdPct))
        const hotLevels = objectOf(hot.harmonics).levels
        expect(Array.isArray(hotLevels) && Number(objectOf(hotLevels[1]).thdPct)).toBeGreaterThan(Number(levels[1].thdPct))
        const transfer = objectOf(soft.transfer)
        expect(Number(transfer.ceilingDbfs)).toBeCloseTo(-6, 0)
        expect(Number(transfer.gainDb)).toBeCloseTo(0, 0)
        expect(Number(objectOf(hot.transfer).ceilingDbfs)).toBeCloseTo(-18, 0)
        const frequency = objectOf(soft.frequency)
        expect(Math.abs(Number(frequency.gainAt1kDb))).toBeLessThan(0.5)
        expect(Object.keys(objectOf(frequency.bandsDb)).slice(0, 3)).toEqual(["20Hz", "25Hz", "31.5Hz"])
        expect(Number(objectOf(soft.imd).imdPct)).toBeLessThan(Number(objectOf(hot.imd).imdPct))
        expect(objectOf(soft.dynamics).attackMs).toBeLessThan(1)
        expect(Number(objectOf(soft.impulse).rt60Ms)).toBeLessThan(5)
        expect(result.content.filter(item => item.type === "inputImage")).toHaveLength(0)
    })
    it("measures the echoes and decay of a feedback delay", async () => {
        const result = await createTool([]).execute({effects: [{device: "Werkstatt", code: FeedbackDelay}], tests: ["impulse"]})
        const impulse = objectOf(chainsOf(result)[0].impulse)
        expect(impulse.echoSpacingMs).toBe(250)
        expect(impulse.wetOnsetMs).toBe(250)
        expect(Array.isArray(impulse.echoesMs) && impulse.echoesMs.slice(0, 3)).toEqual([0, 250, 500])
        expect(Number(impulse.rt60Ms)).toBeGreaterThan(2000)
        expect(Number(impulse.rt60Ms)).toBeLessThan(3000)
    })
    it("keeps one chain with all six tests under 3 KB and free of floor or sentinel values", async () => {
        for (const code of [SoftClip, CombReverb]) {
            const result = await createTool([]).execute({effects: [{device: "Werkstatt", code}]})
            const text = textOf(result)
            expect(text.length).toBeLessThan(3000)
            expect(text).not.toMatch(/-(1[2-9]\d|[2-9]\d\d)(\.\d+)?/)
            expect(text).not.toMatch(/">|"<|-?Infinity|NaN/)
        }
        const reverb = objectOf(chainsOf(await createTool([]).execute({effects: [{device: "Werkstatt", code: CombReverb}], tests: ["impulse", "dynamics"]}))[0])
        expect(Number(objectOf(reverb.impulse).rt60Ms)).toBeGreaterThan(1000)
        expect(Number(objectOf(reverb.dynamics).latencyMs), "the dry path marks the onset, not the reverb build-up").toBeLessThan(2)
    })
    it("measures threshold, ratio, attack and release of a compressor", async () => {
        const result = await createTool([]).execute({effects: [{device: "Werkstatt", code: Compressor}], tests: ["transfer", "dynamics"]})
        const {transfer, dynamics} = chainsOf(result)[0]
        expect(Number(objectOf(transfer).compressionStartDb)).toBeGreaterThanOrEqual(-21)
        expect(Number(objectOf(transfer).compressionStartDb)).toBeLessThanOrEqual(-15)
        expect(Number(objectOf(transfer).ratioAtTop)).toBeCloseTo(4, 0)
        expect(Number(objectOf(dynamics).gainReductionDb)).toBeCloseTo(10, 0)
        expect(Number(objectOf(dynamics).attackMs)).toBeGreaterThan(7)
        expect(Number(objectOf(dynamics).attackMs)).toBeLessThan(16)
        expect(Number(objectOf(dynamics).releaseMs)).toBeGreaterThan(90)
        expect(Number(objectOf(dynamics).releaseMs)).toBeLessThan(130)
    })
    it("puts real devices into every test unit, renders at the requested tempo and reports setup errors per chain", async () => {
        const captured: Array<Captured> = []
        const result = await createTool(captured).execute({
            effects: [{device: "Reverb", params: [{path: "decay", value: 0.5}]}], tests: ["impulse", "frequency"], bpm: 60,
            variations: [{label: "ok", effects: [{device: "Reverb"}]}, {label: "typo", effects: [{device: "Reverb", params: [{path: "decai", value: 1}]}]},
                {label: "broken", effects: [{device: "Werkstatt", code: "class Processor { process( {"}]}]
        })
        expect(result.ok).toBe(true)
        expect(captured).toHaveLength(2)
        const wet = captured.find(entry => entry.others.length > 0)
        expect(wet?.others, "one Reverb per test unit").toEqual(["Reverb", "Reverb"])
        expect(captured.every(entry => entry.frames === 4 * 48_000), "one 4 s bar at 60 bpm").toBe(true)
        const [ok, typo, broken] = chainsOf(result)
        expect(objectOf(ok.impulse).energyGainDb).toBe(0)
        expect(String(typo.error)).toMatch(/Setup failed: .*decai: unknown property\. Paths of Reverb: .*decay/)
        expect(String(broken.error)).toMatch(/^Werkstatt code does not compile: /)
    })
    it("plots the requested tests with every chain overlaid and skips views without image support", async () => {
        const plots: Array<string> = []
        const args = {effects: [{device: "Werkstatt", code: SoftClip}], tests: ["harmonics", "transfer", "impulse"], views: ["transfer", "impulse"]}
        const result = await createTool([], true, plots).execute(args)
        expect(result.content.filter(item => item.type === "inputImage")).toHaveLength(2)
        expect(payloadOf(result).views).toEqual([{test: "transfer", image: 0}, {test: "impulse", image: 1}])
        expect(plots[0]).toMatch(/^Static transfer/)
        const withoutImages = await createTool([], false).execute(args)
        expect(withoutImages.content.filter(item => item.type === "inputImage")).toHaveLength(0)
        expect(payloadOf(withoutImages).notes).toEqual(["The current model does not accept images; views were skipped."])
    })
    it("draws one chart per test with a series per chain", async () => {
        const charts: Array<ProbeChart> = []
        await createTool([], true, [], undefined, charts).execute({
            effects: [{device: "Werkstatt", code: SoftClip}], views: [...ProbeSignals.Tests],
            variations: [{label: "soft", effects: [{device: "Werkstatt"}]}, {label: "hot", effects: [{device: "Werkstatt", params: [{path: "drive", value: 8}]}]}]
        })
        expect(charts.map(chart => chart.title.split(" ")[0])).toEqual(["Frequency", "Harmonics", "Static", "Intermodulation", "Gain", "Impulse"])
        charts.forEach(chart => {
            expect(chart.series.length).toBeGreaterThanOrEqual(2)
            expect(chart.series.every(series => series.points.length > 0)).toBe(true)
            const {context, texts} = createRecorder()
            ProbeViews.draw(context, chart, ProbeViews.Size.width, ProbeViews.Size.height)
            expect(texts[0]).toBe(chart.title)
        })
        const [frequency] = charts
        expect(ProbeViews.toX(1000, frequency, {x: 0, y: 0, width: 300, height: 100})).toBeCloseTo(300 * Math.log(50) / Math.log(1000), 6)
    })
    it("fails when the dry reference cannot render and renders all sandboxes concurrently", async () => {
        const failing: AgentRenderEngine = () => Promise.reject(new Error("no engine"))
        const result = await createTool([], true, [], failing).execute({effects: [{device: "Reverb"}], tests: ["impulse"]})
        expect(result.ok).toBe(false)
        expect(textOf(result)).toMatch(/The dry reference failed: Render failed: no engine/)
        let running = 0
        let maxRunning = 0
        const slow: AgentRenderEngine = async (...args) => {
            running++
            maxRunning = Math.max(maxRunning, running)
            await new Promise(resolve => setTimeout(resolve, 5))
            running--
            return fakeEngine([])(...args)
        }
        await createTool([], true, [], slow).execute({effects: [{device: "Reverb"}], tests: ["imd"], variations: [{label: "a", effects: []}, {label: "b", effects: []}]})
        expect(maxRunning).toBe(3)
    })
})
