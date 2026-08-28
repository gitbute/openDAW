import {describe, expect, it} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {generatedControlManifest} from "./generated"
import type {ControlApi} from "./ControlApi"
import type {
    ControlFieldInspection,
    ControlHandle,
    ControlInspection,
    JsonObject,
    JsonValue,
    ResourceDescription
} from "./types"
import type {Project} from "../project/Project"
import type {ProjectEnv} from "../project/ProjectEnv"

// jsdom lacks the Web Audio worklet globals that EngineWorklet extends at module-eval time.
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

const createProject = async (): Promise<{project: Project, api: ControlApi}> => {
    const {Project} = await import("../project/Project")
    const {ControlApi} = await import("./ControlApi")
    const project = Project.fromSkeleton(createEnv(), ProjectSkeleton.empty({
        createDefaultUser: true, createOutputMaximizer: false
    }))
    return {project, api: new ControlApi(project)}
}

const call = (api: ControlApi, operation: string, args: JsonObject = {}, target?: ControlHandle): JsonValue =>
    target === undefined
        ? api.call({operation, arguments: args})
        : api.call({operation, arguments: args, target})

const asObject = (value: JsonValue): JsonObject => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Expected a JSON object")
    }
    return value as JsonObject
}

const asHandle = (value: JsonValue): ControlHandle => {
    const object = asObject(value)
    if (typeof object.$type !== "string" || typeof object.$address !== "string") {
        throw new Error("Expected a control handle")
    }
    return {$type: object.$type, $address: object.$address}
}

const resource = (resources: ReadonlyArray<ResourceDescription>, predicate: (resource: ResourceDescription) => boolean): ResourceDescription => {
    const result = resources.find(predicate)
    if (result === undefined) {throw new Error("Expected control resource")}
    return result
}

const inspectedField = (inspection: ControlInspection, name: string): ControlFieldInspection => {
    const result = inspection.fields?.find(field => field.name === name)
    if (result === undefined) {throw new Error(`Expected inspected field ${name}`)}
    return result
}

const operation = (id: string) => {
    const result = generatedControlManifest.operations.find(operation => operation.id === id)
    if (result === undefined) {throw new Error(`Missing generated operation ${id}`)}
    return result
}

