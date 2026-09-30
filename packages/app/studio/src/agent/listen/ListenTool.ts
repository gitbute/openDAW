import {Attempt, Attempts, int, isDefined, Nullable, Optional, Provider, tryCatch} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import type {AgentTool, JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AgentToolResult} from "@opendaw/studio-codex"
import type {Project} from "@opendaw/studio-core"
import {AgentRender, AgentRenderRequest, StemRequest} from "./AgentRender"
import {AgentRenderer} from "./AgentRenderer"
import {BarRange, RenderSpan} from "./RenderTimeline"
import {renderSpectrogramPng} from "./SpectrogramView"
import {renderLoudnessPng} from "./LoudnessView"
import {DeviceLoad} from "./DeviceLoad"

export type ListenView = "spectrogram" | "loudness"

export type ListenToolDeps = {
    readonly project: Provider<Project>
    readonly analyze: (render: AgentRender) => JsonObject
    readonly supportsImages: Provider<boolean>
    readonly render?: (project: Project, request: AgentRenderRequest) => Promise<AgentRender>
    readonly resolveSpan?: (project: Project, bars: Optional<BarRange>) => RenderSpan
    readonly renderView?: (view: ListenView, render: AgentRender) => Promise<string>
    readonly stemCount?: (project: Project) => int
}

export type ListenArguments = {
    readonly bars: Optional<BarRange>
    readonly stems: Optional<StemRequest>
    readonly views: ReadonlyArray<ListenView>
}

export namespace ListenTool {
    export const Name = "listen"
    export const MaxBars = 64
    export const MaxSeconds = 240
    export const StemBudgetSeconds = 480
    export const Views: ReadonlyArray<ListenView> = ["spectrogram", "loudness"]
    export const StemSource = "Each stem is one unit's own channel-strip output (after its effects, volume, pan and the live mute/solo)"
        + " from the same render as the mix, so it is already isolated; a group or aux stem contains what is routed into it."

    export const Description = [
        "Render the project offline (exactly the requested bars, the live project is not touched) and perceive the result.",
        "Returns numeric analysis of the mix and of each requested stem, render facts (range, duration, silent stems,",
        "warnings such as script device errors), the estimated real-time CPU load of script devices and, if requested, images: 'spectrogram' (log-frequency STFT of the mix",
        "plus one row per stem when at most 6 stems, bar numbers on top) and 'loudness' (RMS curves of mix and stems).",
        `Bars are 1-based and inclusive; at most ${MaxBars} bars per call. Stems are addressed by audio unit label.`,
        StemSource, "No need to solo units to hear them alone."
    ].join(" ")

    export const InputSchema: JsonObject = {
        type: "object",
        additionalProperties: false,
        properties: {
            bars: {
                type: "object",
                additionalProperties: false,
                description: "1-based inclusive bar range. Omit to render the whole arrangement.",
                properties: {
                    from: {type: "integer", minimum: 1, description: "first bar (1-based)"},
                    to: {type: "integer", minimum: 1, description: "last bar (inclusive)"}
                },
                required: ["from", "to"]
            },
            stems: {
                description: "Which audio units to render as separate stems: 'none', 'all' or a list of unit labels (same labels as inspect_project). Default: all when units x seconds fits the stem budget, else none.",
                anyOf: [
                    {type: "string", enum: ["none", "all"]},
                    {type: "array", items: {type: "string"}, minItems: 1, maxItems: 32}
                ]
            },
            views: {
                type: "array",
                description: "Images to return (default ['spectrogram']). Pass [] for numbers only.",
                items: {type: "string", enum: ["spectrogram", "loudness"]},
                maxItems: 2
            }
        }
    }

    const isObject = (value: Optional<JsonValue>): value is JsonObject =>
        isDefined(value) && typeof value === "object" && !Array.isArray(value)

    const isArray = (value: Optional<JsonValue>): value is ReadonlyArray<JsonValue> => Array.isArray(value)

    const isView = (value: JsonValue): value is ListenView => value === "spectrogram" || value === "loudness"

    export const parseArguments = (args: JsonObject): Attempt<ListenArguments, string> => {
        const {bars: barsValue, stems: stemsValue, views: viewsValue} = args
        let bars: Optional<BarRange> = undefined
        if (isDefined(barsValue)) {
            if (!isObject(barsValue)) {return Attempts.err("'bars' must be an object {from, to}")}
            const {from, to} = barsValue
            if (typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) {
                return Attempts.err("'bars.from' and 'bars.to' must be integers")
            }
            if (from < 1 || to < from) {return Attempts.err(`Invalid bar range ${from}..${to}: bars are 1-based and 'to' must be >= 'from'`)}
            bars = {from, to}
        }
        let stems: Optional<StemRequest> = undefined
        if (isDefined(stemsValue)) {
            if (stemsValue === "none" || stemsValue === "all") {
                stems = stemsValue
            } else if (isArray(stemsValue) && stemsValue.every(value => typeof value === "string")) {
                stems = stemsValue.map(value => String(value))
            } else {
                return Attempts.err("'stems' must be 'none', 'all' or a list of unit labels")
            }
        }
        let views: ReadonlyArray<ListenView> = ["spectrogram"]
        if (isDefined(viewsValue)) {
            if (!isArray(viewsValue) || !viewsValue.every(isView)) {return Attempts.err("'views' must be a list of 'spectrogram' | 'loudness'")}
            views = viewsValue.filter(isView).filter((view, index, array) => array.indexOf(view) === index)
        }
        return Attempts.ok({bars, stems, views})
    }

    export const barCount = ({from, to}: BarRange): int => to - from + 1

    const roundTo = (value: number, digits: int): Nullable<number> => {
        if (!Number.isFinite(value)) {return null}
        const scale = Math.pow(10, digits)
        return Math.round(value * scale) / scale
    }

