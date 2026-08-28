import {Address, Box, Field, Float32Field, Int32Field, PointerField, PrimitiveField} from "@opendaw/lib-box"
import {
    AutomatableParameterFieldAdapter,
    BoxAdapter,
    InstrumentSemantics,
    SemanticFields,
    isSupportedInstrumentBox
} from "@opendaw/studio-adapters"
import type {Sample} from "@opendaw/studio-adapters"
import {ControlResolver} from "../control-api/ControlResolver"
import type {JsonObject, JsonValue} from "../control-api/types"
import type {
    ResourceInspectionResult,
    ResourceKind,
    ResourceQuery,
    ResourceQueryResult,
    InstrumentInspectionResult,
    InstrumentPropertyInspection,
    SampleCatalog,
    SampleQuery,
    SampleQueryResult
} from "./types"

type ResourceEntry = {
    readonly kind: ResourceKind
    readonly address: string
    readonly owner?: string
    readonly type: string
    readonly search: string
    readonly view: JsonObject
}

const addressSpec = {
    kind: "handle",
    handle: "address",
    name: "Address"
} as const

const boxSpec = {
    kind: "handle",
    handle: "box",
    name: "Box"
} as const

const knownKinds: ReadonlyArray<ResourceKind> = ["box", "field", "adapter", "parameter"]
const kindOrder: Readonly<Record<ResourceKind, number>> = {box: 0, field: 1, adapter: 2, parameter: 3}
const defaultLimit = 100
const sampleDefaultLimit = 50
const sampleMaxLimit = 50
const sampleOrigins: ReadonlyArray<Sample["origin"]> = ["openDAW", "recording", "import"]

const asJsonValue = (value: unknown): JsonValue | undefined => {
    if (value === null || typeof value === "boolean" || typeof value === "string") {return value}
    if (typeof value === "number") {return Number.isFinite(value) ? value : undefined}
    if (Array.isArray(value)) {
        return value.map(element => asJsonValue(element)).filter((element): element is JsonValue => element !== undefined)
    }
    if (ArrayBuffer.isView(value)) {
        return Array.from(value as unknown as ArrayLike<number>)
            .map(element => asJsonValue(element))
            .filter((element): element is JsonValue => element !== undefined)
    }
    if (typeof value !== "object") {return undefined}
    const object = value as Record<string, unknown>
    const entries = Object.entries(object)
        .map(([key, member]) => [key, asJsonValue(member)] as const)
        .filter((entry): entry is readonly [string, JsonValue] => entry[1] !== undefined)
    return Object.fromEntries(entries)
}

const pointerTypeValue = (value: unknown): JsonValue => {
    if (typeof value === "number" || typeof value === "string") {return value}
    if (typeof value === "symbol") {return value.description ?? String(value)}
    return String(value)
}

const primitiveValue = (field: Field): JsonValue | undefined =>
    field instanceof PrimitiveField ? asJsonValue(field.toJSON()) : undefined

const primitiveFields = (fields: ReadonlyArray<Field>, prefix = ""):
    ReadonlyArray<{readonly name: string, readonly value: JsonValue}> => {
    const result: Array<{name: string, value: JsonValue}> = []
    fields.forEach(field => {
        const name = prefix.length === 0 ? field.fieldName : `${prefix}/${field.fieldName}`
        const value = primitiveValue(field)
        if (value !== undefined) {
            result.push({name, value})
        }
        if (!(field instanceof PrimitiveField) && !(field instanceof PointerField)) {
            result.push(...primitiveFields(field.fields(), name))
        }
    })
    return result
}

const labelOf = (box: Box): string | undefined => {
    const field = box.fields().find(candidate => candidate.fieldName === "label")
    const value = field === undefined ? undefined : primitiveValue(field)
    return typeof value === "string" ? value : undefined
}

const directFieldView = (resolver: ControlResolver, field: Field): JsonObject => {
    const value = primitiveValue(field)
    return {
        name: field.fieldName,
        handle: resolver.handle(field),
        kind: field.constructor.name,
        type: field instanceof PrimitiveField
            ? field.type
            : field instanceof PointerField ? "pointer" : field.constructor.name,
        ...(value === undefined ? {} : {value})
    }
}

const pointerView = (resolver: ControlResolver, pointer: PointerField): JsonObject => ({
    handle: resolver.handle(pointer),
    name: pointer.fieldName,
    pointerType: pointerTypeValue(pointer.pointerType),
    owner: resolver.handle(pointer.box)
})

