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
    NanoDeviceBox,
    NoteClipBox,
    NoteEventBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    PlayfieldDeviceBox,
    TrackBox,
    ValueClipBox,
    ValueEventBox,
    ValueEventCollectionBox,
    ValueRegionBox
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
    SampleAssignment,
    TrackBoxAdapter,
    TrackType
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

export type ClipRegionOptions = {
    name?: string
    hue?: number
}

export type NoteEventInput = {
    position: ppqn
    duration: ppqn
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

export type NoteEventParams = {
    owner: NoteEventOwner
    position: ppqn
    duration: ppqn
    pitch: int
    cent?: number
    velocity?: float
    chance?: int
}

export type NoteRegionParams = {
    trackBox: TrackBox
    position: ppqn
    duration: ppqn
    loopOffset?: ppqn
    loopDuration?: ppqn
    eventOffset?: ppqn
    eventCollection?: NoteEventCollectionBox
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

    createAnyInstrument(factory: InstrumentFactory<any, any>): InstrumentProduct<InstrumentBox> {
        return this.createInstrument(factory)
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

    assignSample(target: NanoDeviceBox | PlayfieldDeviceBox, sample: Sample, slot?: int): void {
        const assignment = {
            uuid: UUID.parse(sample.uuid),
            name: sample.name,
            durationInSeconds: sample.duration
        }
        if (target instanceof NanoDeviceBox) {
            if (slot !== undefined) {throw new Error("Nano has one sample slot")}
            SampleAssignment.assignNano(this.#project.boxGraph, target, assignment)
        } else {
            if (slot === undefined) {throw new Error("Playfield sample assignment requires a slot")}
            SampleAssignment.assignPlayfield(this.#project.boxGraph, target, slot, assignment)
        }
    }

    removeSample(target: NanoDeviceBox | PlayfieldDeviceBox, slot?: int): void {
        if (target instanceof NanoDeviceBox) {
            if (slot !== undefined) {throw new Error("Nano has one sample slot")}
            SampleAssignment.removeNano(target)
        } else {
            if (slot === undefined) {throw new Error("Playfield sample removal requires a slot")}
            SampleAssignment.removePlayfield(target, slot)
        }
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

    createNoteRegion({
                         trackBox, position, duration, loopOffset, loopDuration,
                         eventOffset, eventCollection, mute, name, hue
                     }: NoteRegionParams): NoteRegionBox {
        if (trackBox.type.getValue() !== TrackType.Notes) {
            console.warn("You should not create a note-region in mismatched track")
        }
        const {boxGraph} = this.#project
        const events = eventCollection ?? NoteEventCollectionBox.create(boxGraph, UUID.generate())
        return NoteRegionBox.create(boxGraph, UUID.generate(), box => {
            box.position.setValue(position)
            box.label.setValue(name ?? "")
            box.hue.setValue(hue ?? ColorCodes.forTrackType(trackBox.type.getValue()))
            box.mute.setValue(mute ?? false)
            box.duration.setValue(duration)
            box.loopDuration.setValue(loopOffset ?? 0)
            box.loopDuration.setValue(loopDuration ?? duration)
            box.eventOffset.setValue(eventOffset ?? 0)
            box.events.refer(events.owners)
            box.regions.refer(trackBox.regions)
        })
    }

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

    #noteEvents(owner: NoteEventOwner): Field<Pointers.NoteEvents> {
        const collection = owner instanceof NoteEventCollectionBox
            ? owner
            : owner.events.targetVertex.unwrap("Owner has no event-collection").box
        return collection.asBox(NoteEventCollectionBox).events
    }

    #valueEvents(field: Field<Pointers.ValueEventCollection>): Field<Pointers.ValueEvents> {
        const collection = field instanceof PointerField
            ? field.targetVertex.unwrap("Owner has no event-collection").box
            : field.box
        return collection.asBox(ValueEventCollectionBox).events
    }

    createNoteEvent({owner, position, duration, velocity, pitch, chance, cent}: NoteEventParams): NoteEventBox {
        const {boxGraph} = this.#project
        return NoteEventBox.create(boxGraph, UUID.generate(), box => {
            box.position.setValue(position)
            box.duration.setValue(duration)
            box.velocity.setValue(velocity ?? 1.0)
            box.pitch.setValue(pitch)
            box.chance.setValue(chance ?? 100.0)
            box.cent.setValue(cent ?? 0.0)
            box.events.refer(this.#noteEvents(owner))
        })
    }

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

    deleteNoteEvents(events: ReadonlyArray<NoteEventBox>): void {
        events.forEach(event => event.isAttached() && event.delete())
    }

    createValueEvents(collection: Field<Pointers.ValueEventCollection>,
                      events: ReadonlyArray<ValueEventInput>): ReadonlyArray<ValueEventBox> {
        return events.map(({position, index, value, interpolation, slope}) => {
            const event = ValueEventBox.create(this.#project.boxGraph, UUID.generate(), box => {
                box.position.setValue(position)
                box.index.setValue(index)
                box.value.setValue(value)
                box.events.refer(this.#valueEvents(collection))
            })
            this.#writeInterpolation(event, interpolation ?? "linear", slope)
            return event
        })
    }

    replaceValueEvents(collection: Field<Pointers.ValueEventCollection>,
                       events: ReadonlyArray<ValueEventInput>): void {
        this.#valueEvents(collection).pointerHub.incoming().forEach(({box}) => box.delete())
        this.createValueEvents(collection, events)
    }

    updateValueEvent(event: ValueEventBox,
                     position?: ppqn,
                     index?: int,
                     value?: unitValue,
                     interpolation?: "none" | "linear" | "curve",
                     slope?: unitValue): void {
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

    #writeInterpolation(event: ValueEventBox,
                        interpolation: "none" | "linear" | "curve",
                        slope?: unitValue): void {
        const value: Interpolation = interpolation === "none"
            ? Interpolation.None
            : interpolation === "linear"
                ? Interpolation.Linear
                : {type: "curve", slope: slope ?? 0.0}
        InterpolationFieldAdapter.write(event.interpolation, value)
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
