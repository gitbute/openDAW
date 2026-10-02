import {int, Optional} from "@opendaw/lib-std"
import type {AudioMetrics} from "@opendaw/lib-dsp"
import type {JsonValue} from "@opendaw/studio-codex"

/** A sounding note inside a target's channels. offFrame and pitch are known for sandbox notes, not for detected ones. */
export type SoundNote = {
    /** 1-based position among all notes of the render (stays the same when the target is cut to a focus window). */
    readonly index: int
    readonly startFrame: int
    readonly endFrame: int
    readonly offFrame: Optional<int>
    readonly pitch: Optional<int>
}

/** One sound to describe: a mix, a stem or a sandbox variation, already cut to the focus window when zoomed in. */
export type SoundTarget = {
    readonly label: string
    readonly channels: AudioMetrics.Channels
    readonly sampleRate: number
    readonly notes: ReadonlyArray<SoundNote>
    readonly bpm: number
    readonly stepSeconds: number
    /** The agent zoomed in (focus): per-note detail is welcome, otherwise keep the summary compact. */
    readonly focused: boolean
    /** Seconds from the start of the render to channels[0][0] (0 unless focused). */
    readonly offsetSeconds: number
    /** Loudness of exactly these channels when the caller already measured it. */
    readonly loudness: Optional<AudioMetrics.Loudness>
}

/** One family of sound descriptors (envelope, pitch, timbre, ...); its result lands under `key` in the analysis. */
export interface SoundDescriptor {
    readonly key: string
    /** One line for the tool description: what the numbers say. */
    readonly summary: string
    describe(target: SoundTarget): JsonValue
}
