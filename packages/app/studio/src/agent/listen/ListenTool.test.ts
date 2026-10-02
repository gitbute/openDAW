import {describe, expect, it} from "vitest"
import {DefaultObservableValue, isDefined, Optional} from "@opendaw/lib-std"
import {ConstantTempoMap} from "@opendaw/lib-dsp"
import {validateCodexToolboxes} from "@opendaw/studio-codex"
import type {AgentToolResult, JsonObject} from "@opendaw/studio-codex"
import type {SignatureEvent} from "@opendaw/studio-adapters"
import type {Project} from "@opendaw/studio-core"
import type {AgentRender, AgentRenderRequest} from "./AgentRender"
import {BarRange, RenderTimeline} from "./RenderTimeline"
import type {ListenToolDeps} from "./ListenTool"
import type {ListenView} from "./ListenViews"

if (!isDefined(Reflect.get(globalThis, "AudioWorkletNode"))) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}

// studio-core extends AudioWorkletNode at module load, so it is imported after the stub above
const {createListenTool, ListenTool} = await import("./ListenTool")

const events: ReadonlyArray<SignatureEvent> = [{index: -1, accumulatedPpqn: 0, accumulatedBars: 0, nominator: 4, denominator: 4}]
const tempoMap = new ConstantTempoMap(new DefaultObservableValue(120))
const fakeProject = {} as unknown as Project

const fakeRender = (request: AgentRenderRequest): AgentRender => {
    const span = RenderTimeline.span(events, tempoMap, request.bars ?? {from: 1, to: 4}, 1000, 0)
    const channel = new Float32Array(span.totalFrames).fill(0.5)
    return {
        sampleRate: 1000, mix: [channel, channel], bars: span.bars,
        stems: [
            {label: "Bass", unitUuid: "a", channels: [channel, channel], silent: false, feeds: []},
            {label: "Lead", unitUuid: "b", channels: [new Float32Array(span.totalFrames), new Float32Array(span.totalFrames)], silent: true, feeds: []}
        ],
        startSeconds: span.startSeconds, durationSeconds: span.totalFrames / 1000, tailSeconds: 0,
        barStartFrames: span.barStartFrames, stepSeconds: span.stepSeconds, bpm: span.bpm, signature: span.signature,
        warnings: ["'Lead' is silent"]
    }
}

const fakeView = (key: string): ListenView => ({key, summary: `${key} view`, render: async () => `data:image/png;base64,${key}`})
const fakeViews: ReadonlyArray<ListenView> = [fakeView("spectrogram"), fakeView("loudness")]

const createDeps = (overrides: Partial<ListenToolDeps> = {}): ListenToolDeps => ({
    project: () => fakeProject,
    stemCount: () => 2,
    analyze: (render: AgentRender): JsonObject => ({loudness: render.bars.to}),
    views: fakeViews,
    supportsImages: () => true,
    render: async (_project: Project, request: AgentRenderRequest) => fakeRender(request),
    resolveSpan: (_project: Project, bars: Optional<BarRange>) => RenderTimeline.span(events, tempoMap, bars ?? {from: 1, to: 4}, 48_000, 0),
    ...overrides
})

const payloadOf = (result: AgentToolResult): JsonObject => {
    const [first] = result.content
    if (first.type !== "inputText") {throw new Error("expected text first")}
    return JSON.parse(first.text)
}

