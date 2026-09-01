import {Option, UUID} from "@opendaw/lib-std"
import {EffectFactories} from "../EffectFactories"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import {ControlResolver} from "./ControlResolver"
import {
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

const isHandleUnion = (spec: Extract<TypeSpec, {readonly kind: "union"}>): boolean =>
    spec.alternatives.length > 0 && spec.alternatives.every(alternative => alternative.kind === "handle")

const hasHandleShape = (value: JsonValue | undefined): boolean =>
    isJsonObject(value) && typeof value.$address === "string"

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

const decodeObject = (spec: Extract<TypeSpec, {readonly kind: "object"}>, value: JsonValue | undefined,
                      resolver: ControlResolver): NativeValue => {
    if (!isJsonObject(value)) {return fail(`${spec.name ?? "object"} must be an object`)}
    const known = new Set(spec.properties.map(property => property.name))
    for (const name of Object.keys(value)) {
        if (!known.has(name)) {return fail(`Unknown property '${name}' for ${spec.name ?? "object"}`)}
    }
    const result: Record<string, NativeValue> = {}
    for (const property of spec.properties) {
        const present = Object.prototype.hasOwnProperty.call(value, property.name)
        if (!present && !property.optional) {return fail(`Missing ${spec.name ?? "object"}.${property.name}`)}
        if (present) {result[property.name] = decodeType(property.type, value[property.name], resolver)}
    }
    return result
}

export const decodeType = (spec: TypeSpec, value: JsonValue | undefined,
                           resolver: ControlResolver): NativeValue => {
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
            return value.map(element => decodeType(spec.element, element, resolver))
        case "tuple":
            if (!Array.isArray(value) || value.length !== spec.elements.length) {
                return fail(`value must be a tuple of length ${spec.elements.length}`)
            }
            return spec.elements.map((element, index) => decodeType(element, value[index], resolver))
        case "object":
            return decodeObject(spec, value, resolver)
        case "option":
            return value === null ? Option.None : Option.wrap(decodeType(spec.value, value, resolver))
        case "nullable":
            return value === null ? null : decodeType(spec.value, value, resolver)
        case "union": {
            if (isHandleUnion(spec) && !hasHandleShape(value)) {
                return fail("Handle must be an object containing string $address; pass the complete returned handle object, not the address string alone.")
            }
            let lastError: Error | undefined
            for (const alternative of spec.alternatives) {
                try {return decodeType(alternative, value, resolver)} catch (error) {lastError = error as Error}
            }
            return fail(lastError?.message ?? "value does not match any union alternative")
        }
        case "handle":
            return resolver.resolve(spec, value)
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
            }, value, resolver)
    }
}

const isOption = (value: NativeValue): value is Option<NativeValue> =>
    typeof value === "object" && value !== null
    && "isEmpty" in value && typeof value.isEmpty === "function"
    && "unwrapOrUndefined" in value && typeof value.unwrapOrUndefined === "function"

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

const encodeObject = (spec: Extract<TypeSpec, {readonly kind: "object"}>, value: NativeValue,
                      resolver: ControlResolver): JsonObject => {
    if (!isObject(value)) {return fail(`${spec.name ?? "object"} result is not an object`)}
    const result: Record<string, JsonValue> = {}
    for (const property of spec.properties) {
        const propertyValue = value[property.name]
        if (propertyValue === undefined) {
            if (!property.optional) {return fail(`Missing result property ${property.name}`)}
        } else {
            result[property.name] = encodeType(property.type, propertyValue, resolver)
        }
    }
    return result
}

export const encodeType = (spec: TypeSpec, value: NativeValue, resolver: ControlResolver): JsonValue => {
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
            return value.map(element => encodeType(spec.element, element, resolver))
        case "tuple":
            if (!Array.isArray(value) || value.length !== spec.elements.length) {return fail("tuple result has the wrong shape")}
            return spec.elements.map((element, index) => encodeType(element, value[index], resolver))
        case "object":
            return encodeObject(spec, value, resolver)
        case "option":
            if (!isOption(value)) {return fail("option result has the wrong runtime type")}
            return value.isEmpty() ? null : encodeType(spec.value, value.unwrapOrUndefined(), resolver)
        case "nullable":
            return value === null || value === undefined ? null : encodeType(spec.value, value, resolver)
        case "union": {
            let lastError: Error | undefined
            for (const alternative of spec.alternatives) {
                try {return encodeType(alternative, value, resolver)} catch (error) {lastError = error as Error}
            }
            return fail(lastError?.message ?? "result does not match any union alternative")
        }
        case "handle":
            return resolver.assertResult(spec, value)
        case "uuid":
            return encodeUuid(value)
        case "parameterValue":
            return encodeParameterValue(value)
        case "factory":
        case "instrumentOptions":
            return fail(`${spec.kind} cannot be used as a result type`)
    }
}
