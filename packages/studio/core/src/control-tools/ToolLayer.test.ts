import {describe, expect, it, vi} from "vitest"
import {BoxEditing, type Field} from "@opendaw/lib-box"
import {AudioData} from "@opendaw/lib-dsp"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import type {Sample} from "@opendaw/studio-adapters"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {
    AudioFileBox,
    ApparatDeviceBox,
    NeonDeviceBox,
    NanoDeviceBox,
    NoteRegionBox,
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
import type {Pointers} from "@opendaw/studio-enums"
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
        expect(generated).toHaveLength(generatedControlManifest.operations.filter(operation =>
            !["project.createNoteEvent", "project.createNoteEvents", "project.insertEffect"]
                .includes(operation.id)).length)
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
                "inspect_device_definition", "inspect_device", "inspect_device_help",
                "inspect_timing", "inspect_arrangement", "inspect_patterns", "apply_edit", "inspect_audio"
            ])
        const audioTool = first.get("daw_analysis", "inspect_audio")
        expect(audioTool?.spec.exposure).toBe("eager")
        expect(audioTool?.spec.inputSchema).toMatchObject({
            type: "object",
            additionalProperties: false
        })
        expect(audioTool?.spec.inputSchema.properties?.target?.description)
            .toContain("Handle to an AudioUnitBox.")
        expect(audioTool?.spec.inputSchema.properties?.target?.description)
            .toContain("complete handle object")
        expect(audioTool?.spec.inputSchema.required).toEqual([])
        expect(first.get("daw_transport", "play")).toBeDefined()
        expect(first.get("daw_transport", "stop")).toBeDefined()
        expect(first.get("daw_transport", "set_position")).toBeDefined()
        expect(first.get("daw_transport", "sleep")).toBeUndefined()
        expect(first.get("daw_transport", "wake")).toBeUndefined()
        expect(first.get("daw_project", "create_note_event")).toBeUndefined()
        expect(first.get("daw_project", "create_note_events")).toBeUndefined()
        expect(first.get("daw_project", "insert_effect")).toBeUndefined()
        expect(generatedControlManifest.operations.some(operation => operation.id === "project.createNoteEvent")).toBe(true)
        expect(generatedControlManifest.operations.some(operation => operation.id === "project.createNoteEvents")).toBe(true)
        expect(generatedControlManifest.operations.some(operation => operation.id === "project.insertEffect")).toBe(true)
        expect(generatedControlManifest.operations.some(operation => operation.id === "transport.sleep")).toBe(false)
        expect(generatedControlManifest.operations.some(operation => operation.id === "transport.wake")).toBe(false)
        expect(first.get("daw_resources", "inspect_device_help")?.spec.inputSchema.properties?.device)
            .toMatchObject({
                anyOf: expect.arrayContaining([
                    expect.objectContaining({description: expect.stringContaining("Handle to an ApparatDeviceBox.")}),
                    expect.objectContaining({description: expect.stringContaining("Handle to a WerkstattDeviceBox.")})
                ])
            })
        const applyEdit = first.get("daw_project", "apply_edit")
        expect(applyEdit?.spec.exposure).toBe("eager")
        expect(JSON.stringify(applyEdit?.spec.inputSchema).length).toBeLessThan(5000)
        const applyEditSteps = applyEdit?.spec.inputSchema.properties?.steps?.items
        if (applyEditSteps === undefined || applyEditSteps === false) {throw new Error("Missing apply_edit step schema")}
        expect(applyEditSteps).toMatchObject({type: "object", additionalProperties: false})
        expect(applyEditSteps.properties?.arguments).toEqual({})
        const sampleQuery = first.get("daw_resources", "query_samples")?.spec.inputSchema
        expect(sampleQuery?.properties?.origin?.enum).toEqual(["openDAW", "recording", "import"])
        expect(sampleQuery?.properties?.limit?.maximum).toBe(50)
        generated.forEach(tool => allSchemas(tool.inputSchema).forEach(schema => {
            if (schema.type === "object") {expect(schema.additionalProperties).toBe(false)}
        }))
        first.tools.flatMap(tool => allSchemas(tool.inputSchema))
            .filter(schema => schema.properties?.$address?.type === "string")
            .forEach(schema => expect(schema.description).toContain("complete handle object"))
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
        const effect = catalog.get("daw_project", "insert_audio_effect")?.spec.inputSchema
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
        expect(box.description).toBe(
            "Handle to a TrackBox. Pass the complete handle object returned by a tool, e.g. {\"$address\":\"...\"}; do not pass the $address string alone."
        )
        expect(Object.keys(box.properties ?? {})).toEqual(["$address"])

        const parameter = typeSpecToJsonSchema({
            kind: "handle", handle: "parameter", name: "AutomatableParameterFieldAdapter"
        })
        expect(parameter.description).toContain("Handle to an AutomatableParameterFieldAdapter.")
        expect(parameter.description).toContain("complete handle object")

        const constrained = typeSpecToJsonSchema({
            kind: "handle",
            handle: "field",
            name: "Field",
            constraint: "Pointers.NoteEventCollection",
            constraintMembers: ["Pointers.NoteEventCollection"]
        })
        expect(constrained.description).toBe(
            "Field handle accepting Pointers.NoteEventCollection. Pass the complete handle object returned by a tool, e.g. {\"$address\":\"...\"}; do not pass the $address string alone."
        )

        const several = typeSpecToJsonSchema({
            kind: "handle",
            handle: "pointerField",
            name: "PointerField",
            constraint: "EffectPointerType",
            constraintMembers: ["Pointers.AudioEffects", "Pointers.MidiEffects", "Pointers.EffectChain"]
        })
        expect(several.description)
            .toBe("PointerField handle accepting Pointers.AudioEffects, Pointers.MidiEffects, or Pointers.EffectChain. Pass the complete handle object returned by a tool, e.g. {\"$address\":\"...\"}; do not pass the $address string alone.")

        const catalog = new ToolCatalog()
        for (const name of ["create_musical_note_event", "create_musical_note_events"]) {
            const owner = catalog.get("daw_project", name)?.spec.inputSchema.properties?.owner
            expect(owner?.anyOf?.map(schema => schema.description)).toEqual(expect.arrayContaining([
                expect.stringContaining("Handle to a NoteRegionBox."),
                expect.stringContaining("Handle to a NoteClipBox."),
                expect.stringContaining("Handle to a NoteEventCollectionBox.")
            ]))
        }

        const inspectDevice = catalog.get("daw_resources", "inspect_device")?.spec
        expect(inspectDevice?.inputSchema.properties?.device?.anyOf
            ?.map(schema => schema.description)).toContainEqual(expect.stringContaining("Handle to an ApparatDeviceBox."))

        const generatedOperation = generatedControlManifest.operations
            .find(operation => operation.method === "setDeviceProperties")
        expect(generatedOperation).toBeDefined()
        const deviceMutation = catalog.get("daw_project", "set_device_properties")
        expect(deviceMutation?.spec.exposure).toBe("deferred")
        expect(deviceMutation?.spec.inputSchema.properties?.device?.anyOf
            ?.map(schema => schema.description)).toEqual(expect.arrayContaining([
                expect.stringContaining("Handle to an ApparatDeviceBox."),
                expect.stringContaining("Handle to a CubedDeviceBox."),
                expect.stringContaining("Handle to a MIDIOutputDeviceBox."),
                expect.stringContaining("Handle to a NanoDeviceBox."),
                expect.stringContaining("Handle to a NeonDeviceBox."),
                expect.stringContaining("Handle to a PlayfieldDeviceBox."),
                expect.stringContaining("Handle to a SoundfontDeviceBox."),
                expect.stringContaining("Handle to a TapeDeviceBox."),
                expect.stringContaining("Handle to a VaporisateurDeviceBox."),
                expect.stringContaining("Handle to an ArpeggioDeviceBox."),
                expect.stringContaining("Handle to a NeuralAmpDeviceBox."),
                expect.stringContaining("Handle to a WerkstattDeviceBox.")
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
                expect.stringContaining("Handle to a NoteRegionBox."),
                expect.stringContaining("Handle to a NoteClipBox."),
                expect.stringContaining("Handle to a NoteEventCollectionBox.")
            ]))
        expect(region?.description).toContain("eventOwner")
        expect(region?.description).toContain("note-event collection is reused")
        expect(catalog.get("daw_project", "create_note_clip")?.spec.description)
            .toContain("TrackBox of type TrackType.Notes")
        for (const name of ["create_musical_note_event", "create_musical_note_events"]) {
            const description = catalog.get("daw_project", name)?.spec.description?.replace(/\s+/g, " ")
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
                .toContain("Named musical lengths resolved through the active project signature")
            expect(catalog.get("daw_resources", "inspect_timing")?.spec.inputSchema.properties
                ?.positionPulses?.description).toContain("960 pulses")
        } finally {
            project.terminate()
        }
    })

    it("shows exact note timing, same-position alignment, loops, and automation in one pattern view", async () => {
        const {project, controlApi, executor} = createLayer()
        try {
            const createPattern = async (factory: "Neon" | "Vaporisateur", name: string) => {
                const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {factory}))
                const track = handleValue(await run(executor, "daw_project", "create_note_track", {
                    audioUnitBox: handleValue(product.audioUnitBox)
                }))
                const region = handleValue(await run(executor, "daw_project", "create_note_region", {
                    trackBox: track, position: 0, duration: 3840, name
                }))
                return {product, region}
            }
            const kick = await createPattern("Neon", "Kick")
            await run(executor, "daw_project", "create_musical_note_events", {
                owner: kick.region,
                events: [1, 2, 3, 4].map(beat => ({
                    position: {bar: 1, beat}, duration: "sixteenth", pitch: 36
                }))
            })
            const bass = await createPattern("Vaporisateur", "Bass")
            await run(executor, "daw_project", "create_musical_note_events", {
                owner: bass.region,
                events: [1, 2, 3, 4].map(beat => ({
                    position: {bar: 1, beat, sixteenth: 3}, duration: "eighth", pitch: 48
                }))
            })
            const same = await createPattern("Neon", "Same")
            await run(executor, "daw_project", "create_musical_note_events", {
                owner: same.region,
                events: [1, 2, 3, 4].map(beat => ({
                    position: {bar: 1, beat}, duration: "sixteenth", pitch: 60
                }))
            })
            const looped = handleValue(await run(executor, "daw_project", "create_note_region", {
                trackBox: handleValue(kick.product.trackBox),
                position: 3840,
                duration: 4 * 3840,
                loopDuration: 3840,
                name: "Looped"
            }))
            await run(executor, "daw_project", "create_musical_note_events", {
                owner: looped,
                events: [{position: {bar: 1}, duration: "quarter", pitch: 72}]
            })

            const automationProduct = project.editing.modify(() =>
                project.api.createAnyInstrument(InstrumentFactories.Neon)).unwrap("automation instrument")
            const automationTrack = project.editing.modify(() => project.api.createAutomationTrack(
                automationProduct.audioUnitBox,
                automationProduct.audioUnitBox.volume as unknown as Field<Pointers.Automation>
            )).unwrap("automation track")
            const automationRegion = project.editing.modify(() => project.api.createAutomationRegion(
                automationTrack,
                0,
                3840,
                [{position: 0, index: 0, value: 0.2}, {position: 1920, index: 1, value: 0.8}],
                {name: "Volume"}
            )).unwrap("automation region")

            const result = objectValue(await run(executor, "daw_resources", "inspect_patterns", {
                regions: [kick.region, bass.region, same.region, looped,
                    controlApi.resolver.handle(automationRegion)]
            }))
            const regions = arrayValue(result.regions).map(objectValue)
            const times = (region: JsonObject): ReadonlyArray<JsonObject> =>
                arrayValue(region.events).map(event => objectValue(objectValue(event).timelineMusical))
            const kickTimes = times(regions[0])
            expect(kickTimes).toEqual([1, 2, 3, 4].map(beat => ({
                bar: 1, beat, sixteenth: 1, ticks: 0
            })))
            expect(times(regions[1])).toEqual([1, 2, 3, 4].map(beat => ({
                bar: 1, beat, sixteenth: 3, ticks: 0
            })))
            expect(times(regions[2])).toEqual(kickTimes)
            expect(regions[3].eventCount).toBe(4)
            expect(times(regions[3]).map(time => time.bar)).toEqual([2, 3, 4, 5])
            expect(regions[4].kind).toBe("automation")
            const automationValues = arrayValue(regions[4].events).map(event => objectValue(event).value)
            expect(automationValues[0]).toBeCloseTo(0.2, 5)
            expect(automationValues[1]).toBeCloseTo(0.8, 5)
            expect(regions.every(region => region.truncated === false)).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("caps pattern occurrences and keeps note activity tied to sounding events", async () => {
        const {project, controlApi, executor} = createLayer()
        try {
            const product = project.editing.modify(() =>
                project.api.createAnyInstrument(InstrumentFactories.Neon)).unwrap("instrument")
            const track = product.trackBox
            const looped = project.editing.modify(() => project.api.createNoteRegion({
                trackBox: track, position: 0, duration: 8 * 3840, loopDuration: 3840, name: "Looped"
            })).unwrap("looped region")
            project.editing.modify(() => project.api.createNoteEvents(looped, [
                {position: 0, duration: 120, pitch: 36}
            ]))
            const capped = project.editing.modify(() => project.api.createNoteRegion({
                trackBox: track, position: 8 * 3840, duration: 3840, name: "Capped"
            })).unwrap("capped region")
            project.editing.modify(() => project.api.createNoteEvents(capped,
                Array.from({length: 513}, (_, index) => ({position: index, duration: 1, pitch: 60}))))
            const crossing = project.editing.modify(() => project.api.createNoteRegion({
                trackBox: track, position: 11 * 3840, duration: 2 * 3840, name: "Crossing"
            })).unwrap("crossing region")
            project.editing.modify(() => project.api.createNoteEvents(crossing, [
                {position: 3600, duration: 600, pitch: 48}
            ]))

            const patterns = objectValue(await run(executor, "daw_resources", "inspect_patterns", {
                regions: [controlApi.resolver.handle(looped), controlApi.resolver.handle(capped),
                    controlApi.resolver.handle(crossing)]
            }))
            const regions = arrayValue(patterns.regions).map(objectValue)
            expect(regions[0]).toMatchObject({sourceEventCount: 1, eventCount: 8, truncated: false})
            expect(arrayValue(regions[0].events).map(event => objectValue(event).timelineMusical))
                .toHaveLength(8)
            expect(regions[1]).toMatchObject({sourceEventCount: 513, eventCount: 512, truncated: true})
            expect(arrayValue(regions[1].events)).toHaveLength(512)
            expect(regions[2]).toMatchObject({sourceEventCount: 1, eventCount: 1, truncated: false})
            expect(objectValue(arrayValue(regions[2].events)[0]).timelineMusical).toEqual({
                bar: 12, beat: 4, sixteenth: 4, ticks: 0
            })

            const emptyTrack = project.editing.modify(() =>
                project.api.createNoteTrack(product.audioUnitBox)).unwrap("empty track")
            project.editing.modify(() => project.api.createNoteRegion({
                trackBox: emptyTrack, position: 9 * 3840, duration: 64 * 3840, name: "Empty"
            })).unwrap("empty region")
            const sparse = project.editing.modify(() => project.api.createNoteRegion({
                trackBox: track, position: 13 * 3840, duration: 2 * 3840, name: "Sparse"
            })).unwrap("sparse region")
            project.editing.modify(() => project.api.createNoteEvents(sparse, [
                {position: 3840, duration: 120, pitch: 42}
            ]))
            const muted = project.editing.modify(() => project.api.createNoteRegion({
                trackBox: track, position: 15 * 3840, duration: 3840, mute: true, name: "Muted"
            })).unwrap("muted region")
            project.editing.modify(() => project.api.createNoteEvents(muted, [
                {position: 0, duration: 120, pitch: 42}
            ]))
            const arrangement = objectValue(await run(executor, "daw_resources", "inspect_arrangement", {
                target: controlApi.resolver.handle(product.audioUnitBox),
                startPosition: 0,
                endPosition: 16 * 3840
            }))
            const unit = objectValue(arrayValue(arrangement.audioUnits)[0])
            const activity = stringValue(unit.musicalActivity)
            expect(activity.slice(0, 9)).toBe("1".repeat(9))
            expect(activity.slice(9, 11)).toBe("0".repeat(2))
            expect(activity.slice(11, 13)).toBe("1".repeat(2))
            expect(activity[13]).toBe("0")
            expect(activity[14]).toBe("1")
            expect(activity[15]).toBe("0")
            expect(activity[activity.length - 1]).toBe("0")
            const hasEmptyRegion = arrayValue(unit.tracks).some(track => arrayValue(objectValue(track).regions)
                .some(region => stringValue(objectValue(region).label) === "Empty"))
            expect(hasEmptyRegion).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("updates and replaces musical notes through generated edits with one undo step", async () => {
        const {project, controlApi, executor} = createLayer()
        try {
            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Neon"
            }))
            const track = handleValue(await run(executor, "daw_project", "create_note_track", {
                audioUnitBox: handleValue(product.audioUnitBox)
            }))
            const region = handleValue(await run(executor, "daw_project", "create_note_region", {
                trackBox: track, position: 0, duration: 3840
            }))
            const original = handleValue(arrayValue(await run(executor, "daw_project", "create_musical_note_events", {
                owner: region,
                events: [
                    {position: {bar: 1}, duration: "quarter", pitch: 60},
                    {position: {bar: 1, beat: 3}, duration: "quarter", pitch: 64}
                ]
            }))[0])
            const resolveEvent = (handle: JsonObject): NoteEventBox => {
                const event = controlApi.resolver.resolve({kind: "handle", handle: "box", name: "NoteEventBox"}, handle)
                if (!(event instanceof NoteEventBox)) {throw new Error("Missing note event")}
                return event
            }
            const event = resolveEvent(original)
            const boxEditing = project.editing as BoxEditing
            boxEditing.clear()
            await run(executor, "daw_project", "apply_edit", {
                steps: [{
                    id: "move",
                    namespace: "daw_project",
                    tool: "update_musical_note_event",
                    arguments: {event: original, position: {bar: 1, beat: 2}, pitch: 67}
                }]
            })
            expect(event.position.getValue()).toBe(960)
            expect(event.pitch.getValue()).toBe(67)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(event.position.getValue()).toBe(0)
            expect(event.pitch.getValue()).toBe(60)
            expect(project.editing.canUndo()).toBe(false)

            const replacement = objectValue(await run(executor, "daw_project", "apply_edit", {
                steps: [{
                    id: "replace",
                    namespace: "daw_project",
                    tool: "replace_musical_note_events",
                    arguments: {
                        owner: region,
                        events: [{position: {bar: 1, beat: 4}, duration: "half", pitch: 72}]
                    }
                }]
            }))
            const created = arrayValue(objectValue(arrayValue(replacement.results)[0]).value)
            expect(created).toHaveLength(1)
            expect(resolveEvent(handleValue(created[0])).position.getValue()).toBe(2880)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(project.editing.canUndo()).toBe(false)
            expect(event.isAttached()).toBe(true)
            expect(event.position.getValue()).toBe(0)
        } finally {
            project.terminate()
        }
    })

    it("duplicates a timeline region through the generated semantic wrapper", async () => {
        const {project, controlApi, executor} = createLayer()
        try {
            const product = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Neon"
            }))
            const track = handleValue(await run(executor, "daw_project", "create_note_track", {
                audioUnitBox: handleValue(product.audioUnitBox)
            }))
            const region = handleValue(await run(executor, "daw_project", "create_musical_note_region", {
                trackBox: track, position: {bar: 1}, duration: "bar", name: "Source"
            }))
            const duplicate = handleValue(await run(executor, "daw_project", "duplicate_track_region", {
                region, position: {bar: 2}
            }))
            const resolved = controlApi.resolver.resolve({kind: "handle", handle: "box", name: "NoteRegionBox"}, duplicate)
            if (!(resolved instanceof NoteRegionBox)) {throw new Error("Missing duplicated note region")}
            expect(resolved.position.getValue()).toBe(3840)
            expect(resolved.duration.getValue()).toBe(3840)
            expect(resolved.label.getValue()).toBe("Source")
        } finally {
            project.terminate()
        }
    })

    it("composes dependent generated edits through one atomic apply_edit", async () => {
        const {project, executor} = createLayer()
        try {
            const initialAddresses = project.boxGraph.boxes().map(box => box.address.toString())
            const result = objectValue(await run(executor, "daw_project", "apply_edit", {
                steps: [
                    {
                        id: "inst",
                        namespace: "daw_project",
                        tool: "create_any_instrument",
                        arguments: {factory: "Vaporisateur"}
                    },
                    {
                        id: "region",
                        namespace: "daw_project",
                        tool: "create_musical_note_region",
                        arguments: {
                            trackBox: {$result: "inst", path: "trackBox"},
                            position: {bar: 1},
                            duration: "bar",
                            name: "Atomic Region"
                        }
                    },
                    {
                        id: "notes",
                        namespace: "daw_project",
                        tool: "create_musical_note_events",
                        arguments: {
                            owner: {$result: "region"},
                            events: [
                                {position: {bar: 1}, duration: "quarter", pitch: 60},
                                {position: {bar: 1, beat: 3}, duration: "quarter", pitch: 64}
                            ]
                        }
                    }
                ]
            }))
            const entries = arrayValue(result.results).map(objectValue)
            const valueFor = (id: string): JsonValue => {
                const entry = entries.find(candidate => candidate.id === id)
                if (entry === undefined) {throw new Error(`Missing apply_edit result ${id}`)}
                return entry.value
            }
            const product = objectValue(valueFor("inst"))
            expect(Object.keys(handleValue(product.trackBox))).toEqual(["$address"])
            expect(handleValue(valueFor("region")).$address).toEqual(expect.any(String))
            expect(arrayValue(valueFor("notes"))).toHaveLength(2)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(project.boxGraph.boxes().map(box => box.address.toString())).toEqual(initialAddresses)
            expect(project.editing.canUndo()).toBe(false)
        } finally {
            project.terminate()
        }
    })

    it("uses the shared operation bridge for apply_edit parameter targets", async () => {
        const {project, controlApi, executor} = createLayer()
        try {
            const parameter = controlApi.resolver.parameters().find(candidate => candidate.name === "Volume")
            if (parameter === undefined) {throw new Error("Missing Volume parameter")}
            const before = parameter.getValue()
            const target = controlApi.resolver.handle(parameter)
            await run(executor, "daw_project", "apply_edit", {
                steps: [{
                    id: "volume",
                    namespace: "daw_parameter",
                    tool: "set_print_value",
                    arguments: {target, text: "-12"}
                }]
            })
            expect(parameter.getValue()).not.toBe(before)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(parameter.getValue()).toBe(before)
        } finally {
            project.terminate()
        }
    })

    it("keeps apply_edit limited to synchronous editing operations", async () => {
        const {project, executor} = createLayer()
        try {
            const rejected = async (namespace: string, name: string, arguments_: JsonObject,
                                    message: RegExp): Promise<void> => {
                await expect(executor.execute({
                    namespace: "daw_project",
                    name: "apply_edit",
                    arguments: {
                        steps: [{id: "rejected", namespace, tool: name, arguments: arguments_}]
                    }
                }))
                    .resolves.toMatchObject({ok: false, error: expect.stringMatching(message)})
            }
            await rejected("daw_resources", "query_resources", {}, /namespace must be one of/)
            await rejected("daw_analysis", "inspect_audio", {}, /namespace must be one of/)
            await rejected("daw_transport", "play", {}, /namespace must be one of/)
            await rejected("daw_project", "apply_edit", {
                steps: [{
                    id: "nested",
                    namespace: "daw_project",
                    tool: "set_bpm",
                    arguments: {value: 120}
                }]
            }, /cannot contain another apply_edit/)
            await rejected("daw_project", "program_apparat", {}, /asynchronous.*call it separately/)
        } finally {
            project.terminate()
        }
    })

    it("derives finite integer choices from generic parameter mappings", async () => {
        const {project, executor} = createLayer()
        try {
            const neon = objectValue(await run(executor, "daw_project", "create_any_instrument", {
                factory: "Neon"
            }))
            const neonInspection = objectValue(await run(executor, "daw_resources", "inspect_device", {
                device: handleValue(neon.instrumentBox)
            }))
            const modulation = arrayValue(neonInspection.parameters).map(objectValue)
                .find(parameter => parameter.name === "Mod")
            expect(modulation).toMatchObject({
                choices: [
                    {value: 0, printValue: {value: "Off", unit: ""}},
                    {value: 1, printValue: {value: "Ring", unit: ""}},
                    {value: 2, printValue: {value: "Noise", unit: ""}}
                ]
            })

            const velocity = handleValue(await run(executor, "daw_project", "insert_midi_effect", {
                audioUnitBox: handleValue(neon.audioUnitBox), factory: "Velocity", insertIndex: 0
            }))
            const velocityInspection = objectValue(await run(executor, "daw_resources", "inspect_device", {
                device: velocity
            }))
            const seed = arrayValue(velocityInspection.parameters).map(objectValue)
                .find(parameter => parameter.name === "Seed")
            expect(seed).toBeDefined()
            expect(seed).not.toHaveProperty("choices")
        } finally {
            project.terminate()
        }
    })

    it("projects canonical arrangement hierarchy, compressed activity, and drill-down handles", async () => {
        const {project, controlApi, catalog, executor} = createLayer()
        try {
            const first = project.editing.modify(() =>
                project.api.createAnyInstrument(InstrumentFactories.Neon)).unwrap("first instrument")
            const second = project.editing.modify(() =>
                project.api.createAnyInstrument(InstrumentFactories.Vaporisateur)).unwrap("second instrument")
            const firstAutomationTrack = project.editing.modify(() =>
                project.api.createAutomationTrack(first.audioUnitBox,
                    first.audioUnitBox.volume as unknown as Field<Pointers.Automation>))
                .unwrap("first automation track")
            const secondAutomationTrack = project.editing.modify(() =>
                project.api.createAutomationTrack(second.audioUnitBox,
                    second.audioUnitBox.volume as unknown as Field<Pointers.Automation>))
                .unwrap("second automation track")

            const firstRegion = project.editing.modify(() => project.api.createNoteRegion({
                trackBox: first.trackBox,
                position: 0,
                duration: 7680,
                name: "Lead"
            })).unwrap("first note region")
            project.editing.modify(() => project.api.createNoteEvents(firstRegion, [
                {position: 0, duration: 240, pitch: 60, velocity: 0.5},
                {position: 960, duration: 480, pitch: 72, velocity: 0.75},
                {position: 1920, duration: 480, pitch: 72, velocity: 1.0}
            ]))
            project.editing.modify(() => project.api.createNoteRegion({
                trackBox: first.trackBox,
                position: 7680,
                duration: 7680,
                name: "Lead repeat",
                eventOwner: firstRegion
            }))
            const secondRegion = project.editing.modify(() => project.api.createNoteRegion({
                trackBox: second.trackBox,
                position: 15360,
                duration: 7680,
                name: "Bass"
            })).unwrap("second note region")
            project.editing.modify(() => project.api.createNoteEvents(secondRegion, [
                {position: 0, duration: 480, pitch: 36, velocity: 0.8}
            ]))

            project.editing.modify(() => project.api.createAutomationRegion(
                firstAutomationTrack, 0, 7680,
                [{position: 0, index: 0, value: 0.1}, {position: 3840, index: 1, value: 0.8}],
                {name: "Volume ramp"}
            ))
            project.editing.modify(() => project.api.createAutomationRegion(
                secondAutomationTrack, 15360, 7680,
                [{position: 0, index: 0, value: 0.2}, {position: 3840, index: 1, value: 0.9}],
                {name: "Bass volume"}
            ))

            const whole = objectValue(await run(executor, "daw_resources", "inspect_arrangement"))
            expect(whole.resolutionBars).toBe(4)
            expect(arrayValue(whole.density)).toHaveLength(32)
            const wholeUnits = arrayValue(whole.audioUnits).map(objectValue)
            expect(wholeUnits.map(unit => stringValue(handleValue(unit.handle).$address)))
                .toEqual(project.rootBoxAdapter.audioUnits.adapters().map(unit => unit.address.toString()))

            const narrow = objectValue(await run(executor, "daw_resources", "inspect_arrangement", {
                target: controlApi.resolver.handle(first.audioUnitBox),
                startPosition: 0,
                endPosition: 30720
            }))
            expect(narrow.resolutionBars).toBe(1)
            expect(arrayValue(narrow.density)).toEqual([1, 0, 1, 0, 0, 0, 0, 0])
            const unit = objectValue(arrayValue(narrow.audioUnits)[0])
            expect(stringValue(unit.label)).toBe("Neon")
            const tracks = arrayValue(unit.tracks).map(objectValue)
            expect(tracks.map(track => stringValue(track.type))).toEqual(["Notes", "Value"])
            expect(arrayValue(tracks[0].regions).map(region => objectValue(region).startPosition))
                .toEqual([0, 7680])
            expect(arrayValue(tracks[0].regions).map(region => stringValue(objectValue(region).content)))
                .toEqual(["n1", "n1"])
            expect(stringValue(unit.musicalActivity)).toBe("10100000")
            expect(stringValue(unit.automationActivity)).toBe("11000000")

            const contents = arrayValue(narrow.contents).map(objectValue)
            const noteContent = contents.find(content => content.kind === "notes")!
            expect(noteContent).toMatchObject({
                id: "n1",
                noteCount: 3,
                sourceSpanPulses: 2400,
                pitchMin: 60,
                pitchMax: 72,
                uniquePitches: 2,
                averagePitch: 68,
                averageVelocity: 0.75,
                averageDurationPulses: 400
            })
            expect(arrayValue(noteContent.owners)).toHaveLength(2)

            const automationContent = contents.find(content => content.kind === "automation")!
            expect(automationContent).toMatchObject({
                id: "a1",
                eventCount: 2,
                sourceSpanPulses: 3840
            })
            expect(automationContent.minValue).toBeCloseTo(0.1)
            expect(automationContent.maxValue).toBeCloseTo(0.8)
            expect(automationContent.startValue).toBeCloseTo(0.1)
            expect(automationContent.endValue).toBeCloseTo(0.8)

            const eventsHandle = handleValue(noteContent.eventsHandle)
            const eventFieldQuery = objectValue(await run(executor, "daw_resources", "query_resources", {
                kind: "field",
                text: stringValue(eventsHandle.$address),
                limit: 10
            }))
            expect(arrayValue(eventFieldQuery.resources).length).toBeGreaterThan(0)
            const eventInspection = objectValue(await run(executor, "daw_resources", "inspect_resource", {
                handle: eventsHandle
            }))
            const eventField = arrayValue(eventInspection.views).map(objectValue)
                .find(candidate => stringValue(handleValue(candidate.handle).$address) === eventsHandle.$address)
            if (eventField === undefined) {throw new Error("Missing inspected events field")}
            expect(stringValue(handleValue(eventField.handle).$address)).toBe(eventsHandle.$address)
            const incoming = arrayValue(eventField.incomingPointers)
            expect(incoming).toHaveLength(3)
            const exactEvent = objectValue(await run(executor, "daw_resources", "inspect_resource", {
                handle: handleValue(objectValue(incoming[0]).owner)
            }))
            expect(arrayValue(exactEvent.views).map(view => objectValue(view).type)).toContain("NoteEventBox")

            expect(contents.every(content => !Object.hasOwn(content, "events"))).toBe(true)
            expect(JSON.stringify(narrow)).not.toContain('"type":"note-event"')
            expect(JSON.stringify(narrow)).not.toContain('"type":"value-event"')

            const schema = catalog.get("daw_resources", "inspect_arrangement")?.spec.inputSchema
            expect(schema?.properties?.target?.description).toContain("Handle to an AudioUnitBox.")
            expect(schema?.properties?.startPosition?.description).toContain("Semantic type: ppqn")
            expect(schema?.required).toEqual([])
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
            const events = arrayValue(await run(executor, "daw_project", "create_musical_note_events", {
                owner: region, events: [{position: {bar: 1}, duration: "sixteenth", pitch: 36}]
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
            const inspection = objectValue(await run(executor, "daw_resources", "inspect_device", {
                device: target
            }))
            expect(inspection).toMatchObject({
                type: "ApparatDeviceBox",
                category: "instrument",
                groups: []
            })
            const inspectedTone = arrayValue(inspection.parameters).map(objectValue)
                .find(parameter => parameter.name === "Tone")
            expect(inspectedTone).toMatchObject({
                name: "Tone",
                handle: {$address: toneHandle.$address},
                printValue: {value: expect.anything()}
            })
            if (inspectedTone === undefined) {throw new Error("Missing inspected Tone property")}
            const inspectedToneHandle = handleValue(inspectedTone.handle)
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
            await expect(executor.execute({namespace: "daw_project", name: "insert_audio_effect", arguments: {
                audioUnitBox: audioUnit, factory: "Arpeggio"
            }})).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("requires an audio effect factory")
            })
            await expect(executor.execute({namespace: "daw_project", name: "insert_midi_effect", arguments: {
                audioUnitBox: audioUnit, factory: "Delay"
            }})).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("requires a MIDI effect factory")
            })
            const effectFor = async (name: "audioEffects" | "midiEffects", factory: "Werkstatt" | "Spielwerk") =>
                handleValue(await run(executor, "daw_project",
                    name === "audioEffects" ? "insert_audio_effect" : "insert_midi_effect", {
                        audioUnitBox: audioUnit, factory, insertIndex: 0
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
            const events = arrayValue(await run(executor, "daw_project", "create_musical_note_events", {
                owner: region,
                events: [
                    {position: {bar: 1}, duration: "sixteenth", pitch: 42},
                    {position: {bar: 1, beat: 1, sixteenth: 2}, duration: "sixteenth", pitch: 46}
                ]
            }))
            expect(events).toHaveLength(2)

            const effect = handleValue(await run(executor, "daw_project", "insert_audio_effect", {
                audioUnitBox: audioUnit, factory: "Delay", insertIndex: 0
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

            const parameterInspection = objectValue(await run(executor, "daw_resources", "inspect_resource", {
                handle: parameterHandle
            }))
            const parameterField = handleValue(objectValue(arrayValue(parameterInspection.views)
                .find(view => objectValue(view).kind === "parameter")!).field)
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
            expect(paths).not.toContain("envelopes.0.rate1")
            expect(paths).not.toContain("envelopes.5.level8")
            expect(paths).toContain("vibrato.rate")
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

            const envelope = objectValue(await run(executor, "daw_resources", "inspect_device", {
                device: instrument, group: "envelopes.0"
            }))
            expect(envelope.group).toEqual({prefix: "envelopes.0", label: "Line 1 Pitch Envelope"})
            const envelopePaths = arrayValue(envelope.properties).map(objectValue)
                .map(property => stringValue(property.path))
            expect(envelopePaths.length).toBeGreaterThan(0)
            expect(envelopePaths.every(path => path === "envelopes.0"
                || path.startsWith("envelopes.0."))).toBe(true)
            const rate = objectValue(arrayValue(envelope.properties)
                .find(property => objectValue(property).path === "envelopes.0.rate1")!)
            expect(rate).toMatchObject({
                value: 0,
                fieldType: "float32",
                constraints: {min: 0, max: 99, scaling: "linear"},
                automatable: false
            })

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
            const queried = objectValue(await run(executorWithResources, "daw_resources", "query_resources", {
                kind: "box", limit: 10
            }))
            expect(query).toHaveBeenCalled()
            const summary = objectValue(arrayValue(queried.resources)[0])
            expect(summary).not.toHaveProperty("fields")
            expect(summary).not.toHaveProperty("primitiveValues")
            expect(summary).not.toHaveProperty("incomingPointers")
            expect(summary).not.toHaveProperty("outgoingPointers")
            const detail = objectValue(await run(executorWithResources, "daw_resources", "inspect_resource", {
                handle: handleValue(summary.handle)
            }))
            expect(arrayValue(detail.views).some(view => Object.hasOwn(objectValue(view), "fields"))).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("dispatches audio analysis with a master range or one canonical AudioUnit stem", async () => {
        const {project, controlApi, catalog} = createLayer()
        const audio = AudioData.create(48_000, 144_000, 2)
        const render = vi.fn(async () => audio)
        const analysis = new AudioAnalysisTools(project, controlApi.resolver, render)
        const executor = new ToolExecutor(controlApi, catalog, undefined, undefined, undefined, analysis)
        try {
            const master = objectValue(await run(executor, "daw_analysis", "inspect_audio", {
                startMusical: {bar: 1}, endMusical: {bar: 2}
            }))
            expect(master.target).toBe("master")
            expect(render).toHaveBeenLastCalledWith({range: {start: 0, end: 3840}})
            expect(master.requestedDurationSeconds).toBe(2)
            expect(master.renderedDurationSeconds).toBe(3)
            expect(master.tailDurationSeconds).toBe(1)
            expect(master.range).toMatchObject({
                startPosition: 0,
                endPosition: 3840,
                startMusical: {bar: 1, beat: 1, sixteenth: 1, ticks: 0},
                endMusical: {bar: 2, beat: 1, sixteenth: 1, ticks: 0}
            })

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
            const bpmField = controlApi.resolver.handle(project.timelineBox.bpm)
            await expect(executor.execute({namespace: "daw_project", name: "create_note_track", arguments: {
                audioUnitBox: bpmField
            }})).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("field 'bpm' on TimelineBox")
            })
            await expect(executor.execute({namespace: "daw_project", name: "create_automation_track", arguments: {
                audioUnitBox: handleValue(product.audioUnitBox),
                target: handleValue(product.audioUnitBox)
            }})).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("points to box 'AudioUnitBox'")
            })
            await expect(executor.execute({namespace: "daw_parameter", name: "set_value", arguments: {
                target: bpmField, value: 0.5
            }})).resolves.toMatchObject({
                ok: false,
                error: expect.stringContaining("ordinary field 'bpm' on TimelineBox")
            })
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
