import {Attempt, Attempts, int, isDefined, Nullable, Option, Optional, Provider, tryCatch} from "@opendaw/lib-std"
import {AudioMetrics, dbToGain} from "@opendaw/lib-dsp"
import {Promises} from "@opendaw/lib-runtime"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AgentToolResult} from "@opendaw/studio-codex"
import type {ScriptHostProtocol} from "@opendaw/studio-scripting"
import type {ProjectEnv} from "@opendaw/studio-core"
import {AgentRender, FrameWindow} from "@/agent/listen/AgentRender"
import {AgentRenderEngine, AgentRenderer} from "@/agent/listen/AgentRenderer"
import {ListenFocus} from "@/agent/listen/ListenFocus"
import type {ListenView} from "@/agent/listen/ListenViews"
import {SoundDescriptors} from "@/agent/analysis/SoundDescriptors"
import {ListenAnalysis} from "@/agent/analysis/ListenAnalysis"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import {AuditionSandbox} from "./AuditionSandbox"
import {AuditionNote, AuditionRequest, AuditionVariation} from "./AuditionSpec"

/** What listen needs to render sounds in throwaway sandbox projects. */
export type SoundSourceDeps = {
    readonly host: ScriptHostProtocol
    readonly env: Provider<ProjectEnv>
    readonly engine?: AgentRenderEngine
}

export type SoundListenOptions = {
    readonly views: ReadonlyArray<ListenView>
    readonly focus: Optional<ListenFocus>
    readonly supportsImages: boolean
}

export type AuditionOutcome = {
    readonly label: string
    readonly render: Optional<AgentRender>
    readonly error: Optional<string>
    readonly deviceErrors: ReadonlyArray<string>
    readonly warnings: ReadonlyArray<string>
}

type Measured = {
    readonly outcome: AuditionOutcome
    readonly render: AgentRender
    readonly analysis: AudioMetrics.Analysis
    readonly nonFinite: int
    readonly silent: boolean
}

export namespace SoundSource {
    export const TailSeconds = 1.0

    /** The requested notes in frames: one note per distinct start (a chord is one note, its lowest pitch), running to the next start. */
    export const notesOf = (notes: ReadonlyArray<AuditionNote>, bpm: number, sampleRate: number, totalFrames: int): ReadonlyArray<SoundNote> => {
        const stepFrames = 60.0 / bpm / 4.0 * sampleRate
        const sorted = [...notes].sort((first, second) => first.position - second.position || first.pitch - second.pitch)
        const starts = sorted.filter((note, index) => index === 0 || note.position !== sorted[index - 1].position)
        return starts.map((note, index) => {
            const startFrame = Math.min(totalFrames, Math.round(note.position * stepFrames))
            const next = index + 1 < starts.length ? Math.round(starts[index + 1].position * stepFrames) : totalFrames
            const held = sorted.filter(other => other.position === note.position)
                .reduce((longest, other) => Math.max(longest, other.duration), 0)
            return {
                index: index + 1, startFrame, endFrame: Math.max(startFrame + 1, Math.min(totalFrames, next)),
                offFrame: Math.min(totalFrames, Math.round((note.position + held) * stepFrames)), pitch: note.pitch
            }
        })
    }

    export const round = (value: number, digits: int = 1): Nullable<number> => {
        if (!Number.isFinite(value)) {return null}
        const scale = 10 ** digits
        return Math.round(value * scale) / scale
    }

    export const countNonFinite = (channels: ReadonlyArray<Float32Array>): int =>
        channels.reduce((count, channel) => count + channel.reduce((sum, sample) => Number.isFinite(sample) ? sum : sum + 1, 0), 0)

    export const sanitize = (channels: ReadonlyArray<Float32Array>): ReadonlyArray<Float32Array> =>
        channels.map(channel => channel.map(sample => Number.isFinite(sample) ? sample : 0.0))

    export const scale = (channels: ReadonlyArray<Float32Array>, gain: number): ReadonlyArray<Float32Array> =>
        channels.map(channel => channel.map(sample => sample * gain))

    const tailRmsDb = ({mix, sampleRate, tailSeconds}: AgentRender): Nullable<number> => {
        const frames = Math.round(tailSeconds * sampleRate)
        if (frames <= 0 || mix.length === 0) {return null}
        const start = Math.max(0, mix[0].length - frames)
        let sum = 0.0
        mix.forEach(channel => {
            for (let index = start; index < channel.length; index++) {sum += channel[index] * channel[index]}
        })
        const meanSquare = sum / (frames * mix.length)
        return meanSquare > 1e-12 ? round(10 * Math.log10(meanSquare)) : null
    }

