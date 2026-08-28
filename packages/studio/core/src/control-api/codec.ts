import {Address, Field, PointerField, PrimitiveField} from "@opendaw/lib-box"
import {Option, UUID} from "@opendaw/lib-std"
import {EffectFactories} from "../EffectFactories"
import {Project} from "../project/Project"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import type {BoxAdapter} from "@opendaw/studio-adapters"
import {Pointers} from "@opendaw/studio-enums"
import {
    ControlHandle,
    JsonObject,
    JsonValue,
    LiteralValue,
    TypeSpec
} from "./types"

type NativeValue = JsonValue | object | undefined

const isObject = (value: JsonValue | object | undefined): value is Record<string, NativeValue> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const isAddressable = (value: NativeValue): value is {readonly address: Address} =>
    typeof value === "object" && value !== null && "address" in value && value.address instanceof Address

const hasConstructorName = (value: object, name: string): boolean => {
    let current: object | null = value
    while (current !== null) {
        const constructor = (current as {readonly constructor?: {readonly name?: string}}).constructor
        if (constructor?.name === name) {return true}
        current = Object.getPrototypeOf(current)
    }
    return false
}

const isAnyBoxAdapter = (adapter: BoxAdapter): adapter is BoxAdapter => true

const pointerName = (value: unknown): string | undefined => {
    if (typeof value !== "number") {return undefined}
    return Object.entries(Pointers).find(([key, candidate]) =>
        !/^\d+$/.test(key) && typeof candidate === "number" && candidate === value)?.[0]
}

const satisfiesPointerConstraint = (field: Field, constraint: string): boolean => {
    const accepted = field instanceof PointerField ? [field.pointerType] : field.pointerRules.accepts
    if (constraint === "EffectPointerType") {
        return accepted.includes(Pointers.AudioEffectHost) || accepted.includes(Pointers.MIDIEffectHost)
    }
    const match = /^Pointers\.(.+)$/.exec(constraint)
    if (match === null) {return true}
    const pointer = (Pointers as unknown as Record<string, unknown>)[match[1]]
    return typeof pointer === "number" && accepted.includes(pointer as never)
}

const isOption = (value: NativeValue): value is Option<NativeValue> =>
    typeof value === "object" && value !== null
    && "isEmpty" in value && typeof value.isEmpty === "function"
    && "unwrapOrUndefined" in value && typeof value.unwrapOrUndefined === "function"

const fail = (message: string): never => {throw new Error(`[ControlApi] ${message}`)}

const expectNumber = (value: JsonValue | undefined, context: string): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fail(`${context} must be a finite number`)

const expectString = (value: JsonValue | undefined, context: string): string =>
    typeof value === "string" ? value : fail(`${context} must be a string`)

const expectBoolean = (value: JsonValue | undefined, context: string): boolean =>
    typeof value === "boolean" ? value : fail(`${context} must be a boolean`)

const decodeParameterValue = (value: JsonValue | undefined): NativeValue => {
    if ((typeof value === "number" && Number.isFinite(value))
        || typeof value === "string" || typeof value === "boolean") {
        return value
    }
    if (Array.isArray(value)) {
        if (!value.every(element => typeof element === "number" && Number.isInteger(element)
            && element >= -128 && element <= 127)) {
            return fail("parameter byte array must contain signed 8-bit integers")
        }
        return new Int8Array(value)
    }
    return fail("parameter value must be a finite number, string, boolean, or signed 8-bit integer array")
}

const decodeUuid = (value: JsonValue | undefined): NativeValue => {
    const text = expectString(value, "uuid")
    return UUID.validateString(text) ? UUID.parse(text) : fail(`Invalid UUID '${text}'`)
}

const decodeFactory = (value: JsonValue | undefined, type: "instrument" | "effect"): object => {
    const key = expectString(value, `${type} factory`)
    const factories = type === "instrument"
        ? InstrumentFactories.Named as Record<string, object>
        : EffectFactories.MergedNamed as Record<string, object>
    return factories[key] ?? fail(`Unknown ${type} factory '${key}'`)
}

