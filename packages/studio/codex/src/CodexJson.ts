import {isAbsent, isDefined, Nullable, Optional, panic} from "@opendaw/lib-std"
import type {JsonObject, JsonValue, RpcMessage, RpcNotification, RpcRequest, RpcResponse} from "./types"

export namespace CodexJson {
    export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === "object" && isDefined(value) && !Array.isArray(value)

    export const isJsonObject = (value: Optional<JsonValue>): value is JsonObject => isObjectRecord(value)

    export const hasOwn = (value: object, name: string): boolean => Object.prototype.hasOwnProperty.call(value, name)

    export const asObjectRecord = (value: unknown, context: string): Record<string, unknown> =>
        isObjectRecord(value) ? value : panic(`${context} must be an object`)

    export const stringAt = (record: Record<string, unknown>, name: string, context: string): string => {
        const value = record[name]
        return typeof value === "string" ? value : panic(`${context}.${name} must be a string`)
    }

    export const booleanAt = (record: Record<string, unknown>, name: string, context: string): boolean => {
        const value = record[name]
        return typeof value === "boolean" ? value : panic(`${context}.${name} must be a boolean`)
    }

    export const nullableStringAt = (record: Record<string, unknown>, name: string): Nullable<string> => {
        const value = record[name]
        return typeof value === "string" ? value : null
    }

    export const nullableIntegerAt = (record: Record<string, unknown>, name: string): Nullable<number> => {
        const value = record[name]
        return typeof value === "number" && Number.isInteger(value) ? value : null
    }

    export const strictNullableString = (value: unknown, context: string): Nullable<string> => {
        if (isAbsent(value)) {return null}
        return typeof value === "string" ? value : panic(`${context} must be a string or null`)
    }

    export const nonEmptyString = (value: unknown): Optional<string> =>
        typeof value === "string" && value.length > 0 ? value : undefined

    export const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error))

    export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

    export const isRpcMessage = (value: unknown): value is RpcMessage => isObjectRecord(value)

    export const isRpcRequest = (message: RpcMessage): message is RpcRequest =>
        typeof methodOf(message) === "string" && hasOwn(message, "id")

    export const isRpcNotification = (message: RpcMessage): message is RpcNotification =>
        typeof methodOf(message) === "string" && !hasOwn(message, "id")

    export const isRpcResponse = (message: RpcMessage): message is RpcResponse =>
        !isDefined(methodOf(message)) && hasOwn(message, "id")

    export const methodOf = (message: RpcMessage): Optional<string> => {
        const record: Record<string, unknown> = message
        return typeof record.method === "string" ? record.method : undefined
    }

    export const idOf = (message: RpcMessage): Optional<RpcRequest["id"]> => {
        const record: Record<string, unknown> = message
        return typeof record.id === "string" || typeof record.id === "number" ? record.id : undefined
    }
}
