import {int, isDefined, panic, tryCatch, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {ProjectSkeleton, ScriptCompiler} from "@opendaw/studio-adapters"
import {ApparatDeviceBox, WerkstattDeviceBox} from "@opendaw/studio-boxes"
import {
    AnyDevice,
    ApiImpl,
    Apparat,
    AudioEffects,
    Fields,
    InstrumentAudioUnit,
    Instruments,
    ProjectImpl,
    Props,
    ScriptHostProtocol,
    WerkstattEffect
} from "@opendaw/studio-scripting"
import {Project, ProjectEnv} from "@opendaw/studio-core"
import {AuditionNote, EffectSpec, ParamSetting, SoundSpec} from "./AuditionSpec"

export type SandboxSpec = {
    readonly sound: SoundSpec
    readonly effects: ReadonlyArray<EffectSpec>
    readonly notes: ReadonlyArray<AuditionNote>
    readonly bpm: number
    readonly bars: int
}

type ScriptDevice = Apparat | WerkstattEffect

type ScriptKind = { readonly tag: "apparat" | "werkstatt", readonly code: string }

export namespace AuditionSandbox {
    export const UnitLabel = "Sound"

    export const describeError = (error: unknown): string => error instanceof Error ? error.message : String(error)

    const isScriptDevice = (device: AnyDevice): device is ScriptDevice => device.key === "Apparat" || device.key === "Werkstatt"

    const assignPath = (device: AnyDevice, path: string, value: ParamSetting["value"], subject: string): void => {
        const segments = path.split(".")
        const last = segments.pop() ?? path
        let target: unknown = device
        for (const segment of segments) {
            const next: unknown = typeof target === "object" && isDefined(target) ? Reflect.get(target, segment) : undefined
            if (typeof next !== "object" || !isDefined(next)) {
                return panic(`${subject} '${path}': '${segment}' is not a group. Paths: ${Fields.paths(device).join(", ")}`)
            }
            target = next
        }
        const owner = target
        if (typeof owner !== "object" || !isDefined(owner)) {return panic(`${subject} '${path}' cannot be set`)}
        const name = segments.length === 0 ? subject : `${subject} ${segments.join(".")}`
        const applied = tryCatch(() => Props.apply(owner, {[last]: value}, name))
        if (applied.status === "failure") {
            return panic(`${describeError(applied.error)}. Paths of ${device.key}: ${Fields.paths(device).join(", ")}`)
        }
    }

    export const applyParams = (device: AnyDevice, settings: ReadonlyArray<ParamSetting>, subject: string): void => {
        settings.forEach(({path, value}) => {
            if (!isScriptDevice(device)) {return assignPath(device, path, value, subject)}
            if (typeof value === "string") {return panic(`${subject} @param '${path}' needs a number, got '${value}'`)}
            device.parameter(path).value = Number(value)
        })
    }

    const addEffect = (unit: InstrumentAudioUnit, {device, code, params}: EffectSpec, index: int): void => {
        const effect = unit.addAudioEffect(device as keyof AudioEffects)
        const subject = `effects[${index}] (${device})`
        if (isDefined(code)) {
            if (effect.key !== "Werkstatt") {return panic(`${subject}: 'code' needs a Werkstatt effect`)}
            effect.code = code
        }
        applyParams(effect, params, subject)
    }

    const addNotes = (unit: InstrumentAudioUnit, notes: ReadonlyArray<AuditionNote>, bars: int): void => {
        const track = unit.noteTracks.at(0) ?? unit.addNoteTrack()
        const region = track.addRegion({position: 0, duration: bars * PPQN.Bar})
        region.addEvents(notes.map(({pitch, position, duration, velocity}) => ({
            pitch, velocity,
            position: Math.round(position * PPQN.SemiQuaver),
            duration: Math.max(1, Math.round(duration * PPQN.SemiQuaver))
        })))
    }

    export const build = async (host: ScriptHostProtocol, env: ProjectEnv, {sound, effects, notes, bpm, bars}: SandboxSpec): Promise<Project> => {
        const {device, preset, code, params} = sound
        const scripted = new ProjectImpl(host, ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false}), "Audition")
        scripted.bpm = bpm
        const unit = scripted.addInstrumentUnit((device ?? "Vaporisateur") as keyof Instruments, {label: UnitLabel})
        if (isDefined(preset)) {await new ApiImpl(host).applyPreset(unit, preset)}
        const instrument = unit.instrument
        if (isDefined(code)) {
            if (instrument.key !== "Apparat") {return panic(`'code' needs an Apparat instrument, the sound is ${instrument.key}`)}
            instrument.code = code
        }
        if (instrument.key === "Apparat" && instrument.code.trim().length === 0) {return panic("Apparat needs 'code'")}
        applyParams(instrument, params, `params (${instrument.key})`)
        effects.forEach((effect, index) => addEffect(unit, effect, index))
        addNotes(unit, notes, bars)
        const skeleton = ProjectSkeleton.decode(ProjectSkeleton.encode(scripted.context.skeleton.boxGraph))
        return Project.fromSkeleton(env, skeleton)
    }

    const scriptOf = (box: unknown): ReadonlyArray<ScriptKind> => {
        if (box instanceof ApparatDeviceBox) {return [{tag: "apparat", code: box.code.getValue()}]}
        if (box instanceof WerkstattDeviceBox) {return [{tag: "werkstatt", code: box.code.getValue()}]}
        return []
    }

    // Parses (never runs) each script exactly as the offline engine will load it
    export const scriptErrors = (project: Project): ReadonlyArray<string> =>
        project.boxGraph.boxes().flatMap(box => scriptOf(box)).flatMap(({tag, code}) => {
            const match = code.match(new RegExp(`^// @${tag} (\\w+) (\\d+) (\\d+)\n`))
            const userCode = isDefined(match) ? code.slice(match[0].length) : code
            const wrapped = ScriptCompiler.wrap({headerTag: tag, registryName: `${tag}Processors`, functionName: tag},
                UUID.toString(UUID.generate()), 1, userCode)
            const parsed = tryCatch(() => new Function(wrapped))
            return parsed.status === "failure" ? [`${tag === "apparat" ? "Apparat" : "Werkstatt"} code does not compile: ${describeError(parsed.error)}`] : []
        })
}
