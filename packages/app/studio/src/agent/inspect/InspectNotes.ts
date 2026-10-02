import {CodeCellImageHint} from "@/agent/CodeCellImages"
import {Attempt, Attempts, int, isDefined, Option, Optional, Provider} from "@opendaw/lib-std"
import {LoopableRegion, PPQN, ppqn} from "@opendaw/lib-dsp"
import {NoteNames} from "@/agent/NoteNames"
import {AgentTool, AgentToolResult, CodexJson, JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AudioUnitBoxAdapter, NoteRegionBoxAdapter, TrackType} from "@opendaw/studio-adapters"
import {Project} from "@opendaw/studio-core"
import {BarClock} from "./BarClock"
import {InspectUnits} from "./InspectUnits"

export type ResolvedNote = {
    readonly position: ppqn
    readonly duration: ppqn
    readonly pitch: int
    readonly velocity: number
}

export type NoteRange = {
    readonly from: ppqn
    readonly to: ppqn
}

export type PianoRollRenderer = (notes: ReadonlyArray<ResolvedNote>, range: NoteRange) => Promise<string>

type BarSpan = { readonly from: int, readonly to: int }

type NotesFormat = "grid" | "list"

const DefaultBarLimit = 32
const ListLimit = 1000
const Step = PPQN.SemiQuaver

const isPositiveInteger = (value: Optional<JsonValue>): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 1

const notesOfRegion = (region: NoteRegionBoxAdapter, {from, to}: NoteRange): ReadonlyArray<ResolvedNote> =>
    region.optCollection.mapOr(collection => {
        const notes: Array<ResolvedNote> = []
        for (const {rawStart, resultStart, resultEnd, regionEnd}
            of LoopableRegion.locateLoops(region, from - collection.maxDuration, to)) {
            for (const event of collection.events.iterateRange(Math.floor(resultStart - rawStart), Math.floor(resultEnd - rawStart))) {
                const position = rawStart + event.position
                const complete = Math.min(position + event.duration, regionEnd)
                if (complete > from && position < to) {
                    notes.push({position, duration: complete - position, pitch: event.pitch, velocity: event.velocity})
                }
            }
        }
        return notes
    }, [])

const noteRegionsOf = (unit: AudioUnitBoxAdapter): ReadonlyArray<NoteRegionBoxAdapter> =>
    unit.tracks.collection.adapters()
        .filter(track => track.type === TrackType.Notes && track.enabled.getValue())
        .flatMap(track => track.regions.collection.asArray())
        .filter((region): region is NoteRegionBoxAdapter => region.isNoteRegion() && !region.mute)

export const resolveNotes = (unit: AudioUnitBoxAdapter, range: NoteRange): ReadonlyArray<ResolvedNote> =>
    noteRegionsOf(unit)
        .filter(region => region.position < range.to && region.complete > range.from)
        .flatMap(region => notesOfRegion(region, range))
        .toSorted((left, right) => left.position - right.position || right.pitch - left.pitch)

const onsetSymbol = (velocity: number): string =>
    velocity >= 0.95 ? "x" : String(Math.min(9, Math.max(1, Math.floor(velocity * 10))))

const LabelWidth = 8

const pitchLabel = (pitch: int): string => `${NoteNames.ofMidi(pitch)}/${pitch}`.padEnd(LabelWidth)

const renderBar = (clock: BarClock, bar: int, notes: ReadonlyArray<ResolvedNote>): ReadonlyArray<string> => {
    const barStart = clock.barStart(bar)
    const barEnd = barStart + clock.barDuration(bar)
    const steps = Math.max(1, Math.round((barEnd - barStart) / Step))
    const rows = new Map<int, Array<string>>()
    let offGrid = 0
    notes.filter(note => note.position < barEnd && note.position + note.duration > barStart).forEach(note => {
        const row = rows.get(note.pitch) ?? new Array<string>(steps).fill(".")
        rows.set(note.pitch, row)
        const complete = note.position + note.duration
        if (note.position >= barStart) {
            const step = Math.min(steps - 1, Math.floor((note.position - barStart) / Step))
            row[step] = onsetSymbol(note.velocity)
            if ((note.position - barStart) % Step !== 0) {offGrid++}
        }
        for (let step = 0; step < steps; step++) {
            const stepStart = barStart + step * Step
            if (stepStart > note.position && stepStart < complete && row[step] === ".") {row[step] = "-"}
        }
    })
    const lines = Array.from(rows.entries())
        .sort(([left], [right]) => right - left)
        .map(([pitch, row]) => `${pitchLabel(pitch)}${row.join("")}`)
    return offGrid === 0 ? lines : [...lines, `(${offGrid} onsets off the 16th grid)`]
}

type UnitNotes = { readonly label: string, readonly notes: ReadonlyArray<ResolvedNote> }

const MaxUnits = 6

