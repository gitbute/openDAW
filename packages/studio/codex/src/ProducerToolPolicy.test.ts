import {describe, expect, it} from "vitest"
import {ProducerToolPolicy} from "./ProducerToolPolicy"
import type {JsonObject} from "./types"

const invocation = (namespace: string, name: string, arguments_: JsonObject) => ({
    namespace,
    name,
    arguments: arguments_
})

const help = (category: string, factory: string) =>
    invocation("daw_resources", "inspect_device_help", {category, factory})

const liveHelp = (address: string) =>
    invocation("daw_resources", "inspect_device_help", {device: {$address: address}})

const program = (name: string, address = "device") =>
    invocation("daw_project", name, {target: {$address: address}})

const successfulHelp = (category: string, factory: string) => ({
    ok: true as const,
    value: {category, factory, manualUrl: `manuals/${factory.toLowerCase()}`}
})

const successfulDefinition = (category: string, factory: string) => ({
    ok: true as const,
    value: {category, factory}
})

const failed = {ok: false as const, error: "help failed"}

describe("ProducerToolPolicy", () => {
    it("requires canonical help once per factory and thread", () => {
        const policy = new ProducerToolPolicy()
        const createApparat = invocation("daw_project", "create_any_instrument", {factory: "Apparat"})
        const inspectApparat = help("instrument", "Apparat")

        expect(policy.beforeToolCall("thread-1", createApparat)).toContain(
            'daw_resources.inspect_device_help({"category":"instrument","factory":"Apparat"})')
        policy.afterToolCall("thread-1", inspectApparat, successfulHelp("instrument", "Apparat"))
        expect(policy.beforeToolCall("thread-1", createApparat)).toBeUndefined()
        expect(policy.beforeToolCall("thread-1", createApparat)).toBeUndefined()
        expect(policy.beforeToolCall("thread-2", createApparat)).toContain("instrument factory 'Apparat'")
    })

    it("does not let definition inspection unlock a factory", () => {
        const policy = new ProducerToolPolicy()
        const createApparat = invocation("daw_project", "create_any_instrument", {factory: "Apparat"})
        const inspectApparat = invocation("daw_resources", "inspect_device_definition", {
            category: "instrument", factory: "Apparat"
        })

        policy.afterToolCall("thread-1", inspectApparat, successfulDefinition("instrument", "Apparat"))
        expect(policy.beforeToolCall("thread-1", createApparat)).toContain("inspect_device_help")
    })

    it("uses the effect category and ignores failed help calls", () => {
        const policy = new ProducerToolPolicy()
        const insertCompressor = invocation("daw_project", "insert_audio_effect", {factory: "Compressor"})
        const inspectCompressor = help("audio-effect", "Compressor")

        expect(policy.beforeToolCall("thread-1", insertCompressor)).toContain(
            "Before first use of audio-effect factory 'Compressor'")
        policy.afterToolCall("thread-1", inspectCompressor, failed)
        expect(policy.beforeToolCall("thread-1", insertCompressor)).toContain(
            "Before first use of audio-effect factory 'Compressor'")
        policy.afterToolCall("thread-1", inspectCompressor, successfulHelp("audio-effect", "Compressor"))
        expect(policy.beforeToolCall("thread-1", insertCompressor)).toBeUndefined()
    })

    it("gates MIDI effects until their factory help has been read", () => {
        const policy = new ProducerToolPolicy()
        const insertVelocity = invocation("daw_project", "insert_midi_effect", {factory: "Velocity"})

        expect(policy.beforeToolCall("thread-1", insertVelocity)).toContain("midi-effect factory 'Velocity'")
        policy.afterToolCall("thread-1", help("midi-effect", "Velocity"),
            successfulHelp("midi-effect", "Velocity"))
        expect(policy.beforeToolCall("thread-1", insertVelocity)).toBeUndefined()
    })

    it("uses the same factory gate for programmable devices", () => {
        const cases = [
            ["program_apparat", "instrument", "Apparat"],
            ["program_werkstatt", "audio-effect", "Werkstatt"],
            ["program_spielwerk", "midi-effect", "Spielwerk"]
        ] as const

        for (const [tool, category, factory] of cases) {
            const policy = new ProducerToolPolicy()
            const target = program(tool)
            expect(policy.beforeToolCall("thread-1", target)).toContain(
                `daw_resources.inspect_device_help({"category":"${category}","factory":"${factory}"})`)
            policy.afterToolCall("thread-1", help(category, factory), successfulHelp(category, factory))
            expect(policy.beforeToolCall("thread-1", target)).toBeUndefined()
        }
    })

    it("does not let programmable device definitions bypass the shared gate", () => {
        const policy = new ProducerToolPolicy()
        const target = program("program_apparat")
        const definition = invocation("daw_resources", "inspect_device_definition", {
            category: "instrument", factory: "Apparat"
        })

        policy.afterToolCall("thread-1", definition, successfulDefinition("instrument", "Apparat"))
        expect(policy.beforeToolCall("thread-1", target)).toContain("inspect_device_help")
    })

    it("lets successful live-device help unlock the canonical factory", () => {
        const policy = new ProducerToolPolicy()
        const target = program("program_apparat", "apparat")

        policy.afterToolCall("thread-1", liveHelp("apparat"), successfulHelp("instrument", "Apparat"))
        expect(policy.beforeToolCall("thread-1", target)).toBeUndefined()
    })

    it("uses the successful help result as the authority", () => {
        const policy = new ProducerToolPolicy()
        const createApparat = invocation("daw_project", "create_any_instrument", {factory: "Apparat"})
        const insertDelay = invocation("daw_project", "insert_audio_effect", {factory: "Delay"})

        policy.afterToolCall("thread-1", help("instrument", "Apparat"), successfulHelp("audio-effect", "Delay"))
        expect(policy.beforeToolCall("thread-1", createApparat)).toContain("factory 'Apparat'")
        expect(policy.beforeToolCall("thread-1", insertDelay)).toBeUndefined()
    })

    it("scans every apply_edit factory and rejects the first unhelped one", () => {
        const policy = new ProducerToolPolicy()
        const applyEdit = invocation("daw_project", "apply_edit", {
            steps: [
                {id: "create-apparat", namespace: "daw_project", tool: "create_any_instrument", arguments: {factory: "Apparat"}},
                {id: "insert-delay", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Delay"}}
            ]
        })

        policy.afterToolCall("thread-1", help("instrument", "Apparat"), successfulHelp("instrument", "Apparat"))
        expect(policy.beforeToolCall("thread-1", applyEdit)).toContain("audio-effect factory 'Delay'")
        policy.afterToolCall("thread-1", help("audio-effect", "Delay"), successfulHelp("audio-effect", "Delay"))
        expect(policy.beforeToolCall("thread-1", applyEdit)).toBeUndefined()
    })

    it("keeps apply_edit ordering across several unknown factories", () => {
        const policy = new ProducerToolPolicy()
        const applyEdit = invocation("daw_project", "apply_edit", {
            steps: [
                {id: "insert-delay", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Delay"}},
                {id: "insert-reverb", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Reverb"}}
            ]
        })

        expect(policy.beforeToolCall("thread-1", applyEdit)).toContain("audio-effect factory 'Delay'")
        policy.afterToolCall("thread-1", help("audio-effect", "Delay"), successfulHelp("audio-effect", "Delay"))
        expect(policy.beforeToolCall("thread-1", applyEdit)).toContain("audio-effect factory 'Reverb'")
        policy.afterToolCall("thread-1", help("audio-effect", "Reverb"), successfulHelp("audio-effect", "Reverb"))
        expect(policy.beforeToolCall("thread-1", applyEdit)).toBeUndefined()
    })

    it("allows apply_edit when all factory requirements are helped", () => {
        const policy = new ProducerToolPolicy()
        const applyEdit = invocation("daw_project", "apply_edit", {
            steps: [
                {id: "create-apparat", namespace: "daw_project", tool: "create_any_instrument", arguments: {factory: "Apparat"}},
                {id: "insert-delay", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Delay"}},
                {id: "insert-velocity", namespace: "daw_project", tool: "insert_midi_effect", arguments: {factory: "Velocity"}}
            ]
        })

        for (const [category, factory] of [
            ["instrument", "Apparat"], ["audio-effect", "Delay"], ["midi-effect", "Velocity"]
        ] as const) {
            policy.afterToolCall("thread-1", help(category, factory), successfulHelp(category, factory))
        }
        expect(policy.beforeToolCall("thread-1", applyEdit)).toBeUndefined()
    })

    it("does not require help again for another instance, but resets for a new thread", () => {
        const policy = new ProducerToolPolicy()
        const createCompressor = invocation("daw_project", "insert_audio_effect", {factory: "Compressor"})

        policy.afterToolCall("thread-1", help("audio-effect", "Compressor"),
            successfulHelp("audio-effect", "Compressor"))
        expect(policy.beforeToolCall("thread-1", createCompressor)).toBeUndefined()
        expect(policy.beforeToolCall("thread-2", createCompressor)).toContain("audio-effect factory 'Compressor'")
        policy.clearThread("thread-1")
        expect(policy.beforeToolCall("thread-1", createCompressor)).toContain("audio-effect factory 'Compressor'")
    })
})
