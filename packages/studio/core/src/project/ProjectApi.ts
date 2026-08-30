import {
    asInstanceOf,
    assert,
    Attempt,
    Attempts,
    clamp,
    float,
    int,
    isAbsent,
    isDefined,
    isInstanceOf,
    Observer,
    Option,
    panic,
    quantizeRound,
    Strings,
    Subscription,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {Interpolation, ppqn, PPQN, TimeBase} from "@opendaw/lib-dsp"
import {Box, BoxGraph, Field, IndexedBox, PointerField} from "@opendaw/lib-box"
import {AudioUnitType, Colors, IconSymbol, Pointers} from "@opendaw/studio-enums"
import {
    AudioClipBox,
    AudioBusBox,
    AudioFileBox,
    AudioRegionBox,
    AudioUnitBox,
    AuxSendBox,
    CaptureAudioBox,
    CaptureMidiBox,
    ApparatDeviceBox,
    NanoDeviceBox,
    NoteClipBox,
    NoteEventBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    PlayfieldDeviceBox,
    SpielwerkDeviceBox,
    TrackBox,
    ValueClipBox,
    ValueEventBox,
    ValueEventCollectionBox,
    ValueRegionBox,
    WerkstattDeviceBox,
    WerkstattSampleBox
} from "@opendaw/studio-boxes"
import {
    AnyRegionBox,
    AnyRegionBoxAdapter,
    AudioBusFactory,
    AudioClipBoxAdapter,
    AudioRegionBoxAdapter,
    AudioUnitBoxAdapter,
    AudioUnitFactory,
    CaptureBox,
    ColorCodes,
    DeviceAccepts,
    DeviceHost,
    Devices,
    DeviceSemantics,
    EffectPointerType,
    IndexedAdapterCollectionListener,
    InstrumentBox,
    InstrumentFactory,
    InstrumentOptions,
    InstrumentProduct,
    InterpolationFieldAdapter,
    NoteEventBoxAdapter,
    NoteEventCollectionBoxAdapter,
    PresetDecoder,
    PresetHeader,
    ProjectQueries,
    RegionAdapters,
    SampleAssignment,
    ScriptCompiler,
    ScriptDeviceConfigs,
    SemanticFields,
    SupportedDeviceBox,
    TrackBoxAdapter,
    TrackType,
    ValueEventCollectionBoxAdapter
} from "@opendaw/studio-adapters"
import type {Sample} from "@opendaw/studio-adapters"
import {Project} from "./Project"
import {ProjectModulation} from "./ProjectModulation"
import {EffectFactory} from "../EffectFactory"
import {EffectBox} from "../EffectBox"
import {FactoryCatalog} from "../FactoryCatalog"
import {PresetSource} from "../presets"
import {AudioContentFactory} from "./audio"
import {NoteMidiExport} from "./NoteMidiExport"
import {AudioWavExport} from "./AudioWavExport"
import {musicalDurationToPulses, musicalPositionToPulses} from "../control-tools/MusicalTime"
import type {MusicalDuration, MusicalPosition} from "../control-tools/MusicalTime"
export type {MusicalDuration, MusicalPosition} from "../control-tools/MusicalTime"

export type ClipRegionOptions = {
    name?: string
    hue?: number
}

export type NoteEventInput = {
    /** OpenDAW musical pulses: 960 pulses equal one quarter note, independent of BPM. */
    position: ppqn
    /** OpenDAW musical pulses: 960 pulses equal one quarter note, independent of BPM. */
    duration: ppqn
    pitch: int
    cent?: number
    velocity?: float
    chance?: int
    playCount?: int
}

export type MusicalNoteEventInput = {
    position: MusicalPosition
    duration: MusicalDuration
    pitch: int
    cent?: number
    velocity?: float
    chance?: int
    playCount?: int
}

export type ValueEventInput = {
    position: ppqn
    index: int
    value: unitValue
    interpolation?: "none" | "linear" | "curve"
    slope?: unitValue
}

export type PresetApplyOptions = {
    source?: PresetSource
    keepMIDIEffects?: boolean
    keepAudioEffects?: boolean
    keepTimeline?: boolean
    insertIndex?: int
}

export type NoteEventOwner = NoteRegionBox | NoteClipBox | NoteEventCollectionBox

export type DevicePropertyChange = {
    path: string
    value: number | string | boolean
}

export type NoteEventParams = {
    owner: NoteEventOwner
    position: ppqn
    duration: ppqn
    pitch: int
    cent?: number
    velocity?: float
    chance?: int
    playCount?: int
}

export type MusicalNoteEventParams = {
    owner: NoteEventOwner
    position: MusicalPosition
    duration: MusicalDuration
    pitch: int
    cent?: number
    velocity?: float
    chance?: int
    playCount?: int
}

export type NoteRegionParams = {
    trackBox: TrackBox
    position: ppqn
    duration: ppqn
    loopOffset?: ppqn
    loopDuration?: ppqn
    eventOffset?: ppqn
    eventOwner?: NoteEventOwner
    mute?: boolean
    name?: string
    hue?: number
}

export type AutomationSeed = {
    value: unitValue
    interpolation: InterpolationFieldAdapter.Plain
}

export type QuantiseNotesOptions = {
    positionQuantisation?: ppqn
    durationQuantisation?: ppqn
    offset?: ppqn
}

const validateMidiNote = (midiNote: int): void => {
    if (!Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) {
        throw new Error("midiNote must be an integer in the range 0..127")
    }
}

// noinspection JSUnusedGlobalSymbols
export class ProjectApi {
    readonly modulation: ProjectModulation

    readonly #project: Project

    constructor(project: Project) {
        this.#project = project
        this.modulation = new ProjectModulation(project)
    }

    setBpm(value: number): void {
        if (isNaN(value)) {return}
        this.#project.timelineBoxAdapter.box.bpm.setValue(clamp(value, 30, 1000))
    }

    catchupAndSubscribeBpm(observer: Observer<number>): Subscription {
        return this.#project.timelineBoxAdapter.box.bpm.catchupAndSubscribe(owner => observer(owner.getValue()))
    }

    catchupAndSubscribeAudioUnits(listener: IndexedAdapterCollectionListener<AudioUnitBoxAdapter>): Subscription {
        return this.#project.rootBoxAdapter.audioUnits.catchupAndSubscribe(listener)
    }

    createInstrument<A, INST extends InstrumentBox>(
        {create, defaultIcon, defaultName, trackType}: InstrumentFactory<A, INST>,
        options: InstrumentOptions<A> = {} as any): InstrumentProduct<INST> {
        const {name, icon, index} = options
        const {boxGraph, rootBox, userEditingManager} = this.#project
        assert(rootBox.isAttached(), "rootBox not attached")
        const existingNames = ProjectQueries.existingInstrumentNames(rootBox)
        const audioUnitBox = AudioUnitFactory.create(this.#project.skeleton,
            AudioUnitType.Instrument, this.#trackTypeToCapture(boxGraph, trackType), index)
        const uniqueName = Strings.getUniqueName(existingNames, name ?? defaultName)
        const iconSymbol = icon ?? defaultIcon
        const instrumentBox = create(boxGraph, audioUnitBox.input, uniqueName, iconSymbol, options.attachment)
        const trackBox = TrackBox.create(boxGraph, UUID.generate(), box => {
            box.index.setValue(0)
            box.type.setValue(trackType)
            box.tracks.refer(audioUnitBox.tracks)
            box.target.refer(audioUnitBox)
        })
        userEditingManager.audioUnit.edit(audioUnitBox.editing)
        return {audioUnitBox, instrumentBox, trackBox}
    }

    /** Create an instrument from a canonical factory after reading its canonical device help. */
    createAnyInstrument(factory: InstrumentFactory<any, any>): InstrumentProduct<InstrumentBox> {
        return this.createInstrument(factory)
    }

    /**
     * Set semantic device properties discovered with `daw_resources.inspect_device`.
     * Paths are canonical device property paths, not raw field addresses. Multiple changes
     * are applied together; use the returned paths exactly when making subsequent edits.
     * Ordinary automatable controls remain available through the generic parameter API.
     */
    setDeviceProperties(device: SupportedDeviceBox,
                        changes: ReadonlyArray<DevicePropertyChange>): void {
        const semantics = DeviceSemantics.forBox(device)
        if (semantics === null) {
            throw new Error(`Unsupported device '${device.name}'.`)
        }
        const writes = changes.map(change => {
            const field = SemanticFields.resolve(semantics.spec, change.path)
            if (field === undefined) {
                throw new Error(`'${change.path}' is not a semantic property of ${semantics.type}. `
                    + "Use inspect_device to discover valid paths.")
            }
            return {field, value: SemanticFields.coerceValue(field, change.value, change.path)}
        })
        writes.forEach(({field, value}) => field.setValue(value))
    }

    createAudioBus(name: string, type: "bus" | "aux" = "bus"): AudioBusBox {
        return type === "aux"
            ? AudioBusFactory.create(this.#project.skeleton, name, IconSymbol.Effects, AudioUnitType.Aux, Colors.green)
            : AudioBusFactory.create(this.#project.skeleton, name, IconSymbol.AudioBus, AudioUnitType.Bus, Colors.orange)
    }

    routeOutput(audioUnitBox: AudioUnitBox, target: AudioBusBox | null): void {
        if (!audioUnitBox.isAttached()) {throw new Error("AudioUnitBox is not attached")}
        if (target === null) {
            audioUnitBox.output.defer()
            return
        }
        if (!target.isAttached()) {throw new Error("AudioBusBox is not attached")}
        const isSelf = target.output.targetVertex.mapOr(vertex => vertex.box === audioUnitBox, false)
        if (isSelf) {throw new Error("An audio unit cannot route to itself")}
        audioUnitBox.output.refer(target.input)
    }

    createAuxSend(audioUnitBox: AudioUnitBox,
                  targetBus: AudioBusBox,
                  sendGain: number = -6.0,
                  sendPan: number = 0.0,
                  routing: int = 0): AuxSendBox {
        if (audioUnitBox.type.getValue() === AudioUnitType.Output) {
            throw new Error("The output audio unit cannot create auxiliary sends")
        }
        if (!targetBus.isAttached()) {throw new Error("AudioBusBox is not attached")}
        const index = IndexedBox.insertOrder(audioUnitBox.auxSends)
        return AuxSendBox.create(this.#project.boxGraph, UUID.generate(), box => {
            box.audioUnit.refer(audioUnitBox.auxSends)
            box.targetBus.refer(targetBus.input)
            box.index.setValue(index)
            box.routing.setValue(routing)
            box.sendGain.setValue(sendGain)
            box.sendPan.setValue(sendPan)
        })
    }

    deleteAuxSend(send: AuxSendBox): void {
        if (!send.isAttached()) {return}
        send.audioUnit.targetVertex.ifSome(vertex => {
            if (vertex instanceof Field) {
                IndexedBox.removeOrder(vertex as Field<Pointers.AuxSend>, send.index.getValue())
            }
        })
        send.delete()
    }

    /** Assign a canonical sample to the Nano instrument, which has no MIDI-note/sample-slot argument. */
    assignNanoSample(target: NanoDeviceBox, sample: Sample): void {
        const assignment = {
            uuid: UUID.parse(sample.uuid),
            name: sample.name,
            durationInSeconds: sample.duration
        }
        SampleAssignment.assignNano(this.#project.boxGraph, target, assignment)
    }

    /**
     * Assign a canonical sample to a Playfield slot.
     * target may be the PlayfieldDeviceBox itself or its containing AudioUnitBox returned by createAnyInstrument.
     * midiNote is the absolute MIDI pitch and Playfield slot index in the range 0..127.
     * Note events in the pattern must use the same MIDI pitch to trigger this sample.
     */
    assignPlayfieldSample(target: PlayfieldDeviceBox | AudioUnitBox, sample: Sample, midiNote: int): void {
        validateMidiNote(midiNote)
        const assignment = {
            uuid: UUID.parse(sample.uuid),
            name: sample.name,
            durationInSeconds: sample.duration
        }
        const playfield = target instanceof PlayfieldDeviceBox
            ? target
            : target.input.pointerHub.incoming().at(0)?.box
        if (!(playfield instanceof PlayfieldDeviceBox)) {
            throw new Error("AudioUnitBox does not contain a Playfield instrument")
        }
        SampleAssignment.assignPlayfield(this.#project.boxGraph, playfield, midiNote, assignment)
    }

    /** Remove the sample assigned to a Nano instrument. */
    removeNanoSample(target: NanoDeviceBox): void {
        SampleAssignment.removeNano(target)
    }

    /** Remove the sample assigned to a Playfield absolute MIDI-note/sample slot. */
    removePlayfieldSample(target: PlayfieldDeviceBox, midiNote: int): void {
        validateMidiNote(midiNote)
        SampleAssignment.removePlayfield(target, midiNote)
    }

    /** Read an Apparat's user source without exposing the compiler's private version header. */
    readApparatSource(target: ApparatDeviceBox): string {
        return this.#readScriptSource(ScriptDeviceConfigs.Apparat, target)
    }

    /**
     * Compile and install JavaScript source for an Apparat instrument.
     * Producer agents must read the live device's inspect_device_help programming contract before first
     * programming it in a thread. A script can compile but later be silenced during rendering if
     * process() throws, emits NaN, or emits an absolute sample amplitude above 1000; a successful
     * subsequent compile restores it.
     * @param declarations become automatable parameters discoverable through the parameter API;
     * @sample declarations become named inputs.
     */
    async programApparat(target: ApparatDeviceBox, source: string): Promise<void> {
        await this.#programScriptSource(ScriptDeviceConfigs.Apparat, target, source)
    }

    /** Read a Werkstatt's user source without exposing the compiler's private version header. */
    readWerkstattSource(target: WerkstattDeviceBox): string {
        return this.#readScriptSource(ScriptDeviceConfigs.Werkstatt, target)
    }

    /**
     * Compile and install JavaScript source for a Werkstatt audio effect. Producer agents must read the
     * live device's inspect_device_help programming contract before first programming it in a thread.
     */
    async programWerkstatt(target: WerkstattDeviceBox, source: string): Promise<void> {
        await this.#programScriptSource(ScriptDeviceConfigs.Werkstatt, target, source)
    }

    /** Read a Spielwerk's user source without exposing the compiler's private version header. */
    readSpielwerkSource(target: SpielwerkDeviceBox): string {
        return this.#readScriptSource(ScriptDeviceConfigs.Spielwerk, target)
    }

    /**
     * Compile and install JavaScript source for a Spielwerk MIDI effect. Producer agents must read the
     * live device's inspect_device_help programming contract before first programming it in a thread.
     */
    async programSpielwerk(target: SpielwerkDeviceBox, source: string): Promise<void> {
        await this.#programScriptSource(ScriptDeviceConfigs.Spielwerk, target, source)
    }

    /** Assign a canonical sample to an existing Apparat @sample declaration by its exact label. */
    assignApparatSample(target: ApparatDeviceBox, sampleLabel: string, sample: Sample): void {
        const slot = this.#apparatSample(target, sampleLabel)
        SampleAssignment.assignScriptSample(this.#project.boxGraph, slot, {
            uuid: UUID.parse(sample.uuid),
            name: sample.name,
            durationInSeconds: sample.duration
        })
    }

    /** Remove an Apparat sample assignment while keeping its declared @sample slot. */
    removeApparatSample(target: ApparatDeviceBox, sampleLabel: string): void {
        SampleAssignment.removeScriptSample(this.#apparatSample(target, sampleLabel))
    }

    replaceMIDIInstrument<A>(target: InstrumentBox,
                             fromFactory: InstrumentFactory<A>,
                             attachment?: A): Attempt<InstrumentBox, string> {
        const replacedInstrumentName = target.label.getValue()
        const hostBox = target.host.targetVertex.unwrap("Is not connect to AudioUnitBox").box
        const audioUnitBox = asInstanceOf(hostBox, AudioUnitBox)
        if (audioUnitBox.type.getValue() !== AudioUnitType.Instrument) {
            return Attempts.err("AudioUnitBox does not hold an instrument")
        }
        const captureBox = audioUnitBox.capture.targetVertex.unwrap("AudioUnitBox does not hold a capture").box
        if (!isInstanceOf(captureBox, CaptureMidiBox)) {
            return Attempts.err("Cannot replace instrument without CaptureMidiBox")
        }
        if (fromFactory.trackType !== TrackType.Notes) {
            return Attempts.err("Cannot replace instrument with track type " + TrackType[fromFactory.trackType] + "")
        }
        console.debug(`Replace instrument '${replacedInstrumentName}' with ${fromFactory.defaultName}`)
        target.delete()
        const {boxGraph} = this.#project
        const {create, defaultIcon, defaultName}: InstrumentFactory = fromFactory
        return Attempts.ok(create(boxGraph, audioUnitBox.input, defaultName, defaultIcon, attachment))
    }

    insertEffect(field: Field<EffectPointerType>, factory: EffectFactory, insertIndex: int = Number.MAX_SAFE_INTEGER): EffectBox {
        return factory.create(this.#project, field, IndexedBox.insertOrder(field, insertIndex))
    }

    /**
     * Insert an audio effect into an AudioUnit's canonical audio chain after reading its canonical help.
     */
    insertAudioEffect(audioUnitBox: AudioUnitBox,
                      factory: EffectFactory,
                      insertIndex: int = Number.MAX_SAFE_INTEGER): EffectBox {
        if (factory.type !== "audio") {throw new Error("insertAudioEffect requires an audio effect factory")}
        return this.insertEffect(audioUnitBox.audioEffects, factory, insertIndex)
    }

    /**
     * Insert a MIDI effect into an AudioUnit's canonical MIDI chain after reading its canonical help.
     */
    insertMidiEffect(audioUnitBox: AudioUnitBox,
                     factory: EffectFactory,
                     insertIndex: int = Number.MAX_SAFE_INTEGER): EffectBox {
        if (factory.type !== "midi") {throw new Error("insertMidiEffect requires a MIDI effect factory")}
        return this.insertEffect(audioUnitBox.midiEffects, factory, insertIndex)
    }

    moveEffects(targetField: Field<EffectPointerType>, boxes: ReadonlyArray<EffectBox>, insertIndex: int): void {
        if (boxes.length === 0) {return}
        const movedSet = new Set<Box>(boxes)
        // The chains the boxes currently live in, captured BEFORE re-homing so they can be reindexed afterwards.
        const sourceFields = new Set<Field<EffectPointerType>>()
        boxes.forEach(box => box.host.targetVertex.ifSome(vertex => sourceFields.add(vertex as Field<EffectPointerType>)))
        const moved = boxes.slice().sort((left, right) => left.index.getValue() - right.index.getValue())
        const kept = IndexedBox.collectIndexedBoxes(targetField).filter(box => !movedSet.has(box))
        const at = clamp(insertIndex, 0, kept.length)
        const finalOrder: ReadonlyArray<IndexedBox> = [...kept.slice(0, at), ...moved, ...kept.slice(at)]
        moved.forEach(box => box.host.refer(targetField))
        finalOrder.forEach((box, index) => box.index.setValue(index))
        sourceFields.forEach(field => {
            if (field === targetField) {return}
            IndexedBox.collectIndexedBoxes(field).forEach((box, index) => box.index.setValue(index))
        })
    }

    deleteEffect(effect: EffectBox): void {
        const adapter = this.#project.boxAdapters.adapterFor(effect, Devices.isEffect)
        Devices.deleteEffectDevices([adapter])
    }

    moveEffect(effect: EffectBox, targetField: Field<EffectPointerType>, insertIndex: int): void {
        this.moveEffects(targetField, [effect], insertIndex)
    }

    createNoteTrack(audioUnitBox: AudioUnitBox, insertIndex: int = Number.MAX_SAFE_INTEGER): TrackBox {
        return this.#createTrack({field: audioUnitBox.tracks, trackType: TrackType.Notes, insertIndex})
    }

    createAudioTrack(audioUnitBox: AudioUnitBox, insertIndex: int = Number.MAX_SAFE_INTEGER): TrackBox {
        return this.#createTrack({field: audioUnitBox.tracks, trackType: TrackType.Audio, insertIndex})
    }

    /**
     * Create a TrackType.Value timeline automation lane targeting the supplied automatable parameter field.
     * This is the normal parameter automation lane, not a ValueClip slot.
     */
    createAutomationTrack(audioUnitBox: AudioUnitBox, target: Field<Pointers.Automation>, insertIndex: int = Number.MAX_SAFE_INTEGER): TrackBox {
        return this.#createTrack({field: audioUnitBox.tracks, target, trackType: TrackType.Value, insertIndex})
    }

    // Packs the audio unit's main tracks (Notes for MIDI units, Audio for audio
    // units) onto as few lanes as possible. Iterates tracks top-down; for each
    // region in a non-top track, scans the higher tracks left-to-right and moves
    // the region to the first one where it doesn't overlap an existing region.
    // Empty main tracks are then deleted, but at least one is kept; clips and
    // automation tracks are never moved or deleted.
    compactTracks(audioUnitBox: AudioUnitBox): void {
        const adapter = this.#project.boxAdapters.adapterFor(audioUnitBox, AudioUnitBoxAdapter)
        const inputAdapter = adapter.input.adapter()
        if (inputAdapter.isEmpty()) {return}
        const accepts = inputAdapter.unwrap().accepts
        if (accepts === false) {return}
        const targetType = DeviceAccepts.toTrackType(accepts)
        const tracks = adapter.tracks.values()
            .filter(track => track.type === targetType)
            .toSorted((a, b) => a.indexField.getValue() - b.indexField.getValue())
        if (tracks.length < 2) {return}
        const fits = (track: TrackBoxAdapter, position: ppqn, complete: ppqn): boolean => {
            // Read regions live from the pointerHub (not from track.regions.collection),
            // because the cached collection isn't updated within the running transaction
            // and would miss regions just moved here in a previous iteration.
            const regions = track.box.regions.pointerHub.incoming()
                .map(({box}) => box as AnyRegionBox)
                .toSorted((a, b) => a.position.getValue() - b.position.getValue())
            for (const existing of regions) {
                const existingPosition = existing.position.getValue()
                if (existingPosition >= complete) {return true}
                if (existingPosition + existing.duration.getValue() > position) {return false}
            }
            return true
        }
        for (let i = 1; i < tracks.length; i++) {
            // Snapshot the region list before mutating; moving via `refer` will
            // remove the region from this track's collection mid-iteration.
            const regions = [...tracks[i].box.regions.pointerHub.incoming().map(({box}) => box as AnyRegionBox)]
            for (const region of regions) {
                for (let j = 0; j < i; j++) {
                    const position = region.position.getValue()
                    const complete = position + region.duration.getValue()
                    if (fits(tracks[j], position, complete)) {
                        region.regions.refer(tracks[j].box.regions)
                        break
                    }
                }
            }
        }
        for (let i = tracks.length - 1; i >= 1; i--) {
            const track = tracks[i]
            if (track.box.regions.pointerHub.isEmpty() && track.box.clips.pointerHub.isEmpty()) {
                adapter.deleteTrack(track)
            }
        }
    }

    createTimeStretchedClip(props: AudioContentFactory.TimeStretchedProps & AudioContentFactory.Clip): AudioClipBox {
        return AudioContentFactory.createTimeStretchedClip(props)
    }

    createTimeStretchedRegion(props: AudioContentFactory.TimeStretchedProps & AudioContentFactory.Region): AudioRegionBox {
        return AudioContentFactory.createTimeStretchedRegion(props)
    }

    createPitchStretchedClip(props: AudioContentFactory.PitchStretchedProps & AudioContentFactory.Clip): AudioClipBox {
        return AudioContentFactory.createPitchStretchedClip(props)
    }

    createPitchStretchedRegion(props: AudioContentFactory.PitchStretchedProps & AudioContentFactory.Region): AudioRegionBox {
        return AudioContentFactory.createPitchStretchedRegion(props)
    }

    createNotStretchedClip(props: AudioContentFactory.NotStretchedProps & AudioContentFactory.Clip): AudioClipBox {
        return AudioContentFactory.createNotStretchedClip(props)
    }

    createNotStretchedRegion(props: AudioContentFactory.NotStretchedProps & AudioContentFactory.Region): AudioRegionBox {
        return AudioContentFactory.createNotStretchedRegion(props)
    }

    /** Create a note clip on a TrackBox of type TrackType.Notes with its own note-event collection. */
    createNoteClip(trackBox: TrackBox, clipIndex: int, {name, hue}: ClipRegionOptions = {}): NoteClipBox {
        const {boxGraph} = this.#project
        const type = trackBox.type.getValue()
        if (type !== TrackType.Notes) {return panic("Incompatible track type for note-clip creation: " + type.toString())}
        const events = NoteEventCollectionBox.create(boxGraph, UUID.generate())
        return NoteClipBox.create(boxGraph, UUID.generate(), box => {
            box.index.setValue(clipIndex)
            box.label.setValue(name ?? "")
            box.hue.setValue(hue ?? ColorCodes.forTrackType(type))
            box.mute.setValue(false)
            box.duration.setValue(PPQN.Bar)
            box.clips.refer(trackBox.clips)
            box.events.refer(events.owners)
        })
    }

    /** Duration is expressed in openDAW musical pulses: 960 pulses are one quarter note, independent of BPM. */
    createAudioClip(trackBox: TrackBox,
                    audioFileBox: AudioFileBox,
                    clipIndex: int,
                    duration: ppqn,
                    name: string = ""): AudioClipBox {
        const {boxGraph} = this.#project
        if (trackBox.type.getValue() !== TrackType.Audio) {
            return panic("Incompatible track type for audio-clip creation")
        }
        const events = ValueEventCollectionBox.create(boxGraph, UUID.generate())
        const index = IndexedBox.insertOrder(trackBox.clips, clipIndex)
        return AudioClipBox.create(boxGraph, UUID.generate(), box => {
            box.index.setValue(index)
            box.label.setValue(name)
            box.hue.setValue(ColorCodes.forTrackType(TrackType.Audio))
            box.mute.setValue(false)
            box.duration.setValue(duration)
            box.timeBase.setValue(TimeBase.Musical)
            box.clips.refer(trackBox.clips)
            box.file.refer(audioFileBox)
            box.events.refer(events.owners)
        })
    }

    /** Position and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM. */
    createAudioRegion(trackBox: TrackBox,
                      audioFileBox: AudioFileBox,
                      position: ppqn,
                      duration: ppqn,
                      name: string = ""): AudioRegionBox {
        const {boxGraph} = this.#project
        if (trackBox.type.getValue() !== TrackType.Audio) {
            return panic("Incompatible track type for audio-region creation")
        }
        const trackAdapter = this.#project.boxAdapters.adapterFor(trackBox, TrackBoxAdapter)
        const startPosition = Math.max(position, 0)
        const solver = this.#project.overlapResolver.fromRange(
            trackAdapter, startPosition, startPosition + duration)
        const events = ValueEventCollectionBox.create(boxGraph, UUID.generate())
        const region = AudioRegionBox.create(boxGraph, UUID.generate(), box => {
            box.position.setValue(startPosition)
            box.duration.setValue(duration)
            box.loopOffset.setValue(0)
            box.loopDuration.setValue(duration)
            box.label.setValue(name)
            box.hue.setValue(ColorCodes.forTrackType(TrackType.Audio))
            box.mute.setValue(false)
            box.timeBase.setValue(TimeBase.Musical)
            box.regions.refer(trackBox.regions)
            box.file.refer(audioFileBox)
            box.events.refer(events.owners)
        })
        solver()
        return region
    }

    deleteTrack(trackBox: TrackBox): void {
        if (!trackBox.isAttached()) {return}
        const adapter = this.#project.boxAdapters.adapterFor(trackBox, TrackBoxAdapter)
        const audioUnit = adapter.optAudioUnit
        audioUnit.ifSome(audioUnit => {
            this.#project.boxAdapters.adapterFor(audioUnit, AudioUnitBoxAdapter).deleteTrack(adapter)
        })
        if (audioUnit.isEmpty()) {
            trackBox.tracks.targetVertex.ifSome(vertex => {
                if (vertex instanceof Field) {
                    IndexedBox.removeOrder(vertex as Field<Pointers.TrackCollection>, trackBox.index.getValue())
                }
            })
            trackBox.delete()
        }
    }

    renameTrack(trackBox: TrackBox, name: string): void {
        this.#project.boxAdapters.adapterFor(trackBox, TrackBoxAdapter).targetName = name
    }

    moveTrack(trackBox: TrackBox, delta: int): void {
        if (delta === 0) {return}
        const adapter = this.#project.boxAdapters.adapterFor(trackBox, TrackBoxAdapter)
        const audioUnit = adapter.optAudioUnit
        if (audioUnit.nonEmpty()) {
            this.#project.boxAdapters.adapterFor(audioUnit.unwrap(), AudioUnitBoxAdapter).moveTrack(adapter, delta)
            return
        }
        trackBox.tracks.targetVertex.ifSome(vertex => {
            if (!(vertex instanceof Field)) {return}
            const field = vertex as Field<Pointers.TrackCollection>
            const tracks = [...IndexedBox.collectIndexedBoxes(field)]
            const from = tracks.indexOf(trackBox)
            if (from < 0) {return}
            const to = clamp(from + delta, 0, tracks.length - 1)
            if (from === to) {return}
            const moving = tracks[from]
            tracks.splice(from, 1)
            tracks.splice(to, 0, moving)
            tracks.forEach((track, index) => track.index.setValue(index))
        })
    }

    deleteRegion(region: AnyRegionBox): void {region.delete()}

    deleteClip(clip: NoteClipBox | ValueClipBox | AudioClipBox): void {clip.delete()}

    duplicateRegion<R extends AnyRegionBoxAdapter>(region: R,
                                                   options?: { findFreeSpace?: boolean, position?: ppqn }): Option<R> {
        if (region.trackBoxAdapter.isEmpty()) {return Option.None}
        const track = region.trackBoxAdapter.unwrap()
        const explicitPosition = options?.position
        if (!isDefined(explicitPosition) && options?.findFreeSpace === true) {
            let insert = region.complete
            for (const {position, complete} of track.regions.collection.iterateFrom(region.complete)) {
                if (insert + region.duration <= position) {break}
                insert = complete
            }
            return Option.wrap(region.copyTo({
                position: insert,
                consolidate: true
            }) as R)
        }
        const position = explicitPosition ?? region.complete
        const complete = position + region.duration
        const targetTrack = this.#project.overlapResolver.resolveTargetTrack(track, position, complete)
        const solver = this.#project.overlapResolver.fromRange(targetTrack, position, complete)
        const duplicate = region.copyTo({
            position,
            target: targetTrack.box.regions,
            consolidate: true
        }) as R
        solver()
        return Option.wrap(duplicate)
    }

    /** Duplicate a timeline region using the canonical overlap solver and optional musical position. */
    duplicateTrackRegion(region: AnyRegionBox,
                          position?: MusicalPosition,
                          findFreeSpace: boolean = false): Option<AnyRegionBox> {
        const adapter = RegionAdapters.for(this.#project.boxAdapters, region)
        const positionPulses = position === undefined
            ? undefined
            : musicalPositionToPulses(this.#project.timelineBoxAdapter.signatureTrack, position)
        const duplicate = this.duplicateRegion(adapter, {
            ...(positionPulses === undefined ? {} : {position: positionPulses}),
            findFreeSpace
        })
        return duplicate.map(copy => copy.box)
    }

    async exportMIDI(collection: NoteEventCollectionBoxAdapter, suggestedName: string = "notes.mid") {
        return NoteMidiExport.toFile(collection, suggestedName)
    }

    async exportAudio(owner: AudioRegionBoxAdapter | AudioClipBoxAdapter, suggestedName: string = "audio.wav") {
        return AudioWavExport.toFile(owner, suggestedName)
    }

    quantiseNotes(notes: NoteEventCollectionBox | ReadonlyArray<NoteEventBox>,
                  {positionQuantisation, durationQuantisation, offset}: QuantiseNotesOptions): void {
        if (isAbsent(positionQuantisation) && isAbsent(durationQuantisation)) {
            console.warn("Nothing to quantise: both quantisation parameters are absent")
            return
        }
        const array = notes instanceof NoteEventCollectionBox
            ? notes.events.pointerHub.incoming().map(({box}) => asInstanceOf(box, NoteEventBox))
            : notes
        offset ??= 0.0
        array.forEach(event => {
            let position = event.position.getValue()
            let duration = event.duration.getValue()
            if (isDefined(positionQuantisation)) {
                position = quantizeRound(position + offset, positionQuantisation) - offset
            }
            if (isDefined(durationQuantisation)) {
                duration = Math.max(quantizeRound(duration, durationQuantisation), durationQuantisation)
            }
            event.position.setValue(Math.max(position, 0))
            event.duration.setValue(duration)
        })
    }

    /**
     * Create a ValueClip, a clip-slot style value sequence on a TrackType.Value track.
     * This is not the normal timeline automation region beneath a parameter or instrument track;
     * use createTrackRegion for that.
     */
    createValueClip(trackBox: TrackBox, clipIndex: int, {name, hue}: ClipRegionOptions = {}): ValueClipBox {
        const {boxGraph} = this.#project
        const type = trackBox.type.getValue()
        if (type !== TrackType.Value) {return panic("Incompatible track type for value-clip creation: " + type.toString())}
        const events = ValueEventCollectionBox.create(boxGraph, UUID.generate())
        return ValueClipBox.create(boxGraph, UUID.generate(), box => {
            box.index.setValue(clipIndex)
            box.label.setValue(name ?? "")
            box.hue.setValue(hue ?? ColorCodes.forTrackType(type))
            box.mute.setValue(false)
            box.duration.setValue(PPQN.Bar)
            box.events.refer(events.owners)
            box.clips.refer(trackBox.clips)
        })
    }

    /**
     * Create a note region on a TrackBox of type TrackType.Notes.
     * Position and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM.
     * When eventOwner is supplied, it may be a NoteRegionBox, NoteClipBox, or NoteEventCollectionBox;
     * the supplied owner's note-event collection is reused.
     */
    createNoteRegion({
                         trackBox, position, duration, loopOffset, loopDuration,
                         eventOffset, eventOwner, mute, name, hue
                     }: NoteRegionParams): NoteRegionBox {
        if (trackBox.type.getValue() !== TrackType.Notes) {
            console.warn("You should not create a note-region in mismatched track")
        }
        const {boxGraph} = this.#project
        const events = eventOwner === undefined
            ? NoteEventCollectionBox.create(boxGraph, UUID.generate())
            : this.#noteEventCollection(eventOwner)
        return NoteRegionBox.create(boxGraph, UUID.generate(), box => {
            box.position.setValue(position)
            box.label.setValue(name ?? "")
            box.hue.setValue(hue ?? ColorCodes.forTrackType(trackBox.type.getValue()))
            box.mute.setValue(mute ?? false)
            box.duration.setValue(duration)
            box.loopOffset.setValue(loopOffset ?? 0)
            box.loopDuration.setValue(loopDuration ?? duration)
            box.eventOffset.setValue(eventOffset ?? 0)
            box.events.refer(events.owners)
            box.regions.refer(trackBox.regions)
        })
    }

    /**
     * Create a note region using one-based musical bars/beats and a named
     * musical duration. Position and duration are resolved with the canonical
     * PPQN/signature adapters; callers do not need to calculate pulses.
     */
    createMusicalNoteRegion(trackBox: TrackBox,
                            position: MusicalPosition,
                            duration: MusicalDuration,
                            {name, hue}: ClipRegionOptions = {}): NoteRegionBox {
        const signatureTrack = this.#project.timelineBoxAdapter.signatureTrack
        const positionPulses = musicalPositionToPulses(signatureTrack, position)
        const durationPulses = musicalDurationToPulses(signatureTrack, duration, positionPulses)
        return this.createNoteRegion({trackBox, position: positionPulses, duration: durationPulses, name, hue})
    }

    /**
     * Create a region on a track. On a TrackType.Value track this creates the normal timeline
     * ValueRegionBox automation region and automatically seeds it with the initial held/current value.
     * Position and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM.
     */
    createTrackRegion(trackBox: TrackBox,
                      position: ppqn,
                      duration: ppqn,
                      {name, hue}: ClipRegionOptions = {}): Option<AnyRegionBox> {
        if (duration <= 0.0) {return Option.None}
        const {boxGraph} = this.#project
        const type = trackBox.type.getValue()
        const startPosition = Math.max(position, 0)
        // Resolve overlaps against existing regions BEFORE creating (mirrors duplicateRegion): drawing a region
        // over an existing one must clip / push / keep per the setting, never STACK a second region at the same
        // position. A raw create left two regions overlapping, which a later validateTracks hard-asserts on and
        // crashes the app (live errors 1086/1087).
        const trackAdapter = this.#project.boxAdapters.adapterFor(trackBox, TrackBoxAdapter)
        const solver = this.#project.overlapResolver.fromRange(trackAdapter, startPosition, startPosition + duration)
        const created: Option<AnyRegionBox> = (() => {
            switch (type) {
                case TrackType.Notes: {
                    const events = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                    return Option.wrap(NoteRegionBox.create(boxGraph, UUID.generate(), box => {
                        box.position.setValue(startPosition)
                        box.label.setValue(name ?? "")
                        box.hue.setValue(hue ?? ColorCodes.forTrackType(type))
                        box.mute.setValue(false)
                        box.duration.setValue(duration)
                        box.loopDuration.setValue(duration)
                        box.events.refer(events.owners)
                        box.regions.refer(trackBox.regions)
                    }))
                }
                case TrackType.Value: {
                    // #271: a new automation region inherits a single node from its surroundings — the preceding
                    // region's held (outgoing) value, else the following region's incoming value, else the
                    // parameter's current dial value. Computed BEFORE creating the region so the scan sees only
                    // the existing regions.
                    const seed = this.#automationSeed(trackBox, trackAdapter, startPosition)
                    const events = ValueEventCollectionBox.create(boxGraph, UUID.generate())
                    const region = ValueRegionBox.create(boxGraph, UUID.generate(), box => {
                        box.position.setValue(startPosition)
                        box.label.setValue(name ?? "")
                        box.hue.setValue(hue ?? ColorCodes.forTrackType(type))
                        box.mute.setValue(false)
                        box.duration.setValue(duration)
                        box.loopDuration.setValue(duration)
                        box.events.refer(events.owners)
                        box.regions.refer(trackBox.regions)
                    })
                    seed.ifSome(({value, interpolation}) => ValueEventBox.create(boxGraph, UUID.generate(), box => {
                        box.position.setValue(0)
                        box.value.setValue(value)
                        box.events.refer(events.events)
                        InterpolationFieldAdapter.write(box.interpolation, interpolation)
                    }))
                    return Option.wrap(region)
                }
            }
            return Option.None
        })()
        if (created.nonEmpty()) {solver()}
        return created
    }

    /**
     * Create a timeline automation region on a TrackType.Value track and add its local value events.
     * Position and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM.
     * The region is created through createTrackRegion, so its initial held/current value is preserved;
     * a supplied (0, 0) event updates that seed through the canonical value-event collection.
     */
    createAutomationRegion(trackBox: TrackBox,
                           position: ppqn,
                           duration: ppqn,
                           events: ReadonlyArray<ValueEventInput>,
                           {name, hue}: ClipRegionOptions = {}): ValueRegionBox {
        if (trackBox.type.getValue() !== TrackType.Value) {
            throw new Error("createAutomationRegion requires a TrackType.Value automation track")
        }
        const region = this.createTrackRegion(trackBox, position, duration, {name, hue})
            .unwrap("Could not create automation region")
        if (!(region instanceof ValueRegionBox)) {
            throw new Error("createAutomationRegion did not create a ValueRegionBox")
        }
        this.#createValueEvents(region.events, events)
        return region
    }

    // #271: the node a freshly drawn automation region should hold. Hold-from-left: the preceding region's
    // outgoing (held) value wins; else the following region's incoming value; else the parameter's current dial
    // value. Returns None only when the track's target parameter cannot be resolved (a bug — seed no node then).
    #automationSeed(trackBox: TrackBox, trackAdapter: TrackBoxAdapter, position: ppqn): Option<AutomationSeed> {
        return trackBox.target.targetVertex
            .flatMap(vertex => this.#project.parameterFieldAdapters.opt(vertex.address))
            .map(parameter => {
                const dial = parameter.getControlledUnitValue()
                const interpolation = InterpolationFieldAdapter.map(parameter.type)
                const preceding = trackAdapter.regions.collection.lowerEqual(position)
                if (isDefined(preceding) && preceding.isValueRegion()) {
                    return {value: preceding.outgoingValue(dial), interpolation}
                }
                const following = trackAdapter.regions.collection.greaterEqual(position)
                if (isDefined(following) && following.isValueRegion()) {
                    return {value: following.incomingValue(dial), interpolation}
                }
                return {value: dial, interpolation}
            })
    }

    #noteEventOwner(event: NoteEventBox): NoteEventOwner {
        const collection = event.events.targetVertex.unwrap("NoteEventBox is not attached to an event collection").box
            .asBox(NoteEventCollectionBox)
        const owner = collection.owners.pointerHub.incoming()
            .map(({box}) => box)
            .find(box => box instanceof NoteRegionBox || box instanceof NoteClipBox)
        return owner instanceof NoteRegionBox || owner instanceof NoteClipBox ? owner : collection
    }

    #noteEventCollection(owner: NoteEventOwner): NoteEventCollectionBox {
        return owner instanceof NoteEventCollectionBox
            ? owner
            : owner.events.targetVertex.unwrap("Owner has no event-collection").box
                .asBox(NoteEventCollectionBox)
    }

    #noteEventReferencePosition(owner: NoteEventOwner): ppqn {
        return owner instanceof NoteRegionBox ? owner.position.getValue() : 0
    }

    #readScriptSource(config: ScriptCompiler.Config, target: ScriptCompiler.ScriptDeviceBox): string {
        return this.#project.readScriptDeviceSource(config, target)
    }

    #programScriptSource(config: ScriptCompiler.Config,
                         target: ScriptCompiler.ScriptDeviceBox,
                         source: string): Promise<void> {
        return this.#project.compileScriptDevice(config, target, source)
    }

    #apparatSample(target: ApparatDeviceBox, sampleLabel: string): WerkstattSampleBox {
        const slots = target.samples.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, WerkstattSampleBox))
        const slot = slots.find(candidate => candidate.label.getValue() === sampleLabel)
        if (slot !== undefined) {return slot}
        const available = slots.map(candidate => candidate.label.getValue())
        throw new Error(`Apparat has no @sample declaration named '${sampleLabel}'. Available sample labels: `
            + (available.length === 0 ? "(none)" : available.join(", ")))
    }

    #noteEvents(owner: NoteEventOwner): Field<Pointers.NoteEvents> {
        return this.#noteEventCollection(owner).events
    }

    #valueEventCollection(field: Field<Pointers.ValueEventCollection> | PointerField<Pointers.ValueEventCollection>): ValueEventCollectionBox {
        const collection = field instanceof PointerField
            ? field.targetVertex.unwrap("Owner has no event-collection").box
            : field.box
        return collection.asBox(ValueEventCollectionBox)
    }

    #valueEventCollectionAdapter(field: Field<Pointers.ValueEventCollection> | PointerField<Pointers.ValueEventCollection>): ValueEventCollectionBoxAdapter {
        return this.#project.boxAdapters.adapterFor(this.#valueEventCollection(field), ValueEventCollectionBoxAdapter)
    }

    #createValueEvents(collection: Field<Pointers.ValueEventCollection> | PointerField<Pointers.ValueEventCollection>,
                       events: ReadonlyArray<ValueEventInput>): ReadonlyArray<ValueEventBox> {
        const adapter = this.#valueEventCollectionAdapter(collection)
        return events.map(({position, index, value, interpolation, slope}) => adapter.createEvent({
            position,
            index,
            value,
            interpolation: this.#valueInterpolation(interpolation ?? "linear", slope)
        }).box)
    }

    /**
     * Create one note event in the owner's underlying note-event collection.
     * Position and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM.
     * Pass the semantic owner box directly: the NoteRegionBox, NoteClipBox, or NoteEventCollectionBox itself;
     * do not pass an events field handle.
     */
    createNoteEvent({owner, position, duration, velocity, pitch, chance, cent, playCount}: NoteEventParams): NoteEventBox {
        const {boxGraph} = this.#project
        return NoteEventBox.create(boxGraph, UUID.generate(), box => {
            box.position.setValue(position)
            box.duration.setValue(duration)
            box.velocity.setValue(velocity ?? 1.0)
            box.pitch.setValue(pitch)
            box.chance.setValue(chance ?? 100.0)
            box.cent.setValue(cent ?? 0.0)
            box.playCount.setValue(playCount ?? 1)
            box.events.refer(this.#noteEvents(owner))
        })
    }

    /**
     * Create note events in the owner's underlying note-event collection.
     * Each position and duration is expressed in openDAW musical pulses: 960 pulses are one quarter note,
     * independent of BPM.
     * Pass the semantic owner box directly; do not pass an events field handle or field address.
     * All events are added to that owner.
     */
    createNoteEvents(owner: NoteEventOwner,
                     events: ReadonlyArray<NoteEventInput>): ReadonlyArray<NoteEventBox> {
        return events.map(({position, duration, pitch, cent, velocity, chance, playCount}) =>
            NoteEventBox.create(this.#project.boxGraph, UUID.generate(), box => {
                box.position.setValue(position)
                box.duration.setValue(duration)
                box.pitch.setValue(pitch)
                box.cent.setValue(cent ?? 0.0)
                box.velocity.setValue(velocity ?? 1.0)
                box.chance.setValue(chance ?? 100)
                box.playCount.setValue(playCount ?? 1)
                box.events.refer(this.#noteEvents(owner))
            }))
    }

    /**
     * Create one note event from a one-based musical position and named
     * duration. The position is relative to the owner's note collection; bar
     * 1, beat 1 is the collection start. Signature changes use the active
     * project signature at that owner. Pass the semantic owner box directly:
     * the NoteRegionBox, NoteClipBox, or NoteEventCollectionBox itself; do not
     * pass an events field handle.
     */
    createMusicalNoteEvent({owner, position, duration, velocity, pitch, chance, cent, playCount}: MusicalNoteEventParams): NoteEventBox {
        const reference = this.#noteEventReferencePosition(owner)
        const signatureTrack = this.#project.timelineBoxAdapter.signatureTrack
        return this.createNoteEvent({
            owner,
            position: musicalPositionToPulses(signatureTrack, position, reference),
            duration: musicalDurationToPulses(signatureTrack, duration, reference),
            velocity,
            pitch,
            chance,
            cent,
            playCount
        })
    }

    /**
     * Create note events from one-based musical positions and named durations.
     * Positions are relative to the owner's note collection, so a regular
     * four-on-the-floor pattern uses beats 1, 2, 3, and 4 directly. Pass the
     * semantic owner box directly; do not pass an events field handle.
     */
    createMusicalNoteEvents(owner: NoteEventOwner,
                            events: ReadonlyArray<MusicalNoteEventInput>): ReadonlyArray<NoteEventBox> {
        const reference = this.#noteEventReferencePosition(owner)
        const signatureTrack = this.#project.timelineBoxAdapter.signatureTrack
        return events.map(({position, duration, pitch, cent, velocity, chance, playCount}) => {
            const event = this.createNoteEvent({
                owner,
                position: musicalPositionToPulses(signatureTrack, position, reference),
                duration: musicalDurationToPulses(signatureTrack, duration, reference),
                pitch,
                cent,
                velocity,
                chance,
                playCount
            })
            return event
        })
    }

    /** Update only the supplied properties of a note using one-based musical coordinates. */
    updateMusicalNoteEvent(event: NoteEventBox,
                           position?: MusicalPosition,
                           duration?: MusicalDuration,
                           pitch?: int,
                           cent?: number,
                           velocity?: float,
                           chance?: int,
                           playCount?: int): void {
        const owner = this.#noteEventOwner(event)
        const reference = this.#noteEventReferencePosition(owner)
        const signatureTrack = this.#project.timelineBoxAdapter.signatureTrack
        if (position !== undefined) {
            event.position.setValue(musicalPositionToPulses(signatureTrack, position, reference))
        }
        if (duration !== undefined) {
            event.duration.setValue(musicalDurationToPulses(signatureTrack, duration, reference))
        }
        if (pitch !== undefined) {event.pitch.setValue(pitch)}
        if (cent !== undefined) {event.cent.setValue(cent)}
        if (velocity !== undefined) {event.velocity.setValue(velocity)}
        if (chance !== undefined) {event.chance.setValue(chance)}
        if (playCount !== undefined) {event.playCount.setValue(playCount)}
    }

    /** Replace one owner's note pattern through the existing musical-event creation path. */
    replaceMusicalNoteEvents(owner: NoteEventOwner,
                             events: ReadonlyArray<MusicalNoteEventInput>): ReadonlyArray<NoteEventBox> {
        const collection = this.#noteEventCollection(owner)
        collection.events.pointerHub.incoming()
            .map(({box}) => box)
            .filter((box): box is NoteEventBox => box instanceof NoteEventBox)
            .forEach(event => event.delete())
        return this.createMusicalNoteEvents(owner, events)
    }

    deleteNoteEvents(events: ReadonlyArray<NoteEventBox>): void {
        events.forEach(event => event.isAttached() && event.delete())
    }

    /**
     * Create or update value events in a ValueRegionBox or ValueClipBox event collection.
     * Positions are local to the owning collection, and (position, index) identifies ordering.
     * An existing pair is updated through the canonical collection adapter instead of duplicated.
     */
    createValueEvents(collection: Field<Pointers.ValueEventCollection>,
                      events: ReadonlyArray<ValueEventInput>): ReadonlyArray<ValueEventBox> {
        return this.#createValueEvents(collection, events)
    }

    replaceValueEvents(collection: Field<Pointers.ValueEventCollection>,
                       events: ReadonlyArray<ValueEventInput>): void {
        const adapter = this.#valueEventCollectionAdapter(collection)
        Array.from(adapter.events.asArray()).forEach(event => {
            adapter.events.remove(event)
            event.box.delete()
        })
        this.createValueEvents(collection, events)
    }

    updateValueEvent(event: ValueEventBox,
                     position?: ppqn,
                     index?: int,
                     value?: unitValue,
                     interpolation?: "none" | "linear" | "curve",
                     slope?: unitValue): void {
        const targetPosition = position ?? event.position.getValue()
        const targetIndex = index ?? event.index.getValue()
        const collection = event.events.targetVertex
            .unwrap("ValueEventBox is not attached to an event collection").box
            .asBox(ValueEventCollectionBox)
        const collision = collection.events.pointerHub.incoming().find(({box}) =>
            box !== event
            && box instanceof ValueEventBox
            && box.position.getValue() === targetPosition
            && box.index.getValue() === targetIndex)
        if (collision !== undefined) {
            throw new Error(`Cannot update ValueEventBox to position ${targetPosition} index ${targetIndex}: `
                + "another event already occupies that canonical position/index")
        }
        if (position !== undefined) {event.position.setValue(position)}
        if (index !== undefined) {event.index.setValue(index)}
        if (value !== undefined) {event.value.setValue(value)}
        if (interpolation !== undefined) {this.#writeInterpolation(event, interpolation, slope)}
    }

    deleteValueEvents(events: ReadonlyArray<ValueEventBox>): void {
        events.forEach(event => event.isAttached() && event.delete())
    }

    async applyPreset(target: AudioUnitBox | EffectBox,
                      uuid: UUID.Bytes,
                      options: PresetApplyOptions = {}): Promise<void> {
        const bytes = await FactoryCatalog.loadPreset(uuid, options.source ?? "stock")
        if (target instanceof AudioUnitBox) {
            let failure: string | undefined
            this.#project.editing.modify(() => {
                const result = PresetDecoder.replaceAudioUnit(bytes, target, {
                    keepMIDIEffects: options.keepMIDIEffects,
                    keepAudioEffects: options.keepAudioEffects,
                    keepTimeline: options.keepTimeline
                })
                if (result.isFailure()) {failure = String(result.failureReason())}
            })
            if (failure !== undefined) {throw new Error(failure)}
        } else {
            const effect = this.#project.boxAdapters.adapterFor(target, Devices.isEffect)
            const field = DeviceHost.chainFieldOf(effect.deviceHost(), effect.accepts)
                .unwrap(`Host takes no ${effect.accepts} effects`)
            const index = options.insertIndex ?? effect.indexField.getValue()
            let failure: string | undefined
            this.#project.editing.modify(() => {
                const result = PresetDecoder.insertEffectChain(bytes, field, index,
                    effect.accepts === "audio" ? PresetHeader.ChainKind.Audio : PresetHeader.ChainKind.Midi)
                if (result.isFailure()) {
                    failure = String(result.failureReason())
                    return
                }
                Devices.deleteEffectDevices([effect])
            })
            if (failure !== undefined) {throw new Error(failure)}
        }
        this.#project.loadScriptDevices()
    }

    #valueInterpolation(interpolation: "none" | "linear" | "curve", slope?: unitValue): Interpolation {
        return interpolation === "none"
            ? Interpolation.None
            : interpolation === "linear"
                ? Interpolation.Linear
                : {type: "curve", slope: slope ?? 0.0}
    }

    #writeInterpolation(event: ValueEventBox,
                        interpolation: "none" | "linear" | "curve",
                        slope?: unitValue): void {
        InterpolationFieldAdapter.write(event.interpolation, this.#valueInterpolation(interpolation, slope))
    }

    deleteAudioUnit(audioUnitBox: AudioUnitBox): void {
        // The output unit is mandatory; deleting it desyncs the engine (it rejects the transaction).
        if (audioUnitBox.type.getValue() === AudioUnitType.Output) {return}
        const {rootBox} = this.#project
        IndexedBox.removeOrder(rootBox.audioUnits, audioUnitBox.index.getValue())
        audioUnitBox.delete()
    }

    /**
     * Duplicate a set of notes so that the copies land flush after the
     * source block: each copy is shifted by `max(position + duration) −
     * min(position)` over the input. Returns the newly created note
     * adapters in the same order as `notes`, so the caller can swap its
     * selection in one pass. Returns an empty array when the input is
     * empty or the computed shift is zero. The caller is responsible for
     * wrapping the call in `editing.modify(...)`.
     */
    duplicateNotes(notes: ReadonlyArray<NoteEventBoxAdapter>): ReadonlyArray<NoteEventBoxAdapter> {
        if (notes.length === 0) {return []}
        const blockStart = notes.reduce((min, {position}) => Math.min(min, position), Infinity)
        const blockEnd = notes.reduce((max, {position, duration}) => Math.max(max, position + duration), -Infinity)
        const shift = blockEnd - blockStart
        if (shift <= 0) {return []}
        const {boxGraph, boxAdapters} = this.#project
        return notes.map(adapter => {
            const copy = NoteEventBox.create(boxGraph, UUID.generate(), box => {
                const events = adapter.box.events.targetVertex.unwrap("events.target")
                box.events.refer(events)
                box.position.setValue(adapter.position + shift)
                box.duration.setValue(adapter.duration)
                box.pitch.setValue(adapter.pitch)
                box.velocity.setValue(adapter.velocity)
            })
            return boxAdapters.adapterFor(copy, NoteEventBoxAdapter)
        })
    }

    #createTrack({field, target, trackType, insertIndex}: {
        field: Field<Pointers.TrackCollection>,
        target?: Field<Pointers.Automation>,
        insertIndex: int
        trackType: TrackType,
    }): TrackBox {
        const index = IndexedBox.insertOrder(field, insertIndex)
        return TrackBox.create(this.#project.boxGraph, UUID.generate(), box => {
            box.index.setValue(index)
            box.type.setValue(trackType)
            box.tracks.refer(field)
            box.target.refer(target ?? field.box)
        })
    }

    #trackTypeToCapture(boxGraph: BoxGraph, trackType: TrackType): Option<CaptureBox> {
        switch (trackType) {
            case TrackType.Audio:
                return Option.wrap(CaptureAudioBox.create(boxGraph, UUID.generate()))
            case TrackType.Notes:
                return Option.wrap(CaptureMidiBox.create(boxGraph, UUID.generate()))
            default:
                return Option.None
        }
    }
}
