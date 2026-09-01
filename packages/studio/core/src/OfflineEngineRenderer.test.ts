import {afterEach, describe, expect, it, vi} from "vitest"
import {DefaultObservableValue, Option, Terminator, UUID} from "@opendaw/lib-std"
import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {Project} from "./project/Project"
import type {ProjectEnv} from "./project/ProjectEnv"
import {OfflineEngineRenderer} from "./OfflineEngineRenderer"

const createSampleManager = () => ({
    getOrCreate: (uuid: UUID.Bytes) => ({
        get data() {return Option.None},
        get peaks() {return Option.None},
        get uuid() {return uuid},
        get state() {return {type: "idle"} as const},
        invalidate() {},
        subscribe: () => ({terminate() {}})
    }),
    record: () => {},
    invalidate: () => {},
    remove: () => {},
    register: () => ({terminate() {}})
})

const createEnv = (): ProjectEnv => ({
    audioContext: undefined,
    audioWorklets: undefined,
    sampleManager: createSampleManager(),
    soundfontManager: undefined,
    sampleService: undefined,
    soundfontService: undefined
}) as unknown as ProjectEnv

type SendMessage = {
    readonly type: "send"
    readonly returnId: number | false
    readonly func: string
    readonly args: ReadonlyArray<{readonly value: unknown}>
}

type FakeEngineCommands = {
    play(): void
    stop(reset: boolean): void
    setPosition(position: number): void
    queryLoadingComplete(): Promise<boolean>
    setupMIDI(port: MessagePort, buffer: SharedArrayBuffer): void
}

class FakeOfflineWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onmessageerror: ((event: MessageEvent) => void) | null = null
    readonly #terminator = new Terminator()

    constructor(_url: string, _options: WorkerOptions) {}

    postMessage(value: unknown, _transfer?: ReadonlyArray<Transferable>): void {
        const envelope = value as {readonly channel?: string, readonly message?: SendMessage}
        if (envelope.channel !== "offline-engine" || envelope.message?.type !== "send") {return}
        const message = envelope.message
        if (message.func === "initialize") {
            this.#initialize(message)
        } else if (message.func === "render") {
            this.#reply(message, [new Float32Array([0]), new Float32Array([0])])
        }
    }

    terminate(): void {this.#terminator.terminate()}

    #initialize(message: SendMessage): void {
        const enginePort = message.args[0].value as MessagePort
        const engineMessenger = this.#terminator.own(Messenger.for(enginePort))
        enginePort.start()
        const commands = this.#terminator.own(engineMessenger.channel("engine-commands"))
        this.#terminator.own(Communicator.executor<FakeEngineCommands>(commands, {
            play: () => {},
            stop: (_reset: boolean) => {},
            setPosition: (_position: number) => {},
            queryLoadingComplete: async () => true,
            setupMIDI: (_port: MessagePort, _buffer: SharedArrayBuffer) => {}
        }))
        this.#terminator.own(engineMessenger.channel("engine-to-client")).send({
            type: "send", returnId: false, func: "ready", args: []
        })
        this.#reply(message, undefined)
    }

    #reply(request: SendMessage, resolve: unknown): void {
        if (request.returnId === false) {return}
        this.onmessage?.({data: {
            __id__: "42",
            channel: "offline-engine",
            message: {type: "resolve", returnId: request.returnId, resolve}
        }} as MessageEvent)
    }
}

describe("OfflineEngineRenderer live-stream ownership", () => {
    afterEach(() => {vi.unstubAllGlobals()})

    it("does not take over the live receiver across sequential renders", async () => {
        vi.stubGlobal("Worker", FakeOfflineWorker)
        OfflineEngineRenderer.install("offline-engine-test-worker", {})
        const project = Project.fromSkeleton(createEnv(), ProjectSkeleton.empty({
            createDefaultUser: true, createOutputMaximizer: false
        }))
        const livePort = new MessageChannel()
        const liveMessenger = Messenger.for(livePort.port1)
        const liveConnection = project.liveStreamReceiver.connect(liveMessenger.channel("engine-live-data"))
        try {
            const render = () => OfflineEngineRenderer.start(
                project, Option.None, new DefaultObservableValue(0), undefined, 48_000)
            const first = await render()
            const second = await render()

            expect(first.numberOfFrames).toBe(1)
            expect(second.numberOfFrames).toBe(1)

            const probePort = new MessageChannel()
            const probeMessenger = Messenger.for(probePort.port1)
            expect(() => project.liveStreamReceiver.connect(
                probeMessenger.channel("engine-live-data"))).toThrow("Already connected")
            probeMessenger.terminate()
            probePort.port1.close()
            probePort.port2.close()

            liveConnection.terminate()
            const reconnectPort = new MessageChannel()
            const reconnectMessenger = Messenger.for(reconnectPort.port1)
            const reconnect = project.liveStreamReceiver.connect(
                reconnectMessenger.channel("engine-live-data"))
            reconnect.terminate()
            reconnectMessenger.terminate()
            reconnectPort.port1.close()
            reconnectPort.port2.close()
        } finally {
            liveConnection.terminate()
            liveMessenger.terminate()
            livePort.port1.close()
            livePort.port2.close()
            project.terminate()
        }
    })
})
