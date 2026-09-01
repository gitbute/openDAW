import {describe, expect, it} from "vitest"
import {compactTracePayload, emitCodexTrace} from "./CodexTrace"
import type {CodexTraceEvent} from "./CodexTrace"

describe("CodexTrace", () => {
    it("redacts sensitive fields recursively and compacts text deltas", () => {
        const events: CodexTraceEvent[] = []
        emitCodexTrace(event => events.push(event), {
            layer: "rpc",
            phase: "request",
            method: "account/login/start",
            payload: {
                accessToken: "secret",
                nested: {refreshToken: "also-secret"},
                safe: "visible"
            }
        })
        expect(events[0].payload).toEqual({
            accessToken: "[REDACTED]",
            nested: {refreshToken: "[REDACTED]"},
            safe: "visible"
        })
        expect(compactTracePayload("item/agentMessage/delta", {
            threadId: "thread-1", delta: "a long streamed message"
        })).toEqual({threadId: "thread-1", deltaLength: 23, deltaPreview: "a long streamed message"})
    })

    it("does nothing when no sink is installed", () => {
        expect(() => emitCodexTrace(undefined, {layer: "session", phase: "state"})).not.toThrow()
    })
})