    export const splitWarnings = (warnings: ReadonlyArray<string>): { deviceErrors: ReadonlyArray<string>, warnings: ReadonlyArray<string> } => {
        const isDevice = (warning: string): boolean =>
            warning.startsWith(`${AuditionSandbox.UnitLabel}: `) || warning.startsWith("Master: ") || warning.startsWith("device ")
        return {deviceErrors: warnings.filter(isDevice), warnings: warnings.filter(warning => !isDevice(warning))}
    }

    export const measure = (outcome: AuditionOutcome): Option<Measured> => {
        const {render} = outcome
        if (!isDefined(render)) {return Option.None}
        const nonFinite = countNonFinite(render.mix)
        const mix = nonFinite > 0 ? sanitize(render.mix) : render.mix
        const clean: AgentRender = nonFinite > 0 ? {...render, mix} : render
        const analysis = AudioMetrics.analyse(mix, render.sampleRate)
        return Option.wrap({outcome, render: clean, analysis, nonFinite, silent: AgentRender.isSilent(mix) || analysis.loudness.silent})
    }

    export const referenceOf = (measured: ReadonlyArray<Measured>): Option<Measured> => Option.wrap(
        measured.filter(entry => !entry.silent && Number.isFinite(entry.analysis.loudness.integratedLufs))
            .reduce<Optional<Measured>>((quietest, entry) => !isDefined(quietest)
            || entry.analysis.loudness.integratedLufs < quietest.analysis.loudness.integratedLufs ? entry : quietest, undefined))

    export const gainToMatch = (entry: Measured, reference: Option<Measured>): Nullable<number> => entry.silent ? null
        : reference.mapOr(({analysis}) => round(analysis.loudness.integratedLufs - entry.analysis.loudness.integratedLufs), null)

    export const summarize = (entry: Measured, reference: Option<Measured>): JsonObject => {
        const {outcome: {label, deviceErrors, warnings}, render, analysis: {loudness, spectrum}, nonFinite, silent} = entry
        return {
            label,
            silent,
            ...ListenAnalysis.loudnessOf(loudness),
            ...(silent ? {lufs: null} : {}),
            gainToMatchDb: gainToMatch(entry, reference),
            lufsPerBar: ListenAnalysis.perBarOf(render.mix, render.sampleRate, render.barStartFrames),
            tailRmsDb: tailRmsDb(render),
            spectrumRegionsDb: ListenAnalysis.regionsOf(spectrum),
            ...(nonFinite > 0 ? {nonFiniteSamples: nonFinite} : {}),
            ...(deviceErrors.length > 0 ? {deviceErrors: [...deviceErrors]} : {}),
            ...(warnings.length > 0 ? {warnings: [...warnings]} : {})
        }
    }

    export const failed = ({label, error, deviceErrors}: AuditionOutcome): JsonObject =>
        ({label, error: error ?? "not rendered", ...(deviceErrors.length > 0 ? {deviceErrors: [...deviceErrors]} : {})})

    const renderVariation = async ({host, env, engine}: SoundSourceDeps, {label, sound}: AuditionVariation,
                                   request: AuditionRequest): Promise<AuditionOutcome> => {
        const {effects, notes, bpm, bars} = request
        const failure = (error: string, deviceErrors: ReadonlyArray<string> = []): AuditionOutcome =>
            ({label, render: undefined, error, deviceErrors, warnings: []})
        const built = await Promises.tryCatch(AuditionSandbox.build(host, env(), {sound, effects, notes, bpm, bars}))
        if (built.status === "rejected") {return failure(`Setup failed: ${AuditionSandbox.describeError(built.error)}`)}
        const project = built.value
        const scriptErrors = AuditionSandbox.scriptErrors(project)
        if (scriptErrors.length > 0) {
            project.terminate()
            return failure(scriptErrors.join("; "))
        }
        const rendered = await Promises.tryCatch(AgentRenderer.render(project,
            {bars: {from: 1, to: bars}, stems: "none", tailSeconds: TailSeconds}, undefined,
            {engine: engine ?? AgentRenderer.offlineEngine}))
        project.terminate()
        if (rendered.status === "rejected") {return failure(`Render failed: ${AuditionSandbox.describeError(rendered.error)}`)}
        return {label, render: rendered.value, error: undefined, ...splitWarnings(rendered.value.warnings)}
    }

