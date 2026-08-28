import {Project} from "../project/Project"
import {generatedControlManifest} from "./generated"
import {ControlResolver} from "./ControlResolver"
import {decodeType, encodeType} from "./codec"
import {
    ControlBatchItem,
    ControlCall,
    ControlHandle,
    JsonObject,
    JsonValue,
    OperationDescriptor,
    ParameterSpec
} from "./types"

type DynamicOwner = {[key: string]: (...args: ReadonlyArray<never>) => JsonValue | object | undefined}

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
        return this.#invoke(operation, request)
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
        const execute = (): ReadonlyArray<JsonValue> => calls.map((call, index) =>
            this.#invoke(operations[index], call))
        if (transaction === "editing") {
            return this.#project.editing.modify(execute).unwrapOrUndefined() ?? []
        }
        return execute()
    }

    #invokeWithTransaction(operation: OperationDescriptor, request: ControlCall): JsonValue {
        if (operation.transaction !== "editing") {return this.#invoke(operation, request)}
        return this.#project.editing.modify(() => this.#invoke(operation, request)).unwrapOrUndefined() ?? null
    }

    #invoke(operation: OperationDescriptor, request: ControlCall): JsonValue {
        const {args, owner} = this.#decodeCall(operation, request)
        const value = (owner as DynamicOwner)[operation.method](...args as never[])
        return encodeType(operation.result, value, this.resolver)
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
