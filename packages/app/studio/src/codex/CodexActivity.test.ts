import {describe, expect, it} from "vitest"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import {CodexActivity} from "@/codex/CodexActivity"
import type {CodexActivityEntry} from "@/codex/CodexActivity"
import type {CodexConversationEntry} from "@/codex/CodexAgentController"

const tool = (name: string, args: JsonObject, content: ReadonlyArray<JsonValue> = [], success: boolean | null = true): JsonObject => ({
    type: "dynamicToolCall", id: `id-${name}`, namespace: "daw", tool: name, arguments: args,
    status: success === null ? "inProgress" : success ? "completed" : "failed", success, contentItems: content
})

const text = (value: unknown): JsonObject => ({type: "inputText", text: typeof value === "string" ? value : JSON.stringify(value)})

const scriptResult = (overrides: JsonObject): JsonObject => text({
    ok: true, stage: "done", diagnostics: [], error: null, logs: [], returned: null, applied: false, changeSummary: [],
    ...overrides
})

const activity = (id: string, item: JsonObject, status: CodexActivityEntry["status"] = "success"): CodexActivityEntry => ({
    type: "activity", itemId: id, turnId: "turn-1", kind: "dynamicToolCall", label: CodexActivity.label(item, status),
    status, item
})

describe("CodexActivity.label", () => {
    it("derives human labels for the daw tools", () => {
        expect(CodexActivity.label(tool("inspect_project", {}), "success")).toBe("Inspected project")
        expect(CodexActivity.label(tool("inspect_project", {focus: "Bass"}), "running")).toBe("Inspecting project · Bass")
        expect(CodexActivity.label(tool("inspect_notes", {unit: "Keys", bars: {from: 1, to: 4}}), "success"))
            .toBe("Read notes · Keys · bars 1–4")
        expect(CodexActivity.label(tool("listen", {bars: {from: 1, to: 8}}), "success")).toBe("Listened · bars 1–8")
        expect(CodexActivity.label(tool("listen", {}), "running")).toBe("Listening · full song")
        expect(CodexActivity.label(tool("listen", {bars: {from: 3, to: 3}}), "success")).toBe("Listened · bar 3")
        expect(CodexActivity.label(tool("browse", {kind: "presets", query: "rhodes"}), "success"))
            .toBe("Browsed presets · “rhodes”")
        expect(CodexActivity.label(tool("device_reference", {device: "Apparat"}), "success")).toBe("Looked up Apparat")
        expect(CodexActivity.label(tool("device_reference", {}), "success")).toBe("Listed devices")
        expect(CodexActivity.label(tool("api_reference", {topic: "NoteRegion"}), "success")).toBe("API reference · NoteRegion")
        expect(CodexActivity.label(tool("api_reference", {}), "success")).toBe("API reference index")
        expect(CodexActivity.label(tool("inspect_device_help", {}), "success")).toBe("Inspect device help")
    })

    it("summarizes run_script outcomes", () => {
        const run = (content: JsonObject, apply = true, success = true) =>
            CodexActivity.label(tool("run_script", {code: "x", apply}, [content], success), success ? "success" : "failed")
        expect(CodexActivity.label(tool("run_script", {code: "x", apply: true}, [], null), "running")).toBe("Running script")
        expect(run(scriptResult({applied: true, changeSummary: ["a", "b"]}))).toBe("Ran script · applied · 2 changes")
        expect(run(scriptResult({applied: true}))).toBe("Ran script · applied")
        expect(run(scriptResult({}), false)).toBe("Ran script · dry run")
        expect(run(scriptResult({}), true)).toBe("Ran script · no changes")
        expect(run(scriptResult({
            ok: false, stage: "typecheck", error: {message: "1 type error", line: 12},
            diagnostics: [{line: 12, column: 3, message: "nope"}]
        }), true, false)).toBe("Script failed · type error line 12")
        expect(run(scriptResult({
            ok: false, stage: "typecheck", error: {message: "2 type errors", line: 4},
            diagnostics: [{line: 4, column: 1, message: "a"}, {line: 9, column: 1, message: "b"}]
        }), true, false)).toBe("Script failed · 2 type errors, first line 4")
        expect(run(scriptResult({ok: false, stage: "runtime", error: {message: "boom", line: null}}), true, false))
            .toBe("Script failed · runtime error")
        expect(run(scriptResult({ok: false, stage: "apply", error: {message: "changed", line: null}}), true, false))
            .toBe("Script not applied")
    })

    it("keeps native item labels", () => {
        expect(CodexActivity.label({type: "webSearch", id: "w", action: {type: "search", query: "swing"}}, "success"))
            .toBe("Web search · swing")
        expect(CodexActivity.label({type: "mcpToolCall", id: "m", server: "s", tool: "t"}, "success")).toBe("MCP · s.t")
        expect(CodexActivity.label({type: "futureThing", id: "f"}, "success")).toBe("Codex · futureThing")
    })
})

