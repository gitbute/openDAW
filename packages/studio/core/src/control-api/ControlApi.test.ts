import {describe, expect, it} from "vitest"
import {Field} from "@opendaw/lib-box"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {NoteRegionBox} from "@opendaw/studio-boxes"
import {ControlApi} from "./ControlApi"
import {decodeType} from "./codec"
import {generatedControlManifest} from "./generated"
import type {ControlHandle, JsonObject, JsonValue, OperationDescriptor} from "./types"
import {Project} from "../project/Project"
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
    if (typeof object.$address !== "string") {throw new Error("Expected a control handle")}
    return {$address: object.$address}
}

const asHandles = (value: JsonValue): ReadonlyArray<ControlHandle> => {
    if (!Array.isArray(value)) {throw new Error("Expected an array of control handles")}
    return value.map(asHandle)
}

const operation = (id: string): OperationDescriptor => {
    const result = generatedControlManifest.operations.find(candidate => candidate.id === id)
    if (result === undefined) {throw new Error(`Missing generated operation ${id}`)}
    return result
}

const fieldOf = (api: ControlApi, box: ControlHandle, name: string): Field => {
    const result = api.resolver.fields().find(field =>
        field.box.address.toString() === box.$address && field.fieldName === name)
    if (result === undefined) {throw new Error(`Missing field ${name}`)}
    return result
}

const parameterOf = (api: ControlApi, name: string) => {
    const result = api.resolver.parameters().find(parameter => parameter.name === name)
    if (result === undefined) {throw new Error(`Missing parameter ${name}`)}
    return result
}

