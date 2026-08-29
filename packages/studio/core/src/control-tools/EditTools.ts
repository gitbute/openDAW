import {ControlApi} from "../control-api/ControlApi"
import type {JsonObject, JsonValue, OperationDescriptor} from "../control-api/types"
import {ToolCatalog} from "./ToolCatalog"
import {toControlBatchItem} from "./OperationToolCall"
import type {ApplyEditResult, ApplyEditStep} from "./types"

const namespaces = ["daw_project", "daw_modulation", "daw_parameter"] as const

const assertRecord = (value: unknown, context: string): JsonObject => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${context} must be an object`)
    }
    return value as JsonObject
}

const assertKnownProperties = (value: JsonObject, known: ReadonlyArray<string>, context: string): void => {
    Object.keys(value).forEach(name => {
        if (!known.includes(name)) {throw new Error(`Unknown property '${name}' for ${context}`)}
    })
}

const requiredString = (value: JsonObject, name: string, context: string): string => {
    const candidate = value[name]
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
        throw new Error(`${name} must be a non-empty string for ${context}`)
    }
    return candidate
}

const parseSteps = (input: JsonObject): ReadonlyArray<ApplyEditStep> => {
    assertKnownProperties(input, ["steps"], "daw_project.apply_edit input")
    const rawSteps = input.steps
    if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > 64) {
        throw new Error("steps must contain between 1 and 64 items")
    }
    const ids = new Set<string>()
    return rawSteps.map((rawStep, index) => {
        const value = assertRecord(rawStep, `apply_edit step ${index}`)
        assertKnownProperties(value, ["id", "namespace", "tool", "arguments"], `apply_edit step ${index}`)
        const id = requiredString(value, "id", `apply_edit step ${index}`)
        if (ids.has(id)) {throw new Error(`duplicate apply_edit step id '${id}'`)}
        ids.add(id)
        const namespace = requiredString(value, "namespace", `apply_edit step ${index}`)
        if (!(namespaces as ReadonlyArray<string>).includes(namespace)) {
            throw new Error(`apply_edit step ${index} namespace must be one of ${namespaces.join(", ")}`)
        }
        const tool = requiredString(value, "tool", `apply_edit step ${index}`)
        if (!Object.hasOwn(value, "arguments")) {
            throw new Error(`Missing argument 'arguments' for apply_edit step ${index}`)
        }
        const arguments_ = value.arguments
        if (typeof arguments_ !== "object" || arguments_ === null || Array.isArray(arguments_)) {
            throw new Error(`arguments must be an object for apply_edit step ${index}`)
        }
        return {
            id,
            namespace: namespace as ApplyEditStep["namespace"],
            tool,
            arguments: arguments_ as JsonObject
        }
    })
}

const operationFor = (catalog: ToolCatalog, step: ApplyEditStep): OperationDescriptor => {
    const binding = catalog.resolve(step.namespace, step.tool)
    if (binding === undefined) {
        throw new Error(`Unknown apply_edit tool '${step.namespace}.${step.tool}'`)
    }
    if (binding.manual !== undefined) {
        if (binding.manual === "apply_edit") {
            throw new Error("daw_project.apply_edit cannot contain another apply_edit")
        }
        throw new Error(`${step.namespace}.${step.tool} is not a generated operation and cannot be used inside apply_edit`)
    }
    const operation = binding.operation
    if (operation === undefined) {
        throw new Error(`${step.namespace}.${step.tool} has no generated operation descriptor`)
    }
    if (operation.async) {
        throw new Error(`${step.namespace}.${step.tool} is asynchronous and cannot be included in apply_edit; call it separately`)
    }
    if (operation.transaction !== "editing") {
        throw new Error(`${step.namespace}.${step.tool} is not an editing operation and cannot be included in apply_edit`)
    }
    return operation
}

export class EditTools {
    readonly #controlApi: ControlApi
    readonly #catalog: ToolCatalog

    constructor(controlApi: ControlApi, catalog: ToolCatalog) {
        this.#controlApi = controlApi
        this.#catalog = catalog
    }

    apply(input: JsonObject): ApplyEditResult {
        const value = assertRecord(input, "daw_project.apply_edit input")
        const steps = parseSteps(value)
        const operations = steps.map(step => operationFor(this.#catalog, step))
        const results = this.#controlApi.batch(steps.map((step, index) =>
            toControlBatchItem(operations[index], step.arguments, step.id)))
        return {
            results: results.map((result: JsonValue, index) => ({id: steps[index].id, value: result}))
        }
    }
}
