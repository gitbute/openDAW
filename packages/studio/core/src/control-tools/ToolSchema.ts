import {InstrumentFactories, SupportedDeviceBoxNames} from "@opendaw/studio-adapters"
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

const completeHandleGuidance =
    ` Pass the complete handle object returned by a tool, e.g. {"$address":"..."}; do not pass the $address string alone.`

const handleDescription = (spec?: HandleSpec): string => {
    if (spec === undefined) {return `Control handle.${completeHandleGuidance}`}
    const constraints = spec.constraintMembers?.length === undefined || spec.constraintMembers.length === 0
        ? spec.constraint === undefined ? [] : [spec.constraint]
        : spec.constraintMembers
    const description = spec.handle === "field" || spec.handle === "pointerField" || spec.handle === "primitiveField"
        ? constraints.length === 0
            ? `${spec.name} handle.`
            : `${spec.name} handle accepting ${listValues(constraints)}.`
        : `Handle to ${indefiniteArticle(spec.name)} ${spec.name}.`
    return `${description}${completeHandleGuidance}`
}

const handleSchema = (spec?: HandleSpec): JsonSchema => ({
    ...strictObject({
        $address: {type: "string"}
    }, ["$address"]),
    description: handleDescription(spec)
})

const semanticDescription = (semantic: string): string => {
    switch (semantic) {
        case "ppqn":
            return "Semantic type: ppqn — openDAW musical pulses; 960 pulses equal one quarter note and pulse distances are independent of BPM."
        case "bpm":
            return "Semantic type: bpm — beats per minute; tempo changes elapsed time, not musical pulse distances."
        case "unitValue":
            return "Semantic type: unitValue — normalized unit value, normally in the range 0..1."
        case "seconds":
            return "Semantic type: seconds — elapsed time in seconds."
        case "samples":
            return "Semantic type: samples — audio sample frames."
        case "byte":
            return "Semantic type: byte — signed byte value in the range -128..127."
        default:
            return `Semantic type: ${semantic}`
    }
}

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
                ...(spec.semantic === undefined ? {} : {description: semanticDescription(spec.semantic)})
            }
        case "literal":
            return {
                ...literalSchema(spec.values),
                ...(spec.description === undefined ? {} : {description: spec.description})
            }
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
            return {
                ...strictObject(properties, required),
                ...(spec.description === undefined ? {} : {description: spec.description})
            }
        }
        case "option":
        case "nullable":
            return {anyOf: [{type: "null"}, typeSpecToJsonSchema(spec.value)]}
        case "union":
            if (spec.alternatives.length === 1) {return typeSpecToJsonSchema(spec.alternatives[0])}
            return {
                anyOf: spec.alternatives.map(typeSpecToJsonSchema),
                ...(spec.description === undefined ? {} : {description: spec.description})
            }
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

export const deviceCatalogQueryInputSchema: JsonSchema = strictObject({
    category: literalSchema(["instrument", "midi-effect", "audio-effect"]),
    text: {type: "string"},
    limit: {type: "integer", minimum: 0, maximum: 50},
    offset: {type: "integer", minimum: 0}
}, [])

export const deviceDefinitionInspectInputSchema: JsonSchema = strictObject({
    category: literalSchema(["instrument", "midi-effect", "audio-effect"]),
    factory: {type: "string"}
}, ["category", "factory"])

export const deviceInspectInputSchema: JsonSchema = strictObject({
    device: {
        anyOf: SupportedDeviceBoxNames.map(name => handleSchema({
            kind: "handle", handle: "box", name
        }))
    },
    group: {
        type: "string",
        description: "Optional exact semantic group prefix returned in the device's groups list."
    }
}, ["device"])

const deviceHelpFactoryInputSchema: JsonSchema = strictObject({
    category: literalSchema(["instrument", "midi-effect", "audio-effect"]),
    factory: {type: "string"}
}, ["category", "factory"])

const deviceHelpLiveInputSchema: JsonSchema = strictObject({
    device: {
        anyOf: SupportedDeviceBoxNames.map(name => handleSchema({
            kind: "handle", handle: "box", name
        }))
    }
}, ["device"])

export const deviceHelpInspectInputSchema: JsonSchema = {
    anyOf: [deviceHelpFactoryInputSchema, deviceHelpLiveInputSchema]
}