const renderParts = (clock: BarClock, bar: int, parts: ReadonlyArray<UnitNotes>): ReadonlyArray<string> => {
    const sections = parts.map(part => ({label: part.label, rows: renderBar(clock, bar, part.notes)}))
    if (sections.every(({rows}) => rows.length === 0)) {return []}
    const barStart = clock.barStart(bar)
    const steps = Math.max(1, Math.round(clock.barDuration(bar) / Step))
    const onsets = Array.from({length: steps}, (_, step) => {
        const start = barStart + step * Step
        const hits = parts.flatMap((part, index) =>
            part.notes.some(note => note.position >= start && note.position < start + Step) ? [index + 1] : [])
        return hits.length === 0 ? "." : hits.length === 1 ? String(hits[0]) : "+"
    })
    return [
        ...sections.flatMap(({label, rows}, index) =>
            rows.length === 0 ? [`[${index + 1} ${label}] rest`] : [`[${index + 1} ${label}]`, ...rows]),
        `${"all".padEnd(LabelWidth)}${onsets.join("")}`
    ]
}

const renderGrid = (clock: BarClock, span: BarSpan, renderLines: (bar: int) => ReadonlyArray<string>): ReadonlyArray<string> => {
    const baseSignature = clock.signatureAtBar(span.from)
    const groups: Array<{ from: int, to: int, lines: ReadonlyArray<string>, key: string }> = []
    for (let bar = span.from; bar <= span.to; bar++) {
        const signature = clock.signatureAtBar(bar)
        const lines = renderLines(bar)
        const key = `${signature}\n${lines.join("\n")}`
        const last = groups.at(-1)
        if (isDefined(last) && last.key === key) {
            last.to = bar
        } else {
            groups.push({from: bar, to: bar, lines, key})
        }
    }
    return groups.flatMap(({from, to, lines}) => {
        const signature = clock.signatureAtBar(from)
        const head = from === to ? `bar ${from + 1}` : `bars ${from + 1}-${to + 1}`
        const suffix = signature === baseSignature ? "" : ` (${signature})`
        return lines.length === 0 ? [`${head}${suffix}: rest`] : [`${head}${suffix}:`, ...lines]
    })
}

const renderList = (clock: BarClock, notes: ReadonlyArray<ResolvedNote>): ReadonlyArray<string> => {
    const lines = notes.slice(0, ListLimit).map(({position, duration, pitch, velocity}) => {
        const {bar, beat} = clock.locate(position)
        const beatStart = clock.barStart(bar) + beat * PPQN.fromSignature(1, clock.segmentAtBar(bar).denominator)
        return `${bar + 1}.${beat + 1}.${Math.round(position - beatStart)} ${pitch}(${NoteNames.ofMidi(pitch)}) ${Math.round(duration)} ${velocity.toFixed(2)}`
    })
    return notes.length > ListLimit ? [...lines, `(${notes.length - ListLimit} more notes omitted)`] : lines
}

const defaultSpan = (clock: BarClock, units: ReadonlyArray<AudioUnitBoxAdapter>): Option<BarSpan> => {
    const regions = units.flatMap(unit => noteRegionsOf(unit))
    if (regions.length === 0) {return Option.None}
    const from = clock.barOf(Math.min(...regions.map(region => region.position)))
    const to = clock.barOf(Math.max(...regions.map(region => region.complete)) - 1)
    return Option.wrap({from, to})
}

