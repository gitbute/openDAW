import type {ControlHandle, JsonObject, JsonValue, OperationDescriptor} from "../control-api/types"
import type {Sample} from "@opendaw/studio-adapters"
import type {MusicalPosition, MusicalPositionView} from "../project/MusicalTime"

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

export type ResourceKind = "box" | "field" | "adapter" | "parameter" | "audio-output"

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
    readonly category: DeviceCatalogCategory
    readonly factory: string
    readonly manualUrl: string
    readonly handle?: ControlHandle
    readonly type?: string
    readonly label?: string
}

export type ResourceQuery = {
    readonly kind?: ResourceKind
    readonly text?: string
    readonly type?: string
    readonly owner?: ControlHandle
    readonly limit?: number
    readonly offset?: number
}

export type ManualToolName = "query_resources" | "inspect_resource"
    | "query_samples" | "query_device_catalog" | "inspect_device_definition"
    | "inspect_device" | "inspect_device_help" | "inspect_timing" | "inspect_patterns"
    | "inspect_audio" | "inspect_arrangement" | "apply_edit"

export type ArrangementInspectionInput = {
    readonly target?: ControlHandle
    readonly startPosition?: number
    readonly endPosition?: number
    readonly startMusical?: MusicalPosition
    readonly endMusical?: MusicalPosition
}

export type ArrangementMusicalPosition = MusicalPositionView

export type ArrangementRange = {
    readonly startPosition: number
    readonly endPosition: number
    readonly startMusical: ArrangementMusicalPosition
    readonly endMusical: ArrangementMusicalPosition
}

export type ArrangementRegion = {
    readonly handle: ControlHandle
    readonly label: string
    readonly startPosition: number
    readonly endPosition: number
    readonly startMusical: ArrangementMusicalPosition
    readonly endMusical: ArrangementMusicalPosition
    readonly muted: boolean
    readonly loopOffset: number
    readonly loopDuration: number
    readonly content?: string
    readonly audioFile?: ControlHandle
    readonly gain?: number
}

export type ArrangementTrack = {
    readonly handle: ControlHandle
    readonly type: string
    readonly targetName: string
    readonly targetControlName: string
    readonly regions: ReadonlyArray<ArrangementRegion>
}

export type ArrangementAudioUnit = {
    readonly handle: ControlHandle
    readonly label: string
    readonly type: string
    readonly isInstrument: boolean
    readonly isBus: boolean
    readonly isOutput: boolean
    readonly musicalActivity: string
    readonly automationActivity: string
    readonly tracks: ReadonlyArray<ArrangementTrack>
}

export type ArrangementNoteContent = {
    readonly id: string
    readonly kind: "notes"
    readonly handle: ControlHandle
    readonly eventsHandle: ControlHandle
    readonly owners: ReadonlyArray<ControlHandle>
    readonly noteCount: number
    readonly sourceSpanPulses: number
    readonly pitchMin: number | null
    readonly pitchMax: number | null
    readonly uniquePitches: number
    readonly averagePitch: number | null
    readonly averageVelocity: number | null
    readonly averageDurationPulses: number | null
}

export type ArrangementAutomationContent = {
    readonly id: string
    readonly kind: "automation"
    readonly handle: ControlHandle
    readonly eventsHandle: ControlHandle
    readonly owners: ReadonlyArray<ControlHandle>
    readonly eventCount: number
    readonly sourceSpanPulses: number
    readonly minValue: number | null
    readonly maxValue: number | null
    readonly startValue: number | null
    readonly endValue: number | null
}

export type ArrangementContent = ArrangementNoteContent | ArrangementAutomationContent

export type ArrangementInspectionResult = {
    readonly range: ArrangementRange
    readonly resolutionBars: number
    readonly density: ReadonlyArray<number>
    readonly markers: ReadonlyArray<{
        readonly handle: ControlHandle
        readonly position: number
        readonly musical: ArrangementMusicalPosition
        readonly label: string
    }>
    readonly audioUnits: ReadonlyArray<ArrangementAudioUnit>
    readonly contents: ReadonlyArray<ArrangementContent>
}

export type PatternInspectionInput = {
    readonly regions: ReadonlyArray<ControlHandle>
    readonly startMusical?: MusicalPosition
    readonly endMusical?: MusicalPosition
}

