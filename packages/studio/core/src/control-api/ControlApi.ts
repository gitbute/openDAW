import {Project} from "../project/Project"
import {generatedControlManifest} from "./generated"
import {ControlResolver} from "./ControlResolver"
import {decodeType, encodeType} from "./codec"
import {
    ControlBatchItem,
    ControlCall,
    ControlHandle,
    ControlResultReference,
    JsonObject,
    JsonValue,
    OperationDescriptor,
    ParameterSpec
} from "./types"

type DynamicOwner = {[key: string]: (...args: ReadonlyArray<never>) => JsonValue | object | undefined}

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const isResultReference = (value: JsonValue): value is ControlResultReference =>
    isJsonObject(value)
    && typeof value.$result === "string"
    && Object.keys(value).every(key => key === "$result" || key === "path")
    && (value.path === undefined || typeof value.path === "string")

const batchError = (message: string): never => {throw new Error(`[ControlApi] ${message}`)}

const validateBatchReferences = (calls: ReadonlyArray<ControlBatchItem>): void => {
    const ids = new Map<string, number>()
    calls.forEach((call, index) => {
        if (call.id === undefined) {return}
        if (typeof call.id !== "string" || call.id.trim().length === 0) {
            batchError(`batch step ${index} id must be a non-empty string`)
        }
        if (ids.has(call.id)) {batchError(`duplicate batch step id '${call.id}'`)}
        ids.set(call.id, index)
    })

    const visit = (value: JsonValue, stepIndex: number, location: string): void => {
        if (isResultReference(value)) {
            if (value.$result.trim().length === 0) {
                batchError(`${location} has an empty result id`)
            }
            const sourceIndex = ids.get(value.$result)
            if (sourceIndex === undefined) {
                batchError(`unknown batch result '${value.$result}'`)
            }
            if (sourceIndex !== undefined && sourceIndex >= stepIndex) {
                batchError(`batch result '${value.$result}' must refer to an earlier step`)
            }
            if (value.path !== undefined && value.path.length === 0) {
                batchError(`${location}.path must be a non-empty dotted property path`)
            }
            return
        }
        if (Array.isArray(value)) {
            value.forEach((member, index) => visit(member, stepIndex, `${location}[${index}]`))
            return
        }
        if (isJsonObject(value)) {
            Object.entries(value).forEach(([name, member]) => visit(member, stepIndex, `${location}.${name}`))
        }
    }

    calls.forEach((call, index) => {
        if (call.target !== undefined) {visit(call.target, index, `batch step ${index}.target`)}
        if (call.arguments !== undefined) {visit(call.arguments, index, `batch step ${index}.arguments`)}
    })
}

const resolveBatchPath = (result: JsonValue, path: string, reference: string): JsonValue => {
    let value = result
    for (const segment of path.split(".")) {
        if (segment.length === 0) {batchError(`result reference '${reference}' has an empty path segment`)}
        if (Array.isArray(value)) {
            if (!/^(0|[1-9]\d*)$/.test(segment)) {
                batchError(`result reference '${reference}' has a non-numeric array path segment '${segment}'`)
            }
            const index = Number(segment)
            if (index >= value.length) {batchError(`result reference '${reference}' path was not found`)}
            const member = value[index]
            if (member === undefined) {batchError(`result reference '${reference}' path was not found`)}
            value = member
        } else if (isJsonObject(value) && Object.hasOwn(value, segment)) {
            value = value[segment]
        } else {
            batchError(`result reference '${reference}' path was not found`)
        }
    }
    return value
}

const resolveBatchValue = (value: JsonValue, results: ReadonlyMap<string, JsonValue>): JsonValue => {
    if (isResultReference(value)) {
        const result = results.get(value.$result)
        const resolvedResult = result === undefined
            ? batchError(`unknown batch result '${value.$result}'`)
            : result
        return value.path === undefined
            ? resolvedResult
            : resolveBatchPath(resolvedResult, value.path, value.$result)
    }
    if (Array.isArray(value)) {return value.map(member => resolveBatchValue(member, results))}
    if (isJsonObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([name, member]) => [
            name, resolveBatchValue(member, results)
        ]))
    }
    return value
}

export class ControlApi {
    readonly #project: Project
    readonly #operations: ReadonlyMap<string, OperationDescriptor>
    readonly resolver: ControlResolver

    constructor(project: Project) {
        this.#project = project
        this.resolver = new ControlResolver(project.boxGraph, project.boxAdapters, project.parameterFieldAdapters)
        this.#operations = new Map(generatedControlManifest.operations.map(operation => [operation.id, operation]))
    }

    get manifest() {return generatedControlManifest}

    call(request: ControlCall): JsonValue {
        const operation = this.#operation(request.operation)
        if (operation.async) {
            throw new Error(`[ControlApi] ${operation.id} is asynchronous; use callAsync`)
        }
        return this.#invokeWithTransaction(operation, request)
    }

    async callAsync(request: ControlCall): Promise<JsonValue> {
        const operation = this.#operation(request.operation)
        if (!operation.async) {return this.call(request)}
        // Async canonical methods own any short live-model transaction after
        // their await. ControlApi never holds an editing transaction open here.
        return this.#invokeAsync(operation, request)
    }

