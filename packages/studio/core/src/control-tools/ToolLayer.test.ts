import {describe, expect, it, vi} from "vitest"
import {BoxEditing} from "@opendaw/lib-box"
import {AudioData} from "@opendaw/lib-dsp"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import type {Sample} from "@opendaw/studio-adapters"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {
    AudioFileBox,
    ApparatDeviceBox,
    NeonDeviceBox,
    NanoDeviceBox,
    NoteEventBox,
    PlayfieldDeviceBox,
    SpielwerkDeviceBox,
    PlayfieldSampleBox,
    WerkstattDeviceBox,
    WerkstattSampleBox
} from "@opendaw/studio-boxes"
import {Project} from "../project/Project"
import type {ProjectEnv} from "../project/ProjectEnv"
import {ControlApi} from "../control-api/ControlApi"
import {generatedControlManifest} from "../control-api/generated"
import type {JsonObject, JsonValue} from "../control-api/types"
import {EffectFactories} from "../EffectFactories"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import type {DeviceBoxAdapter} from "@opendaw/studio-adapters"
import {ResourceTools} from "./ResourceTools"
import {AudioAnalysisTools} from "./AudioAnalysisTools"
import {ToolCatalog, toToolName} from "./ToolCatalog"
import {ToolExecutor} from "./ToolExecutor"
import {typeSpecToJsonSchema} from "./ToolSchema"
import type {DeviceHelpCatalog, JsonSchema, SampleCatalog} from "./types"

