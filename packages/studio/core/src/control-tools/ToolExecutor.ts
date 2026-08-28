import {ControlApi} from "../control-api/ControlApi"
import {ResourceTools} from "./ResourceTools"
import {ToolCatalog} from "./ToolCatalog"
import type {ControlHandle, JsonObject, JsonValue} from "../control-api/types"
import type {DeviceHelpCatalog, SampleCatalog, ToolInvocation, ToolResult} from "./types"

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const isObject = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value)

export class ToolExecutor {
    readonly #controlApi: ControlApi
    readonly #catalog: ToolCatalog
    readonly #resources: ResourceTools

    constructor(controlApi: ControlApi, catalog: ToolCatalog = new ToolCatalog(),
                resources?: ResourceTools, sampleCatalog?: SampleCatalog,
                deviceHelpCatalog?: DeviceHelpCatalog) {
        this.#controlApi = controlApi
        this.#catalog = catalog
        this.#resources = resources ?? new ResourceTools(controlApi.resolver, sampleCatalog, deviceHelpCatalog)
    }

    async execute(invocation: ToolInvocation): Promise<ToolResult> {
        const binding = this.#catalog.resolve(invocation.namespace, invocation.name)
        if (binding === undefined) {
            return {ok: false, error: `Unknown tool '${invocation.namespace}.${invocation.name}'`}
        }
        try {
            const input = invocation.arguments ?? {}
            if (!isObject(input)) {throw new Error("Tool arguments must be an object")}
            if (binding.resource === "query_resources") {
                return {ok: true, value: this.#resources.query(input) as unknown as JsonValue}
            }
            if (binding.resource === "inspect_resource") {
                return {ok: true, value: this.#resources.inspect(input) as unknown as JsonValue}
            }
            if (binding.resource === "inspect_instrument") {
                return {ok: true, value: this.#resources.inspectInstrument(input) as unknown as JsonValue}
            }
            if (binding.resource === "query_samples") {
                return {ok: true, value: await this.#resources.querySamples(input) as unknown as JsonValue}
            }
            if (binding.resource === "inspect_device_help") {
                return {ok: true, value: await this.#resources.inspectDeviceHelp(input) as unknown as JsonValue}
            }
            const operation = binding.operation
            if (operation === undefined) {throw new Error("Tool has no executable binding")}
            let target: ControlHandle | undefined
            let args: JsonObject = input
            if (operation.target === "address") {
                const {target: inputTarget, ...remaining} = input
                target = inputTarget as ControlHandle | undefined
                args = remaining
            }
            const request = target === undefined
                ? {operation: operation.id, arguments: args}
                : {operation: operation.id, target, arguments: args}
            const result = operation.async
                ? await this.#controlApi.callAsync(request)
                : this.#controlApi.call(request)
            return {ok: true, value: result}
        } catch (error) {
            return {ok: false, error: errorMessage(error)}
        }
    }
}
