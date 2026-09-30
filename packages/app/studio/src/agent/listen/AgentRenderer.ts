import {int, isDefined, Option, Optional, panic, Procedure, UUID} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {Promises} from "@opendaw/lib-runtime"
import {
    AudioSinkDeviceBoxAdapter,
    AudioUnitBoxAdapter,
    ExportConfiguration,
    ExportStemConfiguration,
    ScriptLoadReport,
    TrackType
} from "@opendaw/studio-adapters"
import {AudioSinkDeviceBox} from "@opendaw/studio-boxes"
import {OfflineEngineRenderer, Project} from "@opendaw/studio-core"
import {AgentRender, AgentRenderRequest} from "./AgentRender"
import {RenderSpan, RenderTimeline} from "./RenderTimeline"
import {InspectUnits} from "@/agent/inspect/InspectUnits"
import {DeviceLoad} from "./DeviceLoad"

export type AgentRenderEngine = (source: Project, configuration: ExportConfiguration, startPpqn: ppqn,
                                 numberOfFrames: int, sampleRate: int, abortSignal: Optional<AbortSignal>,
                                 onDeviceMessage: (uuid: string, message: string) => void,
                                 onScriptLoad: Procedure<ScriptLoadReport>) => Promise<ReadonlyArray<Float32Array>>

export type LabeledUnit = { readonly unit: AudioUnitBoxAdapter, readonly label: string }

export type AgentRenderOptions = { readonly engine?: AgentRenderEngine, readonly sampleRate?: int }

export namespace AgentRenderer {
    export const DefaultSampleRate = 48_000

    export const offlineEngine: AgentRenderEngine = async (source, configuration, startPpqn, numberOfFrames,
                                                           sampleRate, abortSignal, onDeviceMessage, onScriptLoad) => {
        const renderer = await OfflineEngineRenderer
            .create(source, Option.wrap(configuration), sampleRate, abortSignal, onDeviceMessage, true)
        const channels = await renderer.renderFrames(startPpqn, numberOfFrames, abortSignal)
        renderer.scriptLoad.ifSome(onScriptLoad)
        return channels
    }

    export const stemLabels = (project: Project): ReadonlyArray<LabeledUnit> =>
        InspectUnits.list(project).filter(({adapter}) => !adapter.isOutput).map(({adapter, label}) => ({unit: adapter, label}))

    export const resolveSpan = (project: Project, request: AgentRenderRequest, sampleRate: int): RenderSpan => {
        const {timelineBoxAdapter: {signatureTrack}, tempoMap} = project
        const events = Array.from(signatureTrack.iterateAll())
        const bars = request.bars
            ?? {from: 1, to: Math.max(1, RenderTimeline.barsCovering(events, project.lastRegionAction()))}
        return RenderTimeline.span(events, tempoMap, bars, sampleRate, request.tailSeconds ?? 0.0)
    }

    export const hasContent = (unit: AudioUnitBoxAdapter, startPpqn: ppqn, endPpqn: ppqn): boolean =>
        unit.tracks.values().some(track => track.enabled.getValue()
            && (track.type === TrackType.Notes || track.type === TrackType.Audio)
            && track.regions.collection.asArray()
                .some(region => !region.mute && region.position < endPpqn && region.complete > startPpqn))

    type SinkRoute = { readonly owner: string, readonly target: AudioUnitBoxAdapter }

    const sinkRoutes = (project: Project): ReadonlyArray<SinkRoute> => project.boxGraph.boxes().flatMap(box => {
        if (!(box instanceof AudioSinkDeviceBox) || !box.enabled.getValue()) {return []}
        const sink = project.boxAdapters.adapterFor(box, AudioSinkDeviceBoxAdapter)
        return sink.targetBus.adapter.mapOr(bus =>
            [{owner: UUID.toString(sink.audioUnitBoxAdapter().uuid), target: bus.audioUnitBoxAdapter()}], [])
    })

    const targetsOf = (unit: AudioUnitBoxAdapter, sinks: ReadonlyArray<SinkRoute>): ReadonlyArray<AudioUnitBoxAdapter> => [
        ...unit.output.adapter.mapOr(bus => [bus.audioUnitBoxAdapter()], []),
        ...unit.auxSends.adapters().flatMap(send => send.optTargetBus.mapOr(bus => [bus.audioUnitBoxAdapter()], [])),
        ...sinks.filter(({owner}) => owner === UUID.toString(unit.uuid)).map(({target}) => target)
    ]

    export const feedsOf = (project: Project, entries: ReadonlyArray<LabeledUnit>): ReadonlyMap<string, ReadonlyArray<string>> => {
        const labels = new Map<string, string>(entries.map(({unit, label}) => [UUID.toString(unit.uuid), label]))
        const sinks = sinkRoutes(project)
        return new Map(entries.map(({unit, label}) => {
            const reached = new Set<string>([UUID.toString(unit.uuid)])
            const queue = [...targetsOf(unit, sinks)]
            for (let next = queue.shift(); isDefined(next); next = queue.shift()) {
                const key = UUID.toString(next.uuid)
                if (reached.has(key)) {continue}
                reached.add(key)
                queue.push(...targetsOf(next, sinks))
            }
            reached.delete(UUID.toString(unit.uuid))
            return [label, Array.from(reached).flatMap(key => labels.get(key) ?? [])]
        }))
    }

    const stemConfiguration = (fileName: string): ExportStemConfiguration =>
        ({includeAudioEffects: true, includeSends: true, useInstrumentOutput: false, fileName})

