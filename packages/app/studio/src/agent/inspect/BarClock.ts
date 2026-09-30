import {Arrays, int} from "@opendaw/lib-std"
import {PPQN, ppqn} from "@opendaw/lib-dsp"
import {SignatureTrackAdapter} from "@opendaw/studio-adapters"

export type BarSegment = {
    readonly position: ppqn
    readonly bar: int
    readonly nominator: int
    readonly denominator: int
}

export type BarLocation = {
    readonly bar: int
    readonly beat: int
    readonly sixteenth: int
    readonly tick: int
}

const trimNumber = (value: number): string => String(Math.round(value * 100) / 100)

export class BarClock {
    readonly #segments: ReadonlyArray<BarSegment>

    constructor(signatureTrack: SignatureTrackAdapter) {
        this.#segments = Array.from(signatureTrack.iterateAll(), ({accumulatedPpqn, accumulatedBars, nominator, denominator}) =>
            ({position: accumulatedPpqn, bar: accumulatedBars, nominator, denominator}))
    }

    get segments(): ReadonlyArray<BarSegment> {return this.#segments}

    segmentAtPosition(position: ppqn): BarSegment {
        let result = Arrays.getFirst(this.#segments, "no signature")
        for (const segment of this.#segments) {
            if (segment.position > position) {break}
            result = segment
        }
        return result
    }

    segmentAtBar(bar: int): BarSegment {
        let result = Arrays.getFirst(this.#segments, "no signature")
        for (const segment of this.#segments) {
            if (segment.bar > bar) {break}
            result = segment
        }
        return result
    }

    barStart(bar: int): ppqn {
        const {position, bar: segmentBar, nominator, denominator} = this.segmentAtBar(bar)
        return position + (bar - segmentBar) * PPQN.fromSignature(nominator, denominator)
    }

    barDuration(bar: int): ppqn {
        const {nominator, denominator} = this.segmentAtBar(bar)
        return PPQN.fromSignature(nominator, denominator)
    }

    locate(position: ppqn): BarLocation {
        const {position: segmentPosition, bar, nominator, denominator} = this.segmentAtPosition(position)
        const {bars, beats, semiquavers, ticks} = PPQN.toParts(Math.max(0, position - segmentPosition), nominator, denominator)
        return {bar: bar + bars, beat: beats, sixteenth: semiquavers, tick: ticks}
    }

    barOf(position: ppqn): int {return this.locate(position).bar}

    format(position: ppqn): string {
        const {bar, beat, sixteenth, tick} = this.locate(position)
        const head = `${bar + 1}.${beat + 1}`
        if (sixteenth === 0 && tick === 0) {return head}
        return tick === 0 ? `${head}.${sixteenth + 1}` : `${head}.${sixteenth + 1}:${Math.round(tick)}`
    }

    formatLength(position: ppqn, duration: ppqn): string {
        const {nominator, denominator} = this.segmentAtPosition(position)
        const beats = duration / PPQN.fromSignature(1, denominator)
        const bars = Math.floor((beats + 1e-6) / nominator)
        return `${bars}.${trimNumber(Math.max(0, beats - bars * nominator))}`
    }

    signatureAtBar(bar: int): string {
        const {nominator, denominator} = this.segmentAtBar(bar)
        return `${nominator}/${denominator}`
    }
}
