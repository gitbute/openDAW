import {describe, expect, it} from "vitest"
import {DefaultObservableValue, isDefined, Optional} from "@opendaw/lib-std"
import {ConstantTempoMap} from "@opendaw/lib-dsp"
import {validateCodexToolboxes} from "@opendaw/studio-codex"
import type {AgentToolResult, JsonObject} from "@opendaw/studio-codex"
import type {SignatureEvent} from "@opendaw/studio-adapters"
import type {Project} from "@opendaw/studio-core"
import type {AgentRender, AgentRenderRequest} from "./AgentRender"
import {BarRange, RenderTimeline} from "./RenderTimeline"
import type {ListenToolDeps, ListenView} from "./ListenTool"

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

const createDeps = (overrides: Partial<ListenToolDeps> = {}): ListenToolDeps => ({
    project: () => fakeProject,
    stemCount: () => 2,
    analyze: (render: AgentRender): JsonObject => ({loudness: render.bars.to}),
    supportsImages: () => true,
    render: async (_project: Project, request: AgentRenderRequest) => fakeRender(request),
    resolveSpan: (_project: Project, bars: Optional<BarRange>) => RenderTimeline.span(events, tempoMap, bars ?? {from: 1, to: 4}, 48_000, 0),
    renderView: async (view: ListenView) => `data:image/png;base64,${view}`,
    ...overrides
})

const payloadOf = (result: AgentToolResult): JsonObject => {
    const [first] = result.content
    if (first.type !== "inputText") {throw new Error("expected text first")}
    return JSON.parse(first.text)
}

describe("listen tool", () => {
    it("has a schema Codex accepts", () => {
        const tool = createListenTool(createDeps())
        expect(tool.name).toBe("listen")
        expect(() => validateCodexToolboxes([{namespace: "studio", description: "studio tools", tools: [tool]}])).not.toThrow()
    })
    it("parses arguments with defaults", () => {
        expect(ListenTool.parseArguments({}).result()).toEqual({bars: undefined, stems: undefined, views: ["spectrogram"]})
        expect(ListenTool.parseArguments({bars: {from: 2, to: 3}, stems: ["Bass"], views: ["loudness", "loudness"]}).result())
            .toEqual({bars: {from: 2, to: 3}, stems: ["Bass"], views: ["loudness"]})
        expect(ListenTool.parseArguments({bars: {from: 0, to: 3}}).isFailure()).toBe(true)
        expect(ListenTool.parseArguments({bars: {from: 3, to: 2}}).isFailure()).toBe(true)
        expect(ListenTool.parseArguments({stems: "some"}).isFailure()).toBe(true)
        expect(ListenTool.parseArguments({views: ["waveform"]}).isFailure()).toBe(true)
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
