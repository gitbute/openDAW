import {isDefined, Nullable, Optional, tryCatch} from "@opendaw/lib-std"
import {CodexJson} from "@opendaw/studio-codex"
import type {CodexSubagentInfo, JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {CodexConversationEntry} from "./CodexAgentController"

export type CodexActivityEntry = Extract<CodexConversationEntry, {type: "activity"}>
export type CodexReasoningEntry = Extract<CodexConversationEntry, {type: "reasoning"}>
export type CodexMessageEntry = Extract<CodexConversationEntry, {type: "user" | "assistant" | "notice"}>
export type CodexStepEntry = CodexActivityEntry | CodexReasoningEntry
export type CodexActivityStatus = CodexActivityEntry["status"]

export type CodexConversationBlock =
    | {readonly type: "message", readonly key: string, readonly entry: CodexMessageEntry}
    | {readonly type: "steps", readonly key: string, readonly entries: ReadonlyArray<CodexStepEntry>}

export type CodexStepsSummary = {
    readonly label: string
    readonly tools: number
    readonly failed: number
    readonly running: boolean
}

export type CodexAgentNames = (threadId: string) => Optional<string>

export type CodexScriptDiagnostic = {readonly line: Nullable<number>, readonly column: Nullable<number>, readonly message: string}

export type CodexScriptReport = {
    readonly ok: boolean
    readonly stage: string
    readonly applied: boolean
    readonly diagnostics: ReadonlyArray<CodexScriptDiagnostic>
    readonly error: Nullable<{readonly message: string, readonly line: Nullable<number>}>
    readonly logs: ReadonlyArray<string>
    readonly changes: ReadonlyArray<string>
    readonly returned: JsonValue
}

const {isJsonObject, nonEmptyString} = CodexJson

const ResultLimit = 1600

const numberOf = (value: Optional<JsonValue>): Nullable<number> => typeof value === "number" ? value : null

const stringsOf = (value: Optional<JsonValue>): ReadonlyArray<string> => Array.isArray(value)
    ? value.filter((element): element is string => typeof element === "string") : []

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`

export namespace CodexActivity {
    export const trim = (text: string, limit: number): string =>
        text.length > limit ? `${text.slice(0, limit - 1)}…` : text

    export const humanize = (name: string): string => {
        const words = name.replace(/[_.-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase()
        return words.length === 0 ? "Tool" : words.charAt(0).toUpperCase() + words.slice(1)
    }

    export const argumentsOf = (item: JsonObject): JsonObject => isJsonObject(item.arguments) ? item.arguments : {}

    export const texts = (item: JsonObject): ReadonlyArray<string> => Array.isArray(item.contentItems)
        ? item.contentItems.flatMap(content => isJsonObject(content) && content.type === "inputText"
        && typeof content.text === "string" ? [content.text] : [])
        : []

    export const images = (item: JsonObject): ReadonlyArray<string> => Array.isArray(item.contentItems)
        ? item.contentItems.flatMap(content => isJsonObject(content) && content.type === "inputImage"
        && typeof content.imageUrl === "string" ? [content.imageUrl] : [])
        : []

    const parseJson = (text: string): Optional<JsonValue> => {
        const parsed = tryCatch((): JsonValue => JSON.parse(text))
        return parsed.status === "success" ? parsed.value : undefined
    }

    export const scriptReport = (item: JsonObject): Optional<CodexScriptReport> => {
        const text = texts(item).at(0)
        if (!isDefined(text)) {return undefined}
        const json = parseJson(text)
        if (!isJsonObject(json) || typeof json.stage !== "string") {return undefined}
        const diagnostics = Array.isArray(json.diagnostics) ? json.diagnostics.flatMap(value => isJsonObject(value)
            ? [{line: numberOf(value.line), column: numberOf(value.column), message: String(value.message ?? "")}]
            : []) : []
        const error = isJsonObject(json.error)
            ? {message: String(json.error.message ?? ""), line: numberOf(json.error.line)} : null
        return {
            ok: json.ok === true, stage: json.stage, applied: json.applied === true, diagnostics, error,
            logs: stringsOf(json.logs), changes: stringsOf(json.changeSummary), returned: json.returned ?? null
        }
    }

    const barsOf = (args: JsonObject): Optional<string> => {
        const bars = args.bars
        if (!isJsonObject(bars)) {return undefined}
        const from = numberOf(bars.from), to = numberOf(bars.to)
        if (!isDefined(from) || !isDefined(to)) {return undefined}
        return from === to ? `bar ${from}` : `bars ${from}–${to}`
    }

    const join = (...parts: ReadonlyArray<Optional<string>>): string =>
        parts.filter((part): part is string => isDefined(part) && part.length > 0).join(" · ")

    const scriptLabel = (item: JsonObject, status: CodexActivityStatus): string => {
        const apply = argumentsOf(item).apply === true
        if (status === "running") {return apply ? "Running script" : "Running script · dry run"}
        const report = scriptReport(item)
        if (!isDefined(report)) {return status === "failed" ? "Script failed" : "Ran script"}
        if (report.ok) {
            if (report.applied) {return join("Ran script", "applied", report.changes.length > 0
                ? plural(report.changes.length, "change") : undefined)}
            return apply ? "Ran script · no changes" : "Ran script · dry run"
        }
        const line = report.error?.line
        const at = isDefined(line) ? ` line ${line}` : ""
        switch (report.stage) {
            case "typecheck":
                return report.diagnostics.length > 1
                    ? `Script failed · ${plural(report.diagnostics.length, "type error")}, first${at}`
                    : `Script failed · type error${at}`
            case "runtime":
                return `Script failed · runtime error${at}`
            case "apply":
                return "Script not applied"
            default:
                return "Script failed"
        }
    }

    const dynamicLabel = (item: JsonObject, status: CodexActivityStatus): string => {
        const tool = nonEmptyString(item.tool) ?? "tool"
        const args = argumentsOf(item)
        const running = status === "running"
        const text = (key: string): Optional<string> => {
            const value = args[key]
            return typeof value === "string" && value.trim().length > 0 ? trim(value.trim(), 48) : undefined
        }
        switch (tool) {
            case "inspect_project":
                return join(running ? "Inspecting project" : "Inspected project", text("focus"))
            case "inspect_notes":
                return join(running ? "Reading notes" : "Read notes", text("unit"), barsOf(args))
            case "run_script":
                return scriptLabel(item, status)
            case "listen":
                return join(running ? "Listening" : "Listened", barsOf(args) ?? "full song")
            case "browse": {
                const kind = text("kind") ?? "assets"
                const query = text("query")
                return join(running ? `Browsing ${kind}` : `Browsed ${kind}`, text("device"),
                    isDefined(query) ? `“${query}”` : undefined)
            }
            case "device_reference": {
                const device = text("device")
                if (!isDefined(device)) {return running ? "Listing devices" : "Listed devices"}
                return join(running ? `Looking up ${device}` : `Looked up ${device}`,
                    isDefined(text("example")) ? `example ${text("example")}` : undefined)
            }
            case "api_reference": {
                const topic = text("topic")
                return isDefined(topic) ? `API reference · ${topic}` : "API reference index"
            }
            default:
                return humanize(tool)
        }
    }

    export const agentName = (agent: Pick<CodexSubagentInfo, "path" | "nickname" | "role">): Optional<string> => nonEmptyString(agent.path?.split("/").filter(part => part.length > 0).at(-1))
        ?? nonEmptyString(agent.nickname) ?? nonEmptyString(agent.role)

    const receiversOf = (item: JsonObject, agents: CodexAgentNames): Optional<string> => {
        const names = stringsOf(item.receiverThreadIds).map(threadId => agents(threadId) ?? "subagent")
        return names.length === 0 ? undefined : [...new Set(names)].join(", ")
    }

    const agentStates = (item: JsonObject): ReadonlyArray<JsonObject> => isJsonObject(item.agentsStates)
        ? Object.values(item.agentsStates).filter((state): state is JsonObject => isJsonObject(state)) : []

    const collabLabel = (item: JsonObject, status: CodexActivityStatus, agents: CodexAgentNames): string => {
        const running = status === "running"
        const names = receiversOf(item, agents)
        const target = names ?? "subagent"
        const prompt = nonEmptyString(item.prompt)
        switch (nonEmptyString(item.tool)) {
            case "spawnAgent":
                if (running) {return "Spawning subagent"}
                return join("Spawned subagent", names ?? (isDefined(prompt) ? trim(prompt, 48) : undefined))
            case "wait": {
                if (running) {return `Waiting for ${target}`}
                const states = agentStates(item)
                if (states.some(state => state.status === "errored")) {return `Subagent ${target} failed`}
                if (states.some(state => isDefined(nonEmptyString(state.message)))) {return `Subagent ${target} replied`}
                return `Waited for ${target}`
            }
            case "sendInput":
            case "sendMessage":
            case "followupTask":
                return running ? `Messaging ${target}` : `Messaged ${target}`
            case "closeAgent":
                return running ? `Closing subagent ${target}` : `Closed subagent ${target}`
            case "resumeAgent":
                return running ? `Resuming subagent ${target}` : `Resumed subagent ${target}`
            case "interruptAgent":
                return running ? `Interrupting subagent ${target}` : `Interrupted subagent ${target}`
            case "listAgents":
                return running ? "Listing subagents" : "Listed subagents"
            default: {
                const tool = nonEmptyString(item.tool)
                return isDefined(tool) ? `Subagent · ${humanize(tool)}` : "Subagent"
            }
        }
    }

    const subagentActivityLabel = (item: JsonObject, agents: CodexAgentNames): string => {
        const threadId = nonEmptyString(item.agentThreadId)
        const name = agentName({path: nonEmptyString(item.agentPath) ?? null, nickname: null, role: null})
            ?? (isDefined(threadId) ? agents(threadId) : undefined) ?? "subagent"
        switch (item.kind) {
            case "started": return `Subagent ${name} started`
            case "interrupted": return `Subagent ${name} interrupted`
            case "completed": return `Subagent ${name} finished`
            default: return `Subagent ${name} working`
        }
    }

    const webSearchLabel = (item: JsonObject): string => {
        const action = isJsonObject(item.action) ? item.action : undefined
        const actionType = nonEmptyString(action?.type)
        if (actionType === "openPage") {
            const url = nonEmptyString(action?.url)
            return isDefined(url) ? `Opened page · ${url}` : "Opened page"
        }
        if (actionType === "findInPage") {
            const pattern = nonEmptyString(action?.pattern)
            return isDefined(pattern) ? `Find on page · ${pattern}` : "Find on page"
        }
        const query = nonEmptyString(action?.query) ?? stringsOf(action?.queries).join(", ")
        const fallback = nonEmptyString(item.query)
        const resolved = query.length > 0 ? query : fallback
        return isDefined(resolved) ? `Web search · ${resolved}` : "Web search"
    }

    export const label = (item: JsonObject, status: CodexActivityStatus,
                          agents: CodexAgentNames = () => undefined): string => {
        switch (item.type) {
            case "dynamicToolCall":
                return dynamicLabel(item, status)
            case "webSearch":
                return webSearchLabel(item)
            case "mcpToolCall": {
                const server = nonEmptyString(item.server)
                const tool = nonEmptyString(item.tool)
                return isDefined(server) && isDefined(tool) ? `MCP · ${server}.${tool}` : "MCP tool"
            }
            case "commandExecution": {
                const command = nonEmptyString(item.command)
                return isDefined(command) ? `Command · ${trim(command, 120)}` : "Command"
            }
            case "fileChange":
                return Array.isArray(item.changes) ? `File changes · ${item.changes.length} files` : "File changes"
            case "imageView": {
                const path = nonEmptyString(item.path)
                return isDefined(path) ? `View image · ${path}` : "View image"
            }
            case "imageGeneration":
                return "Image generation"
            case "collabAgentToolCall":
            case "collabToolCall":
                return collabLabel(item, status, agents)
            case "subAgentActivity":
                return subagentActivityLabel(item, agents)
            case "contextCompaction":
                return "Context compaction"
            default:
                return `Codex · ${item.type}`
        }
    }

    export const scriptCode = (item: JsonObject): Optional<string> =>
        item.type === "dynamicToolCall" && item.tool === "run_script" ? nonEmptyString(argumentsOf(item).code) : undefined

    export const isCollab = (item: JsonObject): boolean =>
        item.type === "collabAgentToolCall" || item.type === "collabToolCall"

    export const argumentsText = (item: JsonObject): Optional<string> => {
        if (isCollab(item)) {return nonEmptyString(item.prompt)}
        if (item.type === "webSearch" || item.type !== "dynamicToolCall" && item.type !== "mcpToolCall") {
            return undefined
        }
        const entries = Object.entries(argumentsOf(item)).filter(([key]) => key !== "code" || !isDefined(scriptCode(item)))
        if (entries.length === 0) {return undefined}
        return entries.map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n")
    }

    const scriptResultText = (report: CodexScriptReport): string => {
        const lines: Array<string> = []
        if (isDefined(report.error)) {
            lines.push(`${report.stage} error${isDefined(report.error.line) ? ` (line ${report.error.line})` : ""}: ${report.error.message}`)
        }
        report.diagnostics.forEach(({line, column, message}) =>
            lines.push(`  ${isDefined(line) ? `L${line}${isDefined(column) ? `:${column}` : ""} ` : ""}${message}`))
        if (report.changes.length > 0) {lines.push("changes:", ...report.changes.map(change => `  ${change}`))}
        if (report.logs.length > 0) {lines.push("console:", ...report.logs.map(log => `  ${log}`))}
        if (isDefined(report.returned)) {
            lines.push(`returned: ${JSON.stringify(report.returned, null, 2)}`)
        }
        if (lines.length === 0) {lines.push(report.ok ? "ok" : `failed at ${report.stage}`)}
        return lines.join("\n")
    }

    export const resultText = (item: JsonObject): Optional<string> => {
        if (item.type === "dynamicToolCall" && item.tool === "run_script") {
            const report = scriptReport(item)
            if (isDefined(report)) {return trim(scriptResultText(report), ResultLimit)}
        }
        if (isCollab(item)) {
            const replies = agentStates(item).flatMap(state => {
                const message = nonEmptyString(state.message)
                const status = nonEmptyString(state.status)
                const prefix = isDefined(status) && status !== "completed" ? `[${status}] ` : ""
                return isDefined(message) || prefix.length > 0 ? [`${prefix}${message ?? ""}`.trim()] : []
            })
            return replies.length === 0 ? undefined : trim(replies.join("\n\n"), ResultLimit)
        }
        const joined = texts(item).join("\n").trim()
        if (joined.length === 0) {
            const error = isJsonObject(item.error) ? nonEmptyString(item.error.message) : nonEmptyString(item.error)
            return isDefined(error) ? trim(error, ResultLimit) : undefined
        }
        const json = parseJson(joined)
        return trim(isDefined(json) && typeof json === "object" ? JSON.stringify(json, null, 2) : joined, ResultLimit)
    }

    export const reasoningHeadline = (text: string): string => {
        const trimmed = text.trim()
        const bold = /^\*\*(.+?)\*\*/.exec(trimmed)
        if (isDefined(bold)) {return bold[1].trim()}
        const firstLine = trimmed.split("\n").at(0) ?? ""
        return trim(firstLine.replace(/[*_`#]/g, "").trim(), 80)
    }

    export const reasoningBody = (text: string): string => text.trim().replace(/^\*\*(.+?)\*\*\s*/, "")

    export const entryKey = (entry: CodexConversationEntry): string => {
        switch (entry.type) {
            case "user": return `user:${entry.id}`
            case "notice": return `notice:${entry.id}`
            case "assistant": return `assistant:${entry.itemId}`
            case "reasoning": return `reasoning:${entry.itemId}:${entry.summaryIndex ?? "none"}`
            case "activity": return `activity:${entry.itemId}`
        }
    }

    export const group = (entries: ReadonlyArray<CodexConversationEntry>): ReadonlyArray<CodexConversationBlock> => {
        const blocks: Array<CodexConversationBlock> = []
        let run: Array<CodexStepEntry> = []
        const flush = () => {
            if (run.length === 0) {return}
            blocks.push({type: "steps", key: `steps:${entryKey(run[0])}`, entries: run})
            run = []
        }
        for (const entry of entries) {
            if (entry.type === "activity" || entry.type === "reasoning") {
                run.push(entry)
            } else {
                flush()
                blocks.push({type: "message", key: entryKey(entry), entry})
            }
        }
        flush()
        return blocks
    }

    export const summarize = (entries: ReadonlyArray<CodexStepEntry>, live: boolean): CodexStepsSummary => {
        const activities = entries.filter((entry): entry is CodexActivityEntry => entry.type === "activity")
        const failed = activities.filter(entry => entry.status === "failed").length
        const running = live || activities.some(entry => entry.status === "running")
        const last = entries.at(-1)
        const lastActivity = activities.findLast(entry => entry.item.tool === "run_script") ?? activities.at(-1)
        const headline = isDefined(last) && last.type === "reasoning" && (running || !isDefined(lastActivity))
            ? reasoningHeadline(last.text) : lastActivity?.label ?? ""
        const label = headline.length > 0 ? headline : "Thinking"
        return {label, tools: activities.length, failed, running}
    }
}
