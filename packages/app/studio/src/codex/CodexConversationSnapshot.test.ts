import {describe, expect, it} from "vitest"
import {CodexConversationSnapshot} from "@/codex/CodexConversationSnapshot"
import type {CodexConversationEntry} from "@/codex/CodexAgentController"

describe("CodexConversationSnapshot", () => {
    it("settles running entries, drops image data and round-trips through JSON", () => {
        const entries: ReadonlyArray<CodexConversationEntry> = [
            {type: "user", id: "user-1", text: "Hi"},
            {type: "assistant", itemId: "a", turnId: "t", text: "Streaming", complete: false},
            {type: "activity", itemId: "x", turnId: "t", kind: "dynamicToolCall", label: "Listening", status: "running",
                item: {type: "dynamicToolCall", id: "x", contentItems: [{type: "inputImage", imageUrl: "data:image/png;base64,AAAA"}],
                    arguments: {code: "y".repeat(10000)}}}
        ]
        const snapshot = CodexConversationSnapshot.create("thread-1", entries)
        const decoded = CodexConversationSnapshot.decode(CodexConversationSnapshot.encode(snapshot)).unwrap()
        expect(decoded).toEqual(snapshot)
        expect(decoded.threadId).toBe("thread-1")
        const [, assistant, activity] = decoded.entries
        expect(assistant).toMatchObject({complete: true})
        expect(activity).toMatchObject({status: "failed", error: "Interrupted",
            item: {contentItems: [{type: "inputText", text: "[image]"}]}})
        expect(JSON.stringify(activity).length).toBeLessThan(CodexConversationSnapshot.MaxText + 500)
    })

    it("caps the number of entries with a trimmed notice", () => {
        const entries: Array<CodexConversationEntry> = Array.from({length: CodexConversationSnapshot.MaxEntries + 10},
            (_, index) => ({type: "user", id: `user-${index}`, text: `${index}`}))
        const {entries: kept} = CodexConversationSnapshot.create(null, entries)
        expect(kept).toHaveLength(CodexConversationSnapshot.MaxEntries)
        expect(kept[0]).toEqual({type: "notice", id: "notice-trimmed", text: CodexConversationSnapshot.TrimmedNotice})
        expect(kept.at(-1)).toMatchObject({id: `user-${CodexConversationSnapshot.MaxEntries + 9}`})
    })

    it("rejects foreign data and skips malformed entries", () => {
        expect(CodexConversationSnapshot.decode("nope").isEmpty()).toBe(true)
        expect(CodexConversationSnapshot.decode(JSON.stringify({version: 99, entries: []})).isEmpty()).toBe(true)
        const decoded = CodexConversationSnapshot.decode(JSON.stringify({version: 1, threadId: 5,
            entries: [{type: "user", id: "u", text: "ok"}, {type: "user", text: "no id"}, {type: "bogus"}]})).unwrap()
        expect(decoded).toEqual({threadId: null, entries: [{type: "user", id: "u", text: "ok"}]})
    })
})
