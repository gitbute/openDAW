import {Box, BooleanField, BoxGraph, Constraints, Float32Field, Int32Field, PrimitiveField, PrimitiveValues} from "@opendaw/lib-box"
import {
    AutomatableParameterFieldAdapter,
    BoxAdapter,
    BoxAdapters,
    BoxAdaptersContext,
    ParameterFieldAdapters,
    SampleLoader,
    SampleLoaderManager
} from "@opendaw/studio-adapters"
import {
    AudioUnitBox,
    ValueClipBox,
    ValueEventBox,
    ValueEventCollectionBox,
    ValueRegionBox,
    TrackBox
} from "@opendaw/studio-boxes"
import {
    asInstanceOf,
    int,
    isDefined,
    isNull,
    Nullable,
    Option,
    panic,
    StringMapping,
    Terminable,
    tryCatch,
    unitValue,
    UUID,
    ValueMapping
} from "@opendaw/lib-std"
import {Automatable, ParameterInfo} from "../Api"
import {Context} from "./Context"
import {AnyPrimitiveField} from "./Fields"
import {Guard} from "./Guard"
import {Facades} from "./Facades"

export type ParameterMapping = {
    readonly valueMapping: ValueMapping<PrimitiveValues>
    readonly stringMapping: Option<StringMapping<PrimitiveValues>>
}

const DetachedSampleLoader = (uuid: UUID.Bytes): SampleLoader => ({
    get data() {return Option.None},
    get peaks() {return Option.None},
    get uuid() {return uuid},
    get meta() {return Option.None},
    get state() {return {type: "idle"} as const},
    invalidate: () => {},
    subscribe: () => Terminable.Empty
})

const DetachedSampleManager: SampleLoaderManager = {
    getOrCreate: (uuid: UUID.Bytes) => DetachedSampleLoader(uuid),
    record: () => {},
    invalidate: () => {},
    remove: () => {},
    register: () => Terminable.Empty
}

const createAdaptersContext = (boxGraph: BoxGraph, parameters: ParameterFieldAdapters): BoxAdaptersContext => {
    const unavailable = (name: string): never => panic(`${name} is not available to scripts`)
    const context: BoxAdaptersContext = {
        get boxGraph() {return boxGraph},
        get boxAdapters() {return boxAdapters},
        get sampleManager() {return DetachedSampleManager},
        get soundfontManager() {return unavailable("soundfontManager")},
        get rootBoxAdapter() {return unavailable("rootBoxAdapter")},
        get timelineBoxAdapter() {return unavailable("timelineBoxAdapter")},
        get liveStreamReceiver() {return unavailable("liveStreamReceiver")},
        get liveStreamBroadcaster() {return unavailable("liveStreamBroadcaster")},
        get clipSequencing() {return unavailable("clipSequencing")},
        get parameterFieldAdapters() {return parameters},
        get tempoMap() {return unavailable("tempoMap")},
        get isMainThread() {return false},
        get isAudioContext() {return false},
        terminate: () => {}
    }
    const boxAdapters = new BoxAdapters(context)
    return context
}

const hasValues = (constraints: Constraints.Int32): constraints is { values: Array<int> } =>
    typeof constraints === "object" && Object.hasOwn(constraints, "values")
const hasLength = (constraints: Constraints.Int32): constraints is { length: int } =>
    typeof constraints === "object" && Object.hasOwn(constraints, "length")
const hasRange = (constraints: Constraints.Int32): constraints is { min: int, max: int } =>
    typeof constraints === "object" && Object.hasOwn(constraints, "min")

const isBoxAdapter =(adapter: BoxAdapter): adapter is BoxAdapter => isDefined(adapter)

export namespace ParameterMappings {
    // The studio's adapters own the value mappings, so they are instantiated detached and harvested.
    const fromAdapters = (boxGraph: BoxGraph, field: AnyPrimitiveField): Option<ParameterMapping> => {
        let box: Nullable<Box> = field.box
        while (!isNull(box)) {
            const parameters = new ParameterFieldAdapters()
            const context = createAdaptersContext(boxGraph, parameters)
            const owner = box
            const harvested = tryCatch(() => {
                context.boxAdapters.adapterFor(owner, isBoxAdapter)
                return parameters.opt(field.address).map((adapter: AutomatableParameterFieldAdapter): ParameterMapping =>
                    ({valueMapping: adapter.valueMapping, stringMapping: Option.wrap(adapter.stringMapping)}))
            })
            context.boxAdapters.terminate()
            if (harvested.status === "success" && harvested.value.nonEmpty()) {return harvested.value}
            if (box instanceof AudioUnitBox) {break}
            box = Facades.parentBox(box)
        }
        return Option.None
    }

