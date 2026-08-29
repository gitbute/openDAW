import {ControlApi} from "../control-api/ControlApi"
import type {AudioAnalysisTools} from "./AudioAnalysisTools"
import {ArrangementTools} from "./ArrangementTools"
import {EditTools} from "./EditTools"
import {toControlCall} from "./OperationToolCall"
import {PatternTools} from "./PatternTools"
import {ResourceTools} from "./ResourceTools"
import {ToolCatalog} from "./ToolCatalog"
import type {JsonObject, JsonValue} from "../control-api/types"
import type {DeviceHelpCatalog, SampleCatalog, ToolInvocation, ToolResult} from "./types"

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const isObject = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value)

export class ToolExecutor {
    readonly #controlApi: ControlApi
    readonly #catalog: ToolCatalog
    readonly #resources: ResourceTools
    readonly #arrangement: ArrangementTools
    readonly #patterns: PatternTools
    readonly #edits: EditTools
    readonly #audioAnalysis: AudioAnalysisTools | undefined

    constructor(controlApi: ControlApi, catalog: ToolCatalog = new ToolCatalog(),
                resources?: ResourceTools, sampleCatalog?: SampleCatalog,
                deviceHelpCatalog?: DeviceHelpCatalog,
                audioAnalysis?: AudioAnalysisTools) {
        this.#controlApi = controlApi
        this.#catalog = catalog
        this.#resources = resources ?? new ResourceTools(controlApi.resolver, sampleCatalog, deviceHelpCatalog)
        this.#arrangement = new ArrangementTools(controlApi.resolver)
        this.#patterns = new PatternTools(controlApi.resolver)
        this.#edits = new EditTools(controlApi, catalog)
        this.#audioAnalysis = audioAnalysis
    }

    async execute(invocation: ToolInvocation): Promise<ToolResult> {
        const binding = this.#catalog.resolve(invocation.namespace, invocation.name)
        if (binding === undefined) {
            return {ok: false, error: `Unknown tool '${invocation.namespace}.${invocation.name}'`}
        }
        try {
            const input = invocation.arguments ?? {}
            if (!isObject(input)) {throw new Error("Tool arguments must be an object")}
            if (binding.manual !== undefined) {
                switch (binding.manual) {
                    case "query_resources":
                        return {ok: true, value: this.#resources.query(input) as unknown as JsonValue}
                    case "inspect_resource":
                        return {ok: true, value: this.#resources.inspect(input) as unknown as JsonValue}
                    case "query_samples":
                        return {ok: true, value: await this.#resources.querySamples(input) as unknown as JsonValue}
                    case "query_device_catalog":
                        return {ok: true, value: this.#resources.queryDeviceCatalog(input) as unknown as JsonValue}
                    case "inspect_device_definition":
                        return {ok: true, value: await this.#resources.inspectDeviceDefinition(input) as unknown as JsonValue}
                    case "inspect_device":
                        return {ok: true, value: this.#resources.inspectDevice(input) as unknown as JsonValue}
                    case "inspect_device_help":
                        return {ok: true, value: await this.#resources.inspectDeviceHelp(input) as unknown as JsonValue}
                    case "inspect_timing":
                        return {ok: true, value: this.#resources.inspectTiming(input) as unknown as JsonValue}
                    case "inspect_arrangement":
                        return {ok: true, value: this.#arrangement.inspect(input) as unknown as JsonValue}
                    case "inspect_patterns":
                        return {ok: true, value: this.#patterns.inspect(input) as unknown as JsonValue}
                    case "inspect_audio":
                        if (this.#audioAnalysis === undefined) {
                            throw new Error("Audio analysis is unavailable.")
                        }
                        return {ok: true, value: await this.#audioAnalysis.inspect(input) as unknown as JsonValue}
                    case "apply_edit":
                        return {ok: true, value: this.#edits.apply(input) as unknown as JsonValue}
                }
            }
            const operation = binding.operation
            if (operation === undefined) {throw new Error("Tool has no executable binding")}
            const request = toControlCall(operation, input)
            const result = operation.async
                ? await this.#controlApi.callAsync(request)
                : this.#controlApi.call(request)
            return {ok: true, value: result}
        } catch (error) {
            return {ok: false, error: errorMessage(error)}
        }
    }
}