export type PatternTimedPosition = {
    readonly pulses: number
    readonly musical: MusicalPositionView
}

export type PatternNoteEvent = {
    readonly handle: ControlHandle
    readonly sourcePositionPulses: number
    readonly timelinePositionPulses: number
    readonly timelineMusical: MusicalPositionView
    readonly durationPulses: number
    readonly pitch: number
    readonly velocity: number
    readonly cent: number
    readonly chance: number
    readonly playCount: number
}

export type PatternValueEvent = {
    readonly handle: ControlHandle
    readonly sourcePositionPulses: number
    readonly timelinePositionPulses: number
    readonly timelineMusical: MusicalPositionView
    readonly value: number
    readonly interpolation: string
    readonly slope?: number
}

export type PatternNoteRegion = {
    readonly kind: "notes"
    readonly region: ControlHandle
    readonly label: string
    readonly regionStart: PatternTimedPosition
    readonly regionEnd: PatternTimedPosition
    readonly loop: {readonly offsetPulses: number, readonly durationPulses: number}
    readonly sourceEventCount: number
    readonly eventCount: number
    readonly events: ReadonlyArray<PatternNoteEvent>
    readonly truncated: boolean
}

export type PatternValueRegion = {
    readonly kind: "automation"
    readonly region: ControlHandle
    readonly label: string
    readonly regionStart: PatternTimedPosition
    readonly regionEnd: PatternTimedPosition
    readonly loop: {readonly offsetPulses: number, readonly durationPulses: number}
    readonly sourceEventCount: number
    readonly eventCount: number
    readonly events: ReadonlyArray<PatternValueEvent>
    readonly truncated: boolean
}

export type PatternInspectionRegion = PatternNoteRegion | PatternValueRegion

export type PatternInspectionResult = {
    readonly regions: ReadonlyArray<PatternInspectionRegion>
    readonly range?: {
        readonly startPosition: number
        readonly endPosition: number
        readonly startMusical: MusicalPositionView
        readonly endMusical: MusicalPositionView
    }
}

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

export type DeviceDefinitionInspectionResult = DeviceCatalogEntry

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

export type ToolBinding =
    | {
        readonly spec: ToolSpec
        readonly operation: OperationDescriptor
        readonly manual?: never
    }
    | {
        readonly spec: ToolSpec
        readonly operation?: never
        readonly manual: ManualToolName
    }

export type ApplyEditStep = {
    readonly id: string
    readonly namespace: "daw_project" | "daw_modulation" | "daw_parameter"
    readonly tool: string
    readonly arguments: JsonObject
}

export type ApplyEditResult = {
    readonly results: ReadonlyArray<{
        readonly id: string
        readonly value: JsonValue
    }>
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

export type DevicePropertyInspection = {
    readonly path: string
    readonly value: JsonValue
    readonly fieldType: string
    readonly constraints: JsonValue
    readonly automatable: boolean
    readonly parameterName?: string
    readonly parameterHandle?: ControlHandle
    readonly printValue?: JsonObject
}

export type DeviceParameterChoice = {
    readonly value: number
    readonly printValue: JsonObject
}

export type DeviceParameterInspection = {
    readonly handle: ControlHandle
    readonly name: string
    readonly type: string
    readonly owner: ControlHandle
    readonly field: ControlHandle
    readonly printValue: JsonObject
    readonly value?: JsonValue
    readonly choices?: ReadonlyArray<DeviceParameterChoice>
}

export type DeviceInspectionResult = {
    readonly handle: ControlHandle
    readonly category: DeviceCatalogCategory
    readonly type: string
    readonly label: string
    readonly properties: ReadonlyArray<DevicePropertyInspection>
    readonly parameters: ReadonlyArray<DeviceParameterInspection>
    readonly groups: ReadonlyArray<{readonly prefix: string, readonly label: string}>
    readonly group?: {readonly prefix: string, readonly label: string}
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
        readonly startMusical: MusicalPositionView
        readonly endMusical: MusicalPositionView
    }
    readonly sampleRate: number
    readonly requestedDurationSeconds: number
    readonly renderedDurationSeconds: number
    readonly tailDurationSeconds: number
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
