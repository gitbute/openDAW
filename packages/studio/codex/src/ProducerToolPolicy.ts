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

type FactoryRequirement = {
    readonly category: ProducerFactoryCategory
    readonly factory: string
}

const factoryAt = (value: unknown): string | undefined => {
    if (!isRecord(value)) {return undefined}
    const factory = value.factory
    return typeof factory === "string" && factory.length > 0 ? factory : undefined
}

const factoryRequirementAt = (value: unknown): FactoryRequirement | undefined => {
    if (!isRecord(value)) {return undefined}
    const category = value.category
    const factory = factoryAt(value)
    return typeof category === "string" && categories.has(category) && factory !== undefined
        ? {category: category as ProducerFactoryCategory, factory}
        : undefined
}

const helpArguments = (category: ProducerFactoryCategory, factory: string): string =>
    JSON.stringify({category, factory})

const missingHelpMessage = (category: ProducerFactoryCategory, factory: string): string =>
    `Before first use of ${category} factory '${factory}' in this thread, read its canonical help with `
    + `daw_resources.inspect_device_help(${helpArguments(category, factory)}), then retry this operation.`

const requirementForDirectCall = (invocation: ProducerToolInvocation): FactoryRequirement | undefined => {
    const programmable = programmableFactories[invocation.name]
    if (programmable !== undefined) {return programmable}
    const category = factoryCategories[invocation.name]
    const factory = factoryAt(invocation.arguments)
    return category === undefined || factory === undefined ? undefined : {category, factory}
}

const requirementsForApplyEdit = (invocation: ProducerToolInvocation): readonly FactoryRequirement[] => {
    if (invocation.namespace !== "daw_project" || invocation.name !== "apply_edit") {return []}
    const steps = invocation.arguments.steps
    if (!Array.isArray(steps)) {return []}
    const requirements: FactoryRequirement[] = []
    for (const rawStep of steps) {
        if (!isRecord(rawStep)) {continue}
        const tool = rawStep.tool
        const stepArguments = rawStep.arguments
        if (typeof tool !== "string" || !isRecord(stepArguments)) {continue}
        const category = factoryCategories[tool]
        const factory = factoryAt(stepArguments)
        if (category !== undefined && factory !== undefined) {requirements.push({category, factory})}
    }
    return requirements
}

const requirementsFor = (invocation: ProducerToolInvocation): readonly FactoryRequirement[] => {
    const direct = requirementForDirectCall(invocation)
    return direct === undefined ? requirementsForApplyEdit(invocation) : [direct]
}

export class ProducerToolPolicy {
    readonly #helpedFactories = new Map<string, Set<string>>()

    beforeToolCall(threadId: string | undefined, invocation: ProducerToolInvocation): string | undefined {
        if (invocation.namespace !== "daw_project") {return undefined}
        for (const requirement of requirementsFor(invocation)) {
            if (!this.#isHelped(threadId, requirement.category, requirement.factory)) {
                return missingHelpMessage(requirement.category, requirement.factory)
            }
        }
        return undefined
    }

    afterToolCall(threadId: string | undefined, invocation: ProducerToolInvocation, result: ToolResult): void {
        if (!result.ok || threadId === undefined
            || invocation.namespace !== "daw_resources"
            || invocation.name !== "inspect_device_help") {return}
        const requirement = factoryRequirementAt(result.value)
        if (requirement === undefined) {return}
        let helped = this.#helpedFactories.get(threadId)
        if (helped === undefined) {
            helped = new Set<string>()
            this.#helpedFactories.set(threadId, helped)
        }
        helped.add(`${requirement.category}\u0000${requirement.factory}`)
    }

    clearThread(threadId: string | undefined): void {
        if (threadId !== undefined) {this.#helpedFactories.delete(threadId)}
    }

    clear(): void {
        this.#helpedFactories.clear()
    }

    #isHelped(threadId: string | undefined, category: ProducerFactoryCategory, factory: string): boolean {
        return threadId !== undefined
            && this.#helpedFactories.get(threadId)?.has(`${category}\u0000${factory}`) === true
    }
}
