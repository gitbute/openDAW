// Pulses per quarter note (PPQN)
// 960 = 3*5*2^6

import {int} from "@opendaw/lib-std"

export type ppqn = number
export type seconds = number
export type samples = number
export type bpm = number

export type PPQNParts = Readonly<{
    bars: int
    beats: int
    semiquavers: int
    ticks: int
}>

// WASM CONTRACT: PPQN (Quarter = 960) and the conversion formulas below are mirrored in Rust
// (crates/transport ppqn.rs). Changing the value or the math diverges TS and WASM timing.
const Quarter = 960 as const
const Crotchet = Quarter
const Quaver = Quarter / 2 // 480
const SemiQuaver = Quarter / 4 // 240
const Eighth = Quaver
const Sixteenth = SemiQuaver
const Half = Quarter * 2 // 1_920
const Whole = Quarter * 4 // 3_840
const Bar: ppqn = Whole
const fromSignature = (nominator: int, denominator: int) => Math.floor(Bar / denominator) * nominator
const fromParts = ({bars, beats, semiquavers, ticks}: PPQNParts,
                   nominator: int = 4, denominator: int = 4): ppqn =>
    fromSignature(bars * nominator + beats, denominator) + semiquavers * SemiQuaver + ticks
const toParts = (ppqn: ppqn, nominator: int = 4, denominator: int = 4): PPQNParts => {
    const lowerPulses = fromSignature(1, denominator)
    const beats = Math.floor(ppqn / lowerPulses)
    const bars = Math.floor(beats / nominator)
    const remainingPulses = Math.floor(ppqn) - fromSignature(bars * nominator, denominator)
    const ticks = remainingPulses % lowerPulses
    const semiquavers = Math.floor(ticks / SemiQuaver)
    const remainingTicks = ticks % SemiQuaver
    return {
        bars,
        beats: beats - bars * nominator,
        semiquavers,
        ticks: remainingTicks
    } as const
}

// These helpers intentionally operate on canonical musical distances. They do
// not depend on tempo; BPM only enters the seconds/pulses conversion below.
const Triplet = (duration: ppqn): ppqn => Math.round(duration * 2 / 3)
const Dotted = (duration: ppqn): ppqn => Math.round(duration * 3 / 2)

const secondsToPulses = (seconds: seconds, bpm: bpm): ppqn => seconds * bpm / 60.0 * Quarter
const pulsesToSeconds = (pulses: ppqn, bpm: bpm): seconds => (pulses * 60.0 / Quarter) / bpm
const secondsToBpm = (seconds: seconds, pulses: ppqn): bpm => (pulses * 60.0 / Quarter) / seconds
const samplesToPulses = (samples: samples, bpm: bpm, sampleRate: number): ppqn => secondsToPulses(samples / sampleRate, bpm)
const pulsesToSamples = (pulses: ppqn, bpm: bpm, sampleRate: number): number => pulsesToSeconds(pulses, bpm) * sampleRate

export const PPQN = {
    Bar,
    Quarter,
    Crotchet,
    Quaver,
    SemiQuaver,
    Eighth,
    Sixteenth,
    Half,
    Whole,
    fromSignature,
    fromParts,
    toParts,
    Triplet,
    Dotted,
    secondsToPulses,
    pulsesToSeconds,
    secondsToBpm,
    samplesToPulses,
    pulsesToSamples,
    toString: (pulses: ppqn, nominator: int = 4, denominator: int = 4): string => {
        const {bars, beats, semiquavers, ticks} = toParts(pulses | 0, nominator, denominator)
        return `${bars + 1}.${beats + 1}.${semiquavers + 1}:${ticks}`
    }
} as const
