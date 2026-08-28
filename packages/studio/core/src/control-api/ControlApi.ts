import {Address} from "@opendaw/lib-box"
import {Project} from "../project/Project"
import {generatedControlManifest} from "./generated"
import {decodeType, encodeType} from "./codec"
import {
    ControlCall,
    ControlHandle,
    JsonObject,
    OperationDescriptor,
    OperationSearchResult,
    ResourceDescription,
    ResourceKind
} from "./types"

type DynamicOwner = {[key: string]: (...args: ReadonlyArray<never>) => never}

const tokens = (value: string): ReadonlyArray<string> => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

const handle = (type: string, address: Address): ControlHandle => ({$type: type, $address: address.toString()})

export class ControlApi {
    readonly #project: Project
    readonly #operations: ReadonlyMap<string, OperationDescriptor>

    constructor(project: Project) {
        this.#project = project
        this.#operations = new Map(generatedControlManifest.operations.map(operation => [operation.id, operation]))
    }

    search(query: string, options?: {readonly limit?: number}): ReadonlyArray<OperationSearchResult> {
        const queryTokens = tokens(query)
        const limit = options?.limit ?? 20
        if (queryTokens.length === 0) {return []}
        return generatedControlManifest.operations
            .map(operation => {
                const fields = [
                    operation.id,
                    operation.ownerType,
                    operation.method,
                    operation.description ?? "",
                    ...operation.parameters.flatMap(parameter => [parameter.name, this.#typeName(parameter.type)])
                ].join(" ").toLowerCase()
                const score = queryTokens.reduce((sum, token) => sum + (fields.includes(token) ? 1 : 0), 0)
                return {score, operation}
            })
            .filter(result => result.score > 0)
            .sort((left, right) => right.score - left.score || left.operation.id.localeCompare(right.operation.id))
            .slice(0, limit)
    }

    call(request: ControlCall): ReturnType<typeof encodeType> {
        const operation = this.#operations.get(request.operation)
        if (operation === undefined) {throw new Error(`Unknown control operation '${request.operation}'`)}
        const input: JsonObject = request.arguments ?? {}
        const known = new Set(operation.parameters.map(parameter => parameter.name))
        Object.keys(input).forEach(name => {
            if (!known.has(name)) {throw new Error(`Unknown argument '${name}' for ${operation.id}`)}
        })
        const args = operation.parameters.map(parameter => {
            const present = Object.prototype.hasOwnProperty.call(input, parameter.name)
            if (!present && !parameter.optional) {throw new Error(`Missing argument '${parameter.name}' for ${operation.id}`)}
            return present ? decodeType(parameter.type, input[parameter.name], this.#project) : undefined
        })
        const owner = this.#resolveOwner(operation, request.target)
        const invoke = () => (owner as DynamicOwner)[operation.method](...args as never[])
        const value = operation.transaction === "editing"
            ? this.#project.editing.modify(invoke).unwrapOrUndefined()
            : invoke()
        return encodeType(operation.result, value)
    }

    find(kind: ResourceKind, query: string = ""): ReadonlyArray<ResourceDescription> {
        const needle = query.toLowerCase()
        if (kind === "box") {
            return this.#project.boxGraph.boxes()
                .map(box => ({kind, handle: handle(box.name, box.address), name: box.name, type: box.name}))
                .filter(resource => this.#matches(resource, needle))
        }
        return this.#project.parameterFieldAdapters.values()
            .map(parameter => ({
                kind,
                handle: handle("AutomatableParameterFieldAdapter", parameter.address),
                name: parameter.name,
                type: parameter.type
            }))
            .filter(resource => this.#matches(resource, needle))
    }

    get manifest() {return generatedControlManifest}

    #typeName(type: OperationDescriptor["result"]): string {
        switch (type.kind) {
            case "array": return `array<${this.#typeName(type.element)}>`
            case "tuple": return "tuple"
            case "object": return type.name ?? "object"
            case "handle": return type.name
            case "primitive": return type.type
            case "literal": return "literal"
            case "option": return `option<${this.#typeName(type.value)}>`
            case "nullable": return "nullable"
            case "union": return "union"
            case "factory": return `${type.factory} factory`
            case "parameterValue": return "parameter value"
            case "instrumentOptions": return "instrument options"
            case "void": return "void"
        }
    }

    #resolveTarget(target: ControlHandle | undefined): object {
        if (target === undefined) {throw new Error("Address-targeted operation requires target")}
        return decodeType({kind: "handle", handle: "parameter", name: "AutomatableParameterFieldAdapter"}, target, this.#project) as object
    }

    #resolveOwner(operation: OperationDescriptor, target: ControlHandle | undefined): object {
        switch (operation.root) {
            case "project": return this.#project.api
            case "modulation": return this.#project.api.modulation
            case "transport": return this.#project.engine
            case "parameter": return this.#resolveTarget(target)
        }
    }

    #matches(resource: ResourceDescription, query: string): boolean {
        return query.length === 0 || `${resource.name} ${resource.type} ${resource.handle.$address}`
            .toLowerCase().includes(query)
    }
}
