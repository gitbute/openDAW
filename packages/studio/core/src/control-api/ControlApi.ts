import {Address, Box, Field, PointerField, PrimitiveField, PrimitiveType, Vertex} from "@opendaw/lib-box"
import {Pointers} from "@opendaw/studio-enums"
import type {AutomatableParameterFieldAdapter, BoxAdapter} from "@opendaw/studio-adapters"
import {Project} from "../project/Project"
import {generatedControlManifest} from "./generated"
import {decodeType, encodeType} from "./codec"
import {
    ControlCall,
    ControlBatchItem,
    ControlFieldInspection,
    ControlHandle,
    ControlInspection,
    ControlPrintValue,
    ControlSnapshot,
    ControlSnapshotOptions,
    JsonObject,
    JsonValue,
    OperationDescriptor,
    OperationSearchResult,
    ResourceDescription,
    ResourceContext,
    ResourceKind
} from "./types"

type DynamicOwner = {[key: string]: (...args: ReadonlyArray<never>) => never}

const tokens = (value: string): ReadonlyArray<string> => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

const handle = (type: string, address: Address): ControlHandle => ({$type: type, $address: address.toString()})

const isAnyBoxAdapter = (adapter: BoxAdapter): adapter is BoxAdapter => true

const isMissingAdapterFactory = (error: unknown): boolean =>
    error instanceof Error && error.message.startsWith("Could not find factory for")

const hasConstructorName = (value: object, name: string): boolean => {
    let current: object | null = value
    while (current !== null) {
        const constructor = (current as {readonly constructor?: {readonly name?: string}}).constructor
        if (constructor?.name === name) {return true}
        current = Object.getPrototypeOf(current)
    }
    return false
}

const collectFields = (vertex: Vertex, result: Array<Field>): void => {
    vertex.fields().forEach(field => {
        result.push(field)
        collectFields(field, result)
    })
}

const canonicalLabel = (box: Box): string | undefined => {
    const label = box.fields().find(field => field.fieldName === "label")
    if (!(label instanceof PrimitiveField)) {return undefined}
    const value = label.getValue()
    return typeof value === "string" && value.length > 0 ? value : undefined
}

const contextFor = (box: Box, path?: string): ResourceContext => {
    const label = canonicalLabel(box)
    return {
        box: handle(box.name, box.address),
        boxType: box.name,
        ...(label === undefined ? {} : {label}),
        ...(path === undefined ? {} : {path})
    }
}

const fieldHandleType = (kind: ResourceKind): "Field" | "PointerField" | "PrimitiveField" =>
    kind === "pointerField" ? "PointerField" : kind === "primitiveField" ? "PrimitiveField" : "Field"

const fieldResourceKind = (field: Field): ResourceKind =>
    field instanceof PointerField ? "pointerField" : field instanceof PrimitiveField ? "primitiveField" : "field"

const fieldHandle = (field: Field): ControlHandle => handle(fieldHandleType(fieldResourceKind(field)), field.address)

const vertexHandle = (vertex: Vertex): ControlHandle => {
    if (vertex instanceof Box) {return handle(vertex.name, vertex.address)}
    return vertex instanceof Field ? fieldHandle(vertex) : handle("Field", vertex.address)
}

const pointerTypeName = (value: unknown): string | undefined => {
    if (typeof value === "string") {return value}
    if (typeof value !== "number") {return undefined}
    if (Number.isNaN(value)) {return "Deprecated"}
    const entry = Object.entries(Pointers).find(([key, candidate]) =>
        !/^\d+$/.test(key) && typeof candidate === "number" && candidate === value)
    return entry?.[0] ?? String(value)
}

const pointerTypes = (field: Field): ReadonlyArray<string> => field.pointerRules.accepts
    .map(pointerTypeName)
    .filter((value): value is string => value !== undefined)

const jsonValue = (value: unknown): JsonValue => {
    if (value === null) {return null}
    if (typeof value === "string" || typeof value === "boolean") {return value}
    if (typeof value === "number") {return Number.isFinite(value) ? value : null}
    if (ArrayBuffer.isView(value)) {return Array.from(value as unknown as ArrayLike<number>)}
    if (Array.isArray(value)) {return value.map(jsonValue)}
    return null
}

