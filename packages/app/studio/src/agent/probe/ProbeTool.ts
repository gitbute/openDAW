import {Attempt, Attempts, isDefined, Optional, Provider, tryCatch} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import type {AgentTool, JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AgentToolResult} from "@opendaw/studio-codex"
import {CodeCellImageHint} from "@/agent/CodeCellImages"
import {AuditionSandbox} from "@/agent/audition/AuditionSandbox"
import {AuditionSpec, EffectSpec} from "@/agent/audition/AuditionSpec"
import {SoundSource, SoundSourceDeps} from "@/agent/audition/SoundSource"
import {AgentRender} from "@/agent/listen/AgentRender"
import {ProbeMeasure, ProbeResult} from "./ProbeMeasure"
import {ProbeChain, ProbeOutcome, ProbeSandbox} from "./ProbeSandbox"
import {ProbePlan, ProbeSettings, ProbeSignals, ProbeTest} from "./ProbeSignals"
import {LabeledResult, ProbeChart, ProbeViews} from "./ProbeViews"

export type ProbeToolDeps = SoundSourceDeps & {
    readonly supportsImages: Provider<boolean>
    readonly plot?: (chart: ProbeChart) => Promise<string>
}

export type ProbeRequest = {
    readonly tests: ReadonlyArray<ProbeTest>
    readonly chains: ReadonlyArray<ProbeChain>
    readonly settings: ProbeSettings
    readonly bpm: number
    readonly views: ReadonlyArray<ProbeTest>
}

export namespace ProbeTool {
    export const Name = "probe"
    export const MaxVariations = 4

    export const Description = [
        "Plugin Doctor for an effect chain: plays exact test signals through 'effects' (the same format as listen's sound effects:",
        "device key, optional Werkstatt code, params by path) in a throwaway sandbox and measures output against a dry render of the same signals.",
        "Tests (default all): frequency (-18 dBFS log sweep: gain per 1/3 octave, passband level, spread, interior peak and dip, -3 dB roll-off points and slopes);",
        "harmonics (sine, default 100 Hz, at -24/-12/-6/0 dBFS: THD %, residual noise after H10, character; from 0.01 % THD also H2..H10 in dB re H1 and odd vs even energy);",
        "transfer (1 kHz steps -48..+6 dBFS: output rms level per step, outPeakDb too when the crest factor changes, small-signal gain,",
        "compressionStartDb where gain drops 1 dB, ratioAtTop, output ceiling, gate); imd (SMPTE 60 Hz + 7 kHz at 4:1: IMD % and the strongest sidebands);",
        "dynamics (1 kHz tone -30/-6/-30 dBFS: gain reduction, attack and release as the time to 63 %, latency; releaseIncomplete: releaseMs is a lower bound);",
        "impulse (first arrival, wet onset = pre-delay or first echo, echo times and spacing, RT60 and EDT from the Schroeder decay, energy left over time).",
        "Levels are sine-peak dBFS at the chain input (0 dBFS = full-scale sine); gains are output vs input in dB; levels below -120 dB are null or left out.",
        "Use it before trusting a chain on a part: how hard a saturator really distorts and whether it is odd or even, what a compressor or limiter",
        "does (threshold, ratio, attack, release, ceiling), a filter or EQ's real curve, a reverb's decay or a delay's echo spacing.",
        `Up to ${MaxVariations} variations (effects overrides by index) are measured side by side; 'views' adds one plot per test.`,
        "Takes about as long as a short listen; runs in parallel with other tools and never touches the project.", CodeCellImageHint
    ].join(" ")

    const testsSchema = (description: string): JsonObject => ({
        type: "array", maxItems: ProbeSignals.Tests.length, description,
        items: {type: "string", enum: [...ProbeSignals.Tests]}
    })

    const effectsSchema = AuditionSpec.Properties.effects