    export const facts = (render: AgentRender): JsonObject => ({
        range: {
            bars: {from: render.bars.from, to: render.bars.to},
            startSeconds: roundTo(render.startSeconds, 3),
            durationSeconds: roundTo(render.durationSeconds, 3),
            tailSeconds: roundTo(render.tailSeconds, 3),
            bpm: roundTo(render.bpm, 3),
            signature: `${render.signature[0]}/${render.signature[1]}`
        },
        mixPeakDb: roundTo(AgentRender.peakDb(render.mix), 1),
        stems: render.stems.map(stem => ({
            label: stem.label, silent: stem.silent, peakDb: roundTo(AgentRender.peakDb(stem.channels), 1),
            ...(stem.feeds.length > 0 ? {feeds: [...stem.feeds]} : {})
        })),
        ...(render.stems.length > 0 ? {stemSource: StemSource} : {}),
        silentStems: render.stems.filter(stem => stem.silent).map(stem => stem.label),
        ...DeviceLoad.facts(render.deviceLoad ?? []),
        warnings: [...render.warnings]
    })

    export const describeError = (error: unknown): string => error instanceof Error ? error.message : String(error)

    export const defaultRenderView = (view: ListenView, render: AgentRender): Promise<string> =>
        view === "spectrogram" ? renderSpectrogramPng(render) : renderLoudnessPng(render)
}

export const createListenTool = (deps: ListenToolDeps): AgentTool => {
    const {project, analyze, supportsImages} = deps
    const render = deps.render ?? ((source: Project, request: AgentRenderRequest) => AgentRenderer.render(source, request))
    const resolveSpan = deps.resolveSpan ?? ((source: Project, bars: Optional<BarRange>) =>
        AgentRenderer.resolveSpan(source, {bars}, AgentRenderer.DefaultSampleRate))
    const renderView = deps.renderView ?? ListenTool.defaultRenderView
    const stemCount = deps.stemCount ?? ((source: Project) => AgentRenderer.stemLabels(source).length)
    let queue: Promise<unknown> = Promise.resolve()
    const listen = async ({bars: requestedBars, stems, views}: ListenArguments): Promise<AgentToolResult> => {
        const source = project()
        const planned = tryCatch(() => resolveSpan(source, requestedBars))
        if (planned.status === "failure") {return AgentToolResult.failure(ListenTool.describeError(planned.error))}
        const {bars, musicalFrames} = planned.value
        const count = ListenTool.barCount(bars)
        if (count > ListenTool.MaxBars) {
            return AgentToolResult.failure(`Requested ${count} bars (${bars.from}-${bars.to}); listen renders at most ${ListenTool.MaxBars} bars per call. Pass a smaller 'bars' range.`)
        }
        const seconds = musicalFrames / AgentRenderer.DefaultSampleRate
        if (seconds > ListenTool.MaxSeconds) {
            return AgentToolResult.failure(`Bars ${bars.from}-${bars.to} last ${Math.round(seconds)} s; listen is capped at ${ListenTool.MaxSeconds} s per call. Pass fewer bars.`)
        }
        const stemTotal = stems === "all" || !isDefined(stems) ? stemCount(source) : stems === "none" ? 0 : stems.length
        const withinBudget = stemTotal * seconds <= ListenTool.StemBudgetSeconds
        if (stems === "all" && !withinBudget) {
            return AgentToolResult.failure(`${stemTotal} stems x ${Math.round(seconds)} s exceeds the stem budget of ${ListenTool.StemBudgetSeconds} stem-seconds. Pass fewer bars or a list of stem labels.`)
        }
        const effectiveStems: StemRequest = stems ?? (withinBudget ? "all" : "none")
        const budgetNote = !isDefined(stems) && !withinBudget
            ? [`Stems skipped: ${stemTotal} stems x ${Math.round(seconds)} s exceeds ${ListenTool.StemBudgetSeconds} stem-seconds; pass fewer bars or a list of stem labels.`] : []
        const rendered = await Promises.tryCatch(render(source, {bars, stems: effectiveStems}))
        if (rendered.status === "rejected") {return AgentToolResult.failure(`Render failed: ${ListenTool.describeError(rendered.error)}`)}
        const result = rendered.value
        const analysed = tryCatch(() => analyze(result))
        const analysis: JsonValue = analysed.status === "success"
            ? analysed.value : {error: ListenTool.describeError(analysed.error)}
        const images: Array<string> = []
        const renderedViews: Array<ListenView> = []
        const notes: Array<string> = [...budgetNote]
        if (views.length > 0 && !supportsImages()) {
            notes.push("The current model does not accept images; views were skipped.")
        } else {
            for (const view of views) {
                const image = await Promises.tryCatch(renderView(view, result))
                if (image.status === "resolved") {
                    images.push(image.value)
                    renderedViews.push(view)
                } else {
                    notes.push(`View '${view}' failed: ${ListenTool.describeError(image.error)}`)
                }
            }
        }
        const payload: JsonObject = {...ListenTool.facts(result), analysis, views: renderedViews, ...(notes.length > 0 ? {notes} : {})}
        return AgentToolResult.withImages(AgentToolResult.json(payload), images)
    }
    return {
        name: ListenTool.Name,
        description: ListenTool.Description,
        inputSchema: ListenTool.InputSchema,
        execute: (args: JsonObject): Promise<AgentToolResult> => ListenTool.parseArguments(args).match({
            err: (message: string) => Promise.resolve(AgentToolResult.failure(message)),
            ok: (parsed: ListenArguments) => {
                const next = queue.then(() => listen(parsed))
                queue = next.catch(() => undefined)
                return next
            }
        })
    }
}
