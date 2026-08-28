import {describe, expect, it, vi} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {Project} from "../project/Project"
import type {ProjectEnv} from "../project/ProjectEnv"
import {ControlApi} from "../control-api/ControlApi"
import {generatedControlManifest} from "../control-api/generated"
import type {JsonObject, JsonValue} from "../control-api/types"
import {EffectFactories} from "../EffectFactories"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import {ResourceTools} from "./ResourceTools"
import {ToolCatalog, toToolName} from "./ToolCatalog"
import {ToolExecutor} from "./ToolExecutor"
import type {JsonSchema} from "./types"

if (!isDefined(Reflect.get(globalThis, "AudioWorkletNode"))) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}

const createSampleManager = () => ({
    getOrCreate: (uuid: UUID.Bytes) => ({
        get data() {return Option.None},
        get peaks() {return Option.None},
        get uuid() {return uuid},
        get state() {return {type: "idle"} as const},
        invalidate() {},
        subscribe: () => Terminable.Empty
    }),
    record: () => {},
    invalidate: () => {},
    remove: () => {},
    register: () => Terminable.Empty
})

const createEnv = (): ProjectEnv => ({
    audioContext: undefined,
    audioWorklets: undefined,
    sampleManager: createSampleManager(),
    soundfontManager: undefined,
    sampleService: undefined,
    soundfontService: undefined
}) as unknown as ProjectEnv

const createLayer = (): {project: Project, controlApi: ControlApi, catalog: ToolCatalog, executor: ToolExecutor} => {
    const project = Project.fromSkeleton(createEnv(), ProjectSkeleton.empty({
        createDefaultUser: true, createOutputMaximizer: false
    }))
    const controlApi = new ControlApi(project)
    const catalog = new ToolCatalog()
    return {project, controlApi, catalog, executor: new ToolExecutor(controlApi, catalog)}
}

const objectValue = (value: JsonValue): JsonObject => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Expected an object")
    }
    return value as JsonObject
}

const stringValue = (value: JsonValue | undefined): string => {
    if (typeof value !== "string") {throw new Error("Expected a string")}
    return value
}

const handleValue = (value: JsonValue): JsonObject => {
    const object = objectValue(value)
    if (typeof object.$address !== "string") {throw new Error("Expected a handle")}
    return object
}

const arrayValue = (value: JsonValue | undefined): ReadonlyArray<JsonValue> => {
    if (!Array.isArray(value)) {throw new Error("Expected an array")}
    return value
}

const run = async (executor: ToolExecutor, namespace: string, name: string,
                   arguments_: JsonObject = {}): Promise<JsonValue> => {
    const result = await executor.execute({namespace, name, arguments: arguments_})
    if (!result.ok) {throw new Error(result.error)}
    return result.value
}

const allSchemas = (schema: JsonSchema): ReadonlyArray<JsonSchema> => [
    schema,
    ...(schema.properties === undefined ? [] : Object.values(schema.properties).flatMap(allSchemas)),
    ...(schema.items !== undefined && schema.items !== false ? allSchemas(schema.items) : []),
    ...(schema.prefixItems?.flatMap(allSchemas) ?? []),
    ...(schema.anyOf?.flatMap(allSchemas) ?? [])
]