describe("ControlApi", () => {
    it("chains created instrument handles through track, region, and note-event creation", async () => {
        const {project, api} = await createProject()
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Vaporisateur"}))
            const audioUnit = asHandle(product.audioUnitBox)
            const instrument = asHandle(product.instrumentBox)
            const instrumentResource = resource(api.find("box", instrument.$address), entry =>
                entry.handle.$address === instrument.$address)
            expect(instrumentResource.label).toBeDefined()
            expect(instrumentResource.context?.box.$type).toBe(instrument.$type)

            const track = asHandle(call(api, "project.createNoteTrack", {audioUnitBox: audioUnit}))
            const region = asHandle(call(api, "project.createNoteRegion", {
                arg0: {trackBox: track, position: 0, duration: 960, name: "Agent Region"}
            }))
            const events = resource(api.find("pointerField", region.$address), entry =>
                entry.name === "events" && entry.context?.box.$address === region.$address)
            const event = asHandle(call(api, "project.createNoteEvent", {
                arg0: {
                    owner: {events: events.handle},
                    position: 0,
                    duration: 240,
                    pitch: 60
                }
            }))
            const noteAdapter = resource(api.find("adapter", event.$address), entry =>
                entry.type === "NoteEventBoxAdapter" && entry.context?.box.$address === event.$address)
            expect(api.inspect(noteAdapter.handle)).toMatchObject({
                kind: "adapter",
                type: "NoteEventBoxAdapter",
                box: event
            })
            const duplicate = call(api, "project.duplicateNotes", {notes: [noteAdapter.handle]})

            expect(api.find("box", track.$address).some(entry => entry.type === "TrackBox")).toBe(true)
            expect(api.find("box", region.$address).some(entry => entry.type === "NoteRegionBox")).toBe(true)
            expect(api.find("box", event.$address).some(entry => entry.type === "NoteEventBox")).toBe(true)
            expect(Array.isArray(duplicate)).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("sets an arbitrary registered parameter through its print API and undoes one call", async () => {
        const {project, api} = await createProject()
        try {
            const volume = resource(api.find("parameter", "Volume"), entry => entry.name === "Volume")
            expect(volume.field).toBeDefined()
            if (volume.field === undefined) {throw new Error("Parameter field is missing")}
            expect(() => api.set(volume.field, -12)).toThrow(/parameter API/)
            const before = call(api, "parameter.getValue", {}, volume.handle)
            expect(project.editing.canUndo()).toBe(false)

            call(api, "parameter.setPrintValue", {text: "-12"}, volume.handle)
            expect(call(api, "parameter.getValue", {}, volume.handle)).not.toBe(before)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(call(api, "parameter.getValue", {}, volume.handle)).toBe(before)
            expect(project.editing.canUndo()).toBe(false)
        } finally {
            project.terminate()
        }
    })

    it("discovers a field and inserts an effect through the generic factory operation", async () => {
        const {project, api} = await createProject()
        try {
            const field = resource(api.find("field", "audioEffects"), entry =>
                entry.name === "audioEffects" && entry.context?.boxType === "AudioUnitBox")
            const effect = asHandle(call(api, "project.insertEffect", {
                field: field.handle,
                factory: "Delay",
                insertIndex: 0
            }))
            expect(api.find("box", effect.$address).some(entry => entry.type === "DelayDeviceBox")).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("uses a discovered parameter field as both an automation and modulation target", async () => {
        const {project, api} = await createProject()
        try {
            const volume = resource(api.find("parameter", "Volume"), entry => entry.name === "Volume")
            const audioUnit = volume.context?.box
            if (volume.field === undefined || audioUnit === undefined) {throw new Error("Parameter context is incomplete")}

            const automationTrack = asHandle(call(api, "project.createAutomationTrack", {
                audioUnitBox: audioUnit,
                target: volume.field
            }))
            const lfo = asHandle(call(api, "project.modulation.createLfo", {label: "Agent LFO"}))
            const modulation = asHandle(call(api, "project.modulation.assign", {
                modulator: lfo,
                target: volume.field,
                depth: 0.25
            }))

            expect(api.find("box", automationTrack.$address).some(entry => entry.type === "TrackBox")).toBe(true)
            expect(api.find("box", modulation.$address).some(entry => entry.type === "ModulationBox")).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("rejects a handle with the wrong resource kind", async () => {
        const {project, api} = await createProject()
        try {
            const volume = resource(api.find("parameter", "Volume"), entry => entry.name === "Volume")
            const owner = volume.context?.box
            const field = volume.field
            if (field === undefined || owner === undefined) {throw new Error("Parameter context is incomplete")}
            expect(() => call(api, "project.createNoteTrack", {audioUnitBox: field}))
                .toThrow(/AudioUnitBox|box/)
            expect(() => call(api, "parameter.getValue", {}, owner))
                .toThrow(/parameter|field/i)
        } finally {
            project.terminate()
        }
    })

    it("supports a snapshot-driven inspect, set, and one-step batch workflow", async () => {
        const {project, api} = await createProject()
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Vaporisateur"}))
            const audioUnit = asHandle(product.audioUnitBox)
            const track = asHandle(call(api, "project.createNoteTrack", {audioUnitBox: audioUnit}))
            const region = asHandle(call(api, "project.createNoteRegion", {
                arg0: {trackBox: track, position: 0, duration: 1920, name: "Snapshot Region"}
            }))
            const events = resource(api.find("pointerField", region.$address), entry =>
                entry.name === "events" && entry.context?.box.$address === region.$address)
            for (const [position, pitch] of [[0, 60], [480, 64], [960, 67]]) {
                call(api, "project.createNoteEvent", {
                    arg0: {
                        owner: {events: events.handle},
                        position,
                        duration: 240,
                        pitch
                    }
                })
            }
            const effectField = resource(api.find("field", "audioEffects"), entry =>
                entry.name === "audioEffects" && entry.context?.box.$address === audioUnit.$address)
            call(api, "project.insertEffect", {field: effectField.handle, factory: "Delay", insertIndex: 0})
            const cutoff = resource(api.find("parameter", "Flt. Cutoff"), entry => entry.name === "Flt. Cutoff")
            call(api, "parameter.setPrintValue", {text: "840 Hz"}, cutoff.handle)

            // The consumer-facing part starts here. Setup handles above are not used after snapshot().
            const snapshot = api.snapshot()
            expect(() => JSON.stringify(snapshot)).not.toThrow()

            const snapshotInstrument = snapshot.boxes.find(box => box.type === "VaporisateurDeviceBox")
            const snapshotTrack = snapshot.boxes.find(box => box.type === "TrackBox")
            const snapshotRegion = snapshot.boxes.find(box => box.type === "NoteRegionBox")
            const snapshotEffect = snapshot.boxes.find(box => box.type === "DelayDeviceBox")
            const snapshotCutoff = snapshot.parameters.find(parameter => parameter.name === "Flt. Cutoff")
            if (snapshotInstrument === undefined || snapshotTrack === undefined || snapshotRegion === undefined
                || snapshotEffect === undefined || snapshotCutoff === undefined) {
                throw new Error("Snapshot is missing the seeded song resources")
            }
            expect(snapshotInstrument.context?.boxType).toBe("VaporisateurDeviceBox")
            expect(snapshotTrack.handle.$type).toBe("TrackBox")
            expect(snapshotCutoff.rawValue).toBeDefined()
            expect(snapshotCutoff.printValue).toMatchObject({value: "840", unit: "Hz"})

            const regionInspection = api.inspect(snapshotRegion.handle)
            const eventsField = inspectedField(regionInspection, "events")
            const eventCollection = eventsField.target
            if (eventCollection === undefined || eventCollection === null) {
                throw new Error("Snapshot region does not point to an event collection")
            }
            const eventCollectionOwner = api.inspect(eventCollection).context?.box.$address
            if (eventCollectionOwner === undefined) {throw new Error("Event collection owner is missing")}
            const noteInspections = snapshot.boxes
                .filter(box => box.type === "NoteEventBox")
                .map(box => api.inspect(box.handle))
                .filter(note => {
                    const target = inspectedField(note, "events").target
                    return target !== undefined && target !== null
                        && api.inspect(target).context?.box.$address === eventCollectionOwner
                })
            expect(noteInspections).toHaveLength(3)
            expect(noteInspections.map(note => inspectedField(note, "pitch").value))
                .toEqual(expect.arrayContaining([60, 64, 67]))
            const firstNote = noteInspections.find(note => inspectedField(note, "pitch").value === 60)
            if (firstNote === undefined) {throw new Error("Snapshot is missing the first seeded note")}
            const secondNote = noteInspections.find(note => inspectedField(note, "pitch").value === 64)
            if (secondNote === undefined) {throw new Error("Snapshot is missing the second seeded note")}
            expect(inspectedField(firstNote, "position").value).toBe(0)
            expect(inspectedField(firstNote, "duration").value).toBe(240)

            const firstPitch = inspectedField(firstNote, "pitch")
            const secondPitch = inspectedField(secondNote, "pitch")
            api.set(firstPitch.handle, 62)
            expect(inspectedField(api.inspect(firstNote.handle), "pitch").value).toBe(62)

            const discoveredCutoff = resource(api.find("parameter", "Flt. Cutoff"), entry => entry.name === "Flt. Cutoff")
            expect(discoveredCutoff.handle).toEqual(snapshotCutoff.handle)
            call(api, "parameter.setPrintValue", {text: "1200 Hz"}, discoveredCutoff.handle)
            expect(api.inspect(discoveredCutoff.handle).printValue).toMatchObject({value: "1200", unit: "Hz"})

            const batch = api.batch([
                {handle: secondPitch.handle, value: 65},
                {operation: "project.createNoteEvent", arguments: {
                    arg0: {owner: {events: eventsField.handle}, position: 1200, duration: 240, pitch: 69}
                }},
                {operation: "project.createNoteEvent", arguments: {
                    arg0: {owner: {events: eventsField.handle}, position: 1440, duration: 240, pitch: 72}
                }},
                {operation: "project.createNoteEvent", arguments: {
                    arg0: {owner: {events: eventsField.handle}, position: 1680, duration: 240, pitch: 76}
                }}
            ])
            expect(batch).toHaveLength(4)
            expect(inspectedField(api.inspect(secondNote.handle), "pitch").value).toBe(65)
            expect(api.snapshot({parameters: false}).boxes.filter(box => box.type === "NoteEventBox"))
                .toHaveLength(6)

            expect(project.editing.undo()).toBe(true)
            expect(inspectedField(api.inspect(secondNote.handle), "pitch").value).toBe(64)
            expect(api.snapshot({parameters: false}).boxes.filter(box => box.type === "NoteEventBox"))
                .toHaveLength(3)
            expect(api.inspect(discoveredCutoff.handle).printValue).toMatchObject({value: "1200", unit: "Hz"})
        } finally {
            project.terminate()
        }
    })
})

describe("generated control metadata", () => {
    it("keeps semantic numbers, field constraints, and imperative engine methods", () => {
        const ids = generatedControlManifest.operations.map(operation => operation.id)
        expect(ids).toEqual(expect.arrayContaining([
            "transport.ignoreNoteRegion",
            "transport.suspendAutomation",
            "transport.scheduleClipPlay",
            "transport.scheduleClipStop"
        ]))
        expect(operation("transport.setPosition").parameters[0].type)
            .toMatchObject({kind: "primitive", type: "number", semantic: "ppqn"})
        expect(operation("project.modulation.assign").parameters[2].type)
            .toMatchObject({kind: "primitive", type: "number", semantic: "unitValue"})
        expect(operation("project.insertEffect").parameters[0].type)
            .toMatchObject({kind: "handle", handle: "field", constraint: "EffectPointerType"})
        expect(operation("transport.scheduleClipPlay").parameters[0].type)
            .toEqual({kind: "array", element: {kind: "uuid"}})
    })
})