const decodeHandle = (spec: Extract<TypeSpec, {readonly kind: "handle"}>, value: JsonValue | undefined,
                     project: Project): NativeValue => {
    if (!isJsonObject(value)) {return fail(`${spec.name} handle must be an object`)}
    const addressText = value.$address
    const typeText = value.$type
    if (typeof addressText !== "string" || typeof typeText !== "string") {
        return fail(`${spec.name} handle must contain string $type and $address`)
    }
    const address = Address.decode(addressText)
    if (spec.handle === "address") {return address}

    if (spec.handle === "parameter") {
        const field = project.boxGraph.findVertex(address).unwrap(`No field at ${addressText}`)
        project.boxAdapters.adapterFor(field.box, isAnyBoxAdapter)
        const adapter = project.parameterFieldAdapters.opt(address).unwrap(`No parameter at ${addressText}`)
        if (spec.name !== "AutomatableParameterFieldAdapter" && typeText !== spec.name) {
            return fail(`Expected ${spec.name}, received ${typeText}`)
        }
        return adapter
    }

    if (spec.handle === "box" || spec.handle === "adapter") {
        if (!address.isBox()) {return fail(`${spec.name} handle must address a box`)}
        const box = project.boxGraph.findBox(address.uuid).unwrap(`No box at ${addressText}`)
        if (spec.handle === "box") {
            if (spec.name !== "Box" && box.name !== spec.name) {
                return fail(`Expected box ${spec.name}, received ${box.name}`)
            }
            return box
        }
        const adapter = project.boxAdapters.adapterFor(box, isAnyBoxAdapter)
        if (spec.name !== "BoxAdapter" && !hasConstructorName(adapter, spec.name)) {
            return fail(`Expected adapter ${spec.name}, received ${adapter.constructor.name}`)
        }
        return adapter
    }

    const vertex = project.boxGraph.findVertex(address).unwrap(`No vertex at ${addressText}`)
    if (spec.handle === "pointerField" && !(vertex instanceof PointerField)) {
        return fail(`Expected PointerField at ${addressText}`)
    }
    if (spec.handle === "primitiveField" && !(vertex instanceof PrimitiveField)) {
        return fail(`Expected PrimitiveField at ${addressText}`)
    }
    if (spec.handle === "field" && !(vertex instanceof Field)) {
        return fail(`Expected Field at ${addressText}`)
    }
    if (spec.handle === "pointerField" && typeText !== "PointerField") {
        return fail(`Expected PointerField handle type, received ${typeText}`)
    }
    if (spec.handle === "primitiveField" && typeText !== "PrimitiveField") {
        return fail(`Expected PrimitiveField handle type, received ${typeText}`)
    }
    if (spec.handle === "field" && typeText !== "Field" && typeText !== "PointerField"
        && typeText !== "PrimitiveField") {
        return fail(`Expected Field handle type, received ${typeText}`)
    }
    if (spec.constraint !== undefined && vertex instanceof Field
        && !satisfiesPointerConstraint(vertex, spec.constraint)) {
        const actual = (vertex instanceof PointerField ? [vertex.pointerType] : vertex.pointerRules.accepts)
            .map(pointerName).filter(value => value !== undefined).join(", ")
        return fail(`Field at ${addressText} does not satisfy ${spec.constraint} (accepts ${actual})`)
    }
    return vertex
}

const decodeObject = (spec: Extract<TypeSpec, {readonly kind: "object"}>, value: JsonValue | undefined,
                      project: Project): NativeValue => {
    if (!isJsonObject(value)) {return fail(`${spec.name ?? "object"} must be an object`)}
    const result: Record<string, NativeValue> = {}
    for (const property of spec.properties) {
        const present = Object.prototype.hasOwnProperty.call(value, property.name)
        if (!present && !property.optional) {return fail(`Missing ${spec.name ?? "object"}.${property.name}`)}
        if (present) {result[property.name] = decodeType(property.type, value[property.name], project)}
    }
    return result
}

export const decodeType = (spec: TypeSpec, value: JsonValue | undefined, project: Project): NativeValue => {
    switch (spec.kind) {
        case "void":
            return fail("void is not a valid input type")
        case "primitive":
            return spec.type === "number"
                ? expectNumber(value, spec.type)
                : spec.type === "string" ? expectString(value, spec.type) : expectBoolean(value, spec.type)
        case "literal":
            return spec.values.includes(value as LiteralValue) ? value : fail("value is not an allowed literal")
        case "array":
            if (!Array.isArray(value)) {return fail("value must be an array")}
            return value.map(element => decodeType(spec.element, element, project))
        case "tuple":
            if (!Array.isArray(value) || value.length !== spec.elements.length) {
                return fail(`value must be a tuple of length ${spec.elements.length}`)
            }
            return spec.elements.map((element, index) => decodeType(element, value[index], project))
        case "object":
            return decodeObject(spec, value, project)
        case "option":
            return value === null ? Option.None : Option.wrap(decodeType(spec.value, value, project))
        case "nullable":
            return value === null ? null : decodeType(spec.value, value, project)
        case "union": {
            let lastError: Error | undefined
            for (const alternative of spec.alternatives) {
                try {return decodeType(alternative, value, project)} catch (error) {lastError = error as Error}
            }
            return fail(lastError?.message ?? "value does not match any union alternative")
        }
        case "handle":
            return decodeHandle(spec, value, project)
        case "factory":
            return decodeFactory(value, spec.factory)
        case "uuid":
            return decodeUuid(value)
        case "parameterValue":
            return decodeParameterValue(value)
        case "instrumentOptions":
            if (!isJsonObject(value)) {return fail("instrument options must be an object")}
            if (Object.prototype.hasOwnProperty.call(value, "attachment")) {
                return fail("instrument option attachment is not supported in this slice")
            }
            return decodeObject({
                    kind: "object",
                name: "InstrumentOptions",
                properties: [
                    {name: "name", optional: true, type: {kind: "primitive", type: "string"}},
                    {name: "icon", optional: true, type: {kind: "primitive", type: "number"}},
                    {name: "index", optional: true, type: {kind: "primitive", type: "number"}}
                ]
            }, value, project)
    }
}