describe("Slice 2 control tools", () => {
    it("projects every generated operation exactly once with deterministic strict tools", () => {
        const first = new ToolCatalog()
        const second = new ToolCatalog()
        const generated = first.tools.filter(tool => tool.namespace !== "daw_resources")
        expect(generated).toHaveLength(generatedControlManifest.operations.length)
        expect(new Set(generated.map(tool => `${tool.namespace}.${tool.name}`)).size).toBe(generated.length)
        expect(generated.map(tool => `${tool.namespace}.${tool.name}`))
            .toEqual(second.tools.filter(tool => tool.namespace !== "daw_resources")
                .map(tool => `${tool.namespace}.${tool.name}`))
        expect(generated.every(tool => /^[A-Za-z0-9_]+$/.test(tool.name))).toBe(true)
        expect(JSON.stringify(generated)).not.toMatch(/\b(?:arg|param)\d+\b/)
        expect(generated.every(tool => tool.exposure === "deferred")).toBe(true)
        expect(first.tools.filter(tool => tool.exposure === "eager").map(tool => tool.name))
            .toEqual(["query_resources", "inspect_resource"])
        generated.forEach(tool => allSchemas(tool.inputSchema).forEach(schema => {
            if (schema.type === "object") {expect(schema.additionalProperties).toBe(false)}
        }))
        generatedControlManifest.operations.filter(operation => operation.target === "address").forEach(operation => {
            const tool = first.get("daw_parameter", toToolName(operation.method))
            expect(tool?.spec.inputSchema.properties?.target).toBeDefined()
        })
    })

    it("derives factory enums and instrument options from the canonical registries", () => {
        const catalog = new ToolCatalog()
        const instrument = catalog.get("daw_project", "create_any_instrument")?.spec.inputSchema
            .properties?.factory
        const effect = catalog.get("daw_project", "insert_effect")?.spec.inputSchema
            .properties?.factory
        expect(instrument?.enum).toEqual(Object.keys(InstrumentFactories.Named))
        expect(effect?.enum).toEqual(Object.keys(EffectFactories.MergedNamed))
        const options = catalog.get("daw_project", "create_note_region")?.spec.inputSchema
        expect(JSON.stringify(options)).not.toContain("attachment")
    })

    it("discovers and executes a producer workflow using only catalog and executor", async () => {
        const {project, executor} = createLayer()
        try {
            const initial = objectValue(await run(executor, "daw_resources", "query_resources", {
                kind: "box", limit: 10
            }))
            expect(Array.isArray(initial.resources)).toBe(true)

            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Vaporisateur"
            }))
            const audioUnit = handleValue(product.audioUnitBox)
            const track = handleValue(await run(executor, "daw_project", "create_note_track", {
                audioUnitBox: audioUnit
            }))
            const region = handleValue(await run(executor, "daw_project", "create_note_region", {
                trackBox: track, position: 0, duration: 960, name: "Hats"
            }))
            const events = objectValue((await run(executor, "daw_resources", "query_resources", {
                kind: "field", owner: region, text: "events", limit: 10
            })) as JsonValue)
            const eventField = objectValue((events.resources as ReadonlyArray<JsonValue>)[0])
            await run(executor, "daw_project", "create_note_event", {
                owner: {events: handleValue(eventField.handle)},
                position: 0, duration: 120, pitch: 42
            })
            await run(executor, "daw_project", "create_note_event", {
                owner: {events: handleValue(eventField.handle)},
                position: 240, duration: 120, pitch: 46
            })

            const audioEffects = objectValue((await run(executor, "daw_resources", "query_resources", {
                kind: "field", owner: audioUnit, text: "audioEffects", limit: 10
            })) as JsonValue)
            const effectField = objectValue((audioEffects.resources as ReadonlyArray<JsonValue>)[0])
            const effect = handleValue(await run(executor, "daw_project", "insert_effect", {
                field: handleValue(effectField.handle), factory: "Delay", insertIndex: 0
            }))
            const parameters = objectValue(await run(executor, "daw_resources", "query_resources", {
                kind: "parameter", owner: effect, text: "Feedback", limit: 10
            }))
            const parameter = objectValue((parameters.resources as ReadonlyArray<JsonValue>)[0])
            const parameterHandle = handleValue(parameter.handle)
            const beforePrintValue = objectValue(parameter.printValue)
            await run(executor, "daw_parameter", "set_print_value", {
                target: parameterHandle, text: "10"
            })
            const afterFirstWrite = objectValue(await run(executor, "daw_resources", "inspect_resource", {
                handle: parameterHandle
            }))
            const afterFirstWriteParameter = objectValue(arrayValue(afterFirstWrite.views)
                .find(view => objectValue(view).kind === "parameter")!)
            expect(objectValue(afterFirstWriteParameter.printValue).value)
                .not.toBe(beforePrintValue.value)

            const parameterField = handleValue(parameter.field)
            const modulation = handleValue(await run(executor, "daw_modulation", "create_lfo", {
                label: "Hats LFO"
            }))
            await run(executor, "daw_modulation", "assign", {
                modulator: modulation, target: parameterField, depth: 0.2
            })
            const bus = handleValue(await run(executor, "daw_project", "create_audio_bus", {
                name: "Mix Bus", type: "bus"
            }))
            await run(executor, "daw_project", "route_output", {audioUnitBox: audioUnit, target: bus})
            await run(executor, "daw_project", "create_aux_send", {audioUnitBox: audioUnit, targetBus: bus})

            const rediscovered = objectValue(await run(executor, "daw_resources", "query_resources", {
                text: "Hats", limit: 100
            }))
            expect(arrayValue(rediscovered.resources).some(resource =>
                objectValue(resource).kind === "box"
                && stringValue(objectValue(resource).label) === "Hats")).toBe(true)
            const rediscoveredEffect = objectValue(await run(executor, "daw_resources", "query_resources", {
                kind: "box", text: "Delay", limit: 10
            }))
            expect(arrayValue(rediscoveredEffect.resources).length).toBeGreaterThan(0)
            const rediscoveredParameter = objectValue((await run(executor, "daw_resources", "query_resources", {
                kind: "parameter",
                owner: handleValue(objectValue(arrayValue(rediscoveredEffect.resources)[0]).handle),
                text: "Feedback", limit: 10
            })) as JsonValue)
            const rediscoveredHandle = handleValue(objectValue(arrayValue(rediscoveredParameter.resources)[0]).handle)
            await run(executor, "daw_parameter", "set_print_value", {
                target: rediscoveredHandle, text: "12"
            })

            const inspection = objectValue(await run(executor, "daw_resources", "inspect_resource", {
                handle: rediscoveredHandle
            }))
            expect(arrayValue(inspection.views).length).toBeGreaterThanOrEqual(1)
        } finally {
            project.terminate()
        }
    })

    it("keeps resource discovery generic and routes generated execution through ControlApi", async () => {
        const {project, controlApi, catalog} = createLayer()
        try {
            const resourceTools = new ResourceTools(controlApi.resolver)
            const query = vi.spyOn(resourceTools, "query")
            const executorWithResources = new ToolExecutor(controlApi, catalog, resourceTools)
            const call = vi.spyOn(controlApi, "call")
            const result = await executorWithResources.execute({
                namespace: "daw_project", name: "set_bpm", arguments: {value: 123}
            })
            expect(result.ok).toBe(true)
            expect(call).toHaveBeenCalledWith({operation: "project.setBpm", arguments: {value: 123}})
            await executorWithResources.execute({namespace: "daw_resources", name: "query_resources", arguments: {kind: "box"}})
            expect(query).toHaveBeenCalled()
        } finally {
            project.terminate()
        }
    })

    it("returns compact failures for unknown tools, invalid handles, and strict resource input", async () => {
        const {project, executor} = createLayer()
        try {
            await expect(executor.execute({namespace: "daw_nope", name: "missing"}))
                .resolves.toMatchObject({ok: false})
            await expect(executor.execute({namespace: "daw_resources", name: "inspect_resource", arguments: {
                handle: {$address: "not-an-address"}
            }})).resolves.toMatchObject({ok: false})
            await expect(executor.execute({namespace: "daw_resources", name: "query_resources", arguments: {
                unexpected: true
            } as unknown as JsonObject})).resolves.toMatchObject({ok: false})
        } finally {
            project.terminate()
        }
    })
})
