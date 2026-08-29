import type {ToolResult} from "@opendaw/studio-core"
import type {JsonObject} from "./types"

export type ProducerFactoryCategory = "instrument" | "audio-effect" | "midi-effect"

export type ProducerToolInvocation = {
    readonly namespace: string
    readonly name: string
    readonly arguments: JsonObject
}

const factoryCategories: Readonly<Record<string, ProducerFactoryCategory>> = {
    create_any_instrument: "instrument",
    insert_audio_effect: "audio-effect",
    insert_midi_effect: "midi-effect"
}

const programmableFactories: Readonly<Record<string, {
    readonly category: ProducerFactoryCategory
    readonly factory: string
}>> = {
    program_apparat: {category: "instrument", factory: "Apparat"},
    program_werkstatt: {category: "audio-effect", factory: "Werkstatt"},
    program_spielwerk: {category: "midi-effect", factory: "Spielwerk"}
}

const categories: ReadonlySet<string> = new Set([
    "instrument", "audio-effect", "midi-effect"
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const factoryAt = (arguments_: JsonObject): string | undefined => {
    const factory = arguments_.factory
    return typeof factory === "string" && factory.length > 0 ? factory : undefined
}

const definitionArguments = (category: ProducerFactoryCategory, factory: string): string =>
    JSON.stringify({category, factory})

const missingDefinitionMessage = (category: ProducerFactoryCategory, factory: string): string =>
    `Before first use of ${category} factory '${factory}' in this thread, inspect its canonical definition with `
    + `daw_resources.inspect_device_definition(${definitionArguments(category, factory)}), then retry this operation.`

const missingApplyEditDefinitionMessage = (category: ProducerFactoryCategory, factory: string): string =>
    `apply_edit requires first-use discovery for ${category} factory '${factory}'. Call `
    + `daw_resources.inspect_device_definition(${definitionArguments(category, factory)}) first, then retry the edit.`

const requirementForDirectCall = (invocation: ProducerToolInvocation): {
    readonly category: ProducerFactoryCategory
    readonly factory: string
} | undefined => {
    const category = factoryCategories[invocation.name]
    if (category === undefined) {return undefined}
    const factory = factoryAt(invocation.arguments)
    return factory === undefined ? undefined : {category, factory}
}

const requirementForApplyEdit = (invocation: ProducerToolInvocation): {
    readonly category: ProducerFactoryCategory
    readonly factory: string
} | undefined => {
    if (invocation.namespace !== "daw_project" || invocation.name !== "apply_edit") {return undefined}
    const steps = invocation.arguments.steps
    if (!Array.isArray(steps)) {return undefined}
    for (const rawStep of steps) {
        if (!isRecord(rawStep)) {continue}
        const tool = rawStep.tool
        const stepArguments = rawStep.arguments
        if (typeof tool !== "string" || !isRecord(stepArguments)) {continue}
        const category = factoryCategories[tool]
        if (category === undefined) {continue}
        const factory = factoryAt(stepArguments as JsonObject)
        if (factory !== undefined) {return {category, factory}}
    }
    return undefined
}

const requirementFor = (invocation: ProducerToolInvocation): {
    readonly category: ProducerFactoryCategory
    readonly factory: string
    readonly fromApplyEdit: boolean
} | undefined => {
    const direct = requirementForDirectCall(invocation)
    if (direct !== undefined) {return {...direct, fromApplyEdit: false}}
    const applyEdit = requirementForApplyEdit(invocation)
    return applyEdit === undefined ? undefined : {...applyEdit, fromApplyEdit: true}
}

export class ProducerToolPolicy {
    readonly #knownFactories = new Map<string, Set<string>>()

    beforeToolCall(threadId: string | undefined, invocation: ProducerToolInvocation): string | undefined {
        if (invocation.namespace !== "daw_project") {return undefined}
        const programmable = programmableFactories[invocation.name]
        const requirement = programmable === undefined
            ? requirementFor(invocation)
            : {category: programmable.category, factory: programmable.factory, fromApplyEdit: false}
        if (requirement === undefined) {return undefined}
        if (this.#isKnown(threadId, requirement.category, requirement.factory)) {return undefined}
        return requirement.fromApplyEdit
            ? missingApplyEditDefinitionMessage(requirement.category, requirement.factory)
            : missingDefinitionMessage(requirement.category, requirement.factory)
    }

    afterToolCall(threadId: string | undefined, invocation: ProducerToolInvocation, result: ToolResult): void {
        if (!result.ok || threadId === undefined
            || invocation.namespace !== "daw_resources"
            || invocation.name !== "inspect_device_definition") {return}
        const category = invocation.arguments.category
        const factory = factoryAt(invocation.arguments)
        if (typeof category !== "string" || !categories.has(category) || factory === undefined) {return}
        let known = this.#knownFactories.get(threadId)
        if (known === undefined) {
            known = new Set<string>()
            this.#knownFactories.set(threadId, known)
        }
        known.add(`${category}\u0000${factory}`)
    }

    clearThread(threadId: string | undefined): void {
        if (threadId !== undefined) {this.#knownFactories.delete(threadId)}
    }

    clear(): void {
        this.#knownFactories.clear()
    }

    #isKnown(threadId: string | undefined, category: ProducerFactoryCategory, factory: string): boolean {
        return threadId !== undefined
            && this.#knownFactories.get(threadId)?.has(`${category}\u0000${factory}`) === true
    }
}