const boxView = (resolver: ControlResolver, box: Box): JsonObject => {
    const fields = box.fields().map(field => directFieldView(resolver, field))
    const primitives = box.fields().flatMap(field => {
        const value = primitiveValue(field)
        return value === undefined ? [] : [{name: field.fieldName, value}]
    })
    const primitiveValues = Object.fromEntries(primitives.map(({name, value}) => [name, value]))
    const outgoing = box.outgoingEdges().map(([pointer, target]) => ({
        field: resolver.handle(pointer),
        name: pointer.fieldName,
        pointerType: pointerTypeValue(pointer.pointerType),
        target: resolver.handle(target)
    }))
    const incoming = box.incomingEdges().map(pointer => pointerView(resolver, pointer))
    const label = labelOf(box)
    return {
        kind: "box",
        handle: resolver.handle(box),
        name: box.name,
        type: box.name,
        ...(label === undefined ? {} : {label}),
        fields,
        primitiveValues,
        ...(Object.keys(box.tags).length === 0 ? {} : {tags: box.tags}),
        ...(outgoing.length === 0 ? {} : {outgoingPointers: outgoing}),
        ...(incoming.length === 0 ? {} : {incomingPointers: incoming})
    } as JsonObject
}

const fieldView = (resolver: ControlResolver, field: Field): JsonObject => {
    const primitive = primitiveValue(field)
    const pointerTypes = field instanceof PointerField
        ? [pointerTypeValue(field.pointerType)]
        : field.pointerRules.accepts.map(pointerTypeValue)
    const incoming = field instanceof PointerField ? [] : field.pointerHub.incoming()
    const target = field instanceof PointerField
        ? field.targetAddress.map(address => resolver.handle(address)).unwrapOrUndefined()
        : undefined
    return {
        kind: "field",
        handle: resolver.handle(field),
        name: field.fieldName,
        fieldKind: field.constructor.name,
        type: field instanceof PrimitiveField
            ? field.type
            : field instanceof PointerField ? "pointer" : field.constructor.name,
        owner: resolver.handle(field.box),
        ...(primitive === undefined ? {} : {value: primitive}),
        ...(pointerTypes.length === 0 ? {} : {pointerTypes}),
        ...(target === undefined ? {} : {target}),
        ...(incoming.length === 0 ? {} : {
            incomingCount: incoming.length,
            incomingPointers: incoming.slice(0, 16).map(pointer => pointerView(resolver, pointer))
        })
    } as JsonObject
}

const adapterView = (resolver: ControlResolver, adapter: BoxAdapter): JsonObject => ({
    kind: "adapter",
    handle: resolver.handle(adapter),
    type: adapter.constructor.name,
    adapterType: adapter.constructor.name,
    box: resolver.handle(adapter.box),
    boxType: adapter.box.name,
    ...(labelOf(adapter.box) === undefined ? {} : {label: labelOf(adapter.box)})
})

const printValue = (parameter: AutomatableParameterFieldAdapter): JsonObject => ({
    value: parameter.getPrintValue().value,
    unit: parameter.getPrintValue().unit
})

const parameterView = (resolver: ControlResolver,
                      parameter: AutomatableParameterFieldAdapter): JsonObject => {
    const value = asJsonValue(parameter.getValue())
    return {
        kind: "parameter",
        handle: resolver.handle(parameter),
        name: parameter.name,
        type: String(parameter.type),
        owner: resolver.handle(parameter.field.box),
        field: resolver.handle(parameter.field),
        printValue: printValue(parameter),
        ...(value === undefined ? {} : {value})
    } as JsonObject
}

const semanticPropertyView = (path: string, field: PrimitiveField,
                              parameter: AutomatableParameterFieldAdapter | undefined): InstrumentPropertyInspection => {
    const constraints = field instanceof Float32Field || field instanceof Int32Field
        ? asJsonValue(field.constraints) ?? null
        : null
    return {
        path,
        value: primitiveValue(field) ?? null,
        fieldType: String(field.type),
        constraints,
        automatable: parameter !== undefined,
        ...(parameter === undefined ? {} : {
            parameterName: parameter.name,
            printValue: printValue(parameter)
        })
    }
}

const entrySearchText = (view: JsonObject, extra: ReadonlyArray<string> = []): string =>
    `${JSON.stringify(view)} ${extra.join(" ")}`.toLocaleLowerCase()

const entry = (kind: ResourceKind, address: Address, view: JsonObject,
              type: string, owner?: Address, extra: ReadonlyArray<string> = []): ResourceEntry => ({
    kind,
    address: address.toString(),
    ...(owner === undefined ? {} : {owner: owner.toString()}),
    type,
    search: entrySearchText(view, extra),
    view
})

