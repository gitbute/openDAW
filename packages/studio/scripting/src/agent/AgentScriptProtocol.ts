import {int, Nullable, Optional} from "@opendaw/lib-std"
import {UpdateTask} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {ScriptExecutionContext} from "../ScriptExecutionProtocol"

export type AgentScriptError = {
    readonly message: string
    readonly stack: string
    // position in the executed JavaScript body, 1-based
    readonly line: Optional<int>
    readonly column: Optional<int>
}

export type AgentScriptEdits = {
    readonly updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>
    readonly checksum: Int8Array
}

export type AgentScriptOutcome = {
    readonly logs: ReadonlyArray<string>
    readonly returned: string
    readonly error: Nullable<AgentScriptError>
    readonly invalid: Nullable<string>
    readonly edits: Nullable<AgentScriptEdits>
}

export interface AgentScriptExecutionProtocol {
    executeAgentScript(script: string, context: ScriptExecutionContext): Promise<AgentScriptOutcome>
}

export namespace AgentScriptChannels {
    export const Host = "scripting-host"
    export const Execution = "agent-scripting-execution"
}
