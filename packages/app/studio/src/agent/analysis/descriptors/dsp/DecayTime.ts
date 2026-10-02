import {int, Option, Optional} from "@opendaw/lib-std"
import type {AudioMetrics} from "@opendaw/lib-dsp"
import {MeasureMath} from "./MeasureMath"

/** Decay of tails: -60 dB time extrapolated from a line fitted to the level falling from -5 to -25 (or -15) dB. */
export namespace DecayTime {
    export type Envelope = { readonly db: Float64Array, readonly power: Float64Array, readonly hop: int, readonly rate: number }
    export type Tail = { readonly decaySeconds: number, readonly fitDb: number }

    export const envelope = (channels: AudioMetrics.Channels, sampleRate: number, hopSeconds: number = 0.01): Envelope => {
        const hop = Math.max(1, Math.round(sampleRate * hopSeconds))
        const power = MeasureMath.blockPower(channels, hop)
        return {db: power.map(value => MeasureMath.powerDb(value)), power, hop, rate: sampleRate / hop}
    }

    const lastAbove = (db: Float64Array, from: int, to: int, level: number): int => {
        for (let index = to - 1; index >= from; index--) {if (db[index] >= level) {return index}}
        return -1
    }

    /** Decay of the window [fromFrame, toFrame): starts where the level last sits within 5 dB of the window's peak. */
    export const measure = ({db, hop, rate}: Envelope, fromFrame: int, toFrame: int): Option<Tail> => {
        const from = Math.max(0, Math.ceil(fromFrame / hop)), to = Math.min(db.length, Math.floor(toFrame / hop))
        if (to - from < 8) {return Option.None}
        let peak = -Infinity
        for (let index = from; index < to; index++) {peak = Math.max(peak, db[index])}
        if (peak < -100) {return Option.None}
        const start = lastAbove(db, from, to, peak - 5) + 1
        let endLevel = Infinity
        for (let index = Math.max(start, to - 3); index < to; index++) {endLevel = Math.min(endLevel, db[index])}
        const fitDb = endLevel <= peak - 25 ? 25 : endLevel <= peak - 15 ? 15 : 0
        if (fitDb === 0) {return Option.None}
        const end = lastAbove(db, start, to, peak - fitDb) + 1
        if (end - start < 4) {return Option.None}
        const {slope, r2} = MeasureMath.linearFit(db, start, end)
        const slopePerSecond = slope * rate
        if (slopePerSecond > -1 || r2 < 0.5) {return Option.None}
        return Option.wrap({decaySeconds: -60 / slopePerSecond, fitDb: fitDb - 5})
    }

    /** Energy of the first earlySeconds of the window against the rest, in dB (high: dry, low: washy). */
    export const earlyLateDb = ({power, hop, rate}: Envelope, fromFrame: int, toFrame: int,
                                earlySeconds: number = 0.08): Optional<number> => {
        const from = Math.max(0, Math.ceil(fromFrame / hop)), to = Math.min(power.length, Math.floor(toFrame / hop))
        const split = from + Math.round(earlySeconds * rate)
        if (to - split < Math.round(earlySeconds * rate)) {return undefined}
        let early = 0, late = 0
        for (let index = from; index < split; index++) {early += power[index]}
        for (let index = split; index < to; index++) {late += power[index]}
        if (early <= 1e-15) {return undefined}
        return MeasureMath.ratioDb(early, late)
    }
}
