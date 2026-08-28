import {Address, Box, BoxGraph, Field, PointerField, PrimitiveField} from "@opendaw/lib-box"
import {Pointers} from "@opendaw/studio-enums"
import {
    AutomatableParameterFieldAdapter,
    BoxAdapter,
    BoxAdapters,
    ParameterFieldAdapters
} from "@opendaw/studio-adapters"
import type {ControlHandle, TypeSpec} from "./types"

type HandleSpec = Extract<TypeSpec, {readonly kind: "handle"}>
type Addressable = Address | {readonly address: Address}

const hasConstructorName = (value: object, name: string): boolean => {
    let current: object | null = value
    while (current !== null) {
        const constructor = (current as {readonly constructor?: {readonly name?: string}}).constructor
        if (constructor?.name === name) {return true}
        current = Object.getPrototypeOf(current)
    }
    return false
}

const pointerName = (value: unknown): string | undefined => {
    if (typeof value === "string") {return value}
    if (typeof value !== "number") {return undefined}
    if (Number.isNaN(value)) {return "Deprecated"}
    return Object.entries(Pointers).find(([key, candidate]) =>
        !/^\d+$/.test(key) && typeof candidate === "number" && candidate === value)?.[0]
}

const pointerTypes = (field: Field): ReadonlyArray<unknown> =>
    field instanceof PointerField ? [field.pointerType] : field.pointerRules.accepts

const isAddressable = (value: unknown): value is {readonly address: Address} =>
    typeof value === "object" && value !== null
    && "address" in value && value.address instanceof Address

const isMissingAdapterFactory = (error: unknown): boolean =>
    error instanceof Error && error.message.startsWith("Could not find factory for")

export class ControlResolver {
    readonly #boxGraph: BoxGraph
    readonly #boxAdapters: BoxAdapters
    readonly #parameterFieldAdapters: ParameterFieldAdapters

    constructor(boxGraph: BoxGraph, boxAdapters: BoxAdapters, parameterFieldAdapters: ParameterFieldAdapters) {
        this.#boxGraph = boxGraph
        this.#boxAdapters = boxAdapters
        this.#parameterFieldAdapters = parameterFieldAdapters
    }

    handle(value: Addressable): ControlHandle {
        return {$address: (value instanceof Address ? value : value.address).toString()}
    }

    resolve(spec: HandleSpec, value: unknown): Address | Box | Field | BoxAdapter | AutomatableParameterFieldAdapter {
        const handle = this.#handle(value, spec.name)
        const address = Address.decode(handle.$address)
        switch (spec.handle) {
            case "address":
                return address
            case "box":
                return this.#resolveBox(spec, address)
            case "adapter":
                return this.#resolveAdapter(spec, address)
            case "parameter":
                return this.#resolveParameter(spec, address)
            case "field":
            case "pointerField":
            case "primitiveField":
                return this.#resolveField(spec, address)
        }
    }

    assertResult(spec: HandleSpec, value: unknown): ControlHandle {
        if (spec.handle === "address") {
            if (!(value instanceof Address)) {
                throw new Error(`[ControlApi] ${spec.name} result is not an Address`)
            }
            return this.handle(value)
        }
        if (!isAddressable(value)) {
            throw new Error(`[ControlApi] ${spec.name} result is not addressable`)
        }
        this.#assertRuntimeType(spec, value)
        return this.handle(value)
    }