describe("CodexActivity results", () => {
    it("extracts images, script code, arguments and a readable script report", () => {
        const item = tool("run_script", {code: "const a = 1\nreturn a", apply: true}, [
            scriptResult({
                ok: false, stage: "typecheck", error: {message: "1 type error, nothing was executed", line: 2},
                diagnostics: [{line: 2, column: 8, message: "Cannot find name 'b'."}], logs: ["hello"]
            })
        ], false)
        expect(CodexActivity.scriptCode(item)).toBe("const a = 1\nreturn a")
        expect(CodexActivity.argumentsText(item)).toBe("apply: true")
        const result = CodexActivity.resultText(item) ?? ""
        expect(result).toContain("typecheck error (line 2): 1 type error, nothing was executed")
        expect(result).toContain("L2:8 Cannot find name 'b'.")
        expect(result).toContain("console:\n  hello")
        const listen = tool("listen", {bars: {from: 1, to: 2}}, [
            text({lufs: -14}), {type: "inputImage", imageUrl: "data:image/png;base64,AAA"}
        ])
        expect(CodexActivity.images(listen)).toEqual(["data:image/png;base64,AAA"])
        expect(CodexActivity.resultText(listen)).toBe("{\n  \"lufs\": -14\n}")
        expect(CodexActivity.argumentsText({type: "webSearch", id: "w"})).toBeUndefined()
    })

    it("trims long results", () => {
        const item = tool("api_reference", {topic: "x"}, [text("a".repeat(5000))])
        const result = CodexActivity.resultText(item) ?? ""
        expect(result.length).toBe(1600)
        expect(result.endsWith("…")).toBe(true)
    })

    it("reads the headline of a reasoning summary", () => {
        expect(CodexActivity.reasoningHeadline("**Planning the drums**\n\nFirst the kick.")).toBe("Planning the drums")
        expect(CodexActivity.reasoningBody("**Planning the drums**\n\nFirst the kick.")).toBe("First the kick.")
        expect(CodexActivity.reasoningHeadline("Plain line\nmore")).toBe("Plain line")
    })
})

describe("CodexActivity.group", () => {
    it("groups consecutive tool calls and reasoning between messages", () => {
        const entries: ReadonlyArray<CodexConversationEntry> = [
            {type: "user", id: "u1", text: "go"},
            {type: "reasoning", itemId: "r1", turnId: "turn-1", summaryIndex: 0, text: "**Look**", complete: true},
            activity("a1", tool("inspect_project", {})),
            activity("a2", tool("run_script", {code: "x", apply: true}, [scriptResult({applied: true})])),
            {type: "assistant", itemId: "m1", turnId: "turn-1", text: "done", complete: true},
            {type: "notice", id: "n1", text: "lost"},
            {type: "user", id: "u2", text: "again"},
            activity("a3", tool("listen", {}), "running")
        ]
        const blocks = CodexActivity.group(entries)
        expect(blocks.map(block => block.type === "steps" ? `steps(${block.entries.length})` : block.key)).toEqual([
            "user:u1", "steps(3)", "assistant:m1", "notice:n1", "user:u2", "steps(1)"
        ])
        expect(blocks[1].key).toBe("steps:reasoning:r1:0")
    })

    it("summarizes a group with its most telling label", () => {
        const failed = activity("a1", tool("run_script", {code: "x", apply: true}, [scriptResult({
            ok: false, stage: "runtime", error: {message: "boom", line: 3}
        })], false), "failed")
        const applied = activity("a2", tool("run_script", {code: "x", apply: true}, [scriptResult({applied: true})]))
        const listened = activity("a3", tool("listen", {bars: {from: 1, to: 4}}))
        expect(CodexActivity.summarize([failed, applied, listened], false))
            .toEqual({label: "Ran script · applied", tools: 3, failed: 1, running: false})
        const thinking = {
            type: "reasoning", itemId: "r", turnId: "turn-1", summaryIndex: 0, text: "**Mixing**", complete: false
        } as const
        expect(CodexActivity.summarize([listened, thinking], true))
            .toEqual({label: "Mixing", tools: 1, failed: 0, running: true})
        expect(CodexActivity.summarize([activity("a4", tool("listen", {}), "running")], false).running).toBe(true)
    })
})

describe("CodexActivity subagents", () => {
    const collab = (name: string, extra: JsonObject = {}): JsonObject => ({
        type: "collabAgentToolCall", id: `collab-${name}`, tool: name, status: "completed", senderThreadId: "main",
        receiverThreadIds: ["child-1"], prompt: null, agentsStates: {}, ...extra
    })
    const names = (threadId: string) => threadId === "child-1" ? "research" : undefined

    it("labels collab tool calls with the subagent name", () => {
        expect(CodexActivity.label(collab("spawnAgent"), "running", names)).toBe("Spawning subagent")
        expect(CodexActivity.label(collab("spawnAgent"), "success", names)).toBe("Spawned subagent · research")
        expect(CodexActivity.label(collab("spawnAgent", {receiverThreadIds: [], prompt: "Find presets"}), "success"))
            .toBe("Spawned subagent · Find presets")
        expect(CodexActivity.label(collab("wait"), "running", names)).toBe("Waiting for research")
        expect(CodexActivity.label(collab("wait", {agentsStates: {"child-1": {status: "completed", message: "Done"}}}),
            "success", names)).toBe("Subagent research replied")
        expect(CodexActivity.label(collab("sendInput"), "success", names)).toBe("Messaged research")
        expect(CodexActivity.label({type: "subAgentActivity", id: "s", kind: "completed", agentThreadId: "x",
            agentPath: "root/bass_design"}, "success")).toBe("Subagent bass_design finished")
    })

    it("shows the prompt as arguments and subagent replies as result", () => {
        const item = collab("wait", {prompt: "Check the low end", agentsStates: {
            "child-1": {status: "completed", message: "Sub is clean"}, "child-2": {status: "errored", message: null}
        }})
        expect(CodexActivity.argumentsText(item)).toBe("Check the low end")
        expect(CodexActivity.resultText(item)).toBe("Sub is clean\n\n[errored]")
    })

    it("prefers the agent path, then nickname, then role as name", () => {
        expect(CodexActivity.agentName({path: "root/bass_design", nickname: "Euclid", role: "explorer"})).toBe("bass_design")
        expect(CodexActivity.agentName({path: null, nickname: "Euclid", role: "explorer"})).toBe("Euclid")
        expect(CodexActivity.agentName({path: null, nickname: null, role: null})).toBeUndefined()
    })
})
