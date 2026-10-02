import {int, isDefined, Optional, tryCatch} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {Promises} from "@opendaw/lib-runtime"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {ProjectImpl, ScriptHostProtocol} from "@opendaw/studio-scripting"
import {Project, ProjectEnv} from "@opendaw/studio-core"
import {AuditionSandbox} from "@/agent/audition/AuditionSandbox"
import type {SoundSourceDeps} from "@/agent/audition/SoundSource"
import type {EffectSpec} from "@/agent/audition/AuditionSpec"
import {AgentRenderer} from "@/agent/listen/AgentRenderer"
import {ProbePlan, ProbeSignals, ProbeTest} from "./ProbeSignals"

export type ProbeChain = { readonly label: string, readonly effects: ReadonlyArray<EffectSpec> }

export type ProbeStems = { readonly sampleRate: number, readonly seconds: number, readonly stems: ReadonlyMap<ProbeTest, ReadonlyArray<Float32Array>> }

export type ProbeOutcome = {
    readonly label: string
    readonly stems: Optional<ProbeStems>
    readonly error: Optional<string>
    readonly deviceErrors: ReadonlyArray<string>
    readonly warnings: ReadonlyArray<string>
}

export namespace ProbeSandbox {
    export const unitLabel = (test: ProbeTest): string => `Probe ${test}`

    export const barsFor = (seconds: number, bpm: number): int => Math.max(1, Math.ceil(seconds / (240 / bpm) - 1e-9))

    // the +12 dB Werkstatt after the generator: Apparat output is limited at 0 dBFS
    export const build = (host: ScriptHostProtocol, env: ProjectEnv, plans: ReadonlyArray<ProbePlan>,
                          effects: ReadonlyArray<EffectSpec>, bpm: number, bars: int): Project => {
        const scripted = new ProjectImpl(host, ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false}), "Probe")
        scripted.bpm = bpm
        plans.forEach(({test, segment}) => {
            const unit = scripted.addInstrumentUnit("Apparat", {label: unitLabel(test)})
            unit.instrument.code = ProbeSignals.generatorCode(segment)
            unit.addAudioEffect("Werkstatt").code = ProbeSignals.PreGainCode
            effects.forEach((effect, index) => AuditionSandbox.addEffect(unit, effect, index))
            const track = unit.noteTracks.at(0) ?? unit.addNoteTrack()
            track.addRegion({position: 0, duration: bars * PPQN.Bar})
                .addEvents([{pitch: 60, velocity: 1, position: 0, duration: bars * PPQN.Bar}])
        })
        const skeleton = ProjectSkeleton.decode(ProjectSkeleton.encode(scripted.context.skeleton.boxGraph))
        return Project.fromSkeleton(env, skeleton)
    }

    const splitWarnings = (warnings: ReadonlyArray<string>, labels: ReadonlyArray<string>): { deviceErrors: ReadonlyArray<string>, warnings: ReadonlyArray<string> } => {
        const prefixes = [...labels, "Master"].map(label => `${label}: `)
        const deviceErrors = new Set<string>()
        const rest = new Set<string>()
        warnings.forEach(warning => {
            const prefix = prefixes.find(candidate => warning.startsWith(candidate))
            if (isDefined(prefix)) {
                deviceErrors.add(warning.slice(prefix.length))
            } else if (warning.startsWith("device ")) {
                deviceErrors.add(warning)
            } else if (!warning.startsWith("The mix is silent")) {
                rest.add(labels.reduce((text, label) => text.replace(`'${label}'`, "The chain"), warning))
            }
        })
        return {deviceErrors: [...deviceErrors], warnings: [...rest]}
    }

    export const render = async ({host, env, engine}: SoundSourceDeps, {label, effects}: ProbeChain,
                                 plans: ReadonlyArray<ProbePlan>, bpm: number): Promise<ProbeOutcome> => {
        const failure = (error: string): ProbeOutcome => ({label, stems: undefined, error, deviceErrors: [], warnings: []})
        const seconds = Math.max(...plans.map(plan => plan.seconds))
        const bars = barsFor(seconds, bpm)
        const built = tryCatch(() => build(host, env(), plans, effects, bpm, bars))
        if (built.status === "failure") {return failure(`Setup failed: ${AuditionSandbox.describeError(built.error)}`)}
        const project = built.value
        const scriptErrors = AuditionSandbox.scriptErrors(project)
        if (scriptErrors.length > 0) {
            project.terminate()
            return failure([...new Set(scriptErrors)].join("; "))
        }
        const labels = plans.map(({test}) => unitLabel(test))
        const rendered = await Promises.tryCatch(AgentRenderer.render(project, {bars: {from: 1, to: bars}, stems: labels, tailSeconds: 0},
            undefined, {engine: engine ?? AgentRenderer.offlineEngine}))
        project.terminate()
        if (rendered.status === "rejected") {return failure(`Render failed: ${AuditionSandbox.describeError(rendered.error)}`)}
        const {sampleRate, durationSeconds, stems, warnings} = rendered.value
        const byTest = new Map<ProbeTest, ReadonlyArray<Float32Array>>(plans.flatMap(({test}) => {
            const stem = stems.find(entry => entry.label === unitLabel(test))
            return isDefined(stem) ? [[test, stem.channels]] : []
        }))
        return {label, stems: {sampleRate, seconds: durationSeconds, stems: byTest}, error: undefined, ...splitWarnings(warnings, labels)}
    }
}
