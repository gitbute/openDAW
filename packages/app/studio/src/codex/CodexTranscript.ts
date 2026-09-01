import type {JsonValue} from "@opendaw/studio-codex"
import type {CodexConversationEntry} from "./CodexAgentController"

export type CodexTranscriptContext = {
    readonly model: string | null
    readonly effort: string | null
    readonly threadId?: string
    readonly activeTurnId?: string | null
}

const jsonBlock = (value: JsonValue): string => {
    const json = JSON.stringify(value, null, 2) ?? "null"
    return `\`\`\`json\n${json}\n\`\`\``
}

const itemIdentifiers = (itemId: string, turnId: string): Array<string> => [
    `Item ID: ${itemId}`,
    `Turn ID: ${turnId}`
]

/** Serialize only the normalized conversation data intended for transcript sharing. */
export const serializeCodexConversation = (
    entries: ReadonlyArray<CodexConversationEntry>,
    context: CodexTranscriptContext
): string => {
    const lines = [
        "# Codex transcript",
        "",
        `Model: ${context.model ?? "not selected"}`,
        `Reasoning effort: ${context.effort ?? "not selected"}`
    ]
    if (context.threadId !== undefined) {lines.push(`Thread ID: ${context.threadId}`)}
    if (context.activeTurnId !== undefined && context.activeTurnId !== null) {
        lines.push(`Active turn ID: ${context.activeTurnId}`)
    }
    lines.push("")

    for (const entry of entries) {
        switch (entry.type) {
            case "user":
                lines.push("## You", "", entry.text, "")
                break
            case "reasoning":
                lines.push(
                    `## Thinking${entry.summaryIndex === null ? "" : ` (summary ${entry.summaryIndex})`}`,
                    "",
                    ...itemIdentifiers(entry.itemId, entry.turnId),
                    `Status: ${entry.complete ? "complete" : "streaming"}`,
                    "",
                    entry.text,
                    ""
                )
                break
            case "assistant":
                lines.push(
                    "## Codex",
                    "",
                    ...itemIdentifiers(entry.itemId, entry.turnId),
                    `Status: ${entry.complete ? "complete" : "streaming"}`,
                    "",
                    entry.text,
                    ""
                )
                break
            case "activity":
                lines.push(
                    `## Activity: ${entry.label}`,
                    "",
                    ...itemIdentifiers(entry.itemId, entry.turnId),
                    `Kind: ${entry.kind}`,
                    `Status: ${entry.status}`,
                    "",
                    "Item:",
                    "",
                    jsonBlock(entry.item),
                    ""
                )
                if (entry.error !== undefined) {
                    lines.push("Error:", "", entry.error, "")
                }
                break
        }
    }
    return `${lines.join("\n").trimEnd()}\n`
}

const compactLine = (value: string): string => value.replace(/\s+/g, " ").trim()

/** Serialize the readable conversation in a compact, model-friendly form without debug payloads. */
export const serializeCodexConversationCompact = (
    entries: ReadonlyArray<CodexConversationEntry>,
    context: CodexTranscriptContext
): string => {
    const lines = [
        "# Codex transcript",
        "",
        `Model: ${context.model ?? "not selected"}`,
        `Reasoning effort: ${context.effort ?? "not selected"}`,
        ""
    ]

    for (const entry of entries) {
        switch (entry.type) {
            case "user":
                lines.push("## You", "", entry.text, "")
                break
            case "reasoning":
                lines.push("## Thinking", "", entry.text, "")
                break
            case "assistant":
                lines.push("## Codex", "", entry.text, "")
                break
            case "activity": {
                const error = entry.status === "failed" && entry.error !== undefined
                    ? ` — ${compactLine(entry.error)}`
                    : ""
                lines.push(`[${entry.status}] ${entry.label}${error}`)
                break
            }
        }
    }

    return `${lines.join("\n").trimEnd()}\n`
}

export type CodexTranscriptScrollMetrics = {
    readonly scrollTop: number
    readonly scrollHeight: number
    readonly clientHeight: number
}

export const CODEX_TRANSCRIPT_NEAR_BOTTOM_PX = 32

export const isCodexTranscriptNearBottom = (
    metrics: CodexTranscriptScrollMetrics,
    threshold = CODEX_TRANSCRIPT_NEAR_BOTTOM_PX
): boolean => metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop <= threshold

/** Small state holder for chat-style follow-latest behavior. */
export class CodexTranscriptFollowState {
    #followLatest = true
    #hasNewActivity = false

    get followLatest(): boolean {return this.#followLatest}

    get hasNewActivity(): boolean {return this.#hasNewActivity}

    onScroll(metrics: CodexTranscriptScrollMetrics): void {
        if (isCodexTranscriptNearBottom(metrics)) {
            this.#followLatest = true
            this.#hasNewActivity = false
        } else {
            this.#followLatest = false
        }
    }

    onContentChanged(metrics: CodexTranscriptScrollMetrics): boolean {
        if (this.#followLatest || isCodexTranscriptNearBottom(metrics)) {
            this.#followLatest = true
            this.#hasNewActivity = false
            return true
        }
        this.#hasNewActivity = true
        return false
    }

    followToLatest(): void {
        this.#followLatest = true
        this.#hasNewActivity = false
    }
}