export const inspectNotes = async (project: Project, unitLabels: ReadonlyArray<string>, bars: Option<BarSpan>,
                                   format: NotesFormat, image: boolean,
                                   renderPianoRoll?: PianoRollRenderer): Promise<AgentToolResult> => {
    const entries = InspectUnits.list(project)
    const found = unitLabels.map(unitLabel => ({unitLabel, entry: InspectUnits.find(entries, unitLabel)}))
    const unknown = found.filter(({entry}) => entry.isEmpty()).map(({unitLabel}) => unitLabel)
    if (unknown.length > 0) {
        return AgentToolResult.failure(`Unknown unit '${unknown.join("', '")}'. Units: ${entries.map(entry => entry.label).join(", ")}`)
    }
    const units = found.map(({entry}) => entry.unwrap())
    const label = units.map(unit => unit.label).join(" + ")
    const clock = new BarClock(project.timelineBoxAdapter.signatureTrack)
    const optContent = bars.nonEmpty() ? bars : defaultSpan(clock, units.map(unit => unit.adapter))
    if (optContent.isEmpty()) {return AgentToolResult.text(`${label}: no note regions`)}
    const content = optContent.unwrap()
    const truncated = bars.isEmpty() && content.to - content.from + 1 > DefaultBarLimit
    const span: BarSpan = truncated ? {from: content.from, to: content.from + DefaultBarLimit - 1} : content
    const range: NoteRange = {from: clock.barStart(span.from), to: clock.barStart(span.to + 1)}
    const parts: ReadonlyArray<UnitNotes> = units.map(unit => ({label: unit.label, notes: resolveNotes(unit.adapter, range)}))
    const notes = parts.flatMap(part => part.notes)
    const legend = format === "grid"
        ? "rows: name/MIDI (C4 = MIDI 60, A4 = 440 Hz); 16th grid: x=full velocity, 1-9=velocity tenths, -=sustain, .=rest"
        + (parts.length > 1 ? "; all = which part starts a note on that 16th (+ = several)" : "")
        : "bar.beat.tick pitch(name) len vel; ticks: 960 per quarter"
    const header = `${label} · bars ${span.from + 1}-${span.to + 1} · ${clock.signatureAtBar(span.from)} · ${notes.length} notes · ${legend}`
    const body = format === "list"
        ? parts.length === 1 ? renderList(clock, notes) : parts.flatMap(part => [`[${part.label}]`, ...renderList(clock, part.notes)])
        : parts.length === 1 ? renderGrid(clock, span, bar => renderBar(clock, bar, notes))
            : renderGrid(clock, span, bar => renderParts(clock, bar, parts))
    const footer = truncated
        ? [`(showing ${DefaultBarLimit} of ${content.to - content.from + 1} bars, pass bars to see more)`] : []
    const lines = [header, ...body, ...footer]
    if (!image) {return AgentToolResult.text(lines.join("\n"))}
    if (!isDefined(renderPianoRoll)) {return AgentToolResult.text([...lines, "(piano-roll image unavailable)"].join("\n"))}
    return AgentToolResult.withImages(AgentToolResult.text(lines.join("\n")), [await renderPianoRoll(notes, range)])
}

const parseBars = (value: Optional<JsonValue>): Attempt<Option<BarSpan>, string> => {
    if (!isDefined(value)) {return Attempts.ok(Option.None)}
    if (!CodexJson.isJsonObject(value)) {return Attempts.err("bars must be an object {from, to}")}
    const {from, to} = value
    if (!isPositiveInteger(from) || !isPositiveInteger(to) || to < from) {
        return Attempts.err("bars.from and bars.to must be integers >= 1 with from <= to")
    }
    return Attempts.ok(Option.wrap({from: from - 1, to: to - 1}))
}

export const createInspectNotesTool = (project: Provider<Project>, renderPianoRoll?: PianoRollRenderer): AgentTool => ({
    name: "inspect_notes",
    description: "Note content of one audio unit (unit) or of several parts together (units, up to 6), resolved on " +
        "the timeline (regions, loops, muting). With units every bar shows each part's rows plus an 'all' row marking " +
        "which part starts a note on each 16th, to judge how parts relate (call and response, collisions, density). " +
        "format 'grid' (default) prints per bar a 16th-step row per pitch (x=full velocity, digits 1-9 = velocity " +
        "tenths, - = sustained, . = rest); identical consecutive bars are merged. format 'list' prints one note per " +
        "line: bar.beat.tick pitch(name) length-in-ticks velocity (960 ticks per quarter). " +
        "bars is 1-based and inclusive; without it all bars with note regions are shown (max 32). " +
        "image=true attaches a piano-roll picture when available. " + CodeCellImageHint,
    inputSchema: {
        type: "object",
        properties: {
            unit: {type: "string", description: "Unit label as returned by inspect_project."},
            units: {type: "array", items: {type: "string"}, description: "Several unit labels to view together."},
            bars: {
                type: "object",
                description: "Inclusive 1-based bar range.",
                properties: {from: {type: "integer", minimum: 1}, to: {type: "integer", minimum: 1}},
                required: ["from", "to"],
                additionalProperties: false
            },
            format: {type: "string", enum: ["grid", "list"]},
            image: {type: "boolean"}
        },
        additionalProperties: false
    },
    execute: async (args: JsonObject): Promise<AgentToolResult> => {
        const {unit, units, format, image} = args
        const labels = [
            ...(typeof unit === "string" && unit.trim().length > 0 ? [unit] : []),
            ...(Array.isArray(units) ? units.filter((label): label is string => typeof label === "string" && label.trim().length > 0) : [])
        ]
        if (labels.length === 0) {return AgentToolResult.failure("unit or units is required")}
        if (labels.length > MaxUnits) {return AgentToolResult.failure(`at most ${MaxUnits} units at once`)}
        if (isDefined(format) && format !== "grid" && format !== "list") {
            return AgentToolResult.failure("format must be 'grid' or 'list'")
        }
        const bars = parseBars(args.bars)
        if (bars.isFailure()) {return AgentToolResult.failure(bars.failureReason())}
        return inspectNotes(project(), labels, bars.result(), format === "list" ? "list" : "grid", image === true, renderPianoRoll)
    }
})
