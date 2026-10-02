import {isDefined} from "@opendaw/lib-std"
import type {JsonValue} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundTarget} from "../SoundTarget"

const MaxListed = 16

const ms = (frames: number, sampleRate: number): number => Math.round(frames / sampleRate * 1000)

export const NotesDescriptor: SoundDescriptor = {
    key: "notes",
    summary: "notes: count, median length, the first notes (start s from render start, length, pitch; index = focus.note)",
    describe: ({notes, sampleRate, offsetSeconds}: SoundTarget): JsonValue => {
        if (notes.length === 0) {return {count: 0}}
        const lengths = notes.map(({startFrame, endFrame}) => endFrame - startFrame).sort((first, second) => first - second)
        return {
            count: notes.length,
            medianLengthMs: ms(lengths[lengths.length >> 1], sampleRate),
            ...(notes.length > MaxListed ? {omittedNotes: notes.length - MaxListed} : {}),
            list: notes.slice(0, MaxListed).map(({index, startFrame, endFrame, offFrame, pitch}) => ({
                note: index,
                startSeconds: Math.round((offsetSeconds + startFrame / sampleRate) * 1000) / 1000,
                lengthMs: ms(endFrame - startFrame, sampleRate),
                ...(isDefined(offFrame) ? {heldMs: ms(offFrame - startFrame, sampleRate)} : {}),
                ...(isDefined(pitch) ? {pitch} : {})
            }))
        }
    }
}
