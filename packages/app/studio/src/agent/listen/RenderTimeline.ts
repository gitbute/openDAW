import {int, panic} from "@opendaw/lib-std"
import {bpm, ppqn, PPQN, seconds, TempoMap} from "@opendaw/lib-dsp"
import type {SignatureEvent} from "@opendaw/studio-adapters"

export type BarRange = { readonly from: int, readonly to: int }

export type RenderSpan = {
    readonly bars: BarRange
    readonly startPpqn: ppqn
    readonly endPpqn: ppqn
    readonly startSeconds: seconds
    readonly musicalFrames: int
    readonly totalFrames: int
    readonly barStartFrames: ReadonlyArray<int>
    readonly bpm: bpm
    readonly signature: [int, int]
    readonly stepSeconds: seconds
}

export namespace RenderTimeline {
    const eventAtBar = (events: ReadonlyArray<SignatureEvent>, barIndex: int): SignatureEvent => {
        if (events.length === 0) {return panic("No signature events")}
        let current = events[0]
        for (const event of events) {
            if (event.accumulatedBars > barIndex) {break}
            current = event
        }
        return current
    }

    // barIndex is zero-based
    export const barToPpqn = (events: ReadonlyArray<SignatureEvent>, barIndex: int): ppqn => {
        const {accumulatedPpqn, accumulatedBars, nominator, denominator} = eventAtBar(events, barIndex)
        return accumulatedPpqn + (barIndex - accumulatedBars) * PPQN.fromSignature(nominator, denominator)
    }

    export const signatureAtBar = (events: ReadonlyArray<SignatureEvent>, barIndex: int): [int, int] => {
        const {nominator, denominator} = eventAtBar(events, barIndex)
        return [nominator, denominator]
    }

    export const barsCovering = (events: ReadonlyArray<SignatureEvent>, position: ppqn): int => {
        if (events.length === 0) {return panic("No signature events")}
        let current = events[0]
        for (const event of events) {
            if (event.accumulatedPpqn > position) {break}
            current = event
        }
        const {accumulatedPpqn, accumulatedBars, nominator, denominator} = current
        return accumulatedBars + Math.ceil((position - accumulatedPpqn) / PPQN.fromSignature(nominator, denominator))
    }

    export const span = (events: ReadonlyArray<SignatureEvent>, tempoMap: TempoMap, bars: BarRange,
                         sampleRate: number, tailSeconds: seconds): RenderSpan => {
        const {from, to} = bars
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
            return panic(`Invalid bar range ${from}..${to} (bars are 1-based and inclusive)`)
        }
        const startPpqn = barToPpqn(events, from - 1)
        const endPpqn = barToPpqn(events, to)
        const framesTo = (position: ppqn): int => Math.round(tempoMap.intervalToSeconds(startPpqn, position) * sampleRate)
        const musicalFrames = framesTo(endPpqn)
        const barStartFrames: Array<int> = []
        for (let bar = from; bar <= to; bar++) {barStartFrames.push(framesTo(barToPpqn(events, bar - 1)))}
        const tempo = tempoMap.getTempoAt(startPpqn)
        return {
            bars, startPpqn, endPpqn, musicalFrames, barStartFrames,
            startSeconds: tempoMap.ppqnToSeconds(startPpqn),
            totalFrames: musicalFrames + Math.round(Math.max(0, tailSeconds) * sampleRate),
            bpm: tempo,
            signature: signatureAtBar(events, from - 1),
            stepSeconds: PPQN.pulsesToSeconds(PPQN.SemiQuaver, tempo)
        }
    }
}
