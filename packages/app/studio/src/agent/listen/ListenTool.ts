import {CodeCellImageHint} from "@/agent/CodeCellImages"
import {Attempt, Attempts, int, isDefined, Nullable, Optional, Provider, tryCatch} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import type {AgentTool, JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AgentToolResult} from "@opendaw/studio-codex"
import type {Project} from "@opendaw/studio-core"
import {SoundDescriptors} from "@/agent/analysis/SoundDescriptors"
import {SoundSource, SoundSourceDeps} from "@/agent/audition/SoundSource"
import {AuditionRequest, AuditionSpec} from "@/agent/audition/AuditionSpec"
import {AgentRender, AgentRenderRequest, FrameWindow, StemRequest} from "./AgentRender"
import {AgentRenderer} from "./AgentRenderer"
import {BarRange, RenderSpan} from "./RenderTimeline"
import {ListenView, ListenViews} from "./ListenViews"
import {ListenFocus} from "./ListenFocus"
import {DeviceLoad} from "./DeviceLoad"

export type ListenToolDeps = {
    readonly project: Provider<Project>
    readonly analyze: (render: AgentRender, window: Optional<FrameWindow>, describe: boolean) => JsonObject
    readonly supportsImages: Provider<boolean>
    readonly sandbox?: SoundSourceDeps
    readonly render?: (project: Project, request: AgentRenderRequest) => Promise<AgentRender>
    readonly resolveSpan?: (project: Project, bars: Optional<BarRange>) => RenderSpan
    readonly views?: ReadonlyArray<ListenView>
    readonly stemCount?: (project: Project) => int
}

export type ListenSource =
    | { readonly kind: "project", readonly bars: Optional<BarRange>, readonly stems: Optional<StemRequest>, readonly viewOf: ReadonlyArray<string> }
    | { readonly kind: "sound", readonly request: AuditionRequest }

export type ListenArguments = {
    readonly source: ListenSource
    readonly focus: Optional<ListenFocus>
    readonly views: ReadonlyArray<string>
}

export namespace ListenTool {
    export const Name = "listen"
    export const MaxBars = 64
    export const MaxSeconds = 240
    export const StemBudgetSeconds = 480
    export const DescribeBudgetSeconds = 240
    export const MaxSoundImages = 8
    export const MaxViewTargets = 4
    export const MixTarget = "mix"
    export const StemSource = "Each stem is one unit's own channel-strip output (after its effects, volume, pan and the live mute/solo)"
        + " from the same render as the mix, so it is already isolated; a group or aux stem contains what is routed into it."
    const SoundOnlyKeys: ReadonlyArray<string> = ["effects", "notes", "pattern", "root", "bpm", "soundBars", "variations"]

    export const describe = (views: ReadonlyArray<ListenView> = ListenViews.all()): string => [
        "Render audio offline and measure it. Two sources:",
        `the project (default): exactly the requested bars, the live project is not touched, the mix plus stems (at most ${MaxBars} bars per call);`,
        "or 'sound': one instrument (any instrument, Apparat with code, or a preset) plus optional effects plays a built-in pattern or your notes",
        `in a throwaway sandbox project; up to ${AuditionSpec.MaxVariations} variations (params/code/preset/device overrides) render side by side,`,
        "each with the gain that matches it to the quietest one. Use 'sound' to shape a sound in isolation before it goes into the project;",
        "sound calls run in parallel with other tools and subagents.",
        "Both return loudness (LUFS, LRA, true peak, crest), loudness per bar, spectrum regions and warnings (silent output, script device errors,",
        "NaN: Apparat/Werkstatt silence themselves after a throw or NaN); the project adds the 1/3-octave spectrum, stereo, timing, masking and",
        "the real-time CPU load of script devices.",
        "Sound descriptors measure what makes a sound: per 'sound' variation, and in the project only for the stems you list by label",
        `(or with 'focus'; the mix when no stems render; up to ${DescribeBudgetSeconds} stem-seconds): ${SoundDescriptors.summaries().join("; ")}.`,
        "'focus' zooms views and descriptors into a time window or one note; 'viewOf' draws the views for any mixer channels (a track, a bus, the mix).",
        `Views (images), pick the one that answers your question: ${views.map(({summary}) => summary).join("; ")}.`,
        "Stem lufs is gated: it only measures where the stem plays (activeFraction), so a stem playing briefly reads louder than it sits in the mix.",
        StemSource, "No need to solo units to hear them alone.", CodeCellImageHint
    ].join(" ")