    boxes(): ReadonlyArray<Box> {return this.#boxGraph.boxes()}

    fields(): ReadonlyArray<Field> {
        const result: Array<Field> = []
        const visit = (fields: ReadonlyArray<Field>): void => fields.forEach(field => {
            result.push(field)
            visit(field.fields())
        })
        this.#boxGraph.boxes().forEach(box => visit(box.fields()))
        return result
    }

    adapters(): ReadonlyArray<BoxAdapter> {
        return this.#boxGraph.boxes().flatMap(box => {
            try {
                return [this.#boxAdapters.adapterFor(box,
                    (adapter: BoxAdapter): adapter is BoxAdapter => true)]
            } catch (error) {
                if (isMissingAdapterFactory(error)) {return []}
                throw error
            }
        })
    }

    parameters(): ReadonlyArray<AutomatableParameterFieldAdapter> {
        // Adapter construction is the canonical registration path. Resolve every
        // box before reading the registry so this does not depend on prior UI use.
        this.adapters()
        return this.#parameterFieldAdapters.values()
    }

    #handle(value: unknown, expected: string): ControlHandle {
        if (typeof value !== "object" || value === null) {
            throw new Error(`[ControlApi] ${expected} handle must be an object`)
        }
        const address = (value as {readonly $address?: unknown}).$address
        if (typeof address !== "string") {
            throw new Error(`[ControlApi] ${expected} handle must contain string $address`)
        }
        const debugType = (value as {readonly $type?: unknown}).$type
        if (debugType !== undefined && typeof debugType !== "string") {
            throw new Error(`[ControlApi] ${expected} handle $type must be a string when present`)
        }
        return {$address: address}
    }

    #resolveBox(spec: HandleSpec, address: Address): Box {
        if (!address.isBox()) {
            throw new Error(`[ControlApi] ${spec.name} handle must address a box`)
        }
        const box = this.#boxGraph.findBox(address.uuid).unwrap(`No box at ${address.toString()}`)
        if (spec.name !== "Box" && box.name !== spec.name) {
            throw new Error(`[ControlApi] Expected box ${spec.name}, received ${box.name}`)
        }
        return box
    }

    #resolveAdapter(spec: HandleSpec, address: Address): BoxAdapter {
        const box = this.#resolveBox({kind: "handle", handle: "box", name: "Box"}, address)
        const adapter = this.#boxAdapters.adapterFor(box,
            (candidate: BoxAdapter): candidate is BoxAdapter => true)
        if (spec.name !== "BoxAdapter" && !hasConstructorName(adapter, spec.name)) {
            throw new Error(`[ControlApi] Expected adapter ${spec.name}, received ${adapter.constructor.name}`)
        }
        return adapter
    }

    #resolveParameter(spec: HandleSpec, address: Address): AutomatableParameterFieldAdapter {
        this.#boxGraph.findVertex(address).unwrap(`No parameter at ${address.toString()}`)
        // Dynamic parameter fields (for example Apparat's WerkstattParameterBox.value) do not
        // have a BoxAdapter of their own. Creating all canonical box adapters registers them in
        // ParameterFieldAdapters, just as parameters() does, and keeps handle resolution generic.
        this.adapters()
        const adapter = this.#parameterFieldAdapters.opt(address)
            .unwrap(`No parameter at ${address.toString()}`)
        if (!hasConstructorName(adapter, spec.name)) {
            throw new Error(`[ControlApi] Expected parameter ${spec.name}, received ${adapter.constructor.name}`)
        }
        return adapter
    }

    #resolveField(spec: HandleSpec, address: Address): Field {
        const vertex = this.#boxGraph.findVertex(address).unwrap(`No field at ${address.toString()}`)
        if (!(vertex instanceof Field)) {
            throw new Error(`[ControlApi] ${address.toString()} does not address a field`)
        }
        if (spec.handle === "pointerField" && !(vertex instanceof PointerField)) {
            throw new Error(`[ControlApi] Expected PointerField at ${address.toString()}`)
        }
        if (spec.handle === "primitiveField" && !(vertex instanceof PrimitiveField)) {
            throw new Error(`[ControlApi] Expected PrimitiveField at ${address.toString()}`)
        }
        if (spec.handle === "field" && !(vertex instanceof Field)) {
            throw new Error(`[ControlApi] Expected Field at ${address.toString()}`)
        }
        if (spec.constraint !== undefined && !this.#satisfiesPointerConstraint(vertex, spec)) {
            const accepted = pointerTypes(vertex).map(pointerName)
                .filter((value): value is string => value !== undefined).join(", ")
            throw new Error(`[ControlApi] Field at ${address.toString()} does not satisfy ${spec.constraint}`
                + (accepted.length === 0 ? "" : ` (accepts ${accepted})`))
        }
        return vertex
    }

    #assertRuntimeType(spec: HandleSpec, value: object): void {
        switch (spec.handle) {
            case "box":
                if (!(value instanceof Box)) {
                    throw new Error(`[ControlApi] Expected box ${spec.name}`)
                }
                if (spec.name !== "Box" && value.name !== spec.name) {
                    throw new Error(`[ControlApi] Expected box ${spec.name}, received ${value.name}`)
                }
                return
            case "adapter":
                if (!(value instanceof Object) || !isAddressable(value)
                    || (spec.name !== "BoxAdapter" && !hasConstructorName(value, spec.name))) {
                    throw new Error(`[ControlApi] Expected adapter ${spec.name}`)
                }
                return
            case "parameter":
                if (!(value instanceof AutomatableParameterFieldAdapter)
                    || !hasConstructorName(value, spec.name)) {
                    throw new Error(`[ControlApi] Expected parameter ${spec.name}`)
                }
                return
            case "field":
            case "pointerField":
            case "primitiveField":
                if (!(value instanceof Field)) {
                    throw new Error(`[ControlApi] Expected ${spec.handle} result`)
                }
                if (spec.handle === "pointerField" && !(value instanceof PointerField)) {
                    throw new Error(`[ControlApi] Expected PointerField result`)
                }
                if (spec.handle === "primitiveField" && !(value instanceof PrimitiveField)) {
                    throw new Error(`[ControlApi] Expected PrimitiveField result`)
                }
                if (spec.constraint !== undefined && !this.#satisfiesPointerConstraint(value, spec)) {
                    throw new Error(`[ControlApi] Field result does not satisfy ${spec.constraint}`)
                }
                return
            case "address":
                return
        }
    }

    #satisfiesPointerConstraint(field: Field, spec: HandleSpec): boolean {
        const accepted = pointerTypes(field)
        const members = spec.constraintMembers
        if (members === undefined || members.length === 0) {return false}
        return members.some(member => {
            const match = /^Pointers\.([A-Za-z_$][\w$]*)$/.exec(member)
            if (match === null) {return false}
            const pointer = (Pointers as unknown as Record<string, unknown>)[match[1]]
            return (typeof pointer === "number" || typeof pointer === "string")
                && accepted.includes(pointer)
        })
    }
}
