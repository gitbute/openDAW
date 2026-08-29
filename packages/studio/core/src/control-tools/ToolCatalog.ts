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
    deviceCatalogQueryInputSchema,
    deviceDefinitionInspectInputSchema,
    deviceInspectInputSchema,
    deviceHelpInspectInputSchema,
    resourceInspectInputSchema,
    resourceQueryInputSchema,
    sampleQueryInputSchema,
    timingInspectInputSchema,
    audioInspectInputSchema,
    arrangementInspectInputSchema,
    applyEditInputSchema
} from "./ToolSchema"
import type {ManualToolName} from "./types"

const namespacesForRoots = {
    project: "daw_project",
    modulation: "daw_modulation",
    transport: "daw_transport",
    parameter: "daw_parameter"
} as const

const namespaceDescriptions: Readonly<Record<string, string>> = {
    daw_project: "Create and edit the canonical openDAW project structure, including ordered atomic edits.",
    daw_modulation: "Create and connect canonical openDAW modulators.",
    daw_transport: "Control playback and transport state.",
    daw_parameter: "Read and edit discovered automatable parameters.",
    daw_resources: "Discover live project resources, compact arrangement context, samples, available device definitions, device help, and project timing.",
    daw_analysis: "Inspect rendered audio and acoustic measurements."
}

const eagerTools: ReadonlyArray<{
    readonly namespace: "daw_project" | "daw_resources" | "daw_analysis"
    readonly name: ManualToolName
    readonly schema: FunctionToolSpec["inputSchema"]
    readonly description: string
}> = [
    {
        namespace: "daw_resources",
        name: "query_resources",
        schema: resourceQueryInputSchema,
        description: "Search the live project for boxes, fields, adapters, or parameters."
    },
    {
        namespace: "daw_resources",
        name: "inspect_resource",
        schema: resourceInspectInputSchema,
        description: "Inspect all generic live-project views available for one handle."
    },
    {
        namespace: "daw_resources",
        name: "query_samples",
        schema: sampleQueryInputSchema,
        description: "Search the canonical sample catalog without loading sample audio."
    },
    {
        namespace: "daw_resources",
        name: "query_device_catalog",
        schema: deviceCatalogQueryInputSchema,
        description: "Search the public canonical instrument, MIDI effect, and audio effect definitions before creating a device."
    },
    {
        namespace: "daw_resources",
        name: "inspect_device_definition",
        schema: deviceDefinitionInspectInputSchema,
        description: "Inspect canonical factory metadata and authoritative help for a public device definition without creating it."
    },
    {
        namespace: "daw_resources",
        name: "inspect_device",
        schema: deviceInspectInputSchema,
        description: "Inspect semantic properties and generic automatable parameters for a live public device."
    },
    {
        namespace: "daw_resources",
        name: "inspect_device_help",
        schema: deviceHelpInspectInputSchema,
        description: "Read the authoritative openDAW manual for a live device. Apparat help also includes its programming contract and bundled examples when available."
    },
    {
        namespace: "daw_resources",
        name: "inspect_timing",
        schema: timingInspectInputSchema,
        description: "Inspect canonical project tempo, signature context, musical pulse resolution, and note lengths."
    },
    {
        namespace: "daw_resources",
        name: "inspect_arrangement",
        schema: arrangementInspectInputSchema,
        description: "Return a compact multiscale map of the current arrangement, grouped by audio unit and timeline lane. Use it to regain global song context or inspect a broad section; use query_resources/inspect_resource for exact notes, automation events, devices, or parameters."
    },
    {
        namespace: "daw_project",
        name: "apply_edit",
        schema: applyEditInputSchema,
        description: "Apply several dependent synchronous generated project, parameter, or modulation operations as one ordered atomic edit."
    },
    {
        namespace: "daw_analysis",
        name: "inspect_audio",
        schema: audioInspectInputSchema,
        description: "Render and inspect the acoustic output of the master or one AudioUnit. Returns compact level, waveform-envelope, and broad-spectrum measurements; use when actual sound feedback would help."
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

        eagerTools.forEach(resource => {
            const spec: ToolSpec = {
                namespace: resource.namespace,
                name: resource.name,
                description: resource.description,
                inputSchema: resource.schema,
                exposure: "eager"
            }
            add({spec, manual: resource.name})
        })

        this.tools = Object.freeze(tools.slice())
        this.#bindings = bindings
        this.namespaces = Object.freeze([
            "daw_project",
            "daw_modulation",
            "daw_transport",
            "daw_parameter",
            "daw_resources",
            "daw_analysis"
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
