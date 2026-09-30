import {isDefined, Provider} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {AgentTool, AgentToolResult, JsonObject, JsonValue} from "@opendaw/studio-codex"
import {
    AnyRegionBoxAdapter,
    AudioUnitBoxAdapter,
    DeviceBoxAdapter,
    ScriptDeclaration,
    TrackBoxAdapter,
    TrackType
} from "@opendaw/studio-adapters"
import {AudioSendRouting} from "@opendaw/studio-enums"
import {Project} from "@opendaw/studio-core"
import {BarClock} from "./BarClock"
import {InspectUnits, ScriptDeviceAdapter, UnitEntry} from "./InspectUnits"

const MaxRegionsPerTrack = 16
const MaxLabels = 8
const MaxOutput = 8_000

type Context = {
    readonly project: Project
    readonly clock: BarClock
    readonly entries: ReadonlyArray<UnitEntry>
    readonly detailed: boolean
    readonly summarizeRegions: boolean
}

const when = (condition: boolean, value: JsonObject): JsonObject => condition ? value : {}

const round = (value: number, digits: number): number => {
    const scale = 10 ** digits
    return Math.round(value * scale) / scale
}

const barsOf = (clock: BarClock, position: ppqn): number => {
    const bar = clock.barOf(position)
    return round(bar + (position - clock.barStart(bar)) / clock.barDuration(bar), 2)
}

const scriptJson = (adapter: ScriptDeviceAdapter): JsonObject => {
    const code = adapter.box.code.getValue()
    const parameters = adapter.parameters.parameters()
    const params: Record<string, JsonValue> = {}
    ScriptDeclaration.parseParams(code).forEach(({label, defaultValue}) => {
        const parameter = parameters.find(candidate => candidate.name.toLowerCase() === label.toLowerCase())
        params[label] = isDefined(parameter) ? InspectUnits.printValue(parameter) : defaultValue
    })
    return {codeLength: code.length, params}
}

const parametersJson = (context: Context, adapter: DeviceBoxAdapter): JsonObject => {
    const params: Record<string, JsonValue> = {}
    const parameters = InspectUnits.isScriptDevice(adapter)
        ? adapter.parameters.parameters()
        : InspectUnits.parametersOf(context.project, adapter.box)
    parameters.forEach(parameter => {
        const name = isDefined(params[parameter.name]) ? `${parameter.name} (${parameter.address.fieldKeys.join(".")})` : parameter.name
        params[name] = InspectUnits.printValue(parameter)
    })
    return params
}

const deviceJson = (context: Context, adapter: DeviceBoxAdapter, ownerLabel?: string): JsonObject => {
    const type = InspectUnits.deviceType(adapter.box)
    const label = adapter.labelField.getValue()
    const sideChains = InspectUnits.sideChainTargets(adapter.box)
        .map(address => InspectUnits.labelAudioOutput(context.entries, address))
    return {
        type,
        ...when(label.length > 0 && label !== type && label !== ownerLabel, {label}),
        ...when(!adapter.enabledField.getValue(), {enabled: false}),
        ...when(sideChains.length > 0, {sidechain: sideChains}),
        ...(InspectUnits.isScriptDevice(adapter) ? {script: scriptJson(adapter)} : {}),
        ...(context.detailed ? {params: parametersJson(context, adapter)} : {})
    }
}

const regionJson = ({clock}: Context, region: AnyRegionBoxAdapter): JsonObject => {
    const {position, duration, loopDuration, label, mute} = region
    const content: JsonObject = region.isNoteRegion()
        ? {notes: region.optCollection.mapOr(collection => collection.events.length(), 0)}
        : region.isValueRegion()
            ? {events: region.optCollection.mapOr(collection => collection.events.length(), 0)}
            : {}
    return {
        at: clock.format(position),
        len: clock.formatLength(position, duration),
        ...when(label.length > 0, {label}),
        ...content,
        ...when(loopDuration > 0 && loopDuration < duration, {loop: clock.formatLength(position, loopDuration)}),
        ...when(mute, {mute: true})
    }
}

const trackTypeName = (type: TrackType): string => {
    switch (type) {
        case TrackType.Notes:
            return "notes"
        case TrackType.Audio:
            return "audio"
        case TrackType.Value:
            return "automation"
        default:
            return "undefined"
    }
}

