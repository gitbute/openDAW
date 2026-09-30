import {int, isDefined, Optional, tryCatch} from "@opendaw/lib-std"
import {AgentScriptError} from "./AgentScriptProtocol"

const FramePattern = /(?:<anonymous>|> (?:Async)?Function):(\d+):(\d+)/

const findFrame = (stack: string): Optional<[int, int]> => {
    const match = FramePattern.exec(stack)
    return isDefined(match) ? [parseInt(match[1]), parseInt(match[2])] : undefined
}

export namespace ScriptErrors {
    // Lines the engine puts in front of a Function constructor body
    export const probeLineOffset = (): int => {
        const probe = tryCatch(() => new Function("throw new Error()")())
        const frame = probe.status === "failure" && probe.error instanceof Error ? findFrame(probe.error.stack ?? "") : undefined
        return isDefined(frame) ? frame[0] - 1 : 2
    }

    export const describe = (error: unknown, lineOffset: int): AgentScriptError => {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        const stack = error instanceof Error ? error.stack ?? "" : ""
        const frame = findFrame(stack)
        const line = isDefined(frame) && frame[0] > lineOffset ? frame[0] - lineOffset : undefined
        return {message, stack, line, column: isDefined(line) && isDefined(frame) ? frame[1] : undefined}
    }
}
