import {generatedControlManifest} from "../control-api/generated"
import type {GeneratedManifest, OperationDescriptor} from "../control-api/types"
import type {
    FunctionToolSpec,
    ToolBinding,
    ToolCatalogSpec,
    ToolNamespaceSpec,
    ToolSpec
} from "./types"
import {
    operationInputSchema,
    resourceInspectInputSchema,
    resourceQueryInputSchema
} from "./ToolSchema"

const namespacesForRoots = {
    project: "daw_project",
    modulation: "daw_modulation",
    transport: "daw_transport",
    parameter: "daw_parameter"
} as const

const namespaceDescriptions: Readonly<Record<string, string>> = {
    daw_project: "Create and edit the canonical openDAW project structure.",
    daw_modulation: "Create and connect canonical openDAW modulators.",
    daw_transport: "Control playback and transport state.",
    daw_parameter: "Read and edit discovered automatable parameters.",
    daw_resources: "Discover and inspect live project resources and handles."
}

const resourceTools: ReadonlyArray<{readonly name: "query_resources" | "inspect_resource", readonly schema: FunctionToolSpec["inputSchema"], readonly description: string}> = [
    {
        name: "query_resources",
        schema: resourceQueryInputSchema,
        description: "Search the live project for boxes, fields, adapters, or parameters."
    },
    {
        name: "inspect_resource",
        schema: resourceInspectInputSchema,
        description: "Inspect all generic live-project views available for one handle."
    }
]

const keyOf = (namespace: string, name: string): string => `${namespace}\u0000${name}`

export const toToolName = (method: string): string => method
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .toLowerCase()

const humanize = (method: string): string => method
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()

const descriptionOf = (operation: OperationDescriptor): string => {
    const description = operation.description?.trim()
    return description === undefined || description.length === 0
        ? `Run ${humanize(operation.method)}.`
        : description
}

export class ToolCatalog implements ToolCatalogSpec {
    readonly tools: ReadonlyArray<ToolSpec>
    readonly namespaces: ReadonlyArray<ToolNamespaceSpec>
    readonly #bindings: ReadonlyMap<string, ToolBinding>

    constructor(manifest: GeneratedManifest = generatedControlManifest) {
        const tools: Array<ToolSpec> = []
        const bindings = new Map<string, ToolBinding>()
        const add = (binding: ToolBinding): void => {
            const key = keyOf(binding.spec.namespace, binding.spec.name)
            if (bindings.has(key)) {
                throw new Error(`Duplicate tool '${binding.spec.namespace}.${binding.spec.name}'`)
            }
            bindings.set(key, binding)
            tools.push(binding.spec)
        }

        manifest.operations.forEach(operation => {
            const namespace = namespacesForRoots[operation.root]
            const name = toToolName(operation.method)
            const spec: ToolSpec = {
                namespace,
                name,
                description: descriptionOf(operation),
                inputSchema: operationInputSchema(operation),
                exposure: "deferred"
            }
            add({spec, operation})
        })

        resourceTools.forEach(resource => {
            const spec: ToolSpec = {
                namespace: "daw_resources",
                name: resource.name,
                description: resource.description,
                inputSchema: resource.schema,
                exposure: "eager"
            }
            add({spec, resource: resource.name})
        })

        this.tools = Object.freeze(tools.slice())
        this.#bindings = bindings
        this.namespaces = Object.freeze([
            "daw_project",
            "daw_modulation",
            "daw_transport",
            "daw_parameter",
            "daw_resources"
        ].map(namespace => Object.freeze({
            namespace,
            description: namespaceDescriptions[namespace],
            tools: Object.freeze(this.tools.filter(tool => tool.namespace === namespace))
        })))
    }

    get(namespace: string, name: string): ToolBinding | undefined {
        return this.#bindings.get(keyOf(namespace, name))
    }

    resolve(namespace: string, name: string): ToolBinding | undefined {
        return this.get(namespace, name)
    }
}