describe("ControlApi", () => {
    it("invokes ProjectApi end-to-end and chains returned handles", async () => {
        const {project, api} = await createProject()
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Vaporisateur"}))
            const audioUnit = asHandle(product.audioUnitBox)
            const instrument = asHandle(product.instrumentBox)
            expect(Object.keys(asObject(product.audioUnitBox))).toEqual(["$address"])

            const track = asHandle(call(api, "project.createNoteTrack", {audioUnitBox: audioUnit}))
            const region = asHandle(call(api, "project.createNoteRegion", {
                trackBox: track, position: 0, duration: 960, name: "Agent Region"
            }))
            const event = asHandle(call(api, "project.createNoteEvent", {
                owner: region,
                position: 0,
                duration: 240,
                pitch: 60
            }))
            const regionEvents = asHandles(call(api, "project.createNoteEvents", {
                owner: region,
                events: [
                    {position: 240, duration: 120, pitch: 64},
                    {position: 480, duration: 120, pitch: 67}
                ]
            }))
            const clip = asHandle(call(api, "project.createNoteClip", {
                trackBox: track, clipIndex: 0
            }))
            const clipEvents = asHandles(call(api, "project.createNoteEvents", {
                owner: clip,
                events: [{position: 0, duration: 120, pitch: 72}]
            }))
            const regionBox = api.resolver.boxes()
                .find(box => box.address.toString() === region.$address)
            if (!(regionBox instanceof NoteRegionBox)) {throw new Error("Missing note region")}
            const collection = regionBox.events.targetVertex.unwrap("Missing event collection").box
            const collectionEvents = asHandles(call(api, "project.createNoteEvents", {
                owner: api.resolver.handle(collection),
                events: [{position: 0, duration: 120, pitch: 36}]
            }))
            const noteAdapter = api.resolver.adapters().find(adapter =>
                adapter.box.address.toString() === event.$address && adapter.constructor.name === "NoteEventBoxAdapter")
            if (noteAdapter === undefined) {throw new Error("Missing note adapter")}
            const duplicate = call(api, "project.duplicateNotes", {
                notes: [api.resolver.handle(noteAdapter)]
            })

            expect(instrument.$address).not.toBe(audioUnit.$address)
            expect(api.resolver.boxes().some(box => box.address.toString() === track.$address
                && box.name === "TrackBox")).toBe(true)
            expect(api.resolver.boxes().some(box => box.address.toString() === region.$address
                && box.name === "NoteRegionBox")).toBe(true)
            expect(api.resolver.boxes().some(box => box.address.toString() === event.$address
                && box.name === "NoteEventBox")).toBe(true)
            expect(regionEvents).toHaveLength(2)
            expect(clipEvents).toHaveLength(1)
            expect(collectionEvents).toHaveLength(1)
            expect(Array.isArray(duplicate)).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("invokes an arbitrary registered parameter through its canonical adapter and undoes one call", async () => {
        const {project, api} = await createProject()
        try {
            const parameter = parameterOf(api, "Volume")
            const handle = api.resolver.handle(parameter)
            const before = call(api, "parameter.getValue", {}, handle)
            expect(project.editing.canUndo()).toBe(false)

            call(api, "parameter.setPrintValue", {text: "-12"}, handle)
            expect(call(api, "parameter.getValue", {}, handle)).not.toBe(before)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(call(api, "parameter.getValue", {}, handle)).toBe(before)
            expect(project.editing.canUndo()).toBe(false)
        } finally {
            project.terminate()
        }
    })

    it("discovers a canonical field and inserts an effect", async () => {
        const {project, api} = await createProject()
        try {
            const audioUnit = api.resolver.handle(project.primaryAudioUnitBox)
            const field = fieldOf(api, audioUnit, "audioEffects")
            const effect = asHandle(call(api, "project.insertEffect", {
                field: api.resolver.handle(field),
                factory: "Delay",
                insertIndex: 0
            }))
            expect(api.resolver.boxes().some(box => box.address.toString() === effect.$address
                && box.name === "DelayDeviceBox")).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("uses a canonical parameter field as an automation and modulation target", async () => {
        const {project, api} = await createProject()
        try {
            const parameter = parameterOf(api, "Volume")
            const field = api.resolver.handle(parameter.field)
            const audioUnit = api.resolver.handle(parameter.field.box)
            const automationTrack = asHandle(call(api, "project.createAutomationTrack", {
                audioUnitBox: audioUnit,
                target: field
            }))
            const lfo = asHandle(call(api, "project.modulation.createLfo", {label: "Agent LFO"}))
            const modulation = asHandle(call(api, "project.modulation.assign", {
                modulator: lfo,
                target: field,
                depth: 0.25
            }))

            expect(api.resolver.boxes().some(box => box.address.toString() === automationTrack.$address
                && box.name === "TrackBox")).toBe(true)
            expect(api.resolver.boxes().some(box => box.address.toString() === modulation.$address
                && box.name === "ModulationBox")).toBe(true)
        } finally {
            project.terminate()
        }
    })

    it("rejects wrong addresses and wrong runtime types", async () => {
        const {project, api} = await createProject()
        try {
            const field = api.resolver.fields()[0]
            const fieldHandle = api.resolver.handle(field)
            expect(() => call(api, "project.createNoteTrack", {audioUnitBox: fieldHandle}))
                .toThrow(/box|AudioUnitBox/)

            const track = api.resolver.handle(project.timelineBox)
            expect(() => call(api, "project.createNoteTrack", {audioUnitBox: track}))
                .toThrow(/AudioUnitBox|TimelineBox/)

            const missing = {$address: `${UUID.toString(UUID.generate())}/1`}
            expect(() => call(api, "project.createNoteTrack", {audioUnitBox: missing}))
                .toThrow(/No box|box/)
        } finally {
            project.terminate()
        }
    })

    it("rejects unknown arguments", async () => {
        const {project, api} = await createProject()
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Vaporisateur"}))
            const track = asHandle(call(api, "project.createNoteTrack", {
                audioUnitBox: asHandle(product.audioUnitBox)
            }))
            const region = asHandle(call(api, "project.createNoteRegion", {
                trackBox: track, position: 0, duration: 960
            }))
            expect(() => call(api, "project.createNoteEvent", {
                owner: region, ignored: true, position: 0, duration: 240, pitch: 60
            })).toThrow(/Unknown argument 'ignored'/)
        } finally {
            project.terminate()
        }
    })

    it("fails closed for unknown pointer constraints", async () => {
        const {project, api} = await createProject()
        try {
            const field = api.resolver.fields()[0]
            expect(() => decodeType({
                kind: "handle", handle: "field", name: "Field", constraint: "Unknown.PointerType"
            }, api.resolver.handle(field), api.resolver)).toThrow(/Unknown.PointerType/)
        } finally {
            project.terminate()
        }
    })

    it("supports async invocation without holding a graph transaction across await", async () => {
        const {project, api} = await createProject()
        try {
            expect(project.boxGraph.inTransaction()).toBe(false)
            await api.callAsync({operation: "transport.isReady"})
            expect(project.boxGraph.inTransaction()).toBe(false)
        } finally {
            project.terminate()
        }
    })

    it("uses one undo step for a batch and one step for a single mutation", async () => {
        const {project, api} = await createProject()
        try {
            const initial = project.timelineBox.bpm.getValue()
            call(api, "project.setBpm", {value: initial + 1})
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(project.editing.canUndo()).toBe(false)

            api.batch([
                {operation: "project.setBpm", arguments: {value: initial + 2}},
                {operation: "project.setBpm", arguments: {value: initial + 3}}
            ])
            expect(project.timelineBox.bpm.getValue()).toBe(initial + 3)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(project.timelineBox.bpm.getValue()).toBe(initial)
            expect(project.editing.canUndo()).toBe(false)
        } finally {
            project.terminate()
        }
    })
})

describe("generated Slice 1 manifest", () => {
    it("keeps semantic aliases, pointer constraints, imperative methods, and explicit reports", () => {
        const ids = generatedControlManifest.operations.map(candidate => candidate.id)
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
        expect(Object.keys(generatedControlManifest.operations).some(id => id.includes("resources"))).toBe(false)
        expect(JSON.stringify(generatedControlManifest)).not.toMatch(/\b(?:arg|param)\d+\b/)
        expect(generatedControlManifest.skipped.length + generatedControlManifest.unsupported.length).toBeGreaterThan(0)

        const createRegion = operation("project.createNoteRegion")
        expect(createRegion.parameters[0].name).toBeUndefined()
        expect(createRegion.parameters[0].binding).toMatchObject({
            kind: "object",
            properties: expect.arrayContaining([
                expect.objectContaining({name: "trackBox"}),
                expect.objectContaining({name: "position"}),
                expect.objectContaining({name: "duration"})
            ])
        })
    })
})
