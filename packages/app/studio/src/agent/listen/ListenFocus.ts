import {Attempt, Attempts, int, isDefined, Optional} from "@opendaw/lib-std"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import type {FrameWindow} from "./AgentRender"

/** Zoom of views and sound descriptors: seconds from the start of the render, or one note of a sound. */
export type ListenFocus =
    | { readonly kind: "seconds", readonly from: number, readonly to: number }
    | { readonly kind: "note", readonly note: int }

export namespace ListenFocus {
    export const MinSeconds = 0.02

    export const Schema: JsonObject = {
        type: "object",
        additionalProperties: false,
        description: "Zoom views and sound descriptors (not the loudness numbers) into {from, to} seconds from the render start, or into one {note} (from 1, as the notes descriptor numbers them; note wins when both are given). In the project a note counts on the first viewOf channel, else the first listed stem, else the mix.",
        properties: {
            from: {type: "number", minimum: 0, description: "start in seconds from the start of the render"},
            to: {type: "number", minimum: 0, description: "end in seconds"},
            note: {type: "integer", minimum: 1, description: "one note, from its onset to the next note or its release"}
        }
    }

    const isObject = (value: Optional<JsonValue>): value is JsonObject =>
        isDefined(value) && typeof value === "object" && !Array.isArray(value)

    export const parse = (value: Optional<JsonValue>): Attempt<Optional<ListenFocus>, string> => {
        if (!isDefined(value)) {return Attempts.ok(undefined)}
        if (!isObject(value)) {return Attempts.err("'focus' must be {from, to} or {note}")}
        const {from, to, note} = value
        if (isDefined(note)) {
            if (typeof note !== "number" || !Number.isInteger(note) || note < 1) {return Attempts.err("'focus.note' must be an integer >= 1 (notes are numbered from 1)")}
            return Attempts.ok({kind: "note", note})
        }
        if (typeof from !== "number" || typeof to !== "number" || !Number.isFinite(from) || !Number.isFinite(to)) {
            return Attempts.err("'focus' needs numbers 'from' and 'to' (seconds) or an integer 'note'")
        }
        if (from < 0 || to - from < MinSeconds) {return Attempts.err(`'focus' must satisfy 0 <= from and to - from >= ${MinSeconds} s`)}
        return Attempts.ok({kind: "seconds", from, to})
    }

    export const window = (focus: ListenFocus, notes: ReadonlyArray<SoundNote>, totalFrames: int,
                           sampleRate: number): Attempt<FrameWindow, string> => {
        if (focus.kind === "note") {
            const found = notes.find(({index}) => index === focus.note)
            if (!isDefined(found)) {return Attempts.err(`focus.note ${focus.note} does not exist; the sound has ${notes.length} note(s)`)}
            return Attempts.ok({startFrame: found.startFrame, endFrame: found.endFrame})
        }
        const startFrame = Math.round(focus.from * sampleRate)
        if (startFrame >= totalFrames) {
            return Attempts.err(`focus.from ${focus.from} s is past the end of the render (${(totalFrames / sampleRate).toFixed(2)} s)`)
        }
        const endFrame = Math.min(totalFrames, Math.round(focus.to * sampleRate))
        if ((endFrame - startFrame) / sampleRate < MinSeconds) {
            return Attempts.err(`focus ${focus.from}-${focus.to} s leaves less than ${MinSeconds} s of the ${(totalFrames / sampleRate).toFixed(2)} s render`)
        }
        return Attempts.ok({startFrame, endFrame})
    }

    /** The notes overlapping the window, clipped to it and shifted to its start; indices stay as they were. */
    export const notesIn = (notes: ReadonlyArray<SoundNote>, {startFrame, endFrame}: FrameWindow): ReadonlyArray<SoundNote> =>
        notes.filter(note => note.endFrame > startFrame && note.startFrame < endFrame).map(note => ({
            ...note,
            startFrame: Math.max(0, note.startFrame - startFrame),
            endFrame: Math.min(endFrame, note.endFrame) - startFrame,
            offFrame: isDefined(note.offFrame) ? Math.max(0, Math.min(endFrame, note.offFrame) - startFrame) : undefined
        }))

    export const describe = (focus: ListenFocus, {startFrame, endFrame}: FrameWindow, sampleRate: number): JsonObject => ({
        ...(focus.kind === "note" ? {note: focus.note} : {}),
        fromSeconds: Math.round(startFrame / sampleRate * 1000) / 1000,
        toSeconds: Math.round(endFrame / sampleRate * 1000) / 1000
    })
}