    const deviceOwners = (project: Project): ReadonlyMap<string, string> => {
        const owners = new Map<string, string>()
        const register = (label: string, uuid: UUID.Bytes): void => {owners.set(UUID.toString(uuid), label)}
        const master = project.rootBoxAdapter.audioUnits.adapters().filter(unit => unit.isOutput)
        const entries: ReadonlyArray<LabeledUnit> = [...master.map(unit => ({unit, label: "Master"})), ...stemLabels(project)]
        entries.forEach(({unit, label}) => {
            unit.input.adapter().ifSome(input => register(label, input.uuid))
            unit.midiEffects.ifSome(effects => effects.adapters().forEach(effect => register(label, effect.uuid)))
            unit.audioEffects.ifSome(effects => effects.adapters().forEach(effect => register(label, effect.uuid)))
        })
        return owners
    }

    export const render = async (project: Project, request: AgentRenderRequest, abortSignal?: AbortSignal,
                                 options?: AgentRenderOptions): Promise<AgentRender> => {
        const sampleRate = options?.sampleRate ?? DefaultSampleRate
        const engine = options?.engine ?? offlineEngine
        const span = resolveSpan(project, request, sampleRate)
        const {bars, startPpqn, endPpqn, totalFrames} = span
        const master = project.rootBoxAdapter.audioUnits.adapters().find(unit => unit.isOutput)
        if (!isDefined(master)) {return panic("The project has no output unit")}
        const candidates = stemLabels(project)
        const labels = candidates.map(({label}) => label)
        const {indices, unknown} = AgentRender.selectStems(labels, request.stems ?? "none")
        if (unknown.length > 0) {
            return panic(`Unknown stem(s): ${unknown.join(", ")}. Available: ${labels.length === 0 ? "none" : labels.join(", ")}`)
        }
        const selected = indices.map(index => candidates[index])
        const configuration: ExportConfiguration = {
            stems: Object.fromEntries([
                [UUID.toString(master.uuid), stemConfiguration("Mix")],
                ...selected.map(({unit, label}) => [UUID.toString(unit.uuid), stemConfiguration(label)])
            ])
        }
        const owners = deviceOwners(project)
        const deviceMessages = new Set<string>()
        const onDeviceMessage = (uuid: string, message: string): void => {
            deviceMessages.add(`${owners.get(uuid) ?? `device ${uuid}`}: ${message}`)
        }
        let scriptLoad: Option<ScriptLoadReport> = Option.None
        const copy = project.copy()
        const {boxGraph, timelineBox: {loopArea: {enabled}}} = copy
        boxGraph.beginTransaction()
        enabled.setValue(false)
        boxGraph.endTransaction()
        const result = await Promises.tryCatch(
            engine(copy, configuration, startPpqn, totalFrames, sampleRate, abortSignal, onDeviceMessage,
                report => {scriptLoad = Option.wrap(report)}))
        copy.terminate()
        if (result.status === "rejected") {return Promise.reject(result.error)}
        const channels = result.value
        const pair = (index: int): ReadonlyArray<Float32Array> =>
            [channels[index * 2] ?? new Float32Array(totalFrames), channels[index * 2 + 1] ?? new Float32Array(totalFrames)]
        const mix = pair(0)
        const deviceLoad = scriptLoad.mapOr(report => DeviceLoad.entries(report, DeviceLoad.identify(project, owners)), [])
        const warnings: Array<string> = [...deviceMessages, ...DeviceLoad.warnings(deviceLoad)]
        const range = bars.from === bars.to ? `bar ${bars.from}` : `bars ${bars.from}-${bars.to}`
        if (AgentRender.isSilent(mix)) {warnings.push(`The mix is silent (peak below ${AgentRender.SilenceThresholdDb} dBFS) in ${range}`)}
        const muted = candidates.filter(({unit}) => unit.box.mute.getValue()).map(({label}) => label)
        const soloed = candidates.filter(({unit}) => unit.box.solo.getValue()).map(({label}) => label)
        const feeds = feedsOf(project, candidates)
        const stems = selected.map(({unit, label}, index) => {
            const stemChannels = pair(index + 1)
            const silent = AgentRender.isSilent(stemChannels)
            const silenced = unit.box.mute.getValue() || (soloed.length > 0 && !unit.box.solo.getValue())
            if (silent && hasContent(unit, startPpqn, endPpqn) && !silenced) {
                warnings.push(`'${label}' is silent (peak below ${AgentRender.SilenceThresholdDb} dBFS) although it has regions in ${range}`)
            }
            return {label, unitUuid: UUID.toString(unit.uuid), channels: stemChannels, silent, feeds: feeds.get(label) ?? []}
        })
        if (muted.length > 0) {
            warnings.push(`Live project has muted units: ${muted.join(", ")}. They are silent in this mix and in their stems.`)
        }
        if (soloed.length > 0) {
            warnings.push(`Live project has soloed units: ${soloed.join(", ")}. All other units are silent in this mix and in their stems (buses fed by a soloed unit stay audible); unsolo before judging the mix.`)
        }
        return {
            sampleRate, mix, stems, bars,
            startSeconds: span.startSeconds,
            durationSeconds: totalFrames / sampleRate,
            tailSeconds: (totalFrames - span.musicalFrames) / sampleRate,
            barStartFrames: span.barStartFrames,
            stepSeconds: span.stepSeconds,
            bpm: span.bpm,
            signature: span.signature,
            warnings,
            deviceLoad
        }
    }
}