    export const Description = describe()

    export const inputSchema = (views: ReadonlyArray<ListenView> = ListenViews.all()): JsonObject => ({
        type: "object",
        additionalProperties: false,
        properties: {
            bars: {
                type: "object",
                additionalProperties: false,
                description: "Project only. 1-based inclusive bar range; omit to render the whole arrangement.",
                properties: {
                    from: {type: "integer", minimum: 1, description: "first bar (1-based)"},
                    to: {type: "integer", minimum: 1, description: "last bar (inclusive)"}
                },
                required: ["from", "to"]
            },
            stems: {
                description: "Project only. Which audio units to render as separate stems: 'none', 'all' or a list of unit labels (same labels as inspect_project). Default: all when units x seconds fits the stem budget, else none.",
                anyOf: [
                    {type: "string", enum: ["none", "all"]},
                    {type: "array", items: {type: "string"}, minItems: 1, maxItems: 32}
                ]
            },
            ...AuditionSpec.Properties,
            focus: ListenFocus.Schema,
            viewOf: {
                type: "array",
                description: "Project only. Mixer channels to draw every requested view for, one image per channel and view: 'mix' or unit labels (tracks, group buses, aux returns; rendered as stems automatically). Default: the mix (spectrogram and loudness also show the stems).",
                items: {type: "string"},
                minItems: 1,
                maxItems: MaxViewTargets
            },
            views: {
                type: "array",
                description: `Images to return (default ['spectrogram'] for the project, none for 'sound', where each variation gets its own; at most ${MaxSoundImages} images per sound call). Pass [] for numbers only.`,
                items: {type: "string", enum: views.map(({key}) => key)},
                maxItems: views.length
            }
        }
    })

    export const InputSchema = inputSchema()

    const isObject = (value: Optional<JsonValue>): value is JsonObject =>
        isDefined(value) && typeof value === "object" && !Array.isArray(value)

    const isArray = (value: Optional<JsonValue>): value is ReadonlyArray<JsonValue> => Array.isArray(value)

    export const usesSound = (args: JsonObject): boolean => isObject(args.sound)

    export const parseArguments = (args: JsonObject, viewKeys: ReadonlyArray<string> = ListenViews.keys()): Attempt<ListenArguments, string> => {
        const {stems: stemsValue, views: viewsValue, focus: focusValue} = args
        const sound = usesSound(args)
        let views: ReadonlyArray<string> = sound ? [] : ["spectrogram"]
        if (isDefined(viewsValue)) {
            if (!isArray(viewsValue) || !viewsValue.every(view => typeof view === "string" && viewKeys.includes(view))) {
                return Attempts.err(`'views' must be a list of ${viewKeys.map(key => `'${key}'`).join(" | ")}`)
            }
            views = viewsValue.map(view => String(view)).filter((view, index, array) => array.indexOf(view) === index)
        }
        const focus = ListenFocus.parse(focusValue)
        if (focus.isFailure()) {return Attempts.err(focus.failureReason())}
        if (sound) {
            if (isDefined(stemsValue) && stemsValue !== "none") {return Attempts.err("'stems' is for the project; a 'sound' renders on its own")}
            if (isDefined(args.bars)) {return Attempts.err("'bars' is the project's bar range; with 'sound' use 'soundBars' (1..4)")}
            if (isDefined(args.viewOf)) {return Attempts.err("'viewOf' is for the project; with 'sound' every variation gets its own views")}
            const variations = isArray(args.variations) ? Math.max(1, args.variations.length) : 1
            if (variations * views.length > MaxSoundImages) {
                return Attempts.err(`${variations} variations x ${views.length} views exceed ${MaxSoundImages} images; request fewer views or variations`)
            }
            return AuditionSpec.parseArguments(args)
                .map((request): ListenArguments => ({source: {kind: "sound", request}, focus: focus.result(), views}))
        }
        const soundOnly = SoundOnlyKeys.find(key => isDefined(args[key]))
        if (isDefined(soundOnly)) {return Attempts.err(`'${soundOnly}' needs 'sound' (listening to a sound in a sandbox)`)}
        const viewOfValue = args.viewOf
        let viewOf: ReadonlyArray<string> = []
        if (isDefined(viewOfValue)) {
            if (!isArray(viewOfValue) || viewOfValue.length === 0 || !viewOfValue.every(label => typeof label === "string")) {
                return Attempts.err("'viewOf' must be a list of 'mix' and/or unit labels")
            }
            viewOf = viewOfValue.map(label => String(label)).filter((label, index, array) => array.indexOf(label) === index)
            if (viewOf.length > MaxViewTargets) {return Attempts.err(`'viewOf' takes at most ${MaxViewTargets} channels per call`)}
            if (viewOf.length * views.length > MaxSoundImages) {
                return Attempts.err(`${viewOf.length} channels x ${views.length} views exceed ${MaxSoundImages} images; request fewer`)
            }
        }
        return parseProject(args).map(({bars, stems}): ListenArguments => ({source: {kind: "project", bars, stems, viewOf}, focus: focus.result(), views}))
    }

