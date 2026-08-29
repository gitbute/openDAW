import {describe, expect, it} from "vitest"
import {ProducerToolPolicy} from "./ProducerToolPolicy"
import type {JsonObject} from "./types"

const invocation = (namespace: string, name: string, arguments_: JsonObject) => ({
    namespace,
    name,
    arguments: arguments_
})

const successful = {ok: true as const, value: {}}
const failed = {ok: false as const, error: "definition failed"}

describe("ProducerToolPolicy", () => {
    it("enforces first-use discovery per thread and factory", () => {
        const policy = new ProducerToolPolicy()
        const createApparat = invocation("daw_project", "create_any_instrument", {factory: "Apparat"})
        const inspectApparat = invocation("daw_resources", "inspect_device_definition", {
            category: "instrument", factory: "Apparat"
        })

        expect(policy.beforeToolCall("thread-1", createApparat)).toContain(
            'daw_resources.inspect_device_definition({"category":"instrument","factory":"Apparat"})')
        policy.afterToolCall("thread-1", inspectApparat, successful)
        expect(policy.beforeToolCall("thread-1", createApparat)).toBeUndefined()
        expect(policy.beforeToolCall("thread-1", createApparat)).toBeUndefined()
        expect(policy.beforeToolCall("thread-2", createApparat)).toContain("instrument factory 'Apparat'")
    })

    it("uses the effect category, blocks apply_edit, and ignores failed inspections", () => {
        const policy = new ProducerToolPolicy()
        const insertCompressor = invocation("daw_project", "insert_audio_effect", {factory: "Compressor"})
        const inspectCompressor = invocation("daw_resources", "inspect_device_definition", {
            category: "audio-effect", factory: "Compressor"
        })
        const applyDelay = invocation("daw_project", "apply_edit", {
            steps: [{
                id: "insert-delay",
                namespace: "daw_project",
                tool: "insert_audio_effect",
                arguments: {factory: "Delay"}
            }]
        })
        const inspectDelay = invocation("daw_resources", "inspect_device_definition", {
            category: "audio-effect", factory: "Delay"
        })

        expect(policy.beforeToolCall("thread-1", insertCompressor)).toContain(
            "Before first use of audio-effect factory 'Compressor'")
        policy.afterToolCall("thread-1", inspectCompressor, failed)
        expect(policy.beforeToolCall("thread-1", insertCompressor)).toContain(
            "Before first use of audio-effect factory 'Compressor'")
        policy.afterToolCall("thread-1", inspectCompressor, successful)
        expect(policy.beforeToolCall("thread-1", insertCompressor)).toBeUndefined()

        expect(policy.beforeToolCall("thread-1", applyDelay)).toContain(
            'daw_resources.inspect_device_definition({"category":"audio-effect","factory":"Delay"})')
        policy.afterToolCall("thread-1", inspectDelay, successful)
        expect(policy.beforeToolCall("thread-1", applyDelay)).toBeUndefined()
    })

    it("blocks an unknown later factory after a known instrument in apply_edit", () => {
        const policy = new ProducerToolPolicy()
        const inspectApparat = invocation("daw_resources", "inspect_device_definition", {
            category: "instrument", factory: "Apparat"
        })
        const applyEdit = invocation("daw_project", "apply_edit", {
            steps: [
                {id: "create-apparat", namespace: "daw_project", tool: "create_any_instrument", arguments: {factory: "Apparat"}},
                {id: "insert-delay", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Delay"}}
            ]
        })

        policy.afterToolCall("thread-1", inspectApparat, successful)
        expect(policy.beforeToolCall("thread-1", applyEdit)).toContain("audio-effect factory 'Delay'")
    })

    it("blocks an unknown later effect after a known compressor in apply_edit", () => {
        const policy = new ProducerToolPolicy()
        const inspectCompressor = invocation("daw_resources", "inspect_device_definition", {
            category: "audio-effect", factory: "Compressor"
        })
        const applyEdit = invocation("daw_project", "apply_edit", {
            steps: [
                {id: "insert-compressor", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Compressor"}},
                {id: "insert-reverb", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Reverb"}}
            ]
        })

        policy.afterToolCall("thread-1", inspectCompressor, successful)
        expect(policy.beforeToolCall("thread-1", applyEdit)).toContain("audio-effect factory 'Reverb'")
    })

    it("allows apply_edit when all factory requirements are known", () => {
        const policy = new ProducerToolPolicy()
        const inspectApparat = invocation("daw_resources", "inspect_device_definition", {
            category: "instrument", factory: "Apparat"
        })
        const inspectDelay = invocation("daw_resources", "inspect_device_definition", {
            category: "audio-effect", factory: "Delay"
        })
        const applyEdit = invocation("daw_project", "apply_edit", {
            steps: [
                {id: "create-apparat", namespace: "daw_project", tool: "create_any_instrument", arguments: {factory: "Apparat"}},
                {id: "insert-delay", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Delay"}}
            ]
        })

        policy.afterToolCall("thread-1", inspectApparat, successful)
        policy.afterToolCall("thread-1", inspectDelay, successful)
        expect(policy.beforeToolCall("thread-1", applyEdit)).toBeUndefined()
    })

    it("blocks multiple unknown apply_edit factories in step order", () => {
        const policy = new ProducerToolPolicy()
        const applyEdit = invocation("daw_project", "apply_edit", {
            steps: [
                {id: "insert-delay", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Delay"}},
                {id: "insert-reverb", namespace: "daw_project", tool: "insert_audio_effect", arguments: {factory: "Reverb"}}
            ]
        })
        const inspectDelay = invocation("daw_resources", "inspect_device_definition", {
            category: "audio-effect", factory: "Delay"
        })
        const inspectReverb = invocation("daw_resources", "inspect_device_definition", {
            category: "audio-effect", factory: "Reverb"
        })

        expect(policy.beforeToolCall("thread-1", applyEdit)).toContain("audio-effect factory 'Delay'")
        policy.afterToolCall("thread-1", inspectDelay, successful)
        expect(policy.beforeToolCall("thread-1", applyEdit)).toContain("audio-effect factory 'Reverb'")
        policy.afterToolCall("thread-1", inspectReverb, successful)
        expect(policy.beforeToolCall("thread-1", applyEdit)).toBeUndefined()
    })

    it("requires canonical definitions before programmable devices", () => {
        const policy = new ProducerToolPolicy()
        const programApparat = invocation("daw_project", "program_apparat", {target: {$address: "box"}})
        const inspectApparat = invocation("daw_resources", "inspect_device_definition", {
            category: "instrument", factory: "Apparat"
        })

        expect(policy.beforeToolCall("thread-1", programApparat)).toContain(
            "daw_resources.inspect_device_definition({\"category\":\"instrument\",\"factory\":\"Apparat\"})")
        policy.afterToolCall("thread-1", inspectApparat, successful)
        expect(policy.beforeToolCall("thread-1", programApparat)).toBeUndefined()
    })
})