const eventCount = (region: AnyRegionBoxAdapter): number => region.isNoteRegion() || region.isValueRegion()
    ? region.optCollection.mapOr(collection => collection.events.length(), 0) : 0

const regionSummaryJson = ({clock}: Context, track: TrackBoxAdapter, regions: ReadonlyArray<AnyRegionBoxAdapter>): JsonObject => {
    if (regions.length === 0) {return {count: 0}}
    const end = regions.reduce((max, region) => Math.max(max, region.complete), 0)
    const labels = Array.from(new Set(regions.map(({label}) => label).filter(label => label.length > 0)))
    const events = regions.reduce((sum, region) => sum + eventCount(region), 0)
    const muted = regions.filter(({mute}) => mute).length
    return {
        count: regions.length,
        span: `${clock.format(regions[0].position)}-${clock.format(end)}`,
        ...when(labels.length > 0, {labels: labels.slice(0, MaxLabels)}),
        ...when(labels.length > MaxLabels, {moreLabels: labels.length - MaxLabels}),
        ...when(events > 0, track.type === TrackType.Notes ? {notes: events} : {events}),
        ...when(muted > 0, {muted})
    }
}

const trackJson = (context: Context, track: TrackBoxAdapter): JsonObject => {
    const regions = track.regions.collection.asArray()
    const limit = context.detailed ? regions.length : MaxRegionsPerTrack
    return {
        type: trackTypeName(track.type),
        ...(track.type === TrackType.Value ? track.targetName.mapOr<JsonObject>(target => ({target}), {}) : {}),
        ...when(!track.enabled.getValue(), {enabled: false}),
        ...(context.summarizeRegions ? {regions: regionSummaryJson(context, track, regions)} : {
            regions: regions.slice(0, limit).map(region => regionJson(context, region)),
            ...when(regions.length > limit, {moreRegions: regions.length - limit})
        })
    }
}

const mixerJson = (context: Context, adapter: AudioUnitBoxAdapter): JsonObject => {
    const {volume, panning, mute, solo} = adapter.namedParameter
    const sends = adapter.auxSends.adapters().map(send => ({
        to: send.optTargetBus.mapOr(bus => InspectUnits.labelOf(context.entries, bus.audioUnitBoxAdapter()), "none"),
        levelDb: round(send.sendGain.getValue(), 1),
        routing: send.routingField.getValue() === AudioSendRouting.Pre ? "pre" : "post"
    }))
    return {
        volumeDb: round(volume.getValue(), 1),
        pan: round(panning.getValue(), 2),
        ...when(mute.getValue(), {mute: true}),
        ...when(solo.getValue(), {solo: true}),
        ...adapter.output.adapter.mapOr<JsonObject>(bus => when(!bus.audioUnitBoxAdapter().isOutput,
            {out: InspectUnits.labelOf(context.entries, bus.audioUnitBoxAdapter())}), {}),
        ...when(sends.length > 0, {sends})
    }
}

const instrumentJson = (context: Context, adapter: AudioUnitBoxAdapter): JsonObject => {
    const input = adapter.input.adapter().unwrapOrNull()
    return isDefined(input) && input.type === "instrument" ? {instrument: deviceJson(context, input, adapter.label)} : {}
}

const unitJson = (context: Context, {adapter, label}: UnitEntry): JsonObject => {
    const midiEffects = adapter.midiEffects.mapOr(collection => collection.adapters(), [])
    const audioEffects = adapter.audioEffects.mapOr(collection => collection.adapters(), [])
    const tracks = adapter.tracks.collection.adapters()
    return {
        label,
        kind: InspectUnits.kindOf(adapter),
        ...instrumentJson(context, adapter),
        ...when(midiEffects.length > 0, {midiFx: midiEffects.map(effect => deviceJson(context, effect))}),
        ...when(audioEffects.length > 0, {audioFx: audioEffects.map(effect => deviceJson(context, effect))}),
        mixer: mixerJson(context, adapter),
        ...when(tracks.length > 0, {tracks: tracks.map(track => trackJson(context, track))})
    }
}

