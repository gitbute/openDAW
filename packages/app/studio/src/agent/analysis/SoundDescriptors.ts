import {tryCatch} from "@opendaw/lib-std"
import {AudioMetrics} from "@opendaw/lib-dsp"
import type {JsonObject} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundNote, SoundTarget} from "./SoundTarget"
import {NotesDescriptor} from "./descriptors/NotesDescriptor"
import {EnvelopeDescriptor} from "./descriptors/EnvelopeDescriptor"
import {PitchDescriptor} from "./descriptors/PitchDescriptor"
import {TimbreDescriptor} from "./descriptors/TimbreDescriptor"
import {MovementDescriptor} from "./descriptors/MovementDescriptor"
import {SpaceDescriptor} from "./descriptors/SpaceDescriptor"
import {DynamicsDescriptor} from "./descriptors/DynamicsDescriptor"

// One entry per descriptor family; each family lives in descriptors/ with its own tests.
const Registry: ReadonlyArray<SoundDescriptor> = [
    NotesDescriptor,
    EnvelopeDescriptor,
    PitchDescriptor,
    TimbreDescriptor,
    MovementDescriptor,
    SpaceDescriptor,
    DynamicsDescriptor
]

export namespace SoundDescriptors {
    export const all = (): ReadonlyArray<SoundDescriptor> => Registry

    export const summaries = (): ReadonlyArray<string> => Registry.map(({summary}) => summary)

    /** Notes found in the audio itself (onset to release or next onset), for stems and mixes. */
    export const onsetOptions = (stepSeconds: number): AudioMetrics.OnsetOptions => ({minIntervalSeconds: Math.max(0.03, 0.6 * stepSeconds)})

    export const detectNotes = (channels: AudioMetrics.Channels, sampleRate: number, stepSeconds: number,
                                onsets: ReadonlyArray<number> = AudioMetrics.onsets(channels, sampleRate, onsetOptions(stepSeconds))): ReadonlyArray<SoundNote> => {
        return AudioMetrics.noteSpans(channels, sampleRate, onsets)
            .map(({startFrame, endFrame}, index) => ({index: index + 1, startFrame, endFrame, offFrame: undefined, pitch: undefined}))
    }

    export const describe = (target: SoundTarget, registry: ReadonlyArray<SoundDescriptor> = Registry): JsonObject =>
        Object.fromEntries(registry.map(descriptor => {
            const attempt = tryCatch(() => descriptor.describe(target))
            return [descriptor.key, attempt.status === "success" ? attempt.value
                : {error: attempt.error instanceof Error ? attempt.error.message : String(attempt.error)}]
        }))
}
