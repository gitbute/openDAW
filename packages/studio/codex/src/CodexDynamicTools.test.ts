import {describe, expect, it} from "vitest"
import {tryCatch} from "@opendaw/lib-std"
import {AgentToolResult} from "./AgentTool"
import type {AgentTool, AgentToolbox} from "./AgentTool"
import {CodexDynamicTools, projectDynamicTools, validateCodexToolboxes} from "./CodexDynamicTools"
import type {JsonObject} from "./types"

const objectSchema = (properties: JsonObject = {}, extra: JsonObject = {}): JsonObject =>
    ({type: "object", properties, additionalProperties: false, ...extra})

const agentTool = (name: string, inputSchema: JsonObject = objectSchema(), description = `Tool ${name}.`): AgentTool =>
    ({name, description, inputSchema, execute: async () => AgentToolResult.text(name)})

const toolbox = (namespace: string, tools: ReadonlyArray<AgentTool>): AgentToolbox =>
    ({namespace, description: `Namespace ${namespace}.`, tools})

const schemaError = (inputSchema: JsonObject): string => {
    const result = tryCatch(() => validateCodexToolboxes([toolbox("test", [agentTool("probe", inputSchema)])]))
    return result.status === "success" ? "valid" : result.error instanceof Error ? result.error.message : String(result.error)
}

describe("CodexDynamicTools", () => {
    it("projects every toolbox into an eagerly loaded App Server namespace", () => {
        const inspectSchema = objectSchema({
            unit: {type: "string", description: "Unit label."},
            bars: objectSchema({from: {type: "integer", minimum: 1}, to: {type: "integer"}}, {required: ["from", "to"]}),
            format: {type: "string", enum: ["grid", "list"]},
            tags: {type: "array", items: {type: "string"}, minItems: 0, maxItems: 4},
            value: {anyOf: [{type: "number"}, {type: "null"}]}
        })
        const toolboxes = [
            toolbox("daw_inspect", [agentTool("inspect_project"), agentTool("inspect_notes", inspectSchema)]),
            toolbox("daw_edit", [agentTool("set_bpm")])
        ]
        const projected = projectDynamicTools(toolboxes)
        expect(projected).toEqual([
            {
                type: "namespace",
                name: "daw_inspect",
                description: "Namespace daw_inspect.",
                tools: [
                    {type: "function", name: "inspect_project", description: "Tool inspect_project.",
                        inputSchema: objectSchema(), deferLoading: false},
                    {type: "function", name: "inspect_notes", description: "Tool inspect_notes.",
                        inputSchema: inspectSchema, deferLoading: false}
                ]
            },
            {
                type: "namespace",
                name: "daw_edit",
                description: "Namespace daw_edit.",
                tools: [{type: "function", name: "set_bpm", description: "Tool set_bpm.",
                    inputSchema: objectSchema(), deferLoading: false}]
            }
        ])
        expect(projected[0].tools[1].inputSchema).toBe(inspectSchema)
        const frozen = new CodexDynamicTools(toolboxes).tools
        expect(frozen).toEqual(projected)
        expect(Object.isFrozen(frozen)).toBe(true)
        expect(Object.isFrozen(frozen[0].tools)).toBe(true)
        expect(new CodexDynamicTools([]).tools).toEqual([])
    })

    it("fails fast when a provider-incompatible tuple schema is introduced", () => {
        expect(() => projectDynamicTools([toolbox("test", [agentTool("tuple", {
            type: "array",
            prefixItems: [{type: "string"}],
            items: false
        })])])).toThrow(/tuple schemas/)
        expect(schemaError({type: "array", items: false})).toMatch(/items=false/)
    })

    it("requires additionalProperties=false on every object schema, including nested ones", () => {
        expect(schemaError({type: "object", properties: {}})).toMatch(/additionalProperties=false/)
        expect(schemaError({type: "object"})).toMatch(/additionalProperties=false/)
        expect(schemaError({type: "object", additionalProperties: true})).toMatch(/additionalProperties=false/)
        expect(schemaError(objectSchema({nested: {type: "object", properties: {}}})))
            .toMatch(/inputSchema\.properties\.nested: object schemas must set additionalProperties=false/)
        expect(schemaError(objectSchema({list: {type: "array", items: {type: "object"}}})))
            .toMatch(/properties\.list\.items/)
        expect(schemaError(objectSchema({choice: {anyOf: [{type: "object"}]}})))
            .toMatch(/anyOf\[0\]/)
        expect(schemaError(objectSchema())).toBe("valid")
    })

    it("rejects unsupported keywords, types and malformed keyword values", () => {
        expect(schemaError(objectSchema({}, {$schema: "draft"}))).toMatch(/unsupported keyword '\$schema'/)
        expect(schemaError(objectSchema({value: {type: "string", pattern: "^a"}}))).toMatch(/unsupported keyword 'pattern'/)
        expect(schemaError(objectSchema({value: {type: "string", default: "x"}}))).toMatch(/unsupported keyword 'default'/)
        expect(schemaError(objectSchema({value: {type: "date"}}))).toMatch(/unsupported type/)
        expect(schemaError(objectSchema({value: {type: null}}))).toMatch(/unsupported type/)
        expect(schemaError(objectSchema({}, {required: [1]}))).toMatch(/required must be an array of strings/)
        expect(schemaError(objectSchema({value: {enum: [{}]}}))).toMatch(/enum must contain only JSON scalar values/)
        expect(schemaError(objectSchema({value: {anyOf: {type: "string"}}}))).toMatch(/anyOf must be an array/)
        expect(schemaError({type: "object", properties: [], additionalProperties: false}))
            .toMatch(/properties must be an object/)
        expect(schemaError(objectSchema({value: {enum: ["a", 1, true, null]}}))).toBe("valid")
    })

    it("rejects invalid identifiers, empty descriptions and duplicates", () => {
        expect(() => validateCodexToolboxes([toolbox("daw project", [])])).toThrow(/not a valid App Server tool identifier/)
        expect(() => validateCodexToolboxes([toolbox("daw", [agentTool("set.bpm")])]))
            .toThrow(/not a valid App Server tool identifier/)
        expect(() => validateCodexToolboxes([toolbox("daw", [agentTool("set_bpm", objectSchema(), "  ")])]))
            .toThrow(/empty description/)
        expect(() => validateCodexToolboxes([toolbox("daw", []), toolbox("daw", [])]))
            .toThrow(/Duplicate Codex dynamic namespace 'daw'/)
        expect(() => validateCodexToolboxes([toolbox("daw", [agentTool("same"), agentTool("same")])]))
            .toThrow(/Duplicate Codex dynamic tool 'daw.same'/)
        expect(() => validateCodexToolboxes([toolbox("a", [agentTool("same")]), toolbox("b", [agentTool("same")])]))
            .not.toThrow()
    })
})