if (!isDefined(Reflect.get(globalThis, "AudioWorkletNode"))) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}
if (!isDefined(URL.createObjectURL)) {
    Reflect.set(URL, "createObjectURL", () => "blob:opendaw-test")
    Reflect.set(URL, "revokeObjectURL", () => {})
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

const createAudioWorklets = (addModule: () => Promise<void>): ProjectEnv["audioWorklets"] =>
    ({context: {audioWorklet: {addModule}}} as unknown as ProjectEnv["audioWorklets"])

const createEnv = (audioWorklets?: ProjectEnv["audioWorklets"]): ProjectEnv => ({
    audioContext: undefined,
    audioWorklets,
    sampleManager: createSampleManager(),
    soundfontManager: undefined,
    sampleService: undefined,
    soundfontService: undefined
}) as unknown as ProjectEnv

const createLayer = (sampleCatalog?: SampleCatalog, deviceHelpCatalog?: DeviceHelpCatalog,
                     audioWorklets?: ProjectEnv["audioWorklets"]):
    {project: Project, controlApi: ControlApi, catalog: ToolCatalog, executor: ToolExecutor} => {
    const project = Project.fromSkeleton(createEnv(audioWorklets), ProjectSkeleton.empty({
        createDefaultUser: true, createOutputMaximizer: false
    }))
    const controlApi = new ControlApi(project)
    const catalog = new ToolCatalog()
    return {
        project,
        controlApi,
        catalog,
        executor: new ToolExecutor(controlApi, catalog, undefined, sampleCatalog, deviceHelpCatalog)
    }
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

const sample = (uuid: Sample["uuid"], name: string, origin: Sample["origin"], bpm: number,
                duration: number, custom?: string): Sample => ({
    uuid,
    name,
    bpm,
    duration,
    sample_rate: 48000,
    origin,
    ...(custom === undefined ? {} : {custom})
})

describe("Slice 2 control tools", () => {
    it("projects every generated operation exactly once with deterministic strict tools", () => {
        const first = new ToolCatalog()
        const second = new ToolCatalog()
        const generated = first.tools.filter(tool => tool.exposure === "deferred")
        expect(generated).toHaveLength(generatedControlManifest.operations.length)
        expect(new Set(generated.map(tool => `${tool.namespace}.${tool.name}`)).size).toBe(generated.length)
        expect(generated.map(tool => `${tool.namespace}.${tool.name}`))
            .toEqual(second.tools.filter(tool => tool.exposure === "deferred")
                .map(tool => `${tool.namespace}.${tool.name}`))
        expect(generated.every(tool => /^[A-Za-z0-9_]+$/.test(tool.name))).toBe(true)
        expect(JSON.stringify(generated)).not.toMatch(/\b(?:arg|param)\d+\b/)
        expect(generated.every(tool => tool.exposure === "deferred")).toBe(true)
        expect(first.tools.filter(tool => tool.exposure === "eager").map(tool => tool.name))
            .toEqual([
                "query_resources", "inspect_resource", "query_samples", "query_device_catalog",
                "inspect_device_definition", "inspect_device", "inspect_instrument", "inspect_device_help",
                "inspect_timing", "inspect_audio"
            ])
        const audioTool = first.get("daw_analysis", "inspect_audio")
        expect(audioTool?.spec.exposure).toBe("eager")
        expect(audioTool?.spec.inputSchema).toMatchObject({
            type: "object",
            additionalProperties: false
        })
        expect(audioTool?.spec.inputSchema.properties?.target?.description)
            .toBe("Handle to an AudioUnitBox.")
        expect(audioTool?.spec.inputSchema.required).toEqual([])
        expect(first.get("daw_transport", "play")).toBeDefined()
        expect(first.get("daw_transport", "stop")).toBeDefined()
        expect(first.get("daw_transport", "set_position")).toBeDefined()
        expect(first.get("daw_transport", "sleep")).toBeUndefined()
        expect(first.get("daw_transport", "wake")).toBeUndefined()
        expect(generatedControlManifest.operations.some(operation => operation.id === "transport.sleep")).toBe(false)
        expect(generatedControlManifest.operations.some(operation => operation.id === "transport.wake")).toBe(false)
        expect(first.get("daw_resources", "inspect_device_help")?.spec.inputSchema.properties?.device)
            .toMatchObject({
                anyOf: expect.arrayContaining([
                    expect.objectContaining({description: "Handle to an ApparatDeviceBox."}),
                    expect.objectContaining({description: "Handle to a WerkstattDeviceBox."})
                ])
            })
        const sampleQuery = first.get("daw_resources", "query_samples")?.spec.inputSchema
        expect(sampleQuery?.properties?.origin?.enum).toEqual(["openDAW", "recording", "import"])
        expect(sampleQuery?.properties?.limit?.maximum).toBe(50)
        generated.forEach(tool => allSchemas(tool.inputSchema).forEach(schema => {
            if (schema.type === "object") {expect(schema.additionalProperties).toBe(false)}
        }))
        generatedControlManifest.operations.filter(operation => operation.target === "address").forEach(operation => {
            const tool = first.get("daw_parameter", toToolName(operation.method))
            expect(tool?.spec.inputSchema.properties?.target).toBeDefined()
        })
        for (const [method, name] of [
            ["readApparatSource", "read_apparat_source"],
            ["programApparat", "program_apparat"],
            ["assignApparatSample", "assign_apparat_sample"],
            ["removeApparatSample", "remove_apparat_sample"]
        ] as const) {
            const operation = generatedControlManifest.operations.find(candidate => candidate.method === method)
            expect(operation).toBeDefined()
            expect(first.get("daw_project", name)?.spec.exposure).toBe("deferred")
            if (method === "programApparat") {expect(operation?.async).toBe(true)}
        }
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

    it("derives the empty-project device catalog and definition help from public registries", async () => {
        const read = vi.fn(async (manualUrl: string) => ({
            manualMarkdown: `manual:${manualUrl}`,
            programmingGuide: manualUrl.includes("apparat") ? "programming" : undefined
        }))
        const {project, executor} = createLayer(undefined, {read})
        try {
            const catalog = objectValue(await run(executor, "daw_resources", "query_device_catalog", {
                limit: 100
            }))
            const devices = arrayValue(catalog.devices).map(objectValue)
            const expectedCount = Object.keys(InstrumentFactories.Named).length
                + Object.keys(EffectFactories.MidiNamed).length
                + Object.keys(EffectFactories.AudioNamed).length
            expect(catalog.total).toBe(expectedCount)
            expect(catalog.limit).toBe(50)
            expect(devices.map(device => device.factory)).toEqual([
                ...Object.keys(InstrumentFactories.Named),
                ...Object.keys(EffectFactories.MidiNamed),
                ...Object.keys(EffectFactories.AudioNamed)
            ])
            expect(devices.some(device => device.factory === "Modular")).toBe(false)

            const apparat = devices.find(device => device.factory === "Apparat")!
            expect(apparat).toMatchObject({
                category: "instrument",
                name: InstrumentFactories.Apparat.defaultName,
                briefDescription: InstrumentFactories.Apparat.briefDescription,
                description: InstrumentFactories.Apparat.description,
                manualPage: InstrumentFactories.Apparat.manualPage,
                trackType: "Note"
            })
            const definition = objectValue(await run(executor, "daw_resources", "inspect_device_definition", {
                category: "instrument", factory: "Apparat"
            }))
            expect(definition).toMatchObject({
                ...apparat,
                manualMarkdown: `manual:${InstrumentFactories.Apparat.manualPage}`,
                programmingGuide: "programming"
            })
            expect(read).toHaveBeenCalledWith(InstrumentFactories.Apparat.manualPage)
        } finally {
            project.terminate()
        }
    })

    it("describes handles from generic TypeSpec metadata and exposes semantic note owners", () => {
        const box = typeSpecToJsonSchema({kind: "handle", handle: "box", name: "TrackBox"})
        expect(box.description).toBe("Handle to a TrackBox.")
        expect(Object.keys(box.properties ?? {})).toEqual(["$address"])

        const parameter = typeSpecToJsonSchema({
            kind: "handle", handle: "parameter", name: "AutomatableParameterFieldAdapter"
        })
        expect(parameter.description).toBe("Handle to an AutomatableParameterFieldAdapter.")

        const constrained = typeSpecToJsonSchema({
            kind: "handle",
            handle: "field",
            name: "Field",
            constraint: "Pointers.NoteEventCollection",
            constraintMembers: ["Pointers.NoteEventCollection"]
        })
        expect(constrained.description).toBe("Field handle accepting Pointers.NoteEventCollection.")

        const several = typeSpecToJsonSchema({
            kind: "handle",
            handle: "pointerField",
            name: "PointerField",
            constraint: "EffectPointerType",
            constraintMembers: ["Pointers.AudioEffects", "Pointers.MidiEffects", "Pointers.EffectChain"]
        })
        expect(several.description)
            .toBe("PointerField handle accepting Pointers.AudioEffects, Pointers.MidiEffects, or Pointers.EffectChain.")

        const catalog = new ToolCatalog()
        for (const name of ["create_note_event", "create_note_events"]) {
            const owner = catalog.get("daw_project", name)?.spec.inputSchema.properties?.owner
            expect(owner?.anyOf?.map(schema => schema.description)).toEqual(expect.arrayContaining([
                "Handle to a NoteRegionBox.",
                "Handle to a NoteClipBox.",
                "Handle to a NoteEventCollectionBox."
            ]))
        }

        const inspectInstrument = catalog.get("daw_resources", "inspect_instrument")?.spec
        expect(inspectInstrument?.inputSchema.properties?.instrument?.anyOf
            ?.map(schema => schema.description)).toContain("Handle to an ApparatDeviceBox.")
        expect(inspectInstrument?.description).toContain("dynamically")

        const generatedOperation = generatedControlManifest.operations
            .find(operation => operation.method === "setDeviceProperties")
        expect(generatedOperation).toBeDefined()
        const deviceMutation = catalog.get("daw_project", "set_device_properties")
        expect(deviceMutation?.spec.exposure).toBe("deferred")
        expect(deviceMutation?.spec.inputSchema.properties?.device?.anyOf
            ?.map(schema => schema.description)).toEqual(expect.arrayContaining([
                "Handle to an ApparatDeviceBox.",
                "Handle to a CubedDeviceBox.",
                "Handle to a MIDIOutputDeviceBox.",
                "Handle to a NanoDeviceBox.",
                "Handle to a NeonDeviceBox.",
                "Handle to a PlayfieldDeviceBox.",
                "Handle to a SoundfontDeviceBox.",
                "Handle to a TapeDeviceBox.",
                "Handle to a VaporisateurDeviceBox.",
                "Handle to an ArpeggioDeviceBox.",
                "Handle to a NeuralAmpDeviceBox.",
                "Handle to a WerkstattDeviceBox."
            ]))
    })

    it("exposes explicit sample assignment tools and canonical note-owner documentation", () => {
        const catalog = new ToolCatalog()
        expect(catalog.get("daw_project", "assign_sample")).toBeUndefined()
        expect(catalog.get("daw_project", "assign_nano_sample")).toBeDefined()
        const playfield = catalog.get("daw_project", "assign_playfield_sample")
        expect(playfield).toBeDefined()
        expect(playfield?.spec.inputSchema.properties?.midiNote).toMatchObject({
            type: "number",
            description: expect.stringContaining("Semantic type: int")
        })
        expect(playfield?.spec.description).toContain("absolute MIDI pitch")
        expect(playfield?.spec.description).toContain("same MIDI pitch")

        const region = catalog.get("daw_project", "create_note_region")?.spec
        expect(region?.inputSchema.properties?.eventOwner?.anyOf?.map(schema => schema.description))
            .toEqual(expect.arrayContaining([
                "Handle to a NoteRegionBox.",
                "Handle to a NoteClipBox.",
                "Handle to a NoteEventCollectionBox."
            ]))
        expect(region?.description).toContain("eventOwner")
        expect(region?.description).toContain("note-event collection is reused")
        expect(catalog.get("daw_project", "create_note_clip")?.spec.description)
            .toContain("TrackBox of type TrackType.Notes")
        for (const name of ["create_note_event", "create_note_events"]) {
            const description = catalog.get("daw_project", name)?.spec.description
            expect(description).toContain("semantic owner box directly")
            expect(description).toContain("do not pass an events field handle")
        }
    })

    it("describes canonical project timing and creates notes in musical time", async () => {
        const {project, controlApi, catalog, executor} = createLayer()
        try {
            const timing120 = objectValue(await run(executor, "daw_resources", "inspect_timing"))
            expect(timing120).toMatchObject({
                tempo: 120,
                quarterNotePulses: 960,
                pulsesPerBar: 3840,
                noteLengths: {whole: 3840, half: 1920, quarter: 960, eighth: 480, sixteenth: 240}
            })
            await run(executor, "daw_project", "set_bpm", {value: 145})
            const timing145 = objectValue(await run(executor, "daw_resources", "inspect_timing"))
            expect(timing145).toMatchObject({
                tempo: 145,
                quarterNotePulses: timing120.quarterNotePulses,
                noteLengths: timing120.noteLengths
            })

            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Neon"
            }))
            const track = handleValue(await run(executor, "daw_project", "create_note_track", {
                audioUnitBox: handleValue(product.audioUnitBox)
            }))
            const region = handleValue(await run(executor, "daw_project", "create_musical_note_region", {
                trackBox: track,
                position: {bar: 1, beat: 1},
                duration: "bar",
                name: "Kick"
            }))
            const events = arrayValue(await run(executor, "daw_project", "create_musical_note_events", {
                owner: region,
                events: [1, 2, 3, 4].map(beat => ({
                    position: {bar: 1, beat},
                    duration: "sixteenth",
                    pitch: 36
                }))
            }))
            const positions = events.map(event => {
                const box = controlApi.resolver.resolve({
                    kind: "handle", handle: "box", name: "NoteEventBox"
                }, handleValue(event))
                return (box as NoteEventBox).position.getValue()
            })
            expect(positions).toEqual([0, 960, 1920, 2880])
            expect(events.every(event => stringValue(handleValue(event).$address).length > 0)).toBe(true)

            const triplet = handleValue(await run(executor, "daw_project", "create_musical_note_event", {
                owner: region,
                position: {bar: 1, beat: 1, sixteenth: 2},
                duration: "triplet-eighth",
                pitch: 40
            }))
            const tripletBox = controlApi.resolver.resolve({
                kind: "handle", handle: "box", name: "NoteEventBox"
            }, triplet) as NoteEventBox
            expect(tripletBox.position.getValue()).toBe(240)
            expect(tripletBox.duration.getValue()).toBe(320)

            const musicalRegion = catalog.get("daw_project", "create_musical_note_region")
            expect(musicalRegion?.spec.inputSchema.properties?.position?.description)
                .toContain("One-based musical position")
            expect(musicalRegion?.spec.inputSchema.properties?.duration?.description)
                .toContain("canonical project signature/PPQN helpers")
            expect(catalog.get("daw_resources", "inspect_timing")?.spec.inputSchema.properties
                ?.positionPulses?.description).toContain("960 pulses")
        } finally {
            project.terminate()
        }
    })

    it("queries the injected canonical sample catalog with text filters and bounded pages", async () => {
        const samples = [
            sample("00000000-0000-4000-8000-000000000001", "808 Kick", "openDAW", 120, 0.5, "drum"),
            sample("00000000-0000-4000-8000-000000000002", "Vinyl Snare", "import", 96, 0.8),
            sample("00000000-0000-4000-8000-000000000003", "Recorded Hat", "recording", 140, 0.2)
        ]
        const catalog: SampleCatalog = {list: vi.fn(async () => samples)}
        const {project, executor} = createLayer(catalog)
        try {
            const result = objectValue(await run(executor, "daw_resources", "query_samples", {
                text: "DRUM", origin: "openDAW", minBpm: 100, maxDuration: 1, limit: 1, offset: 0
            }))
            expect(catalog.list).toHaveBeenCalledOnce()
            expect(result.total).toBe(1)
            expect(result.limit).toBe(1)
            expect(result.offset).toBe(0)
            expect(result.samples).toEqual([samples[0]])

            const page = objectValue(await run(executor, "daw_resources", "query_samples", {
                limit: 100, offset: 1
            }))
            expect(page.total).toBe(3)
            expect(page.limit).toBe(50)
            expect(page.offset).toBe(1)
            expect(page.samples).toEqual(samples.slice(1))
        } finally {
            project.terminate()
        }
    })

    it("passes a queried canonical Sample directly to Nano and Playfield assignment", async () => {
        const queried = sample("00000000-0000-4000-8000-000000000011", "Agent Kick", "openDAW", 120, 0.75)
        const catalog: SampleCatalog = {list: async () => [queried]}
        const {project, controlApi, executor} = createLayer(catalog)
        try {
            const query = objectValue(await run(executor, "daw_resources", "query_samples", {text: "kick"}))
            const returnedSample = objectValue(arrayValue(query.samples)[0])
            expect(returnedSample).toEqual(queried)

            const nanoProduct = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Nano"
            }))
            const nanoHandle = handleValue(nanoProduct.instrumentBox)
            await run(executor, "daw_project", "assign_nano_sample", {
                target: nanoHandle, sample: returnedSample
            })
            const nano = controlApi.resolver.resolve({
                kind: "handle", handle: "box", name: "NanoDeviceBox"
            }, nanoHandle)
            expect(nano).toBeInstanceOf(NanoDeviceBox)
            const nanoFile = (nano as NanoDeviceBox).file.targetVertex.unwrap("Nano sample was not assigned").box
            if (!(nanoFile instanceof AudioFileBox)) {throw new Error("Nano sample did not resolve to an audio file")}

            const playfieldProduct = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Playfield"
            }))
            const playfieldHandle = handleValue(playfieldProduct.instrumentBox)
            await run(executor, "daw_project", "assign_playfield_sample", {
                target: playfieldHandle, sample: returnedSample, midiNote: 36
            })
            const playfield = controlApi.resolver.resolve({
                kind: "handle", handle: "box", name: "PlayfieldDeviceBox"
            }, playfieldHandle)
            expect(playfield).toBeInstanceOf(PlayfieldDeviceBox)
            const slots = (playfield as PlayfieldDeviceBox).samples.pointerHub.incoming()
            expect(slots).toHaveLength(1)
            const slot = slots[0].box as PlayfieldSampleBox
            expect(slot.index.getValue()).toBe(36)
            expect(slot.file.targetVertex.unwrap("Playfield sample was not assigned").box).toBe(nanoFile)
            expect(nanoFile.fileName.getValue()).toBe(queried.name)
            expect(nanoFile.endInSeconds.getValue()).toBe(queried.duration)

            const track = handleValue(await run(executor, "daw_project", "create_note_track", {
                audioUnitBox: handleValue(playfieldProduct.audioUnitBox)
            }))
            const region = handleValue(await run(executor, "daw_project", "create_note_region", {
                trackBox: track, position: 0, duration: 960
            }))
            const events = arrayValue(await run(executor, "daw_project", "create_note_events", {
                owner: region, events: [{position: 0, duration: 120, pitch: 36}]
            }))
            expect(events).toHaveLength(1)
            const event = controlApi.resolver.boxes().find(box =>
                box.address.toString() === handleValue(events[0]).$address)
            expect(event).toBeInstanceOf(NoteEventBox)
            if (!(event instanceof NoteEventBox)) {throw new Error("Missing note event")}
            expect(event.pitch.getValue()).toBe(slot.index.getValue())

            for (const midiNote of [-1, 128, 36.5]) {
                await expect(executor.execute({namespace: "daw_project", name: "assign_playfield_sample", arguments: {
                    target: playfieldHandle, sample: returnedSample, midiNote
                }})).resolves.toMatchObject({
                    ok: false,
                    error: expect.stringContaining("midiNote must be an integer in the range 0..127")
                })
            }
        } finally {
            project.terminate()
        }
    })

    it("programs Apparat through the generated tool and discovers ordinary parameters", async () => {
        const {project, controlApi, catalog, executor} = createLayer(undefined, undefined,
            createAudioWorklets(async () => {}))
        try {
            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Apparat"
            }))
            const target = handleValue(product.instrumentBox)
            const source = "// @param tone 0.5\n// @param decay 0.1 0.001 1 exp s\n"
                + "class Processor { noteOn() {} noteOff() {} reset() {} process() {} }"
            await run(executor, "daw_project", "program_apparat", {target, source})
            const resources = objectValue(await run(executor, "daw_resources", "query_resources", {
                kind: "parameter", owner: target, limit: 10
            }))
            const parameters = arrayValue(resources.resources).map(objectValue)
            expect(parameters.map(parameter => parameter.name)).toEqual(expect.arrayContaining(["Tone", "Decay"]))
            expect(parameters.every(parameter => objectValue(parameter.owner).$address === target.$address)).toBe(true)
            const tone = parameters.find(parameter => parameter.name === "Tone")!
            const toneHandle = handleValue(tone.handle)
            const inspection = objectValue(await run(executor, "daw_resources", "inspect_instrument", {
                instrument: target
            }))
            expect(inspection).toMatchObject({
                type: "ApparatDeviceBox",
                guidance: expect.stringContaining("dynamically declared")
            })
            const inspectedTone = arrayValue(inspection.properties).map(objectValue)
                .find(property => property.parameterName === "Tone")
            expect(inspectedTone).toMatchObject({
                path: "Tone",
                automatable: true,
                parameterName: "Tone",
                parameterHandle: {$address: toneHandle.$address},
                printValue: {value: expect.anything()}
            })
            if (inspectedTone === undefined) {throw new Error("Missing inspected Tone property")}
            const inspectedToneHandle = handleValue(inspectedTone.parameterHandle as JsonValue)
            expect(inspectedToneHandle).toEqual(toneHandle)
            expect(catalog.get("daw_project", "set_instrument_properties")).toBeUndefined()
            const before = objectValue(await run(executor, "daw_resources", "inspect_resource", {
                handle: inspectedToneHandle
            }))
            await run(executor, "daw_parameter", "set_value", {target: inspectedToneHandle, value: 0.75})
            const after = objectValue(await run(executor, "daw_resources", "inspect_resource", {
                handle: inspectedToneHandle
            }))
            expect(JSON.stringify(after)).not.toBe(JSON.stringify(before))
            expect(controlApi.resolver.parameters().some(parameter => parameter.name === "Tone")).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("assigns a queried sample to an Apparat declaration without deleting the slot", async () => {
        const queried = sample("00000000-0000-4000-8000-000000000031", "Apparat Kick", "openDAW", 120, 0.5)
        const sampleCatalog: SampleCatalog = {list: async () => [queried]}
        const {project, controlApi, executor} = createLayer(sampleCatalog, undefined,
            createAudioWorklets(async () => {}))
        try {
            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Apparat"
            }))
            const target = handleValue(product.instrumentBox)
            const source = "// @sample kick\n"
                + "class Processor { noteOn() {} noteOff() {} reset() {} process() {} }"
            await run(executor, "daw_project", "program_apparat", {target, source})
            const query = objectValue(await run(executor, "daw_resources", "query_samples", {text: "kick"}))
            const returnedSample = objectValue(arrayValue(query.samples)[0])
            await run(executor, "daw_project", "assign_apparat_sample", {
                target, sampleLabel: "kick", sample: returnedSample
            })
            const apparat = controlApi.resolver.resolve({kind: "handle", handle: "box", name: "ApparatDeviceBox"}, target)
            if (!(apparat instanceof ApparatDeviceBox)) {throw new Error("Missing Apparat box")}
            const slot = apparat.samples.pointerHub.incoming()
                .map(({box}) => box).find(box => box instanceof WerkstattSampleBox)
            if (!(slot instanceof WerkstattSampleBox)) {throw new Error("Missing Apparat sample slot")}
            const file = slot.file.targetVertex.unwrap("Missing assigned sample").box
            if (!(file instanceof AudioFileBox)) {throw new Error("Missing Apparat audio file")}
            expect(file.fileName.getValue()).toBe(queried.name)
            await run(executor, "daw_project", "remove_apparat_sample", {target, sampleLabel: "kick"})
            expect(slot.isAttached()).toBe(true)
            expect(slot.file.targetVertex.isEmpty()).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("awaits generated async tools and reports rejected Apparat compilation", async () => {
        const {project, executor} = createLayer(undefined, undefined,
            createAudioWorklets(async () => {}))
        try {
            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Apparat"
            }))
            const result = await executor.execute({
                namespace: "daw_project",
                name: "program_apparat",
                arguments: {target: handleValue(product.instrumentBox), source: "class Processor {"}
            })
            expect(result).toMatchObject({ok: false, error: expect.any(String)})
        } finally {
            project.terminate()
        }
    })

    it("programs Apparat, Werkstatt, and Spielwerk through shared script compiler configs", async () => {
        const {project, controlApi, executor} = createLayer(undefined, undefined,
            createAudioWorklets(async () => {}))
        try {
            const instrument = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Apparat"
            }))
            const apparat = handleValue(instrument.instrumentBox)
            const apparatSource = "class Processor { noteOn() {} noteOff() {} reset() {} process() {} }"
            await run(executor, "daw_project", "program_apparat", {target: apparat, source: apparatSource})
            expect(await run(executor, "daw_project", "read_apparat_source", {target: apparat}))
                .toBe(apparatSource)
            const apparatBox = controlApi.resolver.resolve({
                kind: "handle", handle: "box", name: "ApparatDeviceBox"
            }, apparat)
            expect((apparatBox as ApparatDeviceBox).code.getValue()).toContain("// @apparat js 1 1\n")

            const audioUnit = handleValue(instrument.audioUnitBox)
            const fieldFor = async (name: "audioEffects" | "midiEffects"): Promise<JsonObject> => {
                const resources = objectValue(await run(executor, "daw_resources", "query_resources", {
                    kind: "field", owner: audioUnit, text: name, limit: 10
                }))
                const field = arrayValue(resources.resources).map(objectValue)[0]
                if (field === undefined) {throw new Error(`Missing ${name} field`)}
                return field
            }
            const effectFor = async (name: "audioEffects" | "midiEffects", factory: "Werkstatt" | "Spielwerk") =>
                handleValue(await run(executor, "daw_project", "insert_effect", {
                    field: handleValue((await fieldFor(name)).handle), factory, insertIndex: 0
                }))

            const werkstatt = await effectFor("audioEffects", "Werkstatt")
            const werkstattSource = "class Processor { process() {} }"
            await run(executor, "daw_project", "program_werkstatt", {
                target: werkstatt, source: werkstattSource
            })
            expect(await run(executor, "daw_project", "read_werkstatt_source", {target: werkstatt}))
                .toBe(werkstattSource)
            const werkstattBox = controlApi.resolver.resolve({
                kind: "handle", handle: "box", name: "WerkstattDeviceBox"
            }, werkstatt)
            expect((werkstattBox as WerkstattDeviceBox).code.getValue()).toContain("// @werkstatt js 1 1\n")

            const spielwerk = await effectFor("midiEffects", "Spielwerk")
            const spielwerkSource = "class Processor { noteOn() {} noteOff() {} }"
            await run(executor, "daw_project", "program_spielwerk", {
                target: spielwerk, source: spielwerkSource
            })
            expect(await run(executor, "daw_project", "read_spielwerk_source", {target: spielwerk}))
                .toBe(spielwerkSource)
            const spielwerkBox = controlApi.resolver.resolve({
                kind: "handle", handle: "box", name: "SpielwerkDeviceBox"
            }, spielwerk)
            expect((spielwerkBox as SpielwerkDeviceBox).code.getValue()).toContain("// @spielwerk js 1 1\n")

            for (const [name, target] of [
                ["program_apparat", apparat],
                ["program_werkstatt", werkstatt],
                ["program_spielwerk", spielwerk]
            ] as const) {
                await expect(executor.execute({
                    namespace: "daw_project", name,
                    arguments: {target, source: "class Processor {"}
                })).resolves.toMatchObject({ok: false, error: expect.any(String)})
            }
        } finally {
            project.terminate()
        }
    })

    it("resolves generic device help from the live adapter manual URL", async () => {
        const read = vi.fn(async (manualUrl: string) => ({manualMarkdown: `manual:${manualUrl}`}))
        const deviceHelpCatalog: DeviceHelpCatalog = {read}
        const {project, controlApi, executor} = createLayer(undefined, deviceHelpCatalog)
        try {
            for (const factory of ["Apparat", "Cubed"] as const) {
                const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {factory}))
                const device = handleValue(product.instrumentBox)
                const adapter = controlApi.resolver.adapters()
                    .find(candidate => candidate.address.toString() === device.$address) as DeviceBoxAdapter | undefined
                if (adapter === undefined) {throw new Error(`Missing ${factory} adapter`)}
                const help = objectValue(await run(executor, "daw_resources", "inspect_device_help", {device}))
                expect(help.manualUrl).toBe(adapter.manualUrl)
                expect(help.manualMarkdown).toBe(`manual:${adapter.manualUrl}`)
                expect(read).toHaveBeenCalledWith(adapter.manualUrl)
            }
        } finally {
            project.terminate()
        }
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
            const events = arrayValue(await run(executor, "daw_project", "create_note_events", {
                owner: region,
                events: [
                    {position: 0, duration: 120, pitch: 42},
                    {position: 240, duration: 120, pitch: 46}
                ]
            }))
            expect(events).toHaveLength(2)

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

    it("inspects and mutates Neon semantic properties without raw field handles", async () => {
        const {project, controlApi, catalog, executor} = createLayer()
        try {
            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Neon"
            }))
            const instrument = handleValue(product.instrumentBox)
            // Creation itself is a separate producer mutation; start this focused assertion with a clean history.
            const boxEditing = project.editing as BoxEditing
            boxEditing.clear()
            const inspection = objectValue(await run(executor, "daw_resources", "inspect_device", {device: instrument}))
            expect(inspection.type).toBe("NeonDeviceBox")
            expect(inspection.category).toBe("instrument")
            expect(inspection.label).toBe("Neon")

            const properties = arrayValue(inspection.properties).map(objectValue)
            const paths = properties.map(property => stringValue(property.path))
            expect(paths).toContain("envelopes.0.rate1")
            expect(paths).toContain("envelopes.5.level8")
            expect(paths).toContain("vibrato.rate")
            const rate = properties.find(property => property.path === "envelopes.0.rate1")!
            expect(rate).toMatchObject({
                value: 0,
                fieldType: "float32",
                constraints: {min: 0, max: 99, scaling: "linear"},
                automatable: false
            })
            const lineSelect = properties.find(property => property.path === "lineSelect")!
            expect(lineSelect).toMatchObject({automatable: true, parameterName: "Line"})
            expect(lineSelect).not.toHaveProperty("field")

            const groups = arrayValue(inspection.groups).map(objectValue)
            expect(groups.map(group => group.label)).toEqual([
                "Line 1 Pitch Envelope",
                "Line 1 DCW Envelope",
                "Line 1 DCA Envelope",
                "Line 2 Pitch Envelope",
                "Line 2 DCW Envelope",
                "Line 2 DCA Envelope"
            ])

            const neon = controlApi.resolver.resolve({
                kind: "handle", handle: "box", name: "NeonDeviceBox"
            }, instrument)
            expect(neon).toBeInstanceOf(NeonDeviceBox)
            if (!(neon instanceof NeonDeviceBox)) {throw new Error("Missing Neon box")}
            const originalRate = neon.envelopes.fields()[0].rate1.getValue()
            const originalVibratoRate = neon.vibrato.rate.getValue()
            expect(project.editing.canUndo()).toBe(false)

            await run(executor, "daw_project", "set_device_properties", {
                device: instrument,
                changes: [
                    {path: "envelopes.0.rate1", value: 73},
                    {path: "vibrato.rate", value: 12}
                ]
            })
            expect(neon.envelopes.fields()[0].rate1.getValue()).toBe(73)
            expect(neon.vibrato.rate.getValue()).toBe(12)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(neon.envelopes.fields()[0].rate1.getValue()).toBe(originalRate)
            expect(neon.vibrato.rate.getValue()).toBe(originalVibratoRate)
            expect(project.editing.canUndo()).toBe(false)

            await expect(executor.execute({
                namespace: "daw_project", name: "set_device_properties", arguments: {
                    device: instrument, changes: [{path: "envelopes.9.foo", value: 1}]
                }
            })).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("'envelopes.9.foo' is not a semantic property of Neon")
            })
            await expect(executor.execute({
                namespace: "daw_project", name: "set_device_properties", arguments: {
                    device: instrument, changes: [{path: "envelopes.0.rate1", value: 100}]
                }
            })).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("envelopes.0.rate1")
            })
            expect(neon.envelopes.fields()[0].rate1.getValue()).toBe(originalRate)
            expect(project.editing.canUndo()).toBe(false)

            const mutationTool = catalog.get("daw_project", "set_device_properties")
            expect(mutationTool?.spec.exposure).toBe("deferred")
            expect(catalog.get("daw_project", "set_neon_envelope")).toBeUndefined()
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

    it("dispatches audio analysis with a master range or one canonical AudioUnit stem", async () => {
        const {project, controlApi, catalog} = createLayer()
        const audio = AudioData.create(48_000, 0, 2)
        const render = vi.fn(async () => audio)
        const analysis = new AudioAnalysisTools(project, controlApi.resolver, render)
        const executor = new ToolExecutor(controlApi, catalog, undefined, undefined, undefined, analysis)
        try {
            const master = objectValue(await run(executor, "daw_analysis", "inspect_audio", {
                startPosition: 0, endPosition: 960
            }))
            expect(master.target).toBe("master")
            expect(render).toHaveBeenLastCalledWith({range: {start: 0, end: 960}})

            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Neon"
            }))
            const audioUnit = handleValue(product.audioUnitBox)
            const audioUnitAddress = audioUnit.$address as string
            const unit = objectValue(await run(executor, "daw_analysis", "inspect_audio", {
                target: audioUnit, startPosition: 0, endPosition: 960
            }))
            expect(objectValue(unit.target)).toMatchObject({handle: audioUnit})
            expect(render).toHaveBeenLastCalledWith({
                range: {start: 0, end: 960},
                stems: {
                    [audioUnitAddress]: {
                        includeAudioEffects: true,
                        includeSends: true,
                        useInstrumentOutput: false,
                        fileName: "analysis"
                    }
                }
            })
        } finally {
            project.terminate()
        }
    })

    it("rejects invalid audio analysis without touching live engine state", async () => {
        const {project, controlApi, catalog} = createLayer()
        const render = vi.fn(async () => AudioData.create(48_000, 0, 2))
        const analysis = new AudioAnalysisTools(project, controlApi.resolver, render)
        const executor = new ToolExecutor(controlApi, catalog, undefined, undefined, undefined, analysis)
        const sleep = vi.spyOn(project.engine, "sleep")
        const wake = vi.spyOn(project.engine, "wake")
        const stop = vi.spyOn(project.engine, "stop")
        try {
            await expect(executor.execute({namespace: "daw_analysis", name: "inspect_audio", arguments: {
                target: controlApi.resolver.handle(project.timelineBox), startPosition: 0, endPosition: 960
            }})).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("Expected box AudioUnitBox")
            })
            expect(render).not.toHaveBeenCalled()
            expect(sleep).not.toHaveBeenCalled()
            expect(wake).not.toHaveBeenCalled()
            expect(stop).not.toHaveBeenCalled()
            expect(project.engine.isPlaying.getValue()).toBe(false)
        } finally {
            project.terminate()
        }
    })

    it("returns compact failures for unknown tools, invalid handles, and strict resource input", async () => {
        const {project, controlApi, executor} = createLayer()
        try {
            await expect(executor.execute({namespace: "daw_nope", name: "missing"}))
                .resolves.toMatchObject({ok: false})
            await expect(executor.execute({namespace: "daw_resources", name: "inspect_resource", arguments: {
                handle: {$address: "not-an-address"}
            }})).resolves.toMatchObject({ok: false})
            await expect(executor.execute({namespace: "daw_resources", name: "query_resources", arguments: {
                unexpected: true
            } as unknown as JsonObject})).resolves.toMatchObject({ok: false})
            await expect(executor.execute({namespace: "daw_resources", name: "inspect_device_help"}))
                .resolves.toEqual({ok: false, error: "Missing argument 'device'"})
            await expect(executor.execute({namespace: "daw_resources", name: "inspect_device_help", arguments: {
                device: controlApi.resolver.handle(project.timelineBox), extra: true
            }})).resolves.toMatchObject({ok: false, error: expect.stringContaining("Unknown property 'extra'")})
            await expect(executor.execute({namespace: "daw_resources", name: "inspect_device_help", arguments: {
                device: controlApi.resolver.handle(project.timelineBox)
            }})).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("supported device box")
            })
            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Apparat"
            }))
            await expect(executor.execute({namespace: "daw_resources", name: "inspect_device_help", arguments: {
                device: handleValue(product.audioUnitBox)
            }})).resolves.toEqual({
                ok: false,
                error: "Device help target 'AudioUnitBox' is not a supported device box."
            })
            await expect(executor.execute({namespace: "daw_resources", name: "inspect_device_help", arguments: {
                device: handleValue(product.instrumentBox)
            }})).resolves.toEqual({ok: false, error: "Device help catalog is unavailable."})
        } finally {
            project.terminate()
        }
    })

    it("reports unavailable sample catalogs explicitly", async () => {
        const {project, executor} = createLayer()
        try {
            await expect(executor.execute({namespace: "daw_resources", name: "query_samples"}))
                .resolves.toEqual({ok: false, error: "Sample catalog is unavailable."})
        } finally {
            project.terminate()
        }
    })
})
