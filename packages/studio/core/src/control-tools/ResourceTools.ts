import {Address, Box, Field, PointerField, PrimitiveField} from "@opendaw/lib-box"
import {AutomatableParameterFieldAdapter, BoxAdapter} from "@opendaw/studio-adapters"
import {ControlResolver} from "../control-api/ControlResolver"
import type {JsonObject, JsonValue} from "../control-api/types"
import type {
    ResourceInspectionResult,
    ResourceKind,
    ResourceQuery,
    ResourceQueryResult
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
    return undefined
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

export class ResourceTools {
    readonly #resolver: ControlResolver

    constructor(resolver: ControlResolver) {this.#resolver = resolver}

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