const encodeHandle = (spec: Extract<TypeSpec, {readonly kind: "handle"}>, value: NativeValue): JsonValue => {
    if (!isAddressable(value) && !(spec.handle === "address" && value instanceof Address)) {
        return fail(`${spec.name} result is not addressable`)
    }
    if (spec.handle === "box" && spec.name !== "Box"
        && (value as {readonly name?: unknown}).name !== spec.name) {
        return fail(`Expected box ${spec.name}, received ${(value as {readonly name?: unknown}).name ?? "unknown"}`)
    }
    if (spec.handle === "adapter" && spec.name !== "BoxAdapter"
        && !hasConstructorName(value as object, spec.name)) {
        return fail(`Expected adapter ${spec.name}, received ${(value as object).constructor.name}`)
    }
    if (spec.handle === "pointerField" && !(value instanceof PointerField)) {
        return fail(`Expected PointerField result`)
    }
    if (spec.handle === "primitiveField" && !(value instanceof PrimitiveField)) {
        return fail(`Expected PrimitiveField result`)
    }
    if (spec.handle === "field" && !(value instanceof Field)) {
        return fail(`Expected Field result`)
    }
    const address = value instanceof Address ? value : value.address
    return {$type: spec.name, $address: address.toString()}
}

const encodeParameterValue = (value: NativeValue): JsonValue => {
    if (typeof value === "number" && Number.isFinite(value)) {return value}
    if (typeof value === "string" || typeof value === "boolean") {return value}
    if (value instanceof Int8Array) {return Array.from(value)}
    return fail("parameter result must be a finite number, string, boolean, or signed 8-bit integer array")
}

const encodeUuid = (value: NativeValue): JsonValue =>
    value instanceof Uint8Array && value.length === UUID.length
        ? UUID.toString(value)
        : fail("uuid result must be a 16-byte UUID")

const encodeObject = (spec: Extract<TypeSpec, {readonly kind: "object"}>, value: NativeValue): JsonObject => {
    if (!isObject(value)) {return fail(`${spec.name ?? "object"} result is not an object`)}
    const result: Record<string, JsonValue> = {}
    for (const property of spec.properties) {
        const propertyValue = value[property.name]
        if (propertyValue === undefined) {
            if (!property.optional) {return fail(`Missing result property ${property.name}`)}
        } else {
            result[property.name] = encodeType(property.type, propertyValue)
        }
    }
    return result
}

export const encodeType = (spec: TypeSpec, value: NativeValue): JsonValue => {
    switch (spec.kind) {
        case "void":
            return null
        case "primitive":
            if (spec.type === "number" && typeof value === "number" && Number.isFinite(value)) {return value}
            if (spec.type === "string" && typeof value === "string") {return value}
            if (spec.type === "boolean" && typeof value === "boolean") {return value}
            return fail(`${spec.type} result has the wrong runtime type`)
        case "literal":
            return spec.values.includes(value as LiteralValue) ? value as LiteralValue
                : fail("result is not an allowed literal")
        case "array":
            if (!Array.isArray(value)) {return fail("array result has the wrong runtime type")}
            return value.map(element => encodeType(spec.element, element))
        case "tuple":
            if (!Array.isArray(value) || value.length !== spec.elements.length) {return fail("tuple result has the wrong shape")}
            return spec.elements.map((element, index) => encodeType(element, value[index]))
        case "object":
            return encodeObject(spec, value)
        case "option":
            if (!isOption(value)) {return fail("option result has the wrong runtime type")}
            return value.isEmpty() ? null : encodeType(spec.value, value.unwrapOrUndefined())
        case "nullable":
            return value === null || value === undefined ? null : encodeType(spec.value, value)
        case "union": {
            let lastError: Error | undefined
            for (const alternative of spec.alternatives) {
                try {return encodeType(alternative, value)} catch (error) {lastError = error as Error}
            }
            return fail(lastError?.message ?? "result does not match any union alternative")
        }
        case "handle":
            return encodeHandle(spec, value)
        case "uuid":
            return encodeUuid(value)
        case "parameterValue":
            return encodeParameterValue(value)
        case "factory":
        case "instrumentOptions":
            return fail(`${spec.kind} cannot be used as a result type`)
    }
}