const printValue = (value: {readonly value: string, readonly unit: string}): ControlPrintValue => ({
    value: value.value,
    unit: value.unit
})

const fieldUnit = (field: PrimitiveField<any, any>): string | undefined => {
    const unit = (field as PrimitiveField & {readonly unit?: unknown}).unit
    return typeof unit === "string" ? unit : undefined
}

const primitiveValue = (field: PrimitiveField, value: JsonValue): boolean | number | string | Readonly<Int8Array> => {
    switch (field.type) {
        case PrimitiveType.Boolean:
            if (typeof value === "boolean") {return value}
            break
        case PrimitiveType.Float32:
        case PrimitiveType.Int32:
            if (typeof value === "number" && Number.isFinite(value)) {return value}
            break
        case PrimitiveType.String:
            if (typeof value === "string") {return value}
            break
        case PrimitiveType.Bytes:
            if (Array.isArray(value) && value.every(element => typeof element === "number"
                && Number.isInteger(element) && element >= -128 && element <= 127)) {
                return new Int8Array(value)
            }
            break
    }
    throw new Error(`[ControlApi] value does not match ${field.type}`)
}

const inspectField = (field: Field): ControlFieldInspection => {
    const primitive = field instanceof PrimitiveField
    const pointer = field instanceof PointerField
    const accepted = pointerTypes(field)
    return {
        name: field.fieldName,
        handle: fieldHandle(field),
        kind: pointer ? "pointer" : primitive ? "primitive" : "field",
        type: field.constructor.name,
        context: contextFor(field.box, field.debugPath),
        ...(accepted.length === 0 ? {} : {pointerTypes: accepted}),
        ...(primitive ? {
            primitiveType: field.type,
            ...(fieldUnit(field) === undefined ? {} : {unit: fieldUnit(field)}),
            value: jsonValue(field.getValue())
        } : {}),
        ...(pointer ? {
            ...(pointerTypeName(field.pointerType) === undefined ? {} : {pointerType: pointerTypeName(field.pointerType)}),
            target: field.targetVertex.map(vertexHandle).unwrapOrNull()
        } : {})
    }
}

const inspectParameter = (parameter: AutomatableParameterFieldAdapter): ControlInspection => {
    const field = parameter.field
    const unit = fieldUnit(field)
    const rawValue = jsonValue(parameter.getValue())
    return {
        kind: "parameter",
        handle: handle("AutomatableParameterFieldAdapter", parameter.address),
        name: parameter.name,
        type: String(parameter.type),
        field: fieldHandle(field),
        context: contextFor(field.box, field.debugPath),
        primitiveType: field.type,
        ...(unit === undefined ? {} : {unit}),
        value: rawValue,
        rawValue,
        unitValue: parameter.getUnitValue(),
        printValue: printValue(parameter.getPrintValue()),
        controlledValue: jsonValue(parameter.getControlledValue()),
        controlledPrintValue: printValue(parameter.getControlledPrintValue())
    }
}

const inspectBox = (box: Box): ControlInspection => {
    const label = canonicalLabel(box)
    return {
        kind: "box",
        handle: handle(box.name, box.address),
        name: box.name,
        type: box.name,
        ...(label === undefined ? {} : {label}),
        context: contextFor(box),
        fields: box.fields().map(inspectField)
    }
}