    const parseProject = ({bars: barsValue, stems: stemsValue}: JsonObject): Attempt<{ bars: Optional<BarRange>, stems: Optional<StemRequest> }, string> => {
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
        return Attempts.ok({bars, stems})
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

    /** One channel for a view: the default render, the mix alone, or one stem drawn as if it were the mix. */
    export const viewTarget = (render: AgentRender, label: Optional<string>): Optional<AgentRender> => {
        if (!isDefined(label)) {return render}
        if (label.trim().toLowerCase() === MixTarget) {return {...render, stems: []}}
        const stem = render.stems.find(candidate => candidate.label.toLowerCase() === label.trim().toLowerCase())
        return isDefined(stem) ? {...render, mix: stem.channels, stems: []} : undefined
    }
}

export const createListenTool = (deps: ListenToolDeps): AgentTool => {
    const {project, analyze, supportsImages, sandbox} = deps
    const render = deps.render ?? ((source: Project, request: AgentRenderRequest) => AgentRenderer.render(source, request))
    const resolveSpan = deps.resolveSpan ?? ((source: Project, bars: Optional<BarRange>) =>
        AgentRenderer.resolveSpan(source, {bars}, AgentRenderer.DefaultSampleRate))
    const views = deps.views ?? ListenViews.all()
    const viewsOf = (keys: ReadonlyArray<string>): ReadonlyArray<ListenView> =>
        keys.flatMap(key => views.filter(view => view.key === key))
    const stemCount = deps.stemCount ?? ((source: Project) => AgentRenderer.stemLabels(source).length)
    let queue: Promise<unknown> = Promise.resolve()
    const listenProject = async (requestedBars: Optional<BarRange>, listedStems: Optional<StemRequest>, viewOf: ReadonlyArray<string>,
                                 focus: Optional<ListenFocus>, viewKeys: ReadonlyArray<string>): Promise<AgentToolResult> => {
        const viewStems = viewOf.filter(label => label.toLowerCase() !== ListenTool.MixTarget)
        const stems: Optional<StemRequest> = viewStems.length === 0 ? listedStems
            : Array.isArray(listedStems) ? [...listedStems, ...viewStems.filter(label => !listedStems.includes(label))]
                : listedStems === "none" ? viewStems : listedStems
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
        if (isDefined(stems) && stems !== "none" && !withinBudget) {
            return AgentToolResult.failure(`${stemTotal} stems x ${Math.round(seconds)} s exceeds the stem budget of ${ListenTool.StemBudgetSeconds} stem-seconds. Pass fewer bars or fewer stem labels.`)
        }
        const effectiveStems: StemRequest = stems ?? (withinBudget ? "all" : viewStems.length > 0 ? viewStems : "none")
        const budgetNote = !isDefined(stems) && !withinBudget
            ? [`Stems skipped: ${stemTotal} stems x ${Math.round(seconds)} s exceeds ${ListenTool.StemBudgetSeconds} stem-seconds; pass fewer bars or a list of stem labels.`] : []
        const rendered = await Promises.tryCatch(render(source, {bars, stems: effectiveStems}))
        if (rendered.status === "rejected") {return AgentToolResult.failure(`Render failed: ${ListenTool.describeError(rendered.error)}`)}
        const result = rendered.value
        const noteChannel = viewStems.at(0) ?? (Array.isArray(listedStems) ? listedStems.at(0) : undefined) ?? ListenTool.MixTarget
        const noteSource = focus?.kind === "note" ? ListenTool.viewTarget(result, noteChannel) : undefined
        const focusNotes = isDefined(noteSource) ? SoundDescriptors.detectNotes(noteSource.mix, noteSource.sampleRate, noteSource.stepSeconds) : []
        const zoom = isDefined(focus) ? ListenFocus.window(focus, focusNotes, AgentRender.frameCount(result), result.sampleRate) : undefined
        if (isDefined(zoom) && zoom.isFailure()) {return AgentToolResult.failure(zoom.failureReason())}
        const window = zoom?.result()
        const describedSeconds = (isDefined(window) ? (window.endFrame - window.startFrame) / result.sampleRate : seconds)
            * Math.max(1, result.stems.length)
        const wantsDescriptors = isDefined(window) || Array.isArray(stems)
        const describe = wantsDescriptors && describedSeconds <= ListenTool.DescribeBudgetSeconds
        const describeNote = wantsDescriptors && !describe
            ? [`Sound descriptors skipped: ${Math.round(describedSeconds)} stem-seconds exceed ${ListenTool.DescribeBudgetSeconds}; list fewer stems or bars, or focus on a shorter window.`] : []
        const analysed = tryCatch(() => analyze(result, window, describe))
        const analysis: JsonValue = analysed.status === "success"
            ? analysed.value : {error: ListenTool.describeError(analysed.error)}
        const images: Array<string> = []
        const renderedViews: Array<string> = []
        const notes: Array<string> = [...budgetNote, ...describeNote]
        const requested = viewsOf(viewKeys)
        if (requested.length > 0 && !supportsImages()) {
            notes.push("The current model does not accept images; views were skipped.")
        } else if (requested.length > 0) {
            const zoomed = isDefined(window) ? AgentRender.crop(result, window) : result
            const needsNotes = requested.some(view => view.usesNotes === true)
            const targets: ReadonlyArray<Optional<string>> = viewOf.length > 0 ? viewOf : [undefined]
            for (const label of targets) {
                const target = ListenTool.viewTarget(zoomed, label)
                if (!isDefined(target)) {
                    notes.push(`viewOf '${label}' is not a rendered channel; channels: mix, ${zoomed.stems.map(stem => stem.label).join(", ")}`)
                    continue
                }
                const targetNotes = needsNotes ? SoundDescriptors.detectNotes(target.mix, target.sampleRate, target.stepSeconds) : []
                for (const view of requested) {
                    const image = await Promises.tryCatch(view.render({render: target, notes: targetNotes, compact: false, title: label}))
                    if (image.status === "resolved") {
                        images.push(image.value)
                        renderedViews.push(isDefined(label) ? `${view.key}:${label}` : view.key)
                    } else {
                        notes.push(`View '${view.key}' failed: ${ListenTool.describeError(image.error)}`)
                    }
                }
            }
        }
        const payload: JsonObject = {
            ...ListenTool.facts(result),
            ...(isDefined(window) && isDefined(focus) ? {focus: {
                ...ListenFocus.describe(focus, window, result.sampleRate), ...(focus.kind === "note" ? {notesOf: noteChannel} : {})
            }} : {}),
            analysis, views: renderedViews, ...(notes.length > 0 ? {notes} : {})
        }
        return AgentToolResult.withImages(AgentToolResult.json(payload), images)
    }
    const listen = ({source, focus, views: viewKeys}: ListenArguments): Promise<AgentToolResult> => {
        if (source.kind === "sound") {
            if (!isDefined(sandbox)) {return Promise.resolve(AgentToolResult.failure("Listening to a 'sound' is not available here"))}
            return SoundSource.listen(sandbox, source.request, {views: viewsOf(viewKeys), focus, supportsImages: supportsImages()})
        }
        const next = queue.then(() => listenProject(source.bars, source.stems, source.viewOf, focus, viewKeys))
        queue = next.catch(() => undefined)
        return next
    }
    return {
        name: ListenTool.Name,
        description: ListenTool.describe(views),
        inputSchema: ListenTool.inputSchema(views),
        concurrent: ListenTool.usesSound,
        execute: (args: JsonObject): Promise<AgentToolResult> => ListenTool.parseArguments(args, views.map(({key}) => key)).match({
            err: (message: string) => Promise.resolve(AgentToolResult.failure(message)),
            ok: (parsed: ListenArguments) => listen(parsed)
        })
    }
}
