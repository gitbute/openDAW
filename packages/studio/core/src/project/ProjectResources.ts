import {Address, Box, Field, PointerField, PrimitiveField, Vertex} from "@opendaw/lib-box"
import {ppqn} from "@opendaw/lib-dsp"
import {int, unitValue} from "@opendaw/lib-std"
import {
    AudioClipBox,
    AudioRegionBox,
    NoteClipBox,
    NoteEventBox,
    NoteRegionBox,
    PlayfieldSampleBox,
    TrackBox,
    ValueClipBox,
    ValueEventBox,
    ValueRegionBox
} from "@opendaw/studio-boxes"
import {IconSymbol} from "@opendaw/studio-enums"
import {
    BoxAdapter,
    Devices,
    InstrumentFactories,
    InterpolationFieldAdapter,
    TrackBoxAdapter,
    TrackType
} from "@opendaw/studio-adapters"
import {EffectFactories} from "../EffectFactories"
import {FactoryCatalog} from "../FactoryCatalog"
import {Project} from "./Project"
import {choicesOf} from "../control-api/parameter-metadata"

export type ProjectResourceRef = {
    readonly $type: string
    readonly $address: string
}

export type ProjectResourceValue = null | boolean | number | string | ReadonlyArray<number>

export type ProjectResourceChoice = {
    readonly value: boolean | number | string
    readonly label: string
    readonly unit: string
}

export type ProjectResourceConstraint = {
    readonly kind: string
    readonly min?: number
    readonly mid?: number
    readonly max?: number
    readonly length?: int
    readonly scaling?: string
    readonly values?: ReadonlyArray<number>
}

export type ProjectParameterResource = {
    readonly ref: ProjectResourceRef
    readonly field: ProjectResourceRef
    readonly owner: ProjectResourceRef
    readonly path: string
    readonly name: string
    readonly primitiveType: string
    readonly unit: string
    readonly rawValue: ProjectResourceValue
    readonly unitValue: unitValue
    readonly printValue: string
    readonly printUnit: string
    readonly controlledValue: ProjectResourceValue
    readonly controlledPrintValue: string
    readonly controlledPrintUnit: string
    readonly constraints: ProjectResourceConstraint
    readonly choices: ReadonlyArray<ProjectResourceChoice>
}

export type ProjectAudioUnitResource = {
    readonly ref: ProjectResourceRef
    readonly type: string
    readonly label: string
    readonly icon: string
    readonly index: int
    readonly volume: number
    readonly panning: number
    readonly mute: boolean
    readonly solo: boolean
    readonly output: ProjectResourceRef | null
    readonly tracks: ReadonlyArray<ProjectResourceRef>
    readonly midiEffects: ReadonlyArray<ProjectResourceRef>
    readonly audioEffects: ReadonlyArray<ProjectResourceRef>
    readonly auxSends: ReadonlyArray<ProjectResourceRef>
}

export type ProjectBusResource = {
    readonly ref: ProjectResourceRef
    readonly unit: ProjectResourceRef
    readonly type: string
    readonly label: string
    readonly icon: string
    readonly color: string
    readonly enabled: boolean
    readonly output: ProjectResourceRef | null
    readonly midiEffects: ReadonlyArray<ProjectResourceRef>
    readonly audioEffects: ReadonlyArray<ProjectResourceRef>
    readonly auxSends: ReadonlyArray<ProjectResourceRef>
}

export type ProjectDeviceResource = {
    readonly ref: ProjectResourceRef
    readonly box: ProjectResourceRef
    readonly host: ProjectResourceRef
    readonly type: string
    readonly name: string
    readonly label: string
    readonly accepts: string
    readonly enabled: boolean
    readonly index?: int
}

export type ProjectTrackResource = {
    readonly ref: ProjectResourceRef
    readonly owner: ProjectResourceRef | null
    readonly target: ProjectResourceRef | null
    readonly type: string
    readonly index: int
    readonly enabled: boolean
    readonly targetName?: string
    readonly targetControlName?: string
    readonly regions: ReadonlyArray<ProjectResourceRef>
    readonly clips: ReadonlyArray<ProjectResourceRef>
}

export type ProjectRegionResource = {
    readonly ref: ProjectResourceRef
    readonly track: ProjectResourceRef | null
    readonly events: ProjectResourceRef | null
    readonly type: string
    readonly label: string
    readonly position: ppqn
    readonly duration: ppqn
    readonly loopOffset?: ppqn
    readonly loopDuration?: ppqn
    readonly mute: boolean
}

