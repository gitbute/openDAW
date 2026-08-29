import {describe, expect, it} from "vitest"
import {ToolCatalog} from "@opendaw/studio-core"
import type {ToolCatalogSpec} from "@opendaw/studio-core"
import {CodexDynamicTools, projectDynamicTools, validateCodexToolCatalog} from "./CodexDynamicTools"

describe("CodexDynamicTools", () => {
    it("projects the complete Slice-2 catalog without a second tool registry", () => {
        const catalog = new ToolCatalog()
        const projected = projectDynamicTools(catalog)

        expect(projected).toHaveLength(catalog.namespaces.length)
        expect(projected.map(namespace => namespace.name))
            .toEqual(catalog.namespaces.map(namespace => namespace.namespace))

        const projectedTools = projected.flatMap(namespace => namespace.tools.map(tool => ({
            namespace: namespace.name,
            tool
        })))
        expect(projectedTools).toHaveLength(catalog.tools.length)
        expect(projectedTools.map(({namespace, tool}) => `${namespace}.${tool.name}`))
            .toEqual(catalog.tools.map(tool => `${tool.namespace}.${tool.name}`))

        catalog.namespaces.forEach((sourceNamespace, namespaceIndex) => {
            const projectedNamespace = projected[namespaceIndex]
            expect(projectedNamespace.description).toBe(sourceNamespace.description)
            sourceNamespace.tools.forEach((sourceTool, toolIndex) => {
                const projectedTool = projectedNamespace.tools[toolIndex]
                expect(projectedTool.name).toBe(sourceTool.name)
                expect(projectedTool.description).toBe(sourceTool.description)
                expect(projectedTool.inputSchema).toBe(sourceTool.inputSchema)
                expect(projectedTool.deferLoading).toBe(sourceTool.exposure === "deferred")
            })
        })

        const resources = projected.find(namespace => namespace.name === "daw_resources")
        expect(resources?.tools.every(tool => tool.deferLoading === false)).toBe(true)
        const analysis = projected.find(namespace => namespace.name === "daw_analysis")
        expect(analysis?.tools.every(tool => tool.deferLoading === false)).toBe(true)
        expect(projected.filter(namespace => !["daw_resources", "daw_analysis"].includes(namespace.name))
            .flatMap(namespace => namespace.tools)
            .every(tool => tool.deferLoading === true)).toBe(true)
        expect(() => validateCodexToolCatalog(catalog)).not.toThrow()
        expect(new CodexDynamicTools(catalog).tools).toEqual(projected)
    })

    it("fails fast when a provider-incompatible tuple schema is introduced", () => {
        const tupleCatalog: ToolCatalogSpec = {
            namespaces: [{
                namespace: "test",
                description: "Test tools",
                tools: [{
                    namespace: "test",
                    name: "tuple",
                    description: "Accept a tuple.",
                    inputSchema: {
                        type: "array",
                        prefixItems: [{type: "string"}],
                        items: false
                    },
                    exposure: "eager"
                }]
            }],
            tools: []
        }

        expect(() => projectDynamicTools(tupleCatalog)).toThrow(/tuple schemas/)
    })
})