    type Zoom = { readonly window: Optional<FrameWindow>, readonly notes: ReadonlyArray<SoundNote> }

    const zoomOf = (render: AgentRender, notes: ReadonlyArray<SoundNote>, focus: Optional<ListenFocus>): Attempt<Zoom, string> => {
        if (!isDefined(focus)) {return Attempts.ok({window: undefined, notes})}
        return ListenFocus.window(focus, notes, AgentRender.frameCount(render), render.sampleRate)
            .map(window => ({window, notes: ListenFocus.notesIn(notes, window)}))
    }

    /** Renders every variation in its own sandbox (concurrently) and returns the listen result for them. */
    export const listen = async (deps: SoundSourceDeps, request: AuditionRequest,
                                 {views, focus, supportsImages}: SoundListenOptions): Promise<AgentToolResult> => {
        const startTime = performance.now()
        const outcomes = await Promise.all(request.variations.map(variation => renderVariation(deps, variation, request)))
        const renderSeconds = (performance.now() - startTime) / 1000
        const measured = outcomes.map(outcome => {
            const attempt = tryCatch(() => measure(outcome))
            return attempt.status === "success" ? attempt.value : Option.None
        })
        const reference = referenceOf(measured.flatMap(entry => entry.mapOr(value => [value], [])))
        const images: Array<string> = []
        const notes: Array<string> = []
        if (views.length > 0 && !supportsImages) {notes.push("The current model does not accept images; views were skipped.")}
        const variations: Array<JsonValue> = []
        let focusInfo: Optional<JsonObject> = undefined
        for (const [index, outcome] of outcomes.entries()) {
            const optEntry = measured[index]
            if (optEntry.isEmpty()) {
                variations.push(failed(outcome))
                continue
            }
            const entry = optEntry.unwrap()
            const {render} = entry
            const allNotes = notesOf(request.notes, request.bpm, render.sampleRate, AgentRender.frameCount(render))
            const zoom = zoomOf(render, allNotes, focus)
            if (zoom.isFailure()) {return AgentToolResult.failure(zoom.failureReason())}
            const {window, notes: zoomedNotes} = zoom.result()
            const zoomed = isDefined(window) ? AgentRender.crop(render, window) : render
            if (isDefined(window) && isDefined(focus)) {focusInfo = ListenFocus.describe(focus, window, render.sampleRate)}
            const sound = SoundDescriptors.describe({
                label: outcome.label, channels: zoomed.mix, sampleRate: render.sampleRate, notes: zoomedNotes,
                bpm: request.bpm, stepSeconds: render.stepSeconds, focused: isDefined(window),
                offsetSeconds: isDefined(window) ? window.startFrame / render.sampleRate : 0,
                loudness: isDefined(window) ? undefined : entry.analysis.loudness
            })
            const summary = {...summarize(entry, reference), sound}
            if (views.length === 0 || !supportsImages || entry.silent) {
                variations.push(summary)
                continue
            }
            const gain = gainToMatch(entry, reference) ?? 0.0
            const matched: AgentRender = {...zoomed, mix: scale(zoomed.mix, dbToGain(gain))}
            const indices: Array<int> = []
            for (const view of views) {
                const image = await Promises.tryCatch(view.render({
                    render: matched, notes: zoomedNotes, compact: true, title: `${outcome.label} (${gain.toFixed(1)} dB)`
                }))
                if (image.status === "resolved") {
                    indices.push(images.length)
                    images.push(image.value)
                } else {
                    notes.push(`View '${view.key}' of '${outcome.label}' failed: ${AuditionSandbox.describeError(image.error)}`)
                }
            }
            variations.push(indices.length > 0 ? {...summary, images: indices} : summary)
        }
        const payload: JsonObject = {
            setup: {
                bpm: request.bpm, bars: request.bars, tailSeconds: TailSeconds,
                notes: request.notes.length, ...(isDefined(request.pattern) ? {pattern: request.pattern} : {})
            },
            ...(isDefined(focusInfo) ? {focus: focusInfo} : {}),
            loudnessMatch: reference.mapOr(({outcome: {label}, analysis: {loudness}}) => ({
                reference: label, referenceLufs: round(loudness.integratedLufs),
                note: "gainToMatchDb brings each variation to the quietest one; views are drawn at matched loudness"
            }), null),
            variations,
            renderSeconds: Math.round(renderSeconds * 100) / 100,
            ...(notes.length > 0 ? {notes} : {})
        }
        return AgentToolResult.withImages(AgentToolResult.json(payload), images)
    }
}
