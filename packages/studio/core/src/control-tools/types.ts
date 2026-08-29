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

export type DeviceHelpExample = {
    readonly name: string
    readonly code: string
}

export type DeviceHelpContent = {
    readonly manualMarkdown: string
    readonly programmingGuide?: string
    readonly examples?: ReadonlyArray<DeviceHelpExample>
}

export type DeviceHelpCatalog = {
    read(manualUrl: string): Promise<DeviceHelpContent>
}

export type DeviceHelpInspectionResult = DeviceHelpContent & {
    readonly handle: ControlHandle
    readonly type: string
    readonly label: string
    readonly manualUrl: string
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
    | "query_samples" | "query_device_catalog" | "inspect_device_definition"
    | "inspect_device" | "inspect_instrument" | "inspect_device_help" | "inspect_timing"
    | "inspect_audio"

export type DeviceCatalogCategory = "instrument" | "midi-effect" | "audio-effect"

export type DeviceCatalogEntry = {
    readonly category: DeviceCatalogCategory
    readonly factory: string
    readonly name: string
    readonly briefDescription: string
    readonly description: string
    readonly manualPage: string
    readonly trackType?: string
    readonly effectType?: "midi" | "audio"
    readonly external?: boolean
}

export type DeviceCatalogQuery = {
    readonly category?: DeviceCatalogCategory
    readonly text?: string
    readonly limit?: number
    readonly offset?: number
}

export type DeviceCatalogQueryResult = {
    readonly devices: ReadonlyArray<DeviceCatalogEntry>
    readonly total: number
    readonly limit: number
    readonly offset: number
}

export type DeviceDefinitionInspectionResult = DeviceCatalogEntry & DeviceHelpContent

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
    readonly parameterHandle?: ControlHandle
    readonly printValue?: JsonObject
}

export type DevicePropertyInspection = InstrumentPropertyInspection

export type DeviceParameterInspection = {
    readonly handle: ControlHandle
    readonly name: string
    readonly type: string
    readonly owner: ControlHandle
    readonly field: ControlHandle
    readonly printValue: JsonObject
    readonly value?: JsonValue
}

export type DeviceInspectionResult = {
    readonly handle: ControlHandle
    readonly category: DeviceCatalogCategory
    readonly type: string
    readonly label: string
    readonly properties: ReadonlyArray<DevicePropertyInspection>
    readonly parameters: ReadonlyArray<DeviceParameterInspection>
    readonly groups: ReadonlyArray<{readonly prefix: string, readonly label: string}>
}

export type InstrumentInspectionResult = {
    readonly handle: ControlHandle
    readonly type: string
    readonly label: string
    readonly properties: ReadonlyArray<InstrumentPropertyInspection>
    readonly groups: ReadonlyArray<{readonly prefix: string, readonly label: string}>
    readonly guidance?: string
}

export type AudioAnalysisTarget = "master" | {
    readonly handle: ControlHandle
    readonly label: string
}

export type AudioAnalysisLevel = {
    readonly peakDbfs: number
    readonly rmsDbfs: number
    readonly crestDb: number
}

export type AudioAnalysisBand = {
    readonly fromHz: number
    readonly toHz: number
    readonly relativeDb: number
}

export type AudioAnalysisResult = {
    readonly target: AudioAnalysisTarget
    readonly range: {
        readonly startPosition: number
        readonly endPosition: number
    }
    readonly sampleRate: number
    readonly durationSeconds: number
    readonly level: AudioAnalysisLevel
    readonly spectrum: ReadonlyArray<AudioAnalysisBand>
    readonly waveform: ReadonlyArray<number>
}

export type TimingSignatureEvent = {
    readonly index: number
    readonly positionPulses: number
    readonly bar: number
    readonly nominator: number
    readonly denominator: number
}

export type TimingInspectionResult = {
    readonly positionPulses: number
    readonly tempo: number
    readonly signature: {readonly nominator: number, readonly denominator: number}
    readonly pulsesPerBar: number
    readonly quarterNotePulses: number
    readonly noteLengths: {
        readonly whole: number
        readonly half: number
        readonly quarter: number
        readonly eighth: number
        readonly sixteenth: number
    }
    readonly signatureEvents: ReadonlyArray<TimingSignatureEvent>
}