    const fromConstraints = (field: AnyPrimitiveField): Option<ParameterMapping> => {
        const wrap = (valueMapping: ValueMapping<PrimitiveValues>): Option<ParameterMapping> =>
            Option.wrap({valueMapping, stringMapping: Option.None})
        if (field instanceof BooleanField) {return wrap(ValueMapping.bool)}
        if (field instanceof Float32Field) {
            const constraints = field.constraints
            if (constraints === "unipolar") {return wrap(ValueMapping.unipolar())}
            if (constraints === "bipolar") {return wrap(ValueMapping.bipolar())}
            if (constraints === "decibel") {return wrap(ValueMapping.DefaultDecibel)}
            if (typeof constraints !== "object") {return Option.None}
            if (constraints.scaling === "decibel") {return wrap(ValueMapping.decibel(constraints.min, constraints.mid, constraints.max))}
            if (constraints.scaling === "exponential") {return wrap(ValueMapping.exponential(constraints.min, constraints.max))}
            return wrap(ValueMapping.linear(constraints.min, constraints.max))
        }
        if (field instanceof Int32Field) {
            const constraints = field.constraints
            if (hasValues(constraints)) {return wrap(ValueMapping.values(constraints.values))}
            if (hasLength(constraints)) {return wrap(ValueMapping.linearInteger(0, constraints.length - 1))}
            if (hasRange(constraints)) {return wrap(ValueMapping.linearInteger(constraints.min, constraints.max))}
            return Option.None
        }
        return Option.None
    }

    export const resolve = (context: Context, field: AnyPrimitiveField): ParameterMapping =>
        context.memo(field, () => fromAdapters(context.boxGraph, field)
            .match({none: () => fromConstraints(field), some: mapping => Option.wrap(mapping)})
            .unwrap(() => `${field.box.name}.${field.fieldName} has no value mapping`))

    export const unitOf = (field: AnyPrimitiveField, mapping: ParameterMapping): string => {
        if ((field instanceof Float32Field || field instanceof Int32Field) && field.unit.length > 0) {return field.unit}
        return mapping.stringMapping.mapOr(strings => strings.x(mapping.valueMapping.y(0.5)).unit, "")
    }

    export const toNumber = (value: PrimitiveValues): number =>
        typeof value === "boolean" ? (value ? 1 : 0) : typeof value === "number" ? value : panic(`Not a numeric parameter`)

    export const toNormalized = (field: AnyPrimitiveField, mapping: ParameterMapping, value: unknown, name: string): unitValue => {
        if (field instanceof BooleanField) {
            if (typeof value === "boolean") {return mapping.valueMapping.x(value)}
            return mapping.valueMapping.x(Guard.finite(value, name) >= 0.5)
        }
        return mapping.valueMapping.x(Guard.number(value, name))
    }

    export const fromNormalized = (mapping: ParameterMapping, normalized: unknown, name: string): number =>
        toNumber(mapping.valueMapping.y(Guard.float32("unipolar", normalized, name)))

    export const trackFieldOfEvent = (box: ValueEventBox): Option<AnyPrimitiveField> => {
        const collection = box.events.targetVertex.map(vertex => asInstanceOf(vertex.box, ValueEventCollectionBox))
        if (collection.isEmpty()) {return Option.None}
        const owner = collection.unwrap().owners.pointerHub.incoming().at(0)?.box
        const trackField = owner instanceof ValueRegionBox ? owner.regions.targetVertex
            : owner instanceof ValueClipBox ? owner.clips.targetVertex : Option.None
        return trackField
            .map(vertex => asInstanceOf(vertex.box, TrackBox))
            .flatMap(track => track.target.targetVertex)
            .flatMap(vertex => vertex instanceof PrimitiveField ? Option.wrap(vertex as AnyPrimitiveField) : Option.None)
    }
}

export class ParameterInfoImpl implements ParameterInfo {
    readonly #context: Context
    readonly #target: Automatable
    readonly #path: string
    readonly #field: AnyPrimitiveField

    constructor(context: Context, target: Automatable, path: string, field: AnyPrimitiveField) {
        this.#context = context
        this.#target = target
        this.#path = path
        this.#field = field
    }

    get target(): Automatable {return this.#target}
    get path(): string {return this.#path}
    get unit(): string {return ParameterMappings.unitOf(this.#field, this.#mapping)}
    get min(): number {return ParameterMappings.toNumber(this.#mapping.valueMapping.y(0.0))}
    get max(): number {return ParameterMappings.toNumber(this.#mapping.valueMapping.y(1.0))}
    get value(): number {return ParameterMappings.toNumber(this.#field.getValue())}
    get normalized(): unitValue {return this.#mapping.valueMapping.x(this.#field.getValue())}

    toNormalized(value: number | boolean): unitValue {
        return ParameterMappings.toNormalized(this.#field, this.#mapping, value, `${this.#path}.toNormalized`)
    }

    fromNormalized(normalized: unitValue): number {
        return ParameterMappings.fromNormalized(this.#mapping, normalized, `${this.#path}.fromNormalized`)
    }

    format(value: number | boolean): string {
        const {valueMapping, stringMapping} = this.#mapping
        const native = valueMapping.y(ParameterMappings.toNormalized(this.#field, this.#mapping, value, `${this.#path}.format`))
        return stringMapping.match({
            none: () => `${ParameterMappings.toNumber(native)}${this.unit.length > 0 ? ` ${this.unit}` : ""}`,
            some: strings => {
                const {value: text, unit} = strings.x(native)
                return unit.length > 0 ? `${text} ${unit}` : text
            }
        })
    }

    toJSON(): object {
        return {path: this.path, unit: this.unit, min: this.min, max: this.max, value: this.value}
    }

    get #mapping() {return ParameterMappings.resolve(this.#context, this.#field)}
}