const assertRecord = (value: unknown, context: string): JsonObject => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${context} must be an object`)
    }
    return value as JsonObject
}

const assertKnownProperties = (value: JsonObject, known: ReadonlyArray<string>, context: string): void => {
    Object.keys(value).forEach(name => {
        if (!known.includes(name)) {throw new Error(`Unknown property '${name}' for ${context}`)}
    })
}

const optionalString = (value: JsonObject, name: string): string | undefined => {
    const candidate = value[name]
    if (candidate === undefined) {return undefined}
    if (typeof candidate !== "string") {throw new Error(`${name} must be a string`)}
    return candidate
}

const optionalNonNegativeInteger = (value: JsonObject, name: string): number | undefined => {
    const candidate = value[name]
    if (candidate === undefined) {return undefined}
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0) {
        throw new Error(`${name} must be a non-negative integer`)
    }
    return candidate
}

const optionalFiniteNumber = (value: JsonObject, name: string): number | undefined => {
    const candidate = value[name]
    if (candidate === undefined) {return undefined}
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
        throw new Error(`${name} must be a finite number`)
    }
    return candidate
}

const optionalSampleOrigin = (value: JsonObject): Sample["origin"] | undefined => {
    const candidate = value.origin
    if (candidate === undefined) {return undefined}
    if (typeof candidate !== "string" || !sampleOrigins.includes(candidate as Sample["origin"])) {
        throw new Error("origin must be one of openDAW, recording, import")
    }
    return candidate as Sample["origin"]
}

const sampleView = (sample: Sample): Sample => ({
    uuid: sample.uuid,
    name: sample.name,
    bpm: sample.bpm,
    duration: sample.duration,
    sample_rate: sample.sample_rate,
    origin: sample.origin,
    ...(sample.custom === undefined ? {} : {custom: sample.custom})
})

export class ResourceTools {
    readonly #resolver: ControlResolver
    readonly #sampleCatalog: SampleCatalog | undefined

    constructor(resolver: ControlResolver, sampleCatalog?: SampleCatalog) {
        this.#resolver = resolver
        this.#sampleCatalog = sampleCatalog
    }

    query(input: ResourceQuery | JsonObject = {}): ResourceQueryResult {
        const value = assertRecord(input, "query_resources input")
        assertKnownProperties(value, ["kind", "text", "type", "owner", "limit", "offset"], "query_resources input")
        const kindValue = value.kind
        if (kindValue !== undefined && (typeof kindValue !== "string"
            || !(knownKinds as ReadonlyArray<string>).includes(kindValue))) {
            throw new Error("kind must be one of box, field, adapter, parameter")
        }
        const kind = kindValue as ResourceKind | undefined
        const text = optionalString(value, "text")?.trim().toLocaleLowerCase()
        const type = optionalString(value, "type")?.trim().toLocaleLowerCase()
        const limit = optionalNonNegativeInteger(value, "limit") ?? defaultLimit
        const offset = optionalNonNegativeInteger(value, "offset") ?? 0
        let owner: string | undefined
        if (value.owner !== undefined) {
            const resolved = this.#resolver.resolve(boxSpec, value.owner)
            if (!(resolved instanceof Box)) {throw new Error("owner must be a box handle")}
            owner = resolved.address.toString()
        }
        const matching = this.#entries()
            .filter(candidate => kind === undefined || candidate.kind === kind)
            .filter(candidate => type === undefined || candidate.type.toLocaleLowerCase().includes(type))
            .filter(candidate => owner === undefined || candidate.owner === owner)
            .filter(candidate => text === undefined || candidate.search.includes(text))
        const resources = matching.slice(offset, offset + limit).map(candidate => candidate.view)
        return {resources, total: matching.length, limit, offset}
    }

    async querySamples(input: SampleQuery | JsonObject = {}): Promise<SampleQueryResult> {
        const value = assertRecord(input, "query_samples input")
        assertKnownProperties(value, [
            "text", "origin", "minBpm", "maxBpm", "minDuration", "maxDuration", "limit", "offset"
        ], "query_samples input")
        const text = optionalString(value, "text")?.trim().toLocaleLowerCase()
        const origin = optionalSampleOrigin(value)
        const minBpm = optionalFiniteNumber(value, "minBpm")
        const maxBpm = optionalFiniteNumber(value, "maxBpm")
        const minDuration = optionalFiniteNumber(value, "minDuration")
        const maxDuration = optionalFiniteNumber(value, "maxDuration")
        const requestedLimit = optionalNonNegativeInteger(value, "limit") ?? sampleDefaultLimit
        const limit = Math.min(requestedLimit, sampleMaxLimit)
        const offset = optionalNonNegativeInteger(value, "offset") ?? 0
        const catalog = this.#sampleCatalog
        if (catalog === undefined) {throw new Error("Sample catalog is unavailable.")}
        const samples = await catalog.list()
        const matching = samples
            .filter(sample => origin === undefined || sample.origin === origin)
            .filter(sample => minBpm === undefined || sample.bpm >= minBpm)
            .filter(sample => maxBpm === undefined || sample.bpm <= maxBpm)
            .filter(sample => minDuration === undefined || sample.duration >= minDuration)
            .filter(sample => maxDuration === undefined || sample.duration <= maxDuration)
            .filter(sample => text === undefined
                || [sample.name, sample.custom ?? "", sample.origin]
                    .join(" ").toLocaleLowerCase().includes(text))
        return {
            samples: matching.slice(offset, offset + limit).map(sampleView),
            total: matching.length,
            limit,
            offset
        }
    }

    inspect(input: JsonObject): ResourceInspectionResult {
        const value = assertRecord(input, "inspect_resource input")
        assertKnownProperties(value, ["handle"], "inspect_resource input")
        const handle = value.handle
        if (handle === undefined) {throw new Error("Missing argument 'handle'")}
        const resolved = this.#resolver.resolve(addressSpec, handle)
        if (!(resolved instanceof Address)) {throw new Error("handle is not an address")}
        const address = resolved.toString()
        const views = this.#entries()
            .filter(candidate => candidate.address === address)
            .sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind])
            .map(candidate => candidate.view)
        if (views.length === 0) {throw new Error(`No resource at ${address}`)}
        return {handle: this.#resolver.handle(resolved), views}
    }

    inspectInstrument(input: JsonObject): InstrumentInspectionResult {
        const value = assertRecord(input, "inspect_instrument input")
        assertKnownProperties(value, ["instrument"], "inspect_instrument input")
        const handle = value.instrument
        if (handle === undefined) {throw new Error("Missing argument 'instrument'")}
        const resolved = this.#resolver.resolve(boxSpec, handle)
        if (!(resolved instanceof Box)) {throw new Error("instrument must be a box handle")}
        if (!isSupportedInstrumentBox(resolved)) {
            throw new Error(`Unsupported instrument '${resolved.name}'.`)
        }
        const semantics = InstrumentSemantics.forBox(resolved)
        if (semantics === null) {throw new Error(`Unsupported instrument '${resolved.name}'.`)}
        const parameters = this.#resolver.parameters()
        const properties = SemanticFields.paths(semantics.spec).map(path => {
            const field = SemanticFields.resolve(semantics.spec, path)
            if (field === undefined) {throw new Error(`Missing semantic field '${path}'`)}
            const parameter = parameters.find(candidate => candidate.field.address.equals(field.address))
            return semanticPropertyView(path, field, parameter)
        })
        return {
            handle: this.#resolver.handle(resolved),
            type: resolved.name,
            label: labelOf(resolved) ?? resolved.name,
            properties,
            groups: semantics.groups
        }
    }

    #entries(): ReadonlyArray<ResourceEntry> {
        const boxes = this.#resolver.boxes()
        const fields = this.#resolver.fields()
        const adapters = this.#resolver.adapters()
        const parameters = this.#resolver.parameters()
        const entries: Array<ResourceEntry> = []
        boxes.forEach(box => entries.push(entry(
            "box", box.address, boxView(this.#resolver, box), box.name,
            undefined, primitiveFields(box.fields()).flatMap(({name, value}) => [name, JSON.stringify(value)]))))
        fields.forEach(field => entries.push(entry(
            "field", field.address, fieldView(this.#resolver, field),
            field instanceof PrimitiveField ? field.type : field.constructor.name,
            field.box.address,
            [field.fieldName, field.constructor.name, field.debugPath])))
        adapters.forEach(adapter => entries.push(entry(
            "adapter", adapter.address, adapterView(this.#resolver, adapter),
            adapter.constructor.name, adapter.box.address, [adapter.box.name])))
        parameters.forEach(parameter => entries.push(entry(
            "parameter", parameter.address, parameterView(this.#resolver, parameter),
            String(parameter.type), parameter.field.box.address, [parameter.name, parameter.field.fieldName])))
        return entries.toSorted((left, right) =>
            kindOrder[left.kind] - kindOrder[right.kind]
            || left.address.localeCompare(right.address))
    }
}
