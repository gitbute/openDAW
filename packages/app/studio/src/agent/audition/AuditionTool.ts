import {CodeCellImageHint} from "@/agent/CodeCellImages"
import {int, isDefined, Nullable, Option, Optional, Provider, tryCatch} from "@opendaw/lib-std"
import {AudioMetrics, dbToGain} from "@opendaw/lib-dsp"
import {Promises} from "@opendaw/lib-runtime"
import type {AgentTool, JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AgentToolResult} from "@opendaw/studio-codex"
import type {ScriptHostProtocol} from "@opendaw/studio-scripting"
import type {ProjectEnv} from "@opendaw/studio-core"
import {AgentRender} from "@/agent/listen/AgentRender"
import {AgentRenderEngine, AgentRenderer} from "@/agent/listen/AgentRenderer"
import {renderSpectrogramPng} from "@/agent/listen/SpectrogramView"
import {AuditionSandbox} from "./AuditionSandbox"
import {AuditionRequest, AuditionSpec, AuditionVariation} from "./AuditionSpec"

export type AuditionToolDeps = {
    readonly host: ScriptHostProtocol
    readonly env: Provider<ProjectEnv>
    readonly supportsImages?: Provider<boolean>
    readonly engine?: AgentRenderEngine
    readonly renderView?: (render: AgentRender, title: string) => Promise<string>
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

const Regions: ReadonlyArray<readonly [string, number, number]> = [
    ["sub", 20, 60], ["low", 60, 250], ["lowMid", 250, 2000], ["highMid", 2000, 6000], ["high", 6000, 20000]]

export namespace AuditionTool {
    export const Name = "audition"
    export const TailSeconds = 1.0
    export const ViewSize = {width: 512, height: 200} as const

    export const Description = [
        "Audition a sound in a throwaway sandbox project (the open project is never touched): one instrument (any instrument,",
        "Apparat with code, or a preset) plus optional effects plays a built-in pattern or your notes, rendered offline and analysed.",
        `Compare up to ${AuditionSpec.MaxVariations} variations (params/code/preset/device overrides) in one call: per variation`,
        "integrated LUFS and the gain that matches it to the quietest one, peaks, crest, spectrum regions, centroid, onsets,",
        "silence, NaN, and script errors (Apparat/Werkstatt silence themselves after a throw or NaN output).",
        "Safe to run in parallel with other tools and subagents.",
        "Images (views ['spectrogram'], one per variation). " + CodeCellImageHint
    ].join(" ")

    export const round = (value: number, digits: int = 1): Nullable<number> => {
        if (!Number.isFinite(value)) {return null}
        const scale = 10 ** digits
        return Math.round(value * scale) / scale
    }

    export const countNonFinite = (channels: ReadonlyArray<Float32Array>): int =>
        channels.reduce((count, channel) => count + channel.reduce((sum, sample) => Number.isFinite(sample) ? sum : sum + 1, 0), 0)

    const sanitize = (channels: ReadonlyArray<Float32Array>): ReadonlyArray<Float32Array> =>
        channels.map(channel => channel.map(sample => Number.isFinite(sample) ? sample : 0.0))

    export const scale = (channels: ReadonlyArray<Float32Array>, gain: number): ReadonlyArray<Float32Array> =>
        channels.map(channel => channel.map(sample => sample * gain))

    const bandPower = (bands: ReadonlyArray<AudioMetrics.Band>, fromHz: number, toHz: number): Nullable<number> => {
        const power = bands.filter(band => band.centerHz >= fromHz && band.centerHz < toHz)
            .reduce((sum, band) => sum + 10 ** (band.db / 10), 0)
        return power > 1e-12 ? round(10 * Math.log10(power)) : null
    }

    const centroid = (bands: ReadonlyArray<AudioMetrics.Band>): Nullable<number> => {
        const weights = bands.map(band => ({hz: band.centerHz, power: 10 ** (band.db / 10)}))
        const total = weights.reduce((sum, {power}) => sum + power, 0)
        return total > 1e-12 ? Math.round(weights.reduce((sum, {hz, power}) => sum + hz * power, 0) / total) : null
    }

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
        const {outcome: {label, deviceErrors, warnings}, render, analysis: {loudness, spectrum, onsets}, nonFinite, silent} = entry
        return {
            label,
            silent,
            lufs: silent ? null : round(loudness.integratedLufs),
            gainToMatchDb: gainToMatch(entry, reference),
            truePeakDbtp: round(loudness.truePeakDbtp),
            samplePeakDbfs: round(loudness.samplePeakDbfs),
            rmsDbfs: round(loudness.rmsDbfs),
            crestDb: round(loudness.crestDb),
            lra: round(loudness.loudnessRangeLu),
            lufsPerBar: AudioMetrics.loudnessPerSegment(render.mix, render.sampleRate, render.barStartFrames)
                .map(segment => segment.silent ? null : round(segment.lufs)),
            tailRmsDb: tailRmsDb(render),
            regionsDb: Object.fromEntries(Regions.map(([name, fromHz, toHz]) => [name, bandPower(spectrum, fromHz, toHz)])),
            centroidHz: centroid(spectrum),
            onsets: onsets.length,
            ...(nonFinite > 0 ? {nonFiniteSamples: nonFinite} : {}),
            ...(deviceErrors.length > 0 ? {deviceErrors: [...deviceErrors]} : {}),
            ...(warnings.length > 0 ? {warnings: [...warnings]} : {})
        }
    }

    export const failed = ({label, error, deviceErrors}: AuditionOutcome): JsonObject =>
        ({label, error: error ?? "not rendered", ...(deviceErrors.length > 0 ? {deviceErrors: [...deviceErrors]} : {})})

    export const defaultRenderView = (render: AgentRender, title: string): Promise<string> =>
        renderSpectrogramPng(render, {...ViewSize, stems: false, title})
}