export const timingInspectInputSchema: JsonSchema = strictObject({
    positionPulses: {
        type: "number",
        description: "OpenDAW musical pulses at which to inspect the current signature and tempo; 960 pulses equal one quarter note and pulse distances are independent of BPM."
    }
}, [])

export const arrangementInspectInputSchema: JsonSchema = strictObject({
    target: handleSchema({kind: "handle", handle: "box", name: "AudioUnitBox"}),
    startPosition: {
        type: "number",
        description: semanticDescription("ppqn")
    },
    endPosition: {
        type: "number",
        description: semanticDescription("ppqn")
    },
    startMusical: {
        type: "object",
        properties: {
            bar: {type: "integer", minimum: 1},
            beat: {type: "integer", minimum: 1},
            sixteenth: {type: "integer", minimum: 1},
            ticks: {type: "integer", minimum: 0}
        },
        required: ["bar"],
        additionalProperties: false,
        description: "One-based global musical position. Prefer this over PPQN for normal production work."
    },
    endMusical: {
        type: "object",
        properties: {
            bar: {type: "integer", minimum: 1},
            beat: {type: "integer", minimum: 1},
            sixteenth: {type: "integer", minimum: 1},
            ticks: {type: "integer", minimum: 0}
        },
        required: ["bar"],
        additionalProperties: false,
        description: "Paired global musical end position; pulse positions remain available for exact cases."
    }
}, [])

const patternRegionHandleSchema: JsonSchema = {
    anyOf: ["NoteRegionBox", "ValueRegionBox"].map(name => handleSchema({
        kind: "handle", handle: "box", name
    }))
}

export const patternInspectInputSchema: JsonSchema = strictObject({
    regions: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: patternRegionHandleSchema,
        description: "Timeline NoteRegionBox or ValueRegionBox handles to inspect."
    },
    startMusical: {
        type: "object",
        properties: {
            bar: {type: "integer", minimum: 1},
            beat: {type: "integer", minimum: 1},
            sixteenth: {type: "integer", minimum: 1},
            ticks: {type: "integer", minimum: 0}
        },
        required: ["bar"],
        additionalProperties: false
    },
    endMusical: {
        type: "object",
        properties: {
            bar: {type: "integer", minimum: 1},
            beat: {type: "integer", minimum: 1},
            sixteenth: {type: "integer", minimum: 1},
            ticks: {type: "integer", minimum: 0}
        },
        required: ["bar"],
        additionalProperties: false
    }
}, ["regions"])

// Deliberately keep apply_edit step arguments as an empty schema: generated
// operation descriptors remain the canonical argument source, this avoids
// duplicating every generated schema, keeps the Codex tool compact, and exact
// validation still happens through ControlApi during execution.
const applyEditArgumentsSchema: JsonSchema = {}

const applyEditStepSchema: JsonSchema = strictObject({
    id: {type: "string"},
    namespace: literalSchema(["daw_project", "daw_modulation", "daw_parameter"]),
    tool: {type: "string"},
    arguments: applyEditArgumentsSchema
}, ["id", "namespace", "tool", "arguments"])

export const applyEditInputSchema: JsonSchema = strictObject({
    steps: {
        type: "array",
        minItems: 1,
        maxItems: 64,
        items: applyEditStepSchema
    }
}, ["steps"])

export const audioInspectInputSchema: JsonSchema = strictObject({
    target: handleSchema({kind: "handle", handle: "box", name: "AudioUnitBox"}),
    startPosition: {
        type: "number",
        description: semanticDescription("ppqn")
    },
    endPosition: {
        type: "number",
        description: semanticDescription("ppqn")
    },
    startMusical: {
        type: "object",
        properties: {
            bar: {type: "integer", minimum: 1},
            beat: {type: "integer", minimum: 1},
            sixteenth: {type: "integer", minimum: 1},
            ticks: {type: "integer", minimum: 0}
        },
        required: ["bar"],
        additionalProperties: false,
        description: "Prefer startMusical/endMusical for normal production work; pulse positions are available for exact low-level cases."
    },
    endMusical: {
        type: "object",
        properties: {
            bar: {type: "integer", minimum: 1},
            beat: {type: "integer", minimum: 1},
            sixteenth: {type: "integer", minimum: 1},
            ticks: {type: "integer", minimum: 0}
        },
        required: ["bar"],
        additionalProperties: false
    }
}, [])