describe("listen tool", () => {
    it("has a schema Codex accepts and runs sound calls concurrently", () => {
        const tool = createListenTool(createDeps())
        expect(tool.name).toBe("listen")
        expect(typeof tool.concurrent === "function" && tool.concurrent({sound: {device: "Nano"}})).toBe(true)
        expect(typeof tool.concurrent === "function" && tool.concurrent({bars: {from: 1, to: 2}})).toBe(false)
        expect(tool.description).toContain("spectrogram view")
        expect(() => validateCodexToolboxes([{namespace: "studio", description: "studio tools", tools: [tool]}])).not.toThrow()
    })
    it("parses arguments with defaults", () => {
        expect(ListenTool.parseArguments({}).result())
            .toEqual({source: {kind: "project", bars: undefined, stems: undefined, viewOf: []}, focus: undefined, views: ["spectrogram"]})
        expect(ListenTool.parseArguments({bars: {from: 2, to: 3}, stems: ["Bass"], views: ["loudness", "loudness"]}).result())
            .toEqual({source: {kind: "project", bars: {from: 2, to: 3}, stems: ["Bass"], viewOf: []}, focus: undefined, views: ["loudness"]})
        expect(ListenTool.parseArguments({focus: {from: 1, to: 1.5}}).result().focus).toEqual({kind: "seconds", from: 1, to: 1.5})
        expect(ListenTool.parseArguments({bars: {from: 0, to: 3}}).isFailure()).toBe(true)
        expect(ListenTool.parseArguments({bars: {from: 3, to: 2}}).isFailure()).toBe(true)
        expect(ListenTool.parseArguments({stems: "some"}).isFailure()).toBe(true)
        expect(ListenTool.parseArguments({views: ["waveform"]}).isFailure()).toBe(true)
        expect(ListenTool.parseArguments({pattern: "16ths"}).failureReason()).toMatch(/'pattern' needs 'sound'/)
        expect(ListenTool.parseArguments({focus: {note: 2}}).result().focus).toEqual({kind: "note", note: 2})
        expect(ListenTool.parseArguments({sound: {device: "Nano"}, stems: "all"}).failureReason()).toMatch(/'stems' is for the project/)
        expect(ListenTool.parseArguments({sound: {device: "Nano"}, stems: "none"}).isSuccess()).toBe(true)
        expect(ListenTool.parseArguments({sound: {device: "Nano"}, focus: {note: 2, from: 0, to: 0}}).result().focus).toEqual({kind: "note", note: 2})
        expect(ListenTool.parseArguments({sound: {device: "Nano"}, viewOf: ["mix"]}).failureReason()).toMatch(/'viewOf' is for the project/)
        expect(ListenTool.parseArguments({viewOf: ["Bass", "Kick", "mix"], views: ["spectrogram", "loudness", "spectrogram"]}).result().source)
            .toMatchObject({viewOf: ["Bass", "Kick", "mix"]})
        expect(ListenTool.parseArguments({viewOf: ["a", "b", "c", "d", "e"]}).failureReason()).toMatch(/at most 4 channels/)
        const sound = ListenTool.parseArguments({sound: {device: "Nano"}, soundBars: 1, focus: {note: 2}}).result()
        expect(sound.source.kind).toBe("sound")
        expect(sound.views).toEqual([])
        expect(sound.focus).toEqual({kind: "note", note: 2})
    })
    it("returns analysis, render facts and images", async () => {
        const tool = createListenTool(createDeps())
        const result = await tool.execute({bars: {from: 2, to: 3}, views: ["spectrogram", "loudness"]})
        expect(result.ok).toBe(true)
        const payload = payloadOf(result)
        expect(payload.analysis).toEqual({loudness: 3})
        expect(payload.range).toMatchObject({bars: {from: 2, to: 3}, durationSeconds: 4, startSeconds: 2, bpm: 120, signature: "4/4"})
        expect(payload.silentStems).toEqual(["Lead"])
        expect(payload.stemSource).toContain("already isolated")
        expect(ListenTool.Description).toContain("No need to solo units")
        expect(payload.warnings).toEqual(["'Lead' is silent"])
        expect(payload.views).toEqual(["spectrogram", "loudness"])
        expect(payload.mixPeakDb).toBeCloseTo(-6, 0)
        expect(result.content.slice(1)).toEqual([
            {type: "inputImage", imageUrl: "data:image/png;base64,spectrogram"},
            {type: "inputImage", imageUrl: "data:image/png;base64,loudness"}
        ])
    })
    it("skips images for models without image input", async () => {
        const tool = createListenTool(createDeps({supportsImages: () => false}))
        const result = await tool.execute({})
        expect(result.content).toHaveLength(1)
        expect(payloadOf(result).notes).toEqual(["The current model does not accept images; views were skipped."])
    })
    it("caps the range with a clear error", async () => {
        const tool = createListenTool(createDeps())
        const result = await tool.execute({bars: {from: 1, to: 65}})
        expect(result.ok).toBe(false)
        expect(result.content[0]).toMatchObject({text: expect.stringContaining("at most 64 bars")})
        const whole = await createListenTool(createDeps({
            resolveSpan: () => RenderTimeline.span(events, tempoMap, {from: 1, to: 100}, 48_000, 0)
        })).execute({})
        expect(whole.ok).toBe(false)
    })
    it("falls back to the mix only when stems exceed the budget, and refuses an explicit 'all'", async () => {
        const requested: Array<AgentRenderRequest> = []
        const deps = createDeps({
            stemCount: () => 200,
            render: async (_project: Project, request: AgentRenderRequest) => {
                requested.push(request)
                return fakeRender(request)
            }
        })
        const auto = await createListenTool(deps).execute({})
        expect(auto.ok).toBe(true)
        expect(requested[0].stems).toBe("none")
        expect(JSON.stringify(payloadOf(auto).notes)).toContain("Stems skipped")
        const explicit = await createListenTool(deps).execute({stems: "all"})
        expect(explicit.ok).toBe(false)
        expect(requested).toHaveLength(1)
    })
    it("zooms the analysis and the views into the focus window", async () => {
        const windows: Array<unknown> = []
        const durations: Array<number> = []
        const view: ListenView = {key: "spectrogram", summary: "s", render: async ({render}) => {
            durations.push(render.durationSeconds)
            return "data:image/png;base64,zoom"
        }}
        const tool = createListenTool(createDeps({
            views: [view],
            analyze: (_render: AgentRender, window) => {
                windows.push(window)
                return {}
            }
        }))
        const result = await tool.execute({bars: {from: 1, to: 2}, focus: {from: 1, to: 1.5}})
        expect(result.ok).toBe(true)
        expect(windows).toEqual([{startFrame: 1000, endFrame: 1500}])
        expect(durations).toEqual([0.5])
        expect(payloadOf(result).focus).toEqual({fromSeconds: 1, toSeconds: 1.5})
        const late = await tool.execute({bars: {from: 1, to: 2}, focus: {from: 9, to: 10}})
        expect(late.ok).toBe(false)
    })
    it("applies the stem budget to stem lists and a separate budget to the sound descriptors", async () => {
        const described: Array<boolean> = []
        const long = createDeps({
            resolveSpan: () => RenderTimeline.span(events, tempoMap, {from: 1, to: 64}, 48_000, 0),
            render: async () => fakeRender({bars: {from: 1, to: 64}}),
            analyze: (_render: AgentRender, _window, describe) => {
                described.push(describe)
                return {}
            }
        })
        const tooMany = await createListenTool(long).execute({stems: ["Bass", "Lead", "Pad", "Keys"], views: []})
        expect(tooMany.ok).toBe(false)
        expect(tooMany.content[0]).toMatchObject({text: expect.stringContaining("exceeds the stem budget")})
        const listed = await createListenTool(long).execute({stems: ["Bass", "Lead"], views: []})
        expect(listed.ok).toBe(true)
        expect(described).toEqual([false])
        expect(JSON.stringify(payloadOf(listed).notes)).toContain("Sound descriptors skipped")
        const short = await createListenTool(createDeps({analyze: (_render: AgentRender, _window, describe) => {
            described.push(describe)
            return {}
        }})).execute({stems: ["Bass"], views: []})
        expect(short.ok).toBe(true)
        expect(described).toEqual([false, true])
    })
    it("caps the images of a sound call", () => {
        const variations = [{label: "a"}, {label: "b"}, {label: "c"}]
        expect(ListenTool.parseArguments({sound: {device: "Nano"}, variations, views: ["spectrogram", "loudness"]}).isSuccess()).toBe(true)
        expect(ListenTool.parseArguments({sound: {device: "Nano"}, variations, views: ["spectrogram", "loudness", "scope"]},
            ["spectrogram", "loudness", "scope"]).failureReason()).toMatch(/exceed 8 images/)
        expect(ListenTool.parseArguments({sound: {device: "Nano"}, bars: {from: 1, to: 2}}).failureReason()).toMatch(/use 'soundBars'/)
    })
    it("draws every view for each channel in viewOf and renders those channels as stems", async () => {
        const requested: Array<AgentRenderRequest> = []
        const drawn: Array<string> = []
        const view: ListenView = {key: "scope", summary: "s", render: async ({render, title}) => {
            drawn.push(`${title}:${render.stems.length}:${render.mix[0][0]}`)
            return "data:image/png;base64,x"
        }}
        const tool = createListenTool(createDeps({
            views: [view],
            render: async (_project: Project, request: AgentRenderRequest) => {
                requested.push(request)
                return fakeRender(request)
            }
        }))
        const result = await tool.execute({bars: {from: 1, to: 2}, stems: "none", viewOf: ["Bass", "mix", "Drums"], views: ["scope"]})
        expect(result.ok).toBe(true)
        expect(requested[0].stems).toEqual(["Bass", "Drums"])
        expect(drawn).toEqual(["Bass:0:0.5", "mix:0:0.5"])
        expect(payloadOf(result).views).toEqual(["scope:Bass", "scope:mix"])
        expect(JSON.stringify(payloadOf(result).notes)).toContain("viewOf 'Drums' is not a rendered channel")
    })
    it("zooms into one note of the first viewOf channel in the project", async () => {
        const hits = (render: AgentRender): AgentRender => {
            const channel = new Float32Array(render.mix[0].length)
            for (const start of [0, 500, 1000, 1500]) {
                for (let index = 0; index < 100; index++) {channel[start + index] = Math.sin(index * 0.5) * (1 - index / 100)}
            }
            return {...render, stems: [{label: "Kick", unitUuid: "k", channels: [channel, channel], silent: false, feeds: []}]}
        }
        const windows: Array<unknown> = []
        const tool = createListenTool(createDeps({
            render: async (_project: Project, request: AgentRenderRequest) => hits(fakeRender(request)),
            analyze: (_render: AgentRender, window) => {
                windows.push(window)
                return {}
            }
        }))
        const result = await tool.execute({bars: {from: 1, to: 2}, viewOf: ["Kick"], focus: {note: 2}, views: []})
        expect(result.ok).toBe(true)
        expect(payloadOf(result).focus).toMatchObject({note: 2, notesOf: "Kick"})
        expect(Number(Reflect.get(Object(payloadOf(result).focus), "fromSeconds"))).toBeCloseTo(0.5, 1)
        expect(windows).toHaveLength(1)
    })
    it("reports render failures", async () => {
        const tool = createListenTool(createDeps({render: async () => {throw new Error("Unknown stem(s): Drums")}}))
        const result = await tool.execute({stems: ["Drums"]})
        expect(result.ok).toBe(false)
        expect(result.content[0]).toMatchObject({text: "Render failed: Unknown stem(s): Drums"})
    })
    it("serialises renders", async () => {
        let active = 0
        let maxActive = 0
        const order: Array<number> = []
        const tool = createListenTool(createDeps({
            render: async (_project: Project, request: AgentRenderRequest) => {
                active++
                maxActive = Math.max(maxActive, active)
                await new Promise(resolve => setTimeout(resolve, 5))
                order.push(request.bars?.from ?? 0)
                active--
                return fakeRender(request)
            }
        }))
        const results = await Promise.all([1, 2, 3].map(from => tool.execute({bars: {from, to: from}, views: []})))
        expect(results.every(result => result.ok)).toBe(true)
        expect(maxActive).toBe(1)
        expect(order).toEqual([1, 2, 3])
    })
})
