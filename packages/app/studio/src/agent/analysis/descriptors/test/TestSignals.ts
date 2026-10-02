import {int, isDefined, Optional} from "@opendaw/lib-std"
import type {SoundNote, SoundTarget} from "../../SoundTarget"

export namespace TestSignals {
    export const SampleRate = 48_000

    export type Shape = "sine" | "saw" | "square"

    export const frames = (seconds: number): int => Math.round(seconds * SampleRate)

    /** Band-limited oscillator; `cents(t)` modulates the pitch over time. */
    export const tone = (shape: Shape, hz: number, seconds: number, gain: number = 0.5,
                         cents: (time: number) => number = () => 0.0): Float32Array => {
        const out = new Float32Array(frames(seconds))
        let phase = 0.0
        for (let index = 0; index < out.length; index++) {
            const frequency = hz * Math.pow(2.0, cents(index / SampleRate) / 1200.0)
            const maxHarmonic = shape === "sine" ? 1 : Math.floor(0.45 * SampleRate / frequency)
            let value = 0.0
            for (let harmonic = 1; harmonic <= maxHarmonic; harmonic++) {
                if (shape === "square" && harmonic % 2 === 0) {continue}
                value += Math.sin(phase * harmonic) / harmonic
            }
            out[index] = value * gain * (shape === "sine" ? 1.0 : 0.6)
            phase += 2.0 * Math.PI * frequency / SampleRate
            if (phase > 2.0 * Math.PI) {phase -= 2.0 * Math.PI}
        }
        return out
    }

    export const noise = (seconds: number, gain: number = 0.3, seed: int = 1): Float32Array => {
        let state = seed
        const out = new Float32Array(frames(seconds))
        for (let index = 0; index < out.length; index++) {
            state = (state * 1664525 + 1013904223) >>> 0
            out[index] = (state / 0x100000000 * 2.0 - 1.0) * gain
        }
        return out
    }

    export const shape = (signal: Float32Array, envelope: (time: number) => number): Float32Array =>
        signal.map((value, index) => value * envelope(index / SampleRate))

    /** Linear attack, linear decay to sustain, held until offSeconds, linear release. */
    export const adsr = (attack: number, decay: number, sustain: number, offSeconds: number, release: number) =>
        (time: number): number => {
            const held = time < attack ? time / attack
                : time < attack + decay ? 1.0 - (1.0 - sustain) * (time - attack) / decay : sustain
            if (time < offSeconds) {return held}
            const level = offSeconds < attack ? offSeconds / attack
                : offSeconds < attack + decay ? 1.0 - (1.0 - sustain) * (offSeconds - attack) / decay : sustain
            return Math.max(0.0, level * (1.0 - (time - offSeconds) / release))
        }

    export const note = (index: int, startSeconds: number, endSeconds: number,
                         offSeconds: Optional<number> = undefined, pitch: Optional<int> = undefined): SoundNote => ({
        index, startFrame: frames(startSeconds), endFrame: frames(endSeconds),
        offFrame: isDefined(offSeconds) ? frames(offSeconds) : undefined, pitch
    })

    export const target = (channels: ReadonlyArray<Float32Array>, notes: ReadonlyArray<SoundNote>, focused: boolean = true): SoundTarget =>
        ({label: "test", channels, sampleRate: SampleRate, notes, bpm: 120, stepSeconds: 0.125, focused, offsetSeconds: 0, loudness: undefined})

    /** Stereo naive-saw bassline of `count` notes over `seconds` (5 ms attack, decay to 0.6, held 70%, 50 ms release, accents). */
    export const bassline = (seconds: number, count: int, focused: boolean = false): SoundTarget => {
        const left = new Float32Array(frames(seconds)), right = new Float32Array(frames(seconds))
        const length = seconds / count
        const notes = Array.from({length: count}, (_unused, index) =>
            note(index + 1, index * length, (index + 1) * length, index * length + length * 0.7, 36 + (index % 5) * 2))
        notes.forEach(({index: number, startFrame, endFrame, offFrame, pitch}) => {
            const accent = [1.0, 0.6, 0.8][number % 3]
            const hz = 440.0 * Math.pow(2.0, ((pitch ?? 36) - 69) / 12)
            const off = ((offFrame ?? endFrame) - startFrame) / SampleRate
            let phase = 0.0
            for (let index = startFrame; index < endFrame; index++) {
                const time = (index - startFrame) / SampleRate
                const level = time < off ? Math.min(1.0, time / 0.005) * (0.6 + 0.4 * Math.exp(-time / 0.08))
                    : 0.6 * Math.exp(-(time - off) / 0.05)
                phase = (phase + hz / SampleRate) % 1.0
                left[index] = (2.0 * phase - 1.0) * level * accent * 0.5
                right[index] = (2.0 * phase - 1.0) * level * accent * (0.4 + 0.1 * (number % 2))
            }
        })
        return target([left, right], notes, focused)
    }

    export const single = (signal: Float32Array, offSeconds: Optional<number> = undefined, pitch: Optional<int> = undefined,
                           focused: boolean = true): SoundTarget =>
        target([signal], [note(1, 0.0, signal.length / SampleRate, offSeconds, pitch)], focused)
}