    batch(calls: ReadonlyArray<ControlBatchItem>): ReadonlyArray<JsonValue> {
        if (calls.length === 0) {return []}
        const operations = calls.map(call => this.#operation(call.operation))
        if (operations.some(operation => operation.async)) {
            throw new Error("[ControlApi] asynchronous operations are not supported in batch")
        }
        const transaction = operations[0].transaction
        if (operations.some(operation => operation.transaction !== transaction)) {
            throw new Error("[ControlApi] mixed editing and non-editing batches are not supported")
        }
        validateBatchReferences(calls)
        const execute = (): ReadonlyArray<JsonValue> => {
            const results = new Map<string, JsonValue>()
            return calls.map((call, index) => {
                const request = this.#resolveBatchCall(call, results)
                const result = this.#invoke(operations[index], request)
                if (call.id !== undefined) {results.set(call.id, result)}
                return result
            })
        }
        if (transaction === "editing") {
            return this.#project.editing.modify(execute).unwrapOrUndefined() ?? []
        }
        return execute()
    }

    #resolveBatchCall(call: ControlBatchItem, results: ReadonlyMap<string, JsonValue>): ControlCall {
        const argumentsValue = call.arguments === undefined
            ? undefined
            : resolveBatchValue(call.arguments, results)
        if (argumentsValue !== undefined && !isJsonObject(argumentsValue)) {
            batchError(`${call.operation} arguments must resolve to an object`)
        }
        const argumentsObject = argumentsValue === undefined
            ? undefined
            : isJsonObject(argumentsValue)
                ? argumentsValue
                : batchError(`${call.operation} arguments must resolve to an object`)
        const target = call.target === undefined ? undefined : resolveBatchValue(call.target, results)
        return {
            operation: call.operation,
            ...(target === undefined ? {} : {target: target as ControlHandle}),
            ...(argumentsObject === undefined ? {} : {arguments: argumentsObject})
        }
    }

    #invokeWithTransaction(operation: OperationDescriptor, request: ControlCall): JsonValue {
        if (operation.transaction !== "editing") {return this.#invoke(operation, request)}
        return this.#project.editing.modify(() => this.#invoke(operation, request)).unwrapOrUndefined() ?? null
    }

    #invoke(operation: OperationDescriptor, request: ControlCall): JsonValue {
        return encodeType(operation.result, this.#invokeNative(operation, request), this.resolver)
    }

    async #invokeAsync(operation: OperationDescriptor, request: ControlCall): Promise<JsonValue> {
        const value = await this.#invokeNative(operation, request)
        return encodeType(operation.result, value, this.resolver)
    }

    #invokeNative(operation: OperationDescriptor, request: ControlCall): JsonValue | object | undefined {
        const {args, owner} = this.#decodeCall(operation, request)
        return (owner as DynamicOwner)[operation.method](...args as never[])
    }

    #decodeCall(operation: OperationDescriptor, request: ControlCall): {args: ReadonlyArray<unknown>, owner: object} {
        const input: JsonObject = request.arguments ?? {}
        const known = new Set<string>()
        operation.parameters.forEach(parameter => this.#bindingNames(parameter).forEach(name => known.add(name)))
        Object.keys(input).forEach(name => {
            if (!known.has(name)) {throw new Error(`Unknown argument '${name}' for ${operation.id}`)}
        })
        const args = operation.parameters.map(parameter => this.#decodeParameter(parameter, input, operation.id))
        const owner = this.#resolveOwner(operation, request.target)
        return {args, owner}
    }

    #decodeParameter(parameter: ParameterSpec, input: JsonObject, operation: string): unknown {
        if (parameter.binding.kind === "identifier") {
            const name = parameter.binding.name
            const present = Object.prototype.hasOwnProperty.call(input, name)
            if (!present && !parameter.optional) {throw new Error(`Missing argument '${name}' for ${operation}`)}
            return present ? decodeType(parameter.type, input[name], this.resolver) : undefined
        }

        const object: Record<string, JsonValue> = {}
        let present = false
        parameter.binding.properties.forEach(property => {
            if (Object.prototype.hasOwnProperty.call(input, property.name)) {
                present = true
                object[property.name] = input[property.name]
            }
        })
        if (!present && parameter.optional) {return undefined}
        return decodeType(parameter.type, object, this.resolver)
    }

    #bindingNames(parameter: ParameterSpec): ReadonlyArray<string> {
        return parameter.binding.kind === "identifier"
            ? [parameter.binding.name]
            : parameter.binding.properties.map(property => property.name)
    }

    #resolveOwner(operation: OperationDescriptor, target: ControlHandle | undefined): object {
        switch (operation.root) {
            case "project": return this.#project.api
            case "modulation": return this.#project.api.modulation
            case "transport": return this.#project.engine
            case "parameter":
                if (target === undefined) {throw new Error("Address-targeted operation requires target")}
                return this.resolver.resolve({
                    kind: "handle",
                    handle: "parameter",
                    name: "AutomatableParameterFieldAdapter"
                }, target)
        }
    }

    #operation(id: string): OperationDescriptor {
        const operation = this.#operations.get(id)
        if (operation === undefined) {throw new Error(`Unknown control operation '${id}'`)}
        return operation
    }
}
