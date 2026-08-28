import type {ControlHandle, JsonObject, JsonValue, OperationDescriptor} from "../control-api/types"
import type {Sample} from "@opendaw/studio-adapters"

export type JsonSchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null"

export type JsonSchema = {
    readonly type?: JsonSchemaType
    readonly enum?: ReadonlyArray<null | boolean | number | string>
    readonly properties?: Readonly<Record<string, JsonSchema>>
    readonly required?: ReadonlyArray<string>
    readonly additionalProperties?: false
    readonly items?: JsonSchema | false
    readonly prefixItems?: ReadonlyArray<JsonSchema>
    readonly anyOf?: ReadonlyArray<JsonSchema>
    readonly description?: string
    readonly format?: string
    readonly minimum?: number
    readonly maximum?: number
    readonly minItems?: number
    readonly maxItems?: number
}

export type ToolExposure = "eager" | "deferred"

export type FunctionToolSpec = {
    readonly namespace: string
    readonly name: string
    readonly description: string
    readonly inputSchema: JsonSchema
    readonly exposure: ToolExposure
}

export type ToolSpec = FunctionToolSpec

export type ToolNamespaceSpec = {
    readonly namespace: string
    readonly description: string
    readonly tools: ReadonlyArray<ToolSpec>
}

export type ToolCatalogSpec = {
    readonly namespaces: ReadonlyArray<ToolNamespaceSpec>
    readonly tools: ReadonlyArray<ToolSpec>
}

export type ResourceKind = "box" | "field" | "adapter" | "parameter"

export type SampleCatalog = {
    list(): Promise<ReadonlyArray<Sample>>
}

export type ResourceQuery = {
    readonly kind?: ResourceKind
    readonly text?: string
    readonly type?: string
    readonly owner?: ControlHandle
    readonly limit?: number
    readonly offset?: number
}

export type ResourceToolName = "query_resources" | "inspect_resource"
    | "query_samples" | "inspect_instrument"

export type SampleQuery = {
    readonly text?: string
    readonly origin?: Sample["origin"]
    readonly minBpm?: number
    readonly maxBpm?: number
    readonly minDuration?: number
    readonly maxDuration?: number
    readonly limit?: number
    readonly offset?: number
}

export type ToolBinding = {
    readonly spec: ToolSpec
    readonly operation?: OperationDescriptor
    readonly resource?: ResourceToolName
}

export type ToolInvocation = {
    readonly namespace: string
    readonly name: string
    readonly arguments?: JsonObject
}

export type ToolSuccess = {
    readonly ok: true
    readonly value: JsonValue
}

export type ToolFailure = {
    readonly ok: false
    readonly error: string
}

export type ToolResult = ToolSuccess | ToolFailure

export type ResourceQueryResult = {
    readonly resources: ReadonlyArray<JsonObject>
    readonly total: number
    readonly limit: number
    readonly offset: number
}

export type SampleQueryResult = {
    readonly samples: ReadonlyArray<Sample>
    readonly total: number
    readonly limit: number
    readonly offset: number
}

export type ResourceInspectionResult = {
    readonly handle: ControlHandle
    readonly views: ReadonlyArray<JsonObject>
}

export type InstrumentPropertyInspection = {
    readonly path: string
    readonly value: JsonValue
    readonly fieldType: string
    readonly constraints: JsonValue
    readonly automatable: boolean
    readonly parameterName?: string
    readonly printValue?: JsonObject
}

export type InstrumentInspectionResult = {
    readonly handle: ControlHandle
    readonly type: string
    readonly label: string
    readonly properties: ReadonlyArray<InstrumentPropertyInspection>
    readonly groups: ReadonlyArray<{readonly prefix: string, readonly label: string}>
}