const timelineJson = ({project, clock}: Context): JsonObject => {
    const {timelineBox, timelineBoxAdapter} = project
    const {bpm, loopArea, durationInPulses, tempoTrack} = timelineBox
    const tempoEvents = timelineBoxAdapter.tempoTrackEvents.mapOr(collection => collection.events.length(), 0)
    const signatureChanges = clock.segments.slice(1)
        .map(({bar, nominator, denominator}) => ({bar: bar + 1, signature: `${nominator}/${denominator}`}))
    const markers = timelineBoxAdapter.markerTrack.events.asArray()
        .map(marker => ({at: clock.format(marker.position), label: marker.label}))
    return {
        bpm: round(bpm.getValue(), 2),
        ...when(tempoEvents > 0, {tempoAutomation: {enabled: tempoTrack.enabled.getValue(), events: tempoEvents}}),
        signature: clock.signatureAtBar(0),
        ...when(signatureChanges.length > 0, {signatureChanges}),
        loop: {
            enabled: loopArea.enabled.getValue(),
            from: clock.format(loopArea.from.getValue()),
            to: clock.format(loopArea.to.getValue())
        },
        lengthBars: barsOf(clock, durationInPulses.getValue()),
        ...when(markers.length > 0, {markers})
    }
}

export const inspectProject = (project: Project, focus?: string): AgentToolResult => {
    const entries = InspectUnits.list(project)
    const clock = new BarClock(project.timelineBoxAdapter.signatureTrack)
    if (isDefined(focus)) {
        const context: Context = {project, clock, entries, detailed: true, summarizeRegions: false}
        return InspectUnits.find(entries, focus).match({
            none: () => AgentToolResult.failure(
                `Unknown unit '${focus}'. Units: ${entries.map(entry => entry.label).join(", ")}`),
            some: entry => AgentToolResult.json({...timelineJson(context), units: [unitJson(context, entry)]})
        })
    }
    const listed: Context = {project, clock, entries, detailed: false, summarizeRegions: false}
    const full: JsonObject = {...timelineJson(listed), units: entries.map(entry => unitJson(listed, entry))}
    if (JSON.stringify(full).length <= MaxOutput) {return AgentToolResult.json(full)}
    const context: Context = {...listed, summarizeRegions: true}
    const timeline = timelineJson(context)
    const units: Array<JsonObject> = []
    let length = JSON.stringify(timeline).length
    for (const entry of entries) {
        const unit = unitJson(context, entry)
        length += JSON.stringify(unit).length + 1
        if (length > MaxOutput && units.length > 0) {break}
        units.push(unit)
    }
    const omitted = entries.slice(units.length).map(({label}) => label)
    return AgentToolResult.json({
        ...timeline,
        note: `Large project: regions are summarized per track${omitted.length > 0 ? " and some units are omitted" : ""}. `
            + "Pass focus=<unit label> for every region and parameter of a unit.",
        units,
        ...when(omitted.length > 0, {moreUnits: omitted})
    })
}

export const createInspectProjectTool = (project: Provider<Project>): AgentTool => ({
    name: "inspect_project",
    description: "Compact JSON snapshot of the open project: tempo, signature, loop area, markers, length and all " +
        "audio units in mixer order (instrument, MIDI/audio effect chains, mixer, sends, tracks and regions). " +
        "Positions are 1-based bar.beat[.16th], lengths are bars.beats. Fields at default values are omitted " +
        "(enabled:true, mute:false, out:master output). Unit labels are unique ('Bass', 'Bass #2') and are the handles other tools use. " +
        "Pass focus=<unit label> to get only that unit with every region and device parameter value. " +
        "Large projects are summarized (regions per track: count, span, labels) to stay compact.",
    inputSchema: {
        type: "object",
        properties: {
            focus: {type: "string", description: "Unit label to inspect in detail, including all parameter values."}
        },
        required: [],
        additionalProperties: false
    },
    execute: async (args: JsonObject): Promise<AgentToolResult> => {
        const focus = args.focus
        if (isDefined(focus) && typeof focus !== "string") {return AgentToolResult.failure("focus must be a string")}
        return inspectProject(project(), isDefined(focus) && focus.trim().length > 0 ? focus : undefined)
    }
})
