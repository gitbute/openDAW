import {describe, expect, it} from "vitest"
import {Field} from "@opendaw/lib-box"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {
    ApparatDeviceBox,
    AudioFileBox,
    NoteClipBox,
    ValueEventBox,
    ValueEventCollectionBox,
    ValueRegionBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    WerkstattParameterBox,
    WerkstattSampleBox
} from "@opendaw/studio-boxes"
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

const createProject = async (audioWorklets?: ProjectEnv["audioWorklets"]): Promise<{project: Project, api: ControlApi}> => {
    const project = Project.fromSkeleton(createEnv(audioWorklets), ProjectSkeleton.empty({
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

    it("reuses semantic note owners when creating note regions", async () => {
        const {project, api} = await createProject()
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Vaporisateur"}))
            const track = asHandle(call(api, "project.createNoteTrack", {
                audioUnitBox: asHandle(product.audioUnitBox)
            }))
            const freshRegion = asHandle(call(api, "project.createNoteRegion", {
                trackBox: track, position: 0, duration: 960
            }))
            const freshRegionBox = api.resolver.boxes()
                .find(box => box.address.toString() === freshRegion.$address)
            if (!(freshRegionBox instanceof NoteRegionBox)) {throw new Error("Missing fresh note region")}
            const freshCollection = freshRegionBox.events.targetVertex.unwrap("Missing fresh collection").box
            expect(freshCollection).toBeInstanceOf(NoteEventCollectionBox)

            const clip = asHandle(call(api, "project.createNoteClip", {
                trackBox: track, clipIndex: 0
            }))
            const clipBox = api.resolver.boxes().find(box => box.address.toString() === clip.$address)
            if (!(clipBox instanceof NoteClipBox)) {throw new Error("Missing note clip")}
            const clipCollection = clipBox.events.targetVertex.unwrap("Missing clip collection").box

            const fromClip = asHandle(call(api, "project.createNoteRegion", {
                trackBox: track, position: 960, duration: 480, eventOwner: clip
            }))
            const fromRegion = asHandle(call(api, "project.createNoteRegion", {
                trackBox: track, position: 1440, duration: 480, eventOwner: freshRegion
            }))
            const fromCollection = asHandle(call(api, "project.createNoteRegion", {
                trackBox: track, position: 1920, duration: 480,
                eventOwner: api.resolver.handle(freshCollection)
            }))
            const collectionOf = (handle: ControlHandle): NoteEventCollectionBox => {
                const box = api.resolver.boxes().find(candidate => candidate.address.toString() === handle.$address)
                if (!(box instanceof NoteRegionBox)) {throw new Error("Expected a note region")}
                const collection = box.events.targetVertex.unwrap("Missing note collection").box
                if (!(collection instanceof NoteEventCollectionBox)) {throw new Error("Expected a note collection")}
                return collection
            }

            expect(collectionOf(freshRegion)).not.toBe(clipCollection)
            expect(collectionOf(fromClip)).toBe(clipCollection)
            expect(collectionOf(fromRegion)).toBe(freshCollection)
            expect(collectionOf(fromCollection)).toBe(freshCollection)
            expect(asHandles(call(api, "project.createNoteEvents", {
                owner: fromRegion,
                events: [{position: 0, duration: 120, pitch: 36}]
            }))).toHaveLength(1)
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

    it("uses canonical value-event creation, reuses seeds, and rejects update collisions", async () => {
        const {project, api} = await createProject()
        try {
            const parameter = parameterOf(api, "Volume")
            const audioUnit = api.resolver.handle(parameter.field.box)
            const target = api.resolver.handle(parameter.field)
            const track = asHandle(call(api, "project.createAutomationTrack", {
                audioUnitBox: audioUnit, target
            }))
            const region = asHandle(call(api, "project.createTrackRegion", {
                trackBox: track, position: 0, duration: 960
            }))
            const regionBox = api.resolver.boxes()
                .find(box => box.address.toString() === region.$address)
            if (!(regionBox instanceof ValueRegionBox)) {throw new Error("Missing value region")}
            const collection = regionBox.events.targetVertex.unwrap("Missing value collection").box
            if (!(collection instanceof ValueEventCollectionBox)) {throw new Error("Missing value collection")}
            const collectionHandle = api.resolver.handle(regionBox.events)
            const eventInput: ReadonlyArray<JsonObject> = [
                {position: 0, index: 0, value: 0.8, interpolation: "linear"},
                {position: 240, index: 0, value: 0.5},
                {position: 240, index: 1, value: 0.6},
                {position: 480, index: 0, value: 0.3}
            ]

            const created = asHandles(call(api, "project.createValueEvents", {
                collection: collectionHandle, events: eventInput
            }))
            const valueEvents = (): ReadonlyArray<ValueEventBox> => collection.events.pointerHub.incoming()
                .map(({box}) => box).filter((box): box is ValueEventBox => box instanceof ValueEventBox)
            const pairs = (): ReadonlyArray<string> => valueEvents()
                .map(event => `${event.position.getValue()}:${event.index.getValue()}`)

            expect(created).toHaveLength(eventInput.length)
            expect(valueEvents()).toHaveLength(4)
            expect(pairs()).toEqual(expect.arrayContaining(["0:0", "240:0", "240:1", "480:0"]))

            const seed = valueEvents().find(event => event.position.getValue() === 0 && event.index.getValue() === 0)
            if (seed === undefined) {throw new Error("Missing automation seed")}
            const seedAddress = seed.address.toString()
            asHandles(call(api, "project.createValueEvents", {
                collection: collectionHandle,
                events: [{position: 0, index: 0, value: 0.2}]
            }))
            expect(valueEvents()).toHaveLength(4)
            expect(valueEvents().find(event => event.position.getValue() === 0 && event.index.getValue() === 0)?.address.toString())
                .toBe(seedAddress)
            expect(seed.value.getValue()).toBeCloseTo(0.2)

            const first = valueEvents().find(event => event.position.getValue() === 240 && event.index.getValue() === 0)
            const second = valueEvents().find(event => event.position.getValue() === 240 && event.index.getValue() === 1)
            if (first === undefined || second === undefined) {throw new Error("Missing same-position value events")}
            expect(() => call(api, "project.updateValueEvent", {
                event: api.resolver.handle(first), position: 240, index: 1
            })).toThrow(/another event already occupies that canonical position\/index/)
            expect(first.position.getValue()).toBe(240)
            expect(first.index.getValue()).toBe(0)
            expect(second.index.getValue()).toBe(1)

            call(api, "project.replaceValueEvents", {
                collection: collectionHandle,
                events: [
                    {position: 0, index: 0, value: 0.4},
                    {position: 120, index: 0, value: 0.7},
                    {position: 120, index: 1, value: 0.9}
                ]
            })
            expect(valueEvents()).toHaveLength(3)
            expect(pairs()).toEqual(expect.arrayContaining(["0:0", "120:0", "120:1"]))
        } finally {
            project.terminate()
        }
    })

    it("creates a timeline automation region with local events through the semantic operation", async () => {
        const {project, api} = await createProject()
        try {
            const parameter = parameterOf(api, "Volume")
            const track = asHandle(call(api, "project.createAutomationTrack", {
                audioUnitBox: api.resolver.handle(parameter.field.box),
                target: api.resolver.handle(parameter.field)
            }))
            const region = asHandle(call(api, "project.createAutomationRegion", {
                trackBox: track,
                position: 0,
                duration: 960,
                events: [
                    {position: 0, index: 0, value: 0.25},
                    {position: 480, index: 0, value: 0.75}
                ]
            }))
            const regionBox = api.resolver.boxes()
                .find(box => box.address.toString() === region.$address)
            if (!(regionBox instanceof ValueRegionBox)) {throw new Error("Missing semantic value region")}
            const collection = regionBox.events.targetVertex.unwrap("Missing semantic value collection").box
            if (!(collection instanceof ValueEventCollectionBox)) {throw new Error("Missing semantic value collection")}
            const events = collection.events.pointerHub.incoming()
                .map(({box}) => box).filter((box): box is ValueEventBox => box instanceof ValueEventBox)
            expect(events).toHaveLength(2)
            expect(events.map(event => `${event.position.getValue()}:${event.index.getValue()}`))
                .toEqual(expect.arrayContaining(["0:0", "480:0"]))
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

    it("gives handle unions a useful complete-object error for bare addresses", async () => {
        const {project, api} = await createProject()
        try {
            expect(() => call(api, "project.createNoteEvent", {
                owner: "not-a-complete-handle",
                position: 0,
                duration: 120,
                pitch: 60
            })).toThrow("[ControlApi] Handle must be an object containing string $address; pass the complete returned handle object, not the address string alone.")
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

    it("waits for Apparat compilation and reads back only user source", async () => {
        let blockRegistration = true
        let releaseRegistration!: () => void
        const addModule = () => blockRegistration
            ? new Promise<void>(resolve => {releaseRegistration = resolve})
            : Promise.resolve()
        const {project, api} = await createProject(createAudioWorklets(addModule))
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Apparat"}))
            const target = asHandle(product.instrumentBox)
            const apparat = api.resolver.resolve({kind: "handle", handle: "box", name: "ApparatDeviceBox"}, target)
            if (!(apparat instanceof ApparatDeviceBox)) {throw new Error("Missing Apparat box")}
            const source = "// @label Agent Apparat\nclass Processor {\n"
                + "    noteOn(pitch, velocity, cent, id) {}\n"
                + "    noteOff(id) {}\n"
                + "    reset() {}\n"
                + "    process(output, block) {}\n"
                + "}"
            let settled = false
            const pending = api.callAsync({operation: "project.programApparat", arguments: {target, source}})
                .then(value => {settled = true; return value})
            await Promise.resolve()
            expect(settled).toBe(false)
            expect(apparat.code.getValue()).toContain("// @apparat js 1 1\n")
            releaseRegistration()
            await pending
            expect(call(api, "project.readApparatSource", {target})).toBe(source)

            blockRegistration = false
            const updated = "class Processor {\n"
                + "    noteOn(pitch, velocity, cent, id) {}\n"
                + "    noteOff(id) {}\n"
                + "    reset() {}\n"
                + "    process(output, block) {}\n"
                + "}\n"
            await api.callAsync({operation: "project.programApparat", arguments: {target, source: updated}})
            expect(apparat.code.getValue()).toContain("// @apparat js 1 2\n")
            expect(call(api, "project.readApparatSource", {target})).toBe(updated)
        } finally {
            project.terminate()
        }
    })

    it("propagates rejected async Apparat compilation", async () => {
        const {project, api} = await createProject(createAudioWorklets(async () => {}))
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Apparat"}))
            const target = asHandle(product.instrumentBox)
            await expect(api.callAsync({
                operation: "project.programApparat",
                arguments: {target, source: "class Processor {"}
            })).rejects.toThrow()
        } finally {
            project.terminate()
        }
    })

    it("turns Apparat declarations into ordinary parameters and reconciles them", async () => {
        const {project, api} = await createProject(createAudioWorklets(async () => {}))
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Apparat"}))
            const target = asHandle(product.instrumentBox)
            const source = "// @param tone 0.5\n// @param decay 0.1 0.001 1 exp s\n"
                + "class Processor { noteOn() {} noteOff() {} reset() {} process() {} }"
            await api.callAsync({operation: "project.programApparat", arguments: {target, source}})
            const apparat = api.resolver.resolve({kind: "handle", handle: "box", name: "ApparatDeviceBox"}, target)
            if (!(apparat instanceof ApparatDeviceBox)) {throw new Error("Missing Apparat box")}
            const parameterBoxes = (): ReadonlyArray<WerkstattParameterBox> => apparat.parameters.pointerHub
                .incoming().map(({box}) => box).filter((box): box is WerkstattParameterBox => box instanceof WerkstattParameterBox)
            expect(parameterBoxes().map(box => box.label.getValue()))
                .toEqual(expect.arrayContaining(["tone", "decay"]))
            const tone = api.resolver.parameters().find(parameter => parameter.name === "Tone")
            if (tone === undefined) {throw new Error("Missing generated Tone parameter")}
            const before = tone.getValue()
            call(api, "parameter.setValue", {value: 0.75}, api.resolver.handle(tone))
            expect(tone.getValue()).not.toBe(before)

            const updated = "// @param tone 0.25 0 1 exp\n"
                + "class Processor { noteOn() {} noteOff() {} reset() {} process() {} }"
            await api.callAsync({operation: "project.programApparat", arguments: {target, source: updated}})
            expect(parameterBoxes().map(box => box.label.getValue())).toEqual(["tone"])
            expect(parameterBoxes()[0].defaultValue.getValue()).toBe(0.25)
        } finally {
            project.terminate()
        }
    })

    it("assigns and removes Apparat samples without deleting declaration slots", async () => {
        const {project, api} = await createProject(createAudioWorklets(async () => {}))
        try {
            const product = asObject(call(api, "project.createAnyInstrument", {factory: "Apparat"}))
            const target = asHandle(product.instrumentBox)
            const source = "// @sample kick\n// @sample texture\n"
                + "class Processor { noteOn() {} noteOff() {} reset() {} process() {} }"
            await api.callAsync({operation: "project.programApparat", arguments: {target, source}})
            const apparat = api.resolver.resolve({kind: "handle", handle: "box", name: "ApparatDeviceBox"}, target)
            if (!(apparat instanceof ApparatDeviceBox)) {throw new Error("Missing Apparat box")}
            const slots = (): ReadonlyArray<WerkstattSampleBox> => apparat.samples.pointerHub.incoming()
                .map(({box}) => box).filter((box): box is WerkstattSampleBox => box instanceof WerkstattSampleBox)
            const kick = slots().find(slot => slot.label.getValue() === "kick")
            if (kick === undefined) {throw new Error("Missing kick sample declaration")}
            const sample = {
                uuid: "00000000-0000-4000-8000-000000000021",
                name: "Agent Kick",
                bpm: 120,
                duration: 0.75,
                sample_rate: 48000,
                origin: "openDAW"
            } as const
            call(api, "project.assignApparatSample", {target, sampleLabel: "kick", sample})
            const file = kick.file.targetVertex.unwrap("Missing assigned Apparat sample").box
            expect(file).toBeInstanceOf(AudioFileBox)
            expect(file.address.uuid).toEqual(UUID.parse(sample.uuid))
            call(api, "project.removeApparatSample", {target, sampleLabel: "kick"})
            expect(kick.isAttached()).toBe(true)
            expect(kick.file.targetVertex.isEmpty()).toBe(true)
            expect(api.resolver.boxes().some(box => box === kick)).toBe(true)
            expect(api.resolver.boxes().some(box => box instanceof AudioFileBox
                && UUID.equals(box.address.uuid, UUID.parse(sample.uuid)))).toBe(false)
            expect(() => call(api, "project.assignApparatSample", {
                target, sampleLabel: "missing", sample
            })).toThrow(/missing.*kick.*texture/i)
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

    it("resolves dependent handle results through one atomic generated-operation batch", async () => {
        const {project, api} = await createProject()
        try {
            const initialAddresses = project.boxGraph.boxes().map(box => box.address.toString())
            const results = api.batch([
                {
                    id: "inst",
                    operation: "project.createAnyInstrument",
                    arguments: {factory: "Vaporisateur"}
                },
                {
                    id: "region",
                    operation: "project.createMusicalNoteRegion",
                    arguments: {
                        trackBox: {$result: "inst", path: "trackBox"},
                        position: {bar: 1},
                        duration: "bar",
                        name: "Atomic Region"
                    }
                },
                {
                    id: "notes",
                    operation: "project.createMusicalNoteEvents",
                    arguments: {
                        owner: {$result: "region"},
                        events: [
                            {position: {bar: 1}, duration: "quarter", pitch: 60},
                            {position: {bar: 1, beat: 3}, duration: "quarter", pitch: 64}
                        ]
                    }
                }
            ])
            const product = asObject(results[0])
            const region = asHandle(results[1])
            const notes = asHandles(results[2])
            expect(asHandle(product.trackBox)).toEqual(expect.objectContaining({$address: expect.any(String)}))
            expect(region.$address).toEqual(expect.any(String))
            expect(notes).toHaveLength(2)
            expect(project.editing.canUndo()).toBe(true)
            expect(project.editing.undo()).toBe(true)
            expect(project.boxGraph.boxes().map(box => box.address.toString())).toEqual(initialAddresses)
            expect(project.editing.canUndo()).toBe(false)
        } finally {
            project.terminate()
        }
    })

    it("rolls back a dependent batch and rejects invalid result references before editing", async () => {
        const {project, api} = await createProject()
        try {
            const initialAddresses = project.boxGraph.boxes().map(box => box.address.toString())
            expect(() => api.batch([
                {
                    id: "inst",
                    operation: "project.createAnyInstrument",
                    arguments: {factory: "Vaporisateur"}
                },
                {
                    id: "region",
                    operation: "project.createMusicalNoteRegion",
                    arguments: {
                        trackBox: {$result: "inst", path: "missingTrackBox"},
                        position: {bar: 1},
                        duration: "bar"
                    }
                }
            ])).toThrow(/path was not found/)
            expect(project.boxGraph.boxes().map(box => box.address.toString())).toEqual(initialAddresses)
            expect(project.editing.canUndo()).toBe(false)

            expect(() => api.batch([
                {
                    id: "region",
                    operation: "project.createMusicalNoteRegion",
                    arguments: {
                        trackBox: {$result: "inst", path: "trackBox"},
                        position: {bar: 1},
                        duration: "bar"
                    }
                },
                {
                    id: "inst",
                    operation: "project.createAnyInstrument",
                    arguments: {factory: "Vaporisateur"}
                }
            ])).toThrow(/must refer to an earlier step/)
            expect(() => api.batch([{
                id: "one", operation: "project.setBpm", arguments: {value: {$result: "missing"}}
            }])).toThrow(/unknown batch result/)
            expect(() => api.batch([{
                id: "one", operation: "project.setBpm", arguments: {value: {$result: ""}}
            }])).toThrow(/empty result id/)
            expect(() => api.batch([
                {id: "same", operation: "project.setBpm", arguments: {value: 121}},
                {id: "same", operation: "project.setBpm", arguments: {value: 122}}
            ])).toThrow(/duplicate batch step id/)
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
        expect(operation("project.createAutomationTrack").description)
            .toMatch(/timeline automation lane[\s\S]*ValueClip slot/i)
        expect(operation("project.createValueClip").description)
            .toMatch(/clip-slot style[\s\S]*not the normal timeline automation/i)
        expect(operation("project.createTrackRegion").description)
            .toMatch(/ValueRegionBox automation region[\s\S]*seeds/i)
        expect(operation("project.createValueEvents").description)
            .toMatch(/local to the owning collection[\s\S]*position, index[\s\S]*canonical collection adapter/i)
        expect(operation("project.createAutomationRegion").description)
            .toMatch(/timeline automation region[\s\S]*local value events/i)
        expect(operation("project.createAutomationRegion").parameters.map(parameter => parameter.name))
            .toEqual(["trackBox", "position", "duration", "events", undefined])
        expect(operation("project.createAutomationRegion").result)
            .toEqual({kind: "handle", handle: "box", name: "ValueRegionBox"})
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
