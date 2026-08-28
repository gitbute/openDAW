import {InstrumentFactories, SupportedInstrumentBoxNames} from "@opendaw/studio-adapters"
import {EffectFactories} from "../EffectFactories"
import type {OperationDescriptor, ParameterSpec, PropertySpec, TypeSpec} from "../control-api/types"
import type {JsonSchema} from "./types"

const typeOfLiteral = (value: null | boolean | number | string): JsonSchema["type"] => {
    if (value === null) {return "null"}
    if (typeof value === "number") {return "number"}
    if (typeof value === "boolean") {return "boolean"}
    return "string"
}

const literalSchema = (values: ReadonlyArray<null | boolean | number | string>): JsonSchema => {
    const types = new Set(values.map(typeOfLiteral))
    const type = types.size === 1 ? [...types][0] : undefined
    return {
        ...(type === undefined ? {} : {type}),
        enum: [...values]
    }
}

const strictObject = (properties: Readonly<Record<string, JsonSchema>>,
                      required: ReadonlyArray<string>): JsonSchema => ({
    type: "object",
    properties,
    required,
    additionalProperties: false
})

type HandleSpec = Extract<TypeSpec, {readonly kind: "handle"}>

const indefiniteArticle = (name: string): "a" | "an" => /^[aeiou]/i.test(name) ? "an" : "a"

const listValues = (values: ReadonlyArray<string>): string => {
    if (values.length <= 1) {return values[0] ?? ""}
    if (values.length === 2) {return `${values[0]} or ${values[1]}`}
    return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`
}

const handleDescription = (spec: HandleSpec): string => {
    const constraints = spec.constraintMembers?.length === undefined || spec.constraintMembers.length === 0
        ? spec.constraint === undefined ? [] : [spec.constraint]
        : spec.constraintMembers
    if (spec.handle === "field" || spec.handle === "pointerField" || spec.handle === "primitiveField") {
        return constraints.length === 0
            ? `${spec.name} handle.`
            : `${spec.name} handle accepting ${listValues(constraints)}.`
    }
    return `Handle to ${indefiniteArticle(spec.name)} ${spec.name}.`
}

const handleSchema = (spec?: HandleSpec): JsonSchema => ({
    ...strictObject({
        $address: {type: "string"}
    }, ["$address"]),
    ...(spec === undefined ? {} : {description: handleDescription(spec)})
})

const instrumentOptionsSchema = (): JsonSchema => strictObject({
    name: {type: "string"},
    icon: {type: "number"},
    index: {type: "number"}
}, [])

const parameterValueSchema = (): JsonSchema => ({
    anyOf: [
        {type: "number"},
        {type: "string"},
        {type: "boolean"},
        {
            type: "array",
            items: {type: "integer", minimum: -128, maximum: 127}
        }
    ]
})

const objectProperty = (properties: ReadonlyArray<PropertySpec>, name: string): PropertySpec => {
    const property = properties.find(candidate => candidate.name === name)
    if (property === undefined) {
        throw new Error(`Binding property '${name}' is missing from its object TypeSpec`)
    }
    return property
}

export const typeSpecToJsonSchema = (spec: TypeSpec): JsonSchema => {
    switch (spec.kind) {
        case "void":
            throw new Error("void is not a valid tool input type")
        case "primitive":
            return {
                type: spec.type,
                ...(spec.semantic === undefined ? {} : {description: `Semantic type: ${spec.semantic}`})
            }
        case "literal":
            return literalSchema(spec.values)
        case "array":
            return {type: "array", items: typeSpecToJsonSchema(spec.element)}
        case "tuple":
            return {
                type: "array",
                prefixItems: spec.elements.map(typeSpecToJsonSchema),
                items: false,
                minItems: spec.elements.length,
                maxItems: spec.elements.length
            }
        case "object": {
            const properties = Object.fromEntries(spec.properties.map(property => [
                property.name, typeSpecToJsonSchema(property.type)
            ]))
            const required = spec.properties.filter(property => !property.optional).map(property => property.name)
            return strictObject(properties, required)
        }
        case "option":
        case "nullable":
            return {anyOf: [{type: "null"}, typeSpecToJsonSchema(spec.value)]}
        case "union":
            return spec.alternatives.length === 1
                ? typeSpecToJsonSchema(spec.alternatives[0])
                : {anyOf: spec.alternatives.map(typeSpecToJsonSchema)}
        case "handle":
            return handleSchema(spec)
        case "factory":
            return {
                type: "string",
                enum: Object.keys(spec.factory === "instrument"
                    ? InstrumentFactories.Named
                    : EffectFactories.MergedNamed)
            }
        case "uuid":
            return {type: "string", format: "uuid"}
        case "parameterValue":
            return parameterValueSchema()
        case "instrumentOptions":
            return instrumentOptionsSchema()
    }
}

const addProperty = (properties: Record<string, JsonSchema>, required: Array<string>,
                     name: string, type: TypeSpec, isRequired: boolean): void => {
    if (Object.hasOwn(properties, name)) {
        throw new Error(`Duplicate tool input property '${name}'`)
    }
    properties[name] = typeSpecToJsonSchema(type)
    if (isRequired) {required.push(name)}
}

const addParameter = (parameter: ParameterSpec, properties: Record<string, JsonSchema>,
                      required: Array<string>): void => {
    if (parameter.binding.kind === "identifier") {
        addProperty(properties, required, parameter.binding.name, parameter.type, !parameter.optional)
        return
    }
    const objectType = parameter.type
    if (objectType.kind !== "object") {
        throw new Error("Object bindings require an object TypeSpec")
    }
    parameter.binding.properties.forEach(property => {
        const typeProperty = objectProperty(objectType.properties, property.name)
        addProperty(properties, required, property.name, typeProperty.type,
            !parameter.optional && !typeProperty.optional)
    })
}

export const operationInputSchema = (operation: OperationDescriptor): JsonSchema => {
    const properties: Record<string, JsonSchema> = {}
    const required: Array<string> = []
    operation.parameters.forEach(parameter => addParameter(parameter, properties, required))
    if (operation.target === "address") {
        addProperty(properties, required, "target",
            {kind: "handle", handle: "parameter", name: "AutomatableParameterFieldAdapter"}, true)
    }
    return strictObject(properties, required)
}

export const resourceQueryInputSchema: JsonSchema = strictObject({
    kind: literalSchema(["box", "field", "adapter", "parameter"]),
    text: {type: "string"},
    type: {type: "string"},
    owner: handleSchema(),
    limit: {type: "integer", minimum: 0},
    offset: {type: "integer", minimum: 0}
}, [])

export const sampleQueryInputSchema: JsonSchema = strictObject({
    text: {type: "string"},
    origin: literalSchema(["openDAW", "recording", "import"]),
    minBpm: {type: "number"},
    maxBpm: {type: "number"},
    minDuration: {type: "number"},
    maxDuration: {type: "number"},
    limit: {type: "integer", minimum: 0, maximum: 50},
    offset: {type: "integer", minimum: 0}
}, [])

export const resourceInspectInputSchema: JsonSchema = strictObject({
    handle: handleSchema()
}, ["handle"])

export const instrumentInspectInputSchema: JsonSchema = strictObject({
    instrument: {
        anyOf: SupportedInstrumentBoxNames.map(name => handleSchema({
            kind: "handle", handle: "box", name
        }))
    }
}, ["instrument"])
