import type {ControlBatchItem, ControlCall, ControlHandle, JsonObject, OperationDescriptor} from "../control-api/types"

/**
 * Convert the ordinary Codex tool shape into the canonical ControlApi call
 * shape. Address-targeted operations consume `target` outside their method
 * arguments; all other arguments remain untouched for ControlApi decoding.
 */
export const toControlBatchItem = (operation: OperationDescriptor, input: JsonObject,
                                   id?: string): ControlBatchItem => {
    if (operation.target === "address") {
        const {target, ...arguments_} = input
        return {
            ...(id === undefined ? {} : {id}),
            operation: operation.id,
            ...(target === undefined ? {} : {target}),
            arguments: arguments_
        }
    }
    return {
        ...(id === undefined ? {} : {id}),
        operation: operation.id,
        arguments: input
    }
}

export const toControlCall = (operation: OperationDescriptor, input: JsonObject): ControlCall => {
    const batchItem = toControlBatchItem(operation, input)
    return {
        operation: batchItem.operation,
        ...(batchItem.target === undefined ? {} : {target: batchItem.target as ControlHandle}),
        ...(batchItem.arguments === undefined ? {} : {arguments: batchItem.arguments})
    }
}