    export const InputSchema: JsonObject = {
        type: "object",
        additionalProperties: false,
        properties: {
            effects: effectsSchema,
            tests: testsSchema("Tests to run (default all)."),
            variations: {
                type: "array",
                minItems: 1,
                maxItems: MaxVariations,
                description: "Alternative chains measured side by side. 'effects' entries override the base effect at the same index: params merge by path, code replaces, another device replaces it, extra entries are appended. Omit to measure the base chain alone.",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {label: {type: "string", description: "Short unique name"}, effects: effectsSchema},
                    required: ["label", "effects"]
                }
            },
            sineHz: {type: "number", minimum: 20, maximum: 5000, description: "Harmonics test frequency (default 100, snapped to 4 Hz)."},
            imdLevelDb: {type: "number", minimum: -30, maximum: 0, description: "Combined peak level of the IMD two-tone (default -6 dBFS)."},
            bpm: {type: "number", minimum: 30, maximum: 300, description: "Sandbox tempo for tempo-synced effects (default 120)."},
            views: testsSchema("Tests to plot (default none): one PNG per test, all chains overlaid.")
        },
        required: ["effects"]
    }

    const isObject = (value: Optional<JsonValue>): value is JsonObject =>
        isDefined(value) && typeof value === "object" && !Array.isArray(value)

    export const parseEffects = (value: JsonValue, name: string): Attempt<ReadonlyArray<EffectSpec>, string> =>
        AuditionSpec.parseEffects(value).match<Attempt<ReadonlyArray<EffectSpec>, string>>({
            ok: effects => Attempts.ok(effects),
            err: reason => Attempts.err(name === "effects" ? reason : reason.replaceAll("'effects", `'${name}`))
        })

    export const mergeEffects = (base: ReadonlyArray<EffectSpec>, override: ReadonlyArray<EffectSpec>): ReadonlyArray<EffectSpec> => [
        ...base.map((effect, index) => {
            const other = override[index]
            if (!isDefined(other)) {return effect}
            const merged = AuditionSpec.mergeSound({...effect, preset: undefined}, {...other, preset: undefined})
            return {device: merged.device ?? other.device, code: merged.code, params: merged.params}
        }),
        ...override.slice(base.length)
    ]

    const parseTests = (value: Optional<JsonValue>, name: string, fallback: ReadonlyArray<ProbeTest>): Attempt<ReadonlyArray<ProbeTest>, string> => {
        if (!isDefined(value)) {return Attempts.ok(fallback)}
        if (!Array.isArray(value) || !value.every(ProbeSignals.isTest)) {
            return Attempts.err(`'${name}' must be a list of ${ProbeSignals.Tests.map(test => `'${test}'`).join(" | ")}`)
        }
        return Attempts.ok(ProbeSignals.Tests.filter(test => value.includes(test)))
    }

    const numberIn = (value: Optional<JsonValue>, name: string, fallback: number, min: number, max: number): Attempt<number, string> => {
        if (!isDefined(value)) {return Attempts.ok(fallback)}
        return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
            ? Attempts.ok(value) : Attempts.err(`'${name}' must be a number ${min}..${max}`)
    }

    const parseChains = (value: Optional<JsonValue>, base: ReadonlyArray<EffectSpec>): Attempt<ReadonlyArray<ProbeChain>, string> => {
        if (!isDefined(value)) {return Attempts.ok([{label: "base", effects: base}])}
        if (!Array.isArray(value) || value.length === 0) {return Attempts.err("'variations' must be a non-empty list")}
        if (value.length > MaxVariations) {return Attempts.err(`${value.length} variations; probe measures at most ${MaxVariations} per call`)}
        const chains: Array<ProbeChain> = []
        for (const [index, entry] of value.entries()) {
            if (!isObject(entry)) {return Attempts.err(`'variations[${index}]' must be an object {label, effects}`)}
            const {label, effects} = entry
            if (typeof label !== "string" || label.trim().length === 0) {return Attempts.err(`'variations[${index}].label' must be a non-empty string`)}
            if (label.trim() === "dry" || chains.some(chain => chain.label === label.trim())) {
                return Attempts.err(`Duplicate or reserved variation label '${label}'`)
            }
            const parsed = parseEffects(effects ?? null, `variations[${index}].effects`)
            if (parsed.isFailure()) {return Attempts.err(parsed.failureReason())}
            chains.push({label: label.trim(), effects: mergeEffects(base, parsed.result())})
        }
        return Attempts.ok(chains)
    }

    export const parseArguments = (args: JsonObject): Attempt<ProbeRequest, string> => {
        const {effects, tests: testsValue, variations, sineHz, imdLevelDb, bpm: bpmValue, views: viewsValue} = args
        if (!Array.isArray(effects) || effects.length === 0) {return Attempts.err("'effects' is required: the chain to measure, [{device, code?, params?}]")}
        const base = parseEffects(effects, "effects")
        if (base.isFailure()) {return Attempts.err(base.failureReason())}
        const tests = parseTests(testsValue, "tests", ProbeSignals.Tests)
        if (tests.isFailure()) {return Attempts.err(tests.failureReason())}
        if (tests.result().length === 0) {return Attempts.err("'tests' is empty")}
        const views = parseTests(viewsValue, "views", [])
        if (views.isFailure()) {return Attempts.err(views.failureReason())}
        const unmeasured = views.result().find(view => !tests.result().includes(view))
        if (isDefined(unmeasured)) {return Attempts.err(`'views' asks for '${unmeasured}', which is not among the tests`)}
        const chains = parseChains(variations, base.result())
        if (chains.isFailure()) {return Attempts.err(chains.failureReason())}
        const hz = numberIn(sineHz, "sineHz", ProbeSignals.DefaultSettings.sineHz, 20, 5000)
        if (hz.isFailure()) {return Attempts.err(hz.failureReason())}
        const imd = numberIn(imdLevelDb, "imdLevelDb", ProbeSignals.DefaultSettings.imdLevelDb, -30, 0)
        if (imd.isFailure()) {return Attempts.err(imd.failureReason())}
        const bpm = numberIn(bpmValue, "bpm", 120, 30, 300)
        if (bpm.isFailure()) {return Attempts.err(bpm.failureReason())}
        return Attempts.ok({
            tests: tests.result(), chains: chains.result(), settings: {sineHz: hz.result(), imdLevelDb: imd.result()},
            bpm: bpm.result(), views: views.result()
        })
    }

    type Measured = { readonly json: JsonObject, readonly results: ReadonlyArray<ProbeResult> }

    const measureChain = (plans: ReadonlyArray<ProbePlan>, dry: ProbeOutcome, wet: ProbeOutcome): Measured => {
        const {label, stems, error, deviceErrors, warnings} = wet
        const issues: JsonObject = {
            ...(deviceErrors.length > 0 ? {deviceErrors: [...deviceErrors]} : {}),
            ...(warnings.length > 0 ? {warnings: [...warnings]} : {})
        }
        if (!isDefined(stems) || !isDefined(dry.stems)) {return {json: {label, error: error ?? "not rendered", ...issues}, results: []}}
        const {sampleRate} = stems
        const results: Array<ProbeResult> = []
        const tests: Array<[string, JsonValue]> = []
        let nonFinite = 0
        for (const plan of plans) {
            const dryChannels = dry.stems.stems.get(plan.test)
            const wetChannels = stems.stems.get(plan.test)
            if (!isDefined(dryChannels) || !isDefined(wetChannels)) {
                tests.push([plan.test, {error: "no stem rendered"}])
                continue
            }
            const invalid = SoundSource.countNonFinite(wetChannels)
            nonFinite += invalid
            const clean = invalid > 0 ? SoundSource.sanitize(wetChannels) : wetChannels
            if (AgentRender.isSilent(clean)) {
                tests.push([plan.test, {silent: true}])
                continue
            }
            const measured = tryCatch(() => ProbeMeasure.analyse(plan, dryChannels, clean, sampleRate))
            if (measured.status === "failure") {
                tests.push([plan.test, {error: AuditionSandbox.describeError(measured.error)}])
                continue
            }
            results.push(measured.value)
            tests.push([plan.test, ProbeMeasure.toJson(measured.value)])
        }
        return {json: {label, ...Object.fromEntries(tests), ...(nonFinite > 0 ? {nonFiniteSamples: nonFinite} : {}), ...issues}, results}
    }

    export const run = async (deps: ProbeToolDeps, {tests, chains, settings, bpm, views}: ProbeRequest): Promise<AgentToolResult> => {
        const plans = tests.map(test => ProbeSignals.plan(test, settings))
        const startTime = performance.now()
        const [dry, ...wet] = await Promise.all([{label: "dry", effects: []}, ...chains]
            .map(chain => ProbeSandbox.render(deps, chain, plans, bpm)))
        const renderSeconds = (performance.now() - startTime) / 1000
        if (!isDefined(dry.stems)) {return AgentToolResult.failure(`The dry reference failed: ${dry.error ?? "not rendered"}`)}
        const measured = wet.map(outcome => measureChain(plans, dry, outcome))
        const notes: Array<string> = []
        const images: Array<string> = []
        const plotted: Array<JsonValue> = []
        if (views.length > 0 && !deps.supportsImages()) {notes.push("The current model does not accept images; views were skipped.")}
        if (views.length > 0 && deps.supportsImages()) {
            const plot = deps.plot ?? ProbeViews.renderPng
            for (const test of views) {
                const entries: ReadonlyArray<LabeledResult> = measured.flatMap(({results}, index) =>
                    results.filter(probe => probe.test === test).map(probe => ({label: chains[index].label, probe})))
                if (entries.length === 0) {continue}
                const image = await Promises.tryCatch(plot(ProbeViews.chartOf(test, entries)))
                if (image.status === "resolved") {
                    plotted.push({test, image: images.length})
                    images.push(image.value)
                } else {
                    notes.push(`View '${test}' failed: ${AuditionSandbox.describeError(image.error)}`)
                }
            }
        }
        const payload: JsonObject = {
            setup: {
                sampleRate: dry.stems.sampleRate, bpm, tests: [...tests], signalSeconds: Math.round(dry.stems.seconds * 100) / 100,
                levels: "sine-peak dBFS at the chain input (0 dBFS = full-scale sine)"
            },
            chains: measured.map(({json}) => json),
            ...(plotted.length > 0 ? {views: plotted} : {}),
            renderSeconds: Math.round(renderSeconds * 100) / 100,
            ...(dry.deviceErrors.length > 0 ? {dryDeviceErrors: [...dry.deviceErrors]} : {}),
            ...(notes.length > 0 ? {notes} : {})
        }
        return AgentToolResult.withImages(AgentToolResult.json(payload), images)
    }
}

export const createProbeTool = (deps: ProbeToolDeps): AgentTool => ({
    name: ProbeTool.Name,
    description: ProbeTool.Description,
    inputSchema: ProbeTool.InputSchema,
    concurrent: true,
    execute: (args: JsonObject): Promise<AgentToolResult> => ProbeTool.parseArguments(args).match({
        err: (message: string) => Promise.resolve(AgentToolResult.failure(message)),
        ok: (request: ProbeRequest) => ProbeTool.run(deps, request)
    })
})