const inspectAdapter = (adapter: BoxAdapter): ControlInspection => {
    const type = adapter.constructor.name
    const label = canonicalLabel(adapter.box)
    return {
        kind: "adapter",
        handle: handle(type, adapter.address),
        name: type,
        type,
        ...(label === undefined ? {} : {label}),
        box: handle(adapter.box.name, adapter.box.address),
        context: contextFor(adapter.box),
        fields: adapter.box.fields().map(inspectField)
    }
}

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
        const operation = this.#operation(request.operation)
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

    inspect(resource: ControlHandle): ControlInspection {
        const resolved = this.#resolveInspectable(resource)
        if (resolved instanceof Box) {return inspectBox(resolved)}
        if (resolved instanceof Field) {
            return {...inspectField(resolved), kind: fieldResourceKind(resolved)}
        }
        if (resource.$type === "AutomatableParameterFieldAdapter") {
            return inspectParameter(resolved as AutomatableParameterFieldAdapter)
        }
        return inspectAdapter(resolved as BoxAdapter)
    }

    snapshot(options: ControlSnapshotOptions = {}): ControlSnapshot {
        const type = options.type?.toLowerCase()
        const matchesType = (resource: ResourceDescription): boolean => type === undefined
            || resource.type.toLowerCase() === type
            || resource.handle.$type.toLowerCase() === type
        const query = options.query ?? ""
        return {
            boxes: options.boxes === false
                ? []
                : this.find("box", query).filter(matchesType).map(resource => this.inspect(resource.handle)),
            parameters: options.parameters === false
                ? []
                : this.find("parameter", query).filter(matchesType).map(resource => this.inspect(resource.handle))
        }
    }

    set(resource: ControlHandle, value: JsonValue): null {
        const field = this.#resolvePrimitiveField(resource)
        const next = primitiveValue(field, value)
        this.#project.editing.modify(() => field.setValue(next))
        return null
    }

    batch(calls: ReadonlyArray<ControlBatchItem>): ReadonlyArray<JsonValue> {
        if (calls.length === 0) {return []}
        const transactions = calls.map(call => this.#batchTransaction(call))
        const transaction = transactions[0]
        if (transactions.some(candidate => candidate !== transaction)) {
            throw new Error("[ControlApi] mixed editing and non-editing batches are not supported")
        }
        const execute = (): ReadonlyArray<JsonValue> => calls.map(call =>
            this.#isControlCall(call) ? this.call(call) : this.set(call.handle, call.value))
        if (transaction === "editing") {
            return this.#project.editing.modify(execute).unwrapOrUndefined() ?? []
        }
        return execute()
    }

    find(kind: ResourceKind, query: string = ""): ReadonlyArray<ResourceDescription> {
        const needle = query.toLowerCase()
        if (kind === "box") {
            return this.#project.boxGraph.boxes()
                .map(box => {
                    const label = canonicalLabel(box)
                    return {
                        kind,
                        handle: handle(box.name, box.address),
                        name: box.name,
                        type: box.name,
                        ...(label === undefined ? {} : {label}),
                        context: contextFor(box)
                    }
                })
                .filter(resource => this.#matches(resource, needle))
        }

        if (kind === "adapter") {
            return this.#adapters()
                .map(adapter => {
                    const type = adapter.constructor.name
                    const label = canonicalLabel(adapter.box)
                    return {
                        kind,
                        handle: handle(type, adapter.address),
                        name: type,
                        type,
                        ...(label === undefined ? {} : {label}),
                        context: contextFor(adapter.box)
                    }
                })
                .filter(resource => this.#matches(resource, needle))
        }

        if (kind === "parameter") {
            this.#adapters()
            return this.#project.parameterFieldAdapters.values()
                .map(parameter => ({
                    kind,
                    handle: handle("AutomatableParameterFieldAdapter", parameter.address),
                    name: parameter.name,
                    type: parameter.type,
                    field: handle("PrimitiveField", parameter.field.address),
                    context: contextFor(parameter.field.box, parameter.field.debugPath)
                }))
                .filter(resource => this.#matches(resource, needle))
        }

        const fields: Array<Field> = []
        this.#project.boxGraph.boxes().forEach(box => collectFields(box, fields))
        return fields
            .filter(field => kind === "field"
                || (kind === "pointerField" && field instanceof PointerField)
                || (kind === "primitiveField" && field instanceof PrimitiveField))
            .map(field => ({
                kind,
                handle: handle(fieldHandleType(kind), field.address),
                name: field.fieldName,
                type: field.constructor.name,
                context: contextFor(field.box, field.debugPath)
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
            case "primitive": return type.semantic ?? type.type
            case "uuid": return "uuid"
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

    #operation(id: string): OperationDescriptor {
        const operation = this.#operations.get(id)
        if (operation === undefined) {throw new Error(`Unknown control operation '${id}'`)}
        return operation
    }

    #isControlCall(value: ControlBatchItem): value is ControlCall {
        return typeof (value as ControlCall).operation === "string"
    }

    #batchTransaction(value: ControlBatchItem): "editing" | "none" {
        if (!this.#isControlCall(value)) {return "editing"}
        return this.#operation(value.operation).transaction
    }

    #resolveInspectable(resource: ControlHandle): Box | Field | BoxAdapter | AutomatableParameterFieldAdapter {
        if (typeof resource.$type !== "string" || typeof resource.$address !== "string") {
            throw new Error("[ControlApi] invalid control handle")
        }
        const address = Address.decode(resource.$address)
        if (address.isBox()) {
            const box = this.#project.boxGraph.findBox(address.uuid).unwrap(`No box at ${resource.$address}`)
            if (resource.$type === "Box" || resource.$type === box.name) {return box}
            const adapter = this.#project.boxAdapters.adapterFor(box, isAnyBoxAdapter)
            if (resource.$type === "BoxAdapter" || hasConstructorName(adapter, resource.$type)) {return adapter}
            throw new Error(`[ControlApi] handle type ${resource.$type} does not match ${box.name}`)
        }

        const vertex = this.#project.boxGraph.findVertex(address).unwrap(`No vertex at ${resource.$address}`)
        if (resource.$type === "AutomatableParameterFieldAdapter") {
            this.#project.boxAdapters.adapterFor(vertex.box, isAnyBoxAdapter)
            return this.#project.parameterFieldAdapters.opt(address)
                .unwrap(`No parameter at ${resource.$address}`)
        }
        if (!(vertex instanceof Field)) {
            throw new Error(`[ControlApi] handle ${resource.$address} is not a field`)
        }
        if (resource.$type === "PointerField" && !(vertex instanceof PointerField)) {
            throw new Error(`[ControlApi] handle ${resource.$address} is not a PointerField`)
        }
        if (resource.$type === "PrimitiveField" && !(vertex instanceof PrimitiveField)) {
            throw new Error(`[ControlApi] handle ${resource.$address} is not a PrimitiveField`)
        }
        if (resource.$type !== "Field" && resource.$type !== "PointerField"
            && resource.$type !== "PrimitiveField") {
            throw new Error(`[ControlApi] handle type ${resource.$type} is not inspectable`)
        }
        return vertex
    }

    #resolvePrimitiveField(resource: ControlHandle): PrimitiveField {
        if (resource.$type === "AutomatableParameterFieldAdapter") {
            throw new Error("[ControlApi] use the parameter API for automatable parameters")
        }
        const resolved = this.#resolveInspectable(resource)
        if (!(resolved instanceof PrimitiveField)) {
            throw new Error(`[ControlApi] handle ${resource.$address} is not a PrimitiveField`)
        }
        if (resolved.deprecated) {
            throw new Error(`[ControlApi] cannot set deprecated field ${resource.$address}`)
        }
        this.#adapters()
        if (this.#project.parameterFieldAdapters.opt(resolved.address).nonEmpty()) {
            throw new Error("[ControlApi] use the parameter API for automatable parameters")
        }
        return resolved
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
        if (query.length === 0) {return true}
        return [
            resource.name,
            resource.type,
            resource.label,
            resource.handle.$type,
            resource.handle.$address,
            resource.field?.$type,
            resource.field?.$address,
            resource.context?.box.$type,
            resource.context?.box.$address,
            resource.context?.boxType,
            resource.context?.label,
            resource.context?.path
        ].filter((value): value is string => value !== undefined)
            .join(" ").toLowerCase().includes(query)
    }

    #adapters(): ReadonlyArray<BoxAdapter> {
        return this.#project.boxGraph.boxes().flatMap(box => {
            try {
                return [this.#project.boxAdapters.adapterFor(box, isAnyBoxAdapter)]
            } catch (error) {
                if (isMissingAdapterFactory(error)) {return []}
                throw error
            }
        })
    }
}
