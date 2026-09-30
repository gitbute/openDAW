import {isDefined, isNull} from "@opendaw/lib-std"
import {AgentTool, AgentToolResult, JsonObject} from "@opendaw/studio-codex"
import {AgentScriptRunner, ScriptRunError, ScriptRunResult} from "./AgentScriptRunner"

const Description = [
    "Run TypeScript against the openDAW scripting API (global `openDAW`).",
    "`const project = await openDAW.getProject()` gives a copy of the live project to read and edit (the same copy for every call in one run).",
    "Top-level await and return are allowed: return a value to inspect state (API objects expand to their getters, output is capped).",
    "console.log output is captured. The code is type-checked first: type errors come back with line, column and a code excerpt and nothing runs.",
    "apply=true commits all edits as ONE undo step, only if the script completes without throwing",
    "and the project did not change meanwhile. apply=false is a dry run: nothing reaches the live project.",
    "No need to call openInStudio(); newProject() cannot be opened from here. Use api_reference for API docs."
].join(" ")

const InputSchema: JsonObject = {
    type: "object",
    properties: {
        code: {type: "string", description: "TypeScript source using the openDAW scripting API"},
        apply: {type: "boolean", description: "true commits the edits as one undo step, false is a dry run"}
    },
    required: ["code", "apply"],
    additionalProperties: false
}

const errorJson = ({message, line, column, excerpt}: ScriptRunError): JsonObject =>
    ({message, line: line ?? null, ...(isDefined(column) ? {column} : {}), ...(isDefined(excerpt) ? {excerpt} : {})})

const toJson = (result: ScriptRunResult): JsonObject => ({
    ok: result.ok,
    stage: result.stage,
    diagnostics: result.diagnostics.map(({line, column, message, excerpt}) =>
        ({line, column, message, ...(isDefined(excerpt) ? {excerpt} : {})})),
    error: isNull(result.error) ? null : errorJson(result.error),
    logs: result.logs,
    returned: result.returned,
    applied: result.applied,
    changeSummary: result.changeSummary
})

export const createRunScriptTool = (runner: AgentScriptRunner): AgentTool => ({
    name: "run_script",
    description: Description,
    inputSchema: InputSchema,
    execute: async (args: JsonObject): Promise<AgentToolResult> => {
        const {code, apply} = args
        if (typeof code !== "string" || typeof apply !== "boolean") {
            return AgentToolResult.failure("run_script expects {code: string, apply: boolean}")
        }
        const result = await runner.run({code, apply})
        return {...AgentToolResult.json(toJson(result)), ok: result.ok}
    }
})
