import {describe, expect, it} from "vitest"
import type {CodexConversationEntry} from "@/codex/CodexAgentController"
import {
    CodexTranscriptFollowState,
    serializeCodexConversation,
    serializeCodexConversationCompact
} from "@/codex/CodexTranscript"

describe("serializeCodexConversation", () => {
    it("keeps normalized conversation data in chronological Markdown", () => {
        const entries: ReadonlyArray<CodexConversationEntry> = [
            {type: "user", id: "user-1", text: "Make a **beat**"},
            {
                type: "reasoning", itemId: "reasoning-1", turnId: "turn-1", summaryIndex: 0,
                text: "Inspecting the project.", complete: true
            },
            {
                type: "tool", itemId: "tool-1", turnId: "turn-1", namespace: "daw_project",
                tool: "create_note_track", status: "failed", arguments: {name: "Drums"},
                contentItems: [{type: "inputText", text: "Track already exists"}], error: "Track already exists"
            },
            {
                type: "assistant", itemId: "message-1", turnId: "turn-1", text: "I could not create it.", complete: true
            }
        ]

        const transcript = serializeCodexConversation(entries, {
            model: "model-alpha",
            effort: "balanced",
            threadId: "thread-1",
            activeTurnId: null
        })

        expect(transcript).toContain("Model: model-alpha")
        expect(transcript).toContain("Reasoning effort: balanced")
        expect(transcript).toContain("Thread ID: thread-1")
        expect(transcript).toContain("Make a **beat**")
        expect(transcript).toContain("Inspecting the project.")
        expect(transcript).toContain("## Tool: daw_project.create_note_track")
        expect(transcript).toContain('"name": "Drums"')
        expect(transcript).toContain('"text": "Track already exists"')
        expect(transcript).toContain("Error:\n\nTrack already exists")
        expect(transcript).toContain("I could not create it.")
        expect(transcript.indexOf("Make a **beat**")).toBeLessThan(transcript.indexOf("Inspecting the project."))
        expect(transcript.indexOf("Inspecting the project.")).toBeLessThan(transcript.indexOf("## Tool:"))
        expect(transcript.indexOf("## Tool:")).toBeLessThan(transcript.indexOf("I could not create it."))
        expect(transcript).not.toContain("raw reasoning")
        expect(transcript).not.toContain("authToken")
        expect(transcript).not.toContain("cookie")
    })
})

describe("CodexTranscriptFollowState", () => {
    it("follows at the bottom, detaches when scrolled up, and resumes at latest", () => {
        const state = new CodexTranscriptFollowState()
        const bottom = {scrollTop: 400, scrollHeight: 500, clientHeight: 100}
        const detached = {scrollTop: 100, scrollHeight: 500, clientHeight: 100}

        expect(state.onContentChanged(bottom)).toBe(true)
        state.onScroll(detached)
        expect(state.followLatest).toBe(false)
        expect(state.onContentChanged(detached)).toBe(false)
        expect(state.hasNewActivity).toBe(true)
        state.followToLatest()
        expect(state.followLatest).toBe(true)
        expect(state.hasNewActivity).toBe(false)
        expect(state.onContentChanged(bottom)).toBe(true)
    })
})

describe("serializeCodexConversationCompact", () => {
    it("keeps chronology and status while omitting debug payloads and identifiers", () => {
        const entries: ReadonlyArray<CodexConversationEntry> = [
            {type: "user", id: "user-1", text: "Create a beat"},
            {
                type: "reasoning", itemId: "reasoning-1", turnId: "turn-1", summaryIndex: 0,
                text: "Inspecting the project.", complete: true
            },
            {
                type: "tool", itemId: "tool-1", turnId: "turn-1", namespace: "daw_project",
                tool: "inspect_project", status: "success", arguments: {scope: "arrangement"},
                contentItems: [{type: "inputText", text: "private result payload"}]
            },
            {
                type: "tool", itemId: "tool-2", turnId: "turn-1", namespace: "daw_project",
                tool: "create_note_track", status: "failed", arguments: {name: "Drums"},
                contentItems: [{type: "inputText", text: "private failed payload"}], error: "Track already exists"
            },
            {type: "assistant", itemId: "message-1", turnId: "turn-1", text: "The beat is ready.", complete: true}
        ]

        const transcript = serializeCodexConversationCompact(entries, {
            model: "model-alpha",
            effort: "balanced",
            threadId: "thread-1",
            activeTurnId: "turn-1"
        })

        expect(transcript).toContain("Model: model-alpha")
        expect(transcript).toContain("Reasoning effort: balanced")
        expect(transcript).toContain("Create a beat")
        expect(transcript).toContain("Inspecting the project.")
        expect(transcript).toContain("[success] daw_project.inspect_project")
        expect(transcript).toContain("[failed] daw_project.create_note_track — Track already exists")
        expect(transcript).toContain("The beat is ready.")
        expect(transcript.indexOf("Create a beat")).toBeLessThan(transcript.indexOf("Inspecting the project."))
        expect(transcript.indexOf("Inspecting the project.")).toBeLessThan(transcript.indexOf("[success]"))
        expect(transcript.indexOf("[success]")).toBeLessThan(transcript.indexOf("[failed]"))
        expect(transcript.indexOf("[failed]")).toBeLessThan(transcript.indexOf("The beat is ready."))
        expect(transcript).not.toContain("thread-1")
        expect(transcript).not.toContain("turn-1")
        expect(transcript).not.toContain("reasoning-1")
        expect(transcript).not.toContain("tool-1")
        expect(transcript).not.toContain("scope")
        expect(transcript).not.toContain("private result payload")
        expect(transcript).not.toContain("private failed payload")
        expect(transcript).not.toContain("Drums")
    })
})
