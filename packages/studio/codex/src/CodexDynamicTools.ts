import type {ToolCatalogSpec, ToolNamespaceSpec, ToolSpec} from "@opendaw/studio-core"
import type {
    CodexDynamicFunctionTool,
    CodexDynamicNamespace,
    CodexDynamicTool,
    JsonValue
} from "./types"

const schemaTypes = new Set(["object", "array", "string", "number", "integer", "boolean", "null"])
const schemaKeys = new Set([
    "type", "enum", "properties", "required", "additionalProperties", "items", "prefixItems",
    "anyOf", "description", "format", "minimum", "maximum", "minItems", "maxItems"
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const fail = (path: string, message: string): never => {
    throw new Error(`Codex tool schema ${path}: ${message}`)
}

const validateSchema = (value: unknown, path: string): void => {
    if (!isRecord(value)) {throw new Error(`Codex tool schema ${path}: must be an object`)}
    const schema = value
    Object.keys(schema).forEach(key => {
        if (!schemaKeys.has(key)) {fail(path, `unsupported keyword '${key}'`)}
    })
    if (schema.type !== undefined
        && (typeof schema.type !== "string" || !schemaTypes.has(schema.type))) {
        fail(path, "has an unsupported type")
    }
    if (schema.prefixItems !== undefined) {
        fail(path, "tuple schemas using prefixItems are not supported by App Server")
    }
    if (schema.items === false) {
        fail(path, "tuple schemas using items=false are not supported by App Server")
    }
    const properties = schema.properties
    if (properties !== undefined) {
        if (!isRecord(properties)) {throw new Error(`Codex tool schema ${path}: properties must be an object`)}
        Object.entries(properties).forEach(([name, property]) => validateSchema(property, `${path}.properties.${name}`))
        if (schema.additionalProperties !== false) {
            fail(path, "object schemas must set additionalProperties=false")
        }
    }
    if (schema.type === "object" && schema.additionalProperties !== false) {
        fail(path, "object schemas must set additionalProperties=false")
    }
    if (schema.items !== undefined) {validateSchema(schema.items, `${path}.items`)}
    const anyOf = schema.anyOf
    if (anyOf !== undefined) {
        if (!Array.isArray(anyOf)) {throw new Error(`Codex tool schema ${path}: anyOf must be an array`)}
        anyOf.forEach((alternative: unknown, index: number) =>
            validateSchema(alternative, `${path}.anyOf[${index}]`))
    }
    if (schema.required !== undefined
        && (!Array.isArray(schema.required) || schema.required.some((name: unknown) => typeof name !== "string"))) {
        fail(path, "required must be an array of strings")
    }
    if (schema.enum !== undefined
        && (!Array.isArray(schema.enum) || schema.enum.some((item: unknown) => item !== null
            && typeof item !== "boolean" && typeof item !== "number" && typeof item !== "string"))) {
        fail(path, "enum must contain only JSON scalar values")
    }
}

const validateName = (name: string, context: string): void => {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new Error(`${context} '${name}' is not a valid App Server tool identifier`)
    }
}

const validateTool = (tool: ToolSpec, path: string): void => {
    validateName(tool.name, `${path} name`)
    if (tool.description.trim().length === 0) {throw new Error(`${path} has an empty description`)}
    validateSchema(tool.inputSchema, `${path}.inputSchema`)
}

export const validateCodexToolCatalog = (catalog: ToolCatalogSpec): void => {
    const namespaces = new Set<string>()
    catalog.namespaces.forEach((namespace: ToolNamespaceSpec, namespaceIndex) => {
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

const projectTool = (tool: ToolSpec): CodexDynamicFunctionTool => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as unknown as JsonValue,
    deferLoading: tool.exposure === "deferred"
})

const projectNamespace = (namespace: ToolNamespaceSpec): CodexDynamicNamespace => ({
    type: "namespace",
    name: namespace.namespace,
    description: namespace.description,
    tools: namespace.tools.map(projectTool)
})

export const projectDynamicTools = (catalog: ToolCatalogSpec): ReadonlyArray<CodexDynamicTool> => {
    validateCodexToolCatalog(catalog)
    return catalog.namespaces.map(projectNamespace)
}

export class CodexDynamicTools {
    readonly tools: ReadonlyArray<CodexDynamicTool>

    constructor(catalog: ToolCatalogSpec) {
        this.tools = Object.freeze(projectDynamicTools(catalog).map(namespace => Object.freeze({
            ...namespace,
            tools: Object.freeze(namespace.tools.slice())
        })))
    }
}