export type ProjectClipResource = {
    readonly ref: ProjectResourceRef
    readonly track: ProjectResourceRef | null
    readonly events: ProjectResourceRef | null
    readonly type: string
    readonly label: string
    readonly index: int
    readonly duration: ppqn
    readonly mute: boolean
}

export type ProjectEventResource = {
    readonly ref: ProjectResourceRef
    readonly owner: ProjectResourceRef | null
    readonly type: string
    readonly position: ppqn
    readonly duration?: ppqn
    readonly pitch?: int
    readonly velocity?: number
    readonly cent?: number
    readonly chance?: int
    readonly playCount?: int
    readonly index?: int
    readonly value?: unitValue
    readonly interpolation?: string
}

export type ProjectPlayfieldSlotResource = {
    readonly ref: ProjectResourceRef
    readonly device: ProjectResourceRef
    readonly index: int
    readonly file: ProjectResourceRef | null
    readonly fileName?: string
    readonly midiEffects: ReadonlyArray<ProjectResourceRef>
    readonly audioEffects: ReadonlyArray<ProjectResourceRef>
}

export type ProjectFactoryResource = {
    readonly key: string
    readonly kind: string
    readonly name: string
    readonly icon: string
    readonly briefDescription: string
    readonly description: string
    readonly manualPage: string
    readonly trackType?: string
}

export type ProjectSampleResource = {
    readonly uuid: string
    readonly name: string
    readonly bpm: number
    readonly duration: number
    readonly sampleRate: number
    readonly origin: string
    readonly custom?: string
}

export type ProjectSoundfontResource = {
    readonly uuid: string
    readonly name: string
    readonly size: int
    readonly url: string
    readonly license: string
    readonly origin: string
}

export type ProjectPresetResource = {
    readonly uuid: string
    readonly name: string
    readonly description: string
    readonly category: string
    readonly device?: string
    readonly instrument?: string
    readonly created: number
    readonly modified: number
    readonly hasTimeline?: boolean
}

const isMissingAdapterFactory = (error: unknown): boolean =>
    error instanceof Error && error.message.startsWith("Could not find factory for")

const fieldRef = (field: Field): ProjectResourceRef => ({
    $type: field instanceof PointerField ? "PointerField" : field instanceof PrimitiveField ? "PrimitiveField" : "Field",
    $address: field.address.toString()
})

const refOf = (value: {readonly address: Address}, type: string): ProjectResourceRef => ({
    $type: type,
    $address: value.address.toString()
})

const boxRef = (box: Box): ProjectResourceRef => refOf(box, box.name)

const vertexRef = (vertex: Vertex): ProjectResourceRef =>
    vertex instanceof Box ? boxRef(vertex) : vertex instanceof Field ? fieldRef(vertex) : refOf(vertex, "Field")

const fieldString = (box: Box, name: string): string | undefined => {
    const field = box.fields().find(candidate => candidate.fieldName === name)
    if (!(field instanceof PrimitiveField)) {return undefined}
    const value = field.getValue()
    return typeof value === "string" ? value : undefined
}

const constraint = (field: PrimitiveField): ProjectResourceConstraint => {
    const raw = (field as unknown as PrimitiveField & {readonly constraints?: unknown}).constraints
    if (typeof raw === "string") {return {kind: raw}}
    if (typeof raw !== "object" || raw === null) {return {kind: "any"}}
    const value = raw as {
        readonly min?: unknown, readonly mid?: unknown, readonly max?: unknown,
        readonly length?: unknown, readonly scaling?: unknown, readonly values?: unknown
    }
    return {
        kind: Array.isArray(value.values) ? "values" : value.length !== undefined ? "length" : "range",
        ...(typeof value.min === "number" ? {min: value.min} : {}),
        ...(typeof value.mid === "number" ? {mid: value.mid} : {}),
        ...(typeof value.max === "number" ? {max: value.max} : {}),
        ...(typeof value.length === "number" ? {length: value.length} : {}),
        ...(typeof value.scaling === "string" ? {scaling: value.scaling} : {}),
        ...(Array.isArray(value.values)
            ? {values: value.values.filter((entry): entry is number => typeof entry === "number")}
            : {})
    }
}

