export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | ReadonlyArray<JsonValue> | JsonObject
export type JsonObject = {readonly [key: string]: JsonValue}

export type ControlHandle = {
    readonly $type: string
    readonly $address: string
}

export type HandleKind = "address" | "box" | "field" | "pointerField" | "primitiveField" | "adapter" | "parameter"

export type PrimitiveType = "number" | "string" | "boolean"

export type LiteralValue = null | boolean | number | string

export type TypeSpec =
    | {readonly kind: "void"}
    | {readonly kind: "primitive", readonly type: PrimitiveType, readonly semantic?: string}
    | {readonly kind: "literal", readonly values: ReadonlyArray<LiteralValue>}
    | {readonly kind: "array", readonly element: TypeSpec}
    | {readonly kind: "tuple", readonly elements: ReadonlyArray<TypeSpec>}
    | {readonly kind: "object", readonly name?: string, readonly properties: ReadonlyArray<PropertySpec>}
    | {readonly kind: "option", readonly value: TypeSpec}
    | {readonly kind: "nullable", readonly value: TypeSpec}
    | {readonly kind: "union", readonly alternatives: ReadonlyArray<TypeSpec>}
    | {readonly kind: "handle", readonly handle: HandleKind, readonly name: string, readonly constraint?: string}
    | {readonly kind: "factory", readonly factory: "instrument" | "effect"}
    | {readonly kind: "uuid"}
    | {readonly kind: "parameterValue"}
    | {readonly kind: "instrumentOptions"}

export type PropertySpec = {
    readonly name: string
    readonly optional: boolean
    readonly type: TypeSpec
}

export type ParameterSpec = {
    readonly name: string
    readonly optional: boolean
    readonly binding?: "identifier" | "pattern"
    readonly type: TypeSpec
}

export type OperationDescriptor = {
    readonly id: string
    readonly root: "project" | "modulation" | "transport" | "parameter"
    readonly ownerType: string
    readonly method: string
    readonly target: "singleton" | "address"
    readonly transaction: "editing" | "none"
    readonly async: boolean
    readonly parameters: ReadonlyArray<ParameterSpec>
    readonly result: TypeSpec
    readonly description?: string
}

export type ReportEntry = {
    readonly root: string
    readonly method: string
    readonly reason: string
}

export type GeneratedManifest = {
    readonly operations: ReadonlyArray<OperationDescriptor>
    readonly skipped: ReadonlyArray<ReportEntry>
    readonly unsupported: ReadonlyArray<ReportEntry>
}

export type ControlCall = {
    readonly operation: string
    readonly target?: ControlHandle
    readonly arguments?: JsonObject
}

export type OperationSearchResult = {
    readonly score: number
    readonly operation: OperationDescriptor
}

export type ResourceContext = {
    readonly box: ControlHandle
    readonly boxType: string
    readonly label?: string
    readonly path?: string
}

export type ResourceKind = "box" | "field" | "pointerField" | "primitiveField" | "adapter" | "parameter"

export type ResourceDescription = {
    readonly kind: ResourceKind
    readonly handle: ControlHandle
    readonly name: string
    readonly type: string
    readonly label?: string
    readonly context?: ResourceContext
    readonly field?: ControlHandle
}
