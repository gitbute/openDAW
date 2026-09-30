import type {AgentTool, AgentToolbox} from "./AgentTool"
import {CodexJson} from "./CodexJson"
import type {
    CodexDynamicFunctionTool,
    CodexDynamicNamespace,
    CodexDynamicTool
} from "./types"

const schemaTypes = new Set(["object", "array", "string", "number", "integer", "boolean", "null"])
const schemaKeys = new Set([
    "type", "enum", "properties", "required", "additionalProperties", "items", "prefixItems",
    "anyOf", "description", "format", "minimum", "maximum", "minItems", "maxItems"
])

const {hasOwn, isObjectRecord} = CodexJson

const isJsonScalar = (value: unknown): boolean => value === null
    || typeof value === "boolean" || typeof value === "number" || typeof value === "string"

const fail = (path: string, message: string): never => {
    throw new Error(`Codex tool schema ${path}: ${message}`)
}

const validateSchema = (value: unknown, path: string): void => {
    if (!isObjectRecord(value)) {throw new Error(`Codex tool schema ${path}: must be an object`)}
    const schema = value
    Object.keys(schema).forEach(key => {
        if (!schemaKeys.has(key)) {fail(path, `unsupported keyword '${key}'`)}
    })
    if (hasOwn(schema, "type") && (typeof schema.type !== "string" || !schemaTypes.has(schema.type))) {
        fail(path, "has an unsupported type")
    }
    if (hasOwn(schema, "prefixItems")) {
        fail(path, "tuple schemas using prefixItems are not supported by App Server")
    }
    if (schema.items === false) {
        fail(path, "tuple schemas using items=false are not supported by App Server")
    }
    const properties = schema.properties
    if (hasOwn(schema, "properties")) {
        if (!isObjectRecord(properties)) {throw new Error(`Codex tool schema ${path}: properties must be an object`)}
        Object.entries(properties).forEach(([name, property]) => validateSchema(property, `${path}.properties.${name}`))
        if (schema.additionalProperties !== false) {
            fail(path, "object schemas must set additionalProperties=false")
        }
    }
    if (schema.type === "object" && schema.additionalProperties !== false) {
        fail(path, "object schemas must set additionalProperties=false")
    }
    if (hasOwn(schema, "items")) {validateSchema(schema.items, `${path}.items`)}
    const anyOf = schema.anyOf
    if (hasOwn(schema, "anyOf")) {
        if (!Array.isArray(anyOf)) {throw new Error(`Codex tool schema ${path}: anyOf must be an array`)}
        anyOf.forEach((alternative: unknown, index: number) =>
            validateSchema(alternative, `${path}.anyOf[${index}]`))
    }
    if (hasOwn(schema, "required")
        && (!Array.isArray(schema.required) || schema.required.some((name: unknown) => typeof name !== "string"))) {
        fail(path, "required must be an array of strings")
    }
    if (hasOwn(schema, "enum")
        && (!Array.isArray(schema.enum) || schema.enum.some((item: unknown) => !isJsonScalar(item)))) {

        fail(path, "enum must contain only JSON scalar values")
    }
}

const validateName = (name: string, context: string): void => {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new Error(`${context} '${name}' is not a valid App Server tool identifier`)
    }
}

const validateTool = (tool: AgentTool, path: string): void => {
    validateName(tool.name, `${path} name`)
    if (tool.description.trim().length === 0) {throw new Error(`${path} has an empty description`)}
    validateSchema(tool.inputSchema, `${path}.inputSchema`)
}

export const validateCodexToolboxes = (toolboxes: ReadonlyArray<AgentToolbox>): void => {
    const namespaces = new Set<string>()
    toolboxes.forEach((namespace: AgentToolbox, namespaceIndex) => {
        validateName(namespace.namespace, `namespace ${namespaceIndex}`)
        if (namespaces.has(namespace.namespace)) {
            throw new Error(`Duplicate Codex dynamic namespace '${namespace.namespace}'`)
        }
        namespaces.add(namespace.namespace)
        const tools = new Set<string>()
        namespace.tools.forEach((tool, toolIndex) => {
            validateTool(tool, `namespace ${namespace.namespace} tool ${toolIndex}`)
            if (tools.has(tool.name)) {
                throw new Error(`Duplicate Codex dynamic tool '${namespace.namespace}.${tool.name}'`)
            }
            tools.add(tool.name)
        })
    })
}

const projectTool = (tool: AgentTool): CodexDynamicFunctionTool => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    deferLoading: false
})

const projectNamespace = (namespace: AgentToolbox): CodexDynamicNamespace => ({
    type: "namespace",
    name: namespace.namespace,
    description: namespace.description,
    tools: namespace.tools.map(projectTool)
})

export const projectDynamicTools = (toolboxes: ReadonlyArray<AgentToolbox>): ReadonlyArray<CodexDynamicTool> => {
    validateCodexToolboxes(toolboxes)
    return toolboxes.map(projectNamespace)
}

export class CodexDynamicTools {
    readonly tools: ReadonlyArray<CodexDynamicTool>

    constructor(toolboxes: ReadonlyArray<AgentToolbox>) {
        this.tools = Object.freeze(projectDynamicTools(toolboxes).map(namespace => Object.freeze({
            ...namespace,
            tools: Object.freeze(namespace.tools.slice())
        })))
    }
}