export const createAuditionTool = (deps: AuditionToolDeps): AgentTool => {
    const {host, env} = deps
    const supportsImages = deps.supportsImages ?? (() => true)
    const engine = deps.engine ?? AgentRenderer.offlineEngine
    const renderView = deps.renderView ?? AuditionTool.defaultRenderView
    const renderVariation = async ({label, sound}: AuditionVariation, request: AuditionRequest): Promise<AuditionOutcome> => {
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
            {bars: {from: 1, to: bars}, stems: "none", tailSeconds: AuditionTool.TailSeconds}, undefined, {engine}))
        project.terminate()
        if (rendered.status === "rejected") {return failure(`Render failed: ${AuditionSandbox.describeError(rendered.error)}`)}
        return {label, render: rendered.value, error: undefined, ...AuditionTool.splitWarnings(rendered.value.warnings)}
    }
    const audition = async (request: AuditionRequest): Promise<AgentToolResult> => {
        const startTime = performance.now()
        const outcomes = await Promise.all(request.variations.map(variation => renderVariation(variation, request)))
        const renderSeconds = (performance.now() - startTime) / 1000
        const measured = outcomes.map(outcome => {
            const attempt = tryCatch(() => AuditionTool.measure(outcome))
            return attempt.status === "success" ? attempt.value : Option.None
        })
        const reference = AuditionTool.referenceOf(measured.flatMap(entry => entry.mapOr(value => [value], [])))
        const images: Array<string> = []
        const notes: Array<string> = []
        const wantsImages = request.views.length > 0
        if (wantsImages && !supportsImages()) {notes.push("The current model does not accept images; views were skipped.")}
        const variations: Array<JsonValue> = []
        for (const [index, outcome] of outcomes.entries()) {
            const optEntry = measured[index]
            if (optEntry.isEmpty()) {
                variations.push(AuditionTool.failed(outcome))
                continue
            }
            const entry = optEntry.unwrap()
            const summary = AuditionTool.summarize(entry, reference)
            if (!wantsImages || !supportsImages() || entry.silent) {
                variations.push(summary)
                continue
            }
            const gain = AuditionTool.gainToMatch(entry, reference) ?? 0.0
            const matched: AgentRender = {...entry.render, mix: AuditionTool.scale(entry.render.mix, dbToGain(gain))}
            const image = await Promises.tryCatch(renderView(matched, `${outcome.label} (${gain.toFixed(1)} dB)`))
            if (image.status === "resolved") {
                variations.push({...summary, image: images.length})
                images.push(image.value)
            } else {
                variations.push(summary)
                notes.push(`Spectrogram of '${outcome.label}' failed: ${AuditionSandbox.describeError(image.error)}`)
            }
        }
        const payload: JsonObject = {
            setup: {
                bpm: request.bpm, bars: request.bars, tailSeconds: AuditionTool.TailSeconds,
                notes: request.notes.length, ...(isDefined(request.pattern) ? {pattern: request.pattern} : {})
            },
            loudnessMatch: reference.mapOr(({outcome: {label}, analysis: {loudness}}) => ({
                reference: label, referenceLufs: AuditionTool.round(loudness.integratedLufs),
                note: "gainToMatchDb brings each variation to the quietest one; spectrograms are drawn at matched loudness"
            }), null),
            variations,
            renderSeconds: Math.round(renderSeconds * 100) / 100,
            ...(notes.length > 0 ? {notes} : {})
        }
        return AgentToolResult.withImages(AgentToolResult.json(payload), images)
    }
    return {
        name: AuditionTool.Name,
        description: AuditionTool.Description,
        inputSchema: AuditionSpec.InputSchema,
        concurrent: true,
        execute: (args: JsonObject): Promise<AgentToolResult> => AuditionSpec.parseArguments(args).match({
            err: (message: string) => Promise.resolve(AgentToolResult.failure(message)),
            ok: (request: AuditionRequest) => audition(request)
        })
    }
}