const resourceValue = (value: unknown): ProjectResourceValue => {
    if (value === null || typeof value === "boolean" || typeof value === "string") {return value}
    if (typeof value === "number") {return Number.isFinite(value) ? value : null}
    if (ArrayBuffer.isView(value)) {return Array.from(value as unknown as ArrayLike<number>)}
    return null
}

const referencesFrom = (field: Field): ReadonlyArray<ProjectResourceRef> =>
    field.pointerHub.incoming().map(({box}) => boxRef(box))

const optionalReference = (field: PointerField): ProjectResourceRef | null =>
    field.targetVertex.map(vertexRef).unwrapOrNull()

const factoryResource = (key: string, factory: {
    readonly defaultName: string
    readonly defaultIcon: IconSymbol
    readonly briefDescription: string
    readonly description: string
    readonly manualPage: string
}, kind: string, trackType?: TrackType): ProjectFactoryResource => ({
    key,
    kind,
    name: factory.defaultName,
    icon: IconSymbol.toName(factory.defaultIcon),
    briefDescription: factory.briefDescription,
    description: factory.description,
    manualPage: factory.manualPage,
    ...(trackType === undefined ? {} : {trackType: TrackType.toLabelString(trackType)})
})

export class ProjectResources {
    readonly #project: Project

    constructor(project: Project) {
        this.#project = project
    }

