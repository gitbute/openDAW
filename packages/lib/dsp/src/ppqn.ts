// Pulses per quarter note (PPQN)
// 960 = 3*5*2^6

import {int} from "@opendaw/lib-std"

export type ppqn = number
export type seconds = number
export type samples = number
export type bpm = number

// WASM CONTRACT: PPQN (Quarter = 960) and the conversion formulas below are mirrored in Rust
// (crates/transport ppqn.rs). Changing the value or the math diverges TS and WASM timing.
const Quarter = 960 as const
const Bar: ppqn = Quarter << 2 // 3_840
const SemiQuaver: ppqn = Quarter >>> 2 // 240
const fromSignature = (nominator: int, denominator: int) => Math.floor(Bar / denominator) * nominator
const toParts = (ppqn: ppqn, nominator: int = 4, denominator: int = 4) => {
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

const secondsToPulses = (seconds: seconds, bpm: bpm): ppqn => seconds * bpm / 60.0 * Quarter
const pulsesToSeconds = (pulses: ppqn, bpm: bpm): seconds => (pulses * 60.0 / Quarter) / bpm
const secondsToBpm = (seconds: seconds, pulses: ppqn): bpm => (pulses * 60.0 / Quarter) / seconds
const samplesToPulses = (samples: samples, bpm: bpm, sampleRate: number): ppqn => secondsToPulses(samples / sampleRate, bpm)
const pulsesToSamples = (pulses: ppqn, bpm: bpm, sampleRate: number): number => pulsesToSeconds(pulses, bpm) * sampleRate

const fromBars = (bars: number, nominator: int = 4, denominator: int = 4): ppqn => bars * fromSignature(nominator, denominator)
const at = (bar: number, beat: number = 1, sixteenth: number = 1, nominator: int = 4, denominator: int = 4): ppqn =>
    fromBars(bar - 1, nominator, denominator) + (beat - 1) * fromSignature(1, denominator) + (sixteenth - 1) * SemiQuaver

/**
 * Pulses per quarter note: 960 pulses = one quarter note (never 480). A 4/4 bar is 3840, a sixteenth 240.
 * Every timeline position uses this unit, including the script devices' `block.p0/p1` and `block.from/to`.
 * @example
 * PPQN.fromBars(8)   // 30720, eight 4/4 bars
 * PPQN.at(3, 2, 3)   // 8640, bar 3, beat 2, sixteenth 3 (1-based, as PPQN.toString prints it)
 * PPQN.at(1)         // 0, the start of bar 1
 * 16 * PPQN.SemiQuaver === PPQN.Bar
 */
export const PPQN = {
    /** 3840 pulses, one 4/4 bar */
    Bar,
    /** 960 pulses, one quarter note (beat in x/4) */
    Quarter,
    /** 240 pulses, one sixteenth note */
    SemiQuaver,
    /** Pulses of `nominator` notes of length 1/`denominator`: `fromSignature(3, 4)` = 2880, `fromSignature(1, 8)` = 480 (an eighth) */
    fromSignature,
    /** Pulses of `bars` whole bars (4/4 unless a signature is given): `fromBars(2)` = 7680 */
    fromBars,
    /** Absolute pulses of a 1-based bar/beat/sixteenth (inverse of `toString`): `at(1)` = 0, `at(2, 3)` = 5760 */
    at,
    toParts,
    secondsToPulses,
    pulsesToSeconds,
    secondsToBpm,
    samplesToPulses,
    pulsesToSamples,
    /** 1-based "bar.beat.sixteenth:ticks": `toString(PPQN.at(2, 3))` = "2.3.1:0" */
    toString: (pulses: ppqn, nominator: int = 4, denominator: int = 4): string => {
        const {bars, beats, semiquavers, ticks} = toParts(pulses | 0, nominator, denominator)
        return `${bars + 1}.${beats + 1}.${semiquavers + 1}:${ticks}`
    }
} as const