    audioUnits(): ReadonlyArray<ProjectAudioUnitResource> {
        return this.#project.rootBoxAdapter.audioUnits.adapters().map(adapter => ({
            ref: boxRef(adapter.box),
            type: String(adapter.type),
            label: adapter.label,
            icon: adapter.input.adapter().mapOr(input => input.iconField.getValue(), ""),
            index: adapter.indexField.getValue(),
            volume: adapter.box.volume.getValue(),
            panning: adapter.box.panning.getValue(),
            mute: adapter.box.mute.getValue(),
            solo: adapter.box.solo.getValue(),
            output: adapter.output.adapter.mapOr(bus => boxRef(bus.box), null),
            tracks: adapter.tracks.collection.adapters().map(track => boxRef(track.box)),
            midiEffects: adapter.midiEffects.mapOr(collection => collection.adapters().map(effect => boxRef(effect.box)), []),
            audioEffects: adapter.audioEffects.mapOr(collection => collection.adapters().map(effect => boxRef(effect.box)), []),
            auxSends: adapter.auxSends.adapters().map(send => boxRef(send.box))
        }))
    }

    buses(): ReadonlyArray<ProjectBusResource> {
        return this.#project.rootBoxAdapter.audioBusses.adapters().map(adapter => {
            const unit = adapter.deviceHost().audioUnitBoxAdapter()
            return {
                ref: boxRef(adapter.box),
                unit: boxRef(unit.box),
                type: String(unit.type),
                label: adapter.labelField.getValue(),
                icon: adapter.iconField.getValue(),
                color: adapter.colorField.getValue(),
                enabled: adapter.enabledField.getValue(),
                output: optionalReference(adapter.box.output),
                midiEffects: unit.midiEffects.mapOr(collection => collection.adapters().map(effect => boxRef(effect.box)), []),
                audioEffects: unit.audioEffects.mapOr(collection => collection.adapters().map(effect => boxRef(effect.box)), []),
                auxSends: unit.auxSends.adapters().map(send => boxRef(send.box))
            }
        })
    }

    devices(): ReadonlyArray<ProjectDeviceResource> {
        return this.#adapters().flatMap(adapter => {
            if (!Devices.isAny(adapter)) {return []}
            const host = adapter.deviceHost().audioUnitBoxAdapter()
            const index = Devices.isEffect(adapter) ? adapter.indexField.getValue() : undefined
            return [{
                ref: refOf(adapter, adapter.constructor.name),
                box: boxRef(adapter.box),
                host: boxRef(host.box),
                type: adapter.type,
                name: adapter.box.name,
                label: adapter.labelField.getValue(),
                accepts: adapter.accepts === false ? "none" : adapter.accepts,
                enabled: adapter.enabledField.getValue(),
                ...(index === undefined ? {} : {index})
            }]
        })
    }

    parameters(): ReadonlyArray<ProjectParameterResource> {
        this.#adapters()
        return this.#project.parameterFieldAdapters.values().flatMap(parameter => {
            const rawValue = resourceValue(parameter.getValue())
            const controlledValue = resourceValue(parameter.getControlledValue())
            const field = parameter.field
            return [{
                ref: refOf(parameter, "AutomatableParameterFieldAdapter"),
                field: fieldRef(field),
                owner: boxRef(field.box),
                path: field.debugPath,
                name: parameter.name,
                primitiveType: field.type,
                unit: (field as unknown as PrimitiveField & {readonly unit?: string}).unit ?? "",
                rawValue,
                unitValue: parameter.getUnitValue(),
                printValue: parameter.getPrintValue().value,
                printUnit: parameter.getPrintValue().unit,
                controlledValue,
                controlledPrintValue: parameter.getControlledPrintValue().value,
                controlledPrintUnit: parameter.getControlledPrintValue().unit,
                constraints: constraint(field as unknown as PrimitiveField),
                choices: choicesOf(parameter).map(choice => ({
                    value: choice.value as boolean | number | string,
                    label: choice.label,
                    unit: choice.unit
                }))
            }]
        })
    }

    tracks(): ReadonlyArray<ProjectTrackResource> {
        return this.#project.boxGraph.boxes()
            .filter((box): box is TrackBox => box instanceof TrackBox)
            .map(box => {
                const adapter = this.#project.boxAdapters.adapterFor(box, TrackBoxAdapter)
                const targetName = adapter.targetName.unwrapOrUndefined()
                const targetControlName = adapter.targetControlName.unwrapOrUndefined()
                return {
                    ref: boxRef(box),
                    owner: box.tracks.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
                    target: box.target.targetVertex.map(vertexRef).unwrapOrNull(),
                    type: TrackType.toLabelString(box.type.getValue()),
                    index: box.index.getValue(),
                    enabled: box.enabled.getValue(),
                    ...(targetName === undefined ? {} : {targetName}),
                    ...(targetControlName === undefined ? {} : {targetControlName}),
                    regions: referencesFrom(box.regions),
                    clips: referencesFrom(box.clips)
                }
            })
    }

    regions(): ReadonlyArray<ProjectRegionResource> {
        return this.#project.boxGraph.boxes().flatMap(box => {
            if (box instanceof NoteRegionBox) {
                return [this.#region(box, "note", box.events, box.loopOffset.getValue(), box.loopDuration.getValue())]
            }
            if (box instanceof ValueRegionBox) {
                return [this.#region(box, "automation", box.events, box.loopOffset.getValue(), box.loopDuration.getValue())]
            }
            if (box instanceof AudioRegionBox) {
                return [this.#region(box, "audio", box.events)]
            }
            return []
        })
    }

    clips(): ReadonlyArray<ProjectClipResource> {
        return this.#project.boxGraph.boxes().flatMap(box => {
            if (box instanceof NoteClipBox) {
                return [this.#clip(box, "note", box.events)]
            }
            if (box instanceof ValueClipBox) {
                return [this.#clip(box, "automation", box.events)]
            }
            if (box instanceof AudioClipBox) {
                return [this.#clip(box, "audio", box.events)]
            }
            return []
        })
    }

    events(): ReadonlyArray<ProjectEventResource> {
        return this.#project.boxGraph.boxes().flatMap((box): ReadonlyArray<ProjectEventResource> => {
            if (box instanceof NoteEventBox) {
                return [{
                    ref: boxRef(box),
                    owner: box.events.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
                    type: "note",
                    position: box.position.getValue(),
                    duration: box.duration.getValue(),
                    pitch: box.pitch.getValue(),
                    velocity: box.velocity.getValue(),
                    cent: box.cent.getValue(),
                    chance: box.chance.getValue(),
                    playCount: box.playCount.getValue()
                }]
            }
            if (box instanceof ValueEventBox) {
                const interpolation = InterpolationFieldAdapter.read(box.interpolation)
                return [{
                    ref: boxRef(box),
                    owner: box.events.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
                    type: "automation",
                    position: box.position.getValue(),
                    index: box.index.getValue(),
                    value: box.value.getValue(),
                    interpolation: interpolation.type
                }]
            }
            return []
        })
    }

    playfieldSlots(): ReadonlyArray<ProjectPlayfieldSlotResource> {
        return this.#project.boxGraph.boxes()
            .filter((box): box is PlayfieldSampleBox => box instanceof PlayfieldSampleBox)
            .map(box => {
                const fileName = box.file.targetVertex
                    .map(vertex => fieldString(vertex.box, "fileName"))
                    .unwrapOrUndefined()
                return {
                    ref: boxRef(box),
                    device: box.device.targetVertex.map(vertex => boxRef(vertex.box)).unwrap("slot has no device"),
                    index: box.index.getValue(),
                    file: box.file.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
                    ...(fileName === undefined ? {} : {fileName}),
                    midiEffects: referencesFrom(box.midiEffects),
                    audioEffects: referencesFrom(box.audioEffects)
                }
            })
    }

    instrumentFactories(): ReadonlyArray<ProjectFactoryResource> {
        return Object.entries(InstrumentFactories.Named)
            .map(([key, factory]) => factoryResource(key, factory, "instrument", factory.trackType))
            .toSorted((left, right) => left.key.localeCompare(right.key))
    }

    midiEffectFactories(): ReadonlyArray<ProjectFactoryResource> {
        return Object.entries(EffectFactories.MidiNamed)
            .map(([key, factory]) => factoryResource(key, factory, "midi-effect"))
            .toSorted((left, right) => left.key.localeCompare(right.key))
    }

    audioEffectFactories(): ReadonlyArray<ProjectFactoryResource> {
        return Object.entries(EffectFactories.AudioNamed)
            .map(([key, factory]) => factoryResource(key, factory, "audio-effect"))
            .toSorted((left, right) => left.key.localeCompare(right.key))
    }

    async samples(): Promise<ReadonlyArray<ProjectSampleResource>> {
        const samples = await FactoryCatalog.get().samples()
        return samples.map(sample => ({
            uuid: sample.uuid,
            name: sample.name,
            bpm: sample.bpm,
            duration: sample.duration,
            sampleRate: sample.sample_rate,
            origin: sample.origin,
            ...(sample.custom === undefined ? {} : {custom: sample.custom})
        })).toSorted((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid))
    }

    async soundfonts(): Promise<ReadonlyArray<ProjectSoundfontResource>> {
        const soundfonts = await FactoryCatalog.get().soundfonts()
        return soundfonts.map(soundfont => ({
            uuid: soundfont.uuid,
            name: soundfont.name,
            size: soundfont.size,
            url: soundfont.url,
            license: soundfont.license,
            origin: soundfont.origin
        })).toSorted((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid))
    }

    async presets(): Promise<ReadonlyArray<ProjectPresetResource>> {
        const presets = await FactoryCatalog.get().presets()
        return presets.map(preset => ({
            uuid: preset.uuid,
            name: preset.name,
            description: preset.description,
            category: preset.category,
            ...("device" in preset ? {device: preset.device} : {}),
            ...("instrument" in preset ? {instrument: preset.instrument} : {}),
            created: preset.created,
            modified: preset.modified,
            ...(preset.hasTimeline === undefined ? {} : {hasTimeline: preset.hasTimeline})
        })).toSorted((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid))
    }

    #region(box: NoteRegionBox | ValueRegionBox | AudioRegionBox,
            type: string,
            events: PointerField,
            loopOffset?: ppqn,
            loopDuration?: ppqn): ProjectRegionResource {
        const position = box.position.getValue()
        const duration = box.duration.getValue()
        return {
            ref: boxRef(box),
            track: box.regions.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
            events: events.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
            type,
            label: box.label.getValue(),
            position,
            duration,
            ...(loopOffset === undefined ? {} : {loopOffset}),
            ...(loopDuration === undefined ? {} : {loopDuration}),
            mute: box.mute.getValue()
        }
    }

    #clip(box: NoteClipBox | ValueClipBox | AudioClipBox,
          type: string,
          events: PointerField): ProjectClipResource {
        return {
            ref: boxRef(box),
            track: box.clips.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
            events: events.targetVertex.map(vertex => boxRef(vertex.box)).unwrapOrNull(),
            type,
            label: box.label.getValue(),
            index: box.index.getValue(),
            duration: box.duration.getValue(),
            mute: box.mute.getValue()
        }
    }

    #adapters(): ReadonlyArray<BoxAdapter> {
        return this.#project.boxGraph.boxes().flatMap(box => {
            try {
                return [this.#project.boxAdapters.adapterFor(box, (adapter: BoxAdapter): adapter is BoxAdapter => true)]
            } catch (error) {
                if (isMissingAdapterFactory(error)) {return []}
                throw error
            }
        })
    }
}
