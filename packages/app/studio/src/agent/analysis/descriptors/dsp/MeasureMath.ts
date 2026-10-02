import {clamp, int, isDefined, Maybe, Nullable, Optional} from "@opendaw/lib-std"
import {AudioMetrics, SILENCE_DB} from "@opendaw/lib-dsp"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {SoundNote} from "../../SoundTarget"

/** Numeric, statistics and JSON helpers shared by the sound descriptors (and the listen views). */
export namespace MeasureMath {
    export const FloorDb = SILENCE_DB
    export const MaxListedNotes = 16

    export type LinearFit = { readonly slope: number, readonly intercept: number, readonly r2: number }
    export type Sinusoid = { readonly amplitude: number, readonly cos: number, readonly sin: number }
    export type NoteRegion = { readonly startFrame: int, readonly endFrame: int, readonly holdFrame: int }

    const MaxTableChars = 340

    export const round = (value: Maybe<number>, digits: int): Nullable<number> => {
        if (!isDefined(value) || !Number.isFinite(value)) {return null}
        const scale = 10 ** digits
        return Math.round(value * scale) / scale + 0
    }

    export const powerDb = (power: number, floorDb: number = FloorDb): number =>
        power > 10 ** (floorDb / 10) ? 10 * Math.log10(power) : floorDb

    export const amplitudeDb = (amplitude: number, floorDb: number = FloorDb): number =>
        amplitude > 10 ** (floorDb / 20) ? 20 * Math.log10(amplitude) : floorDb

    /** Power ratio in dB, clamped to ±limitDb (also when either side is silent). */
    export const ratioDb = (numerator: number, denominator: number, limitDb: number = 60): number =>
        clamp(10 * Math.log10(Math.max(numerator, 1e-30) / Math.max(denominator, 1e-30)), -limitDb, limitDb)

    export const frameCount = (channels: AudioMetrics.Channels): int =>
        channels.length === 0 ? 0 : channels.reduce((min, channel) => Math.min(min, channel.length), Number.MAX_SAFE_INTEGER)

    export const mono = (channels: AudioMetrics.Channels, fromFrame: int = 0, toFrame: int = frameCount(channels)): Float32Array => {
        const result = new Float32Array(Math.max(0, toFrame - fromFrame))
        if (channels.length === 0) {return result}
        const gain = 1 / channels.length
        for (const channel of channels) {
            const end = Math.min(result.length, channel.length - fromFrame)
            for (let index = 0; index < end; index++) {result[index] += channel[fromFrame + index] * gain}
        }
        return result
    }

    /** Mean power over all channels per block of hopFrames (one shorter block when there is no full one). */
    export const blockPower = (channels: AudioMetrics.Channels, hopFrames: int): Float64Array => {
        const numFrames = frameCount(channels)
        const count = numFrames === 0 ? 0 : Math.max(1, Math.floor(numFrames / hopFrames))
        const power = new Float64Array(count)
        for (const samples of channels) {
            for (let block = 0; block < count; block++) {
                const from = block * hopFrames, to = Math.min(numFrames, from + hopFrames)
                let sum = 0
                for (let index = from; index < to; index++) {sum += samples[index] * samples[index]}
                power[block] += sum / ((to - from) * channels.length)
            }
        }
        return power
    }

    /** The finite values, ascending. */
    export const sorted = (values: ArrayLike<Maybe<number>>): Float64Array => {
        const result: Array<number> = []
        for (let index = 0; index < values.length; index++) {
            const value = values[index]
            if (isDefined(value) && Number.isFinite(value)) {result.push(value)}
        }
        return Float64Array.from(result).sort()
    }

    /** Linear interpolation between ranks of an ascending array. */
    export const percentile = (ascending: ArrayLike<number>, fraction: number): number => {
        if (ascending.length === 0) {return NaN}
        const rank = clamp(fraction, 0, 1) * (ascending.length - 1)
        const index = Math.floor(rank)
        const next = Math.min(ascending.length - 1, index + 1)
        return ascending[index] + (ascending[next] - ascending[index]) * (rank - index)
    }

    export const median = (values: ArrayLike<Maybe<number>>): number => percentile(sorted(values), 0.5)

    export const mean = (values: ArrayLike<number>, from: int = 0, to: int = values.length): number => {
        let sum = 0
        for (let index = from; index < to; index++) {sum += values[index]}
        return to > from ? sum / (to - from) : NaN
    }

    export const rms = (values: ArrayLike<number>, from: int = 0, to: int = values.length): number => {
        const start = Math.max(0, from), end = Math.min(values.length, to)
        let sum = 0
        for (let index = start; index < end; index++) {sum += values[index] * values[index]}
        return end > start ? Math.sqrt(sum / (end - start)) : 0
    }

    /** Least-squares line over the index (0 at `from`); r2 is 0 for a flat curve. */
    export const linearFit = (values: ArrayLike<number>, from: int = 0, to: int = values.length): LinearFit => {
        const count = to - from
        if (count < 2) {return {slope: 0, intercept: count === 1 ? values[from] : 0, r2: 0}}
        const meanX = (count - 1) / 2, meanY = mean(values, from, to)
        let covariance = 0, varianceX = 0, varianceY = 0
        for (let index = 0; index < count; index++) {
            const deltaX = index - meanX, deltaY = values[from + index] - meanY
            covariance += deltaX * deltaY
            varianceX += deltaX * deltaX
            varianceY += deltaY * deltaY
        }
        const slope = covariance / varianceX
        return {slope, intercept: meanY - slope * meanX, r2: varianceY > 1e-12 ? covariance * covariance / (varianceX * varianceY) : 0}
    }

    /** Least-squares sinusoid at hz over [from, to), exact for whole cycles. */
    export const sine = (values: ArrayLike<number>, rate: number, hz: number, from: int = 0, to: int = values.length): Sinusoid => {
        const omega = 2 * Math.PI * hz / rate
        const stepCos = Math.cos(omega), stepSin = Math.sin(omega)
        let phaseCos = 1, phaseSin = 0, sumCos = 0, sumSin = 0
        for (let index = from; index < to; index++) {
            sumCos += values[index] * phaseCos
            sumSin += values[index] * phaseSin
            const nextCos = phaseCos * stepCos - phaseSin * stepSin
            phaseSin = phaseSin * stepCos + phaseCos * stepSin
            phaseCos = nextCos
        }
        const count = Math.max(1, to - from)
        const cos = 2 * sumCos / count, sin = 2 * sumSin / count
        return {amplitude: Math.hypot(cos, sin), cos, sin}
    }

    /** Splits values into `points` equal slices and reduces the valid entries of each (null for empty slices). */
    export const curve = (values: ArrayLike<number>, valid: (index: int) => boolean, points: int,
                          reduce: (slice: ReadonlyArray<number>) => number, digits: int): ReadonlyArray<JsonValue> =>
        Array.from({length: points}, (_value, point) => {
            const from = Math.floor(point * values.length / points)
            const to = Math.floor((point + 1) * values.length / points)
            const slice: Array<number> = []
            for (let index = from; index < to; index++) {if (valid(index)) {slice.push(values[index])}}
            return slice.length === 0 ? null : round(reduce(slice), digits)
        })

    /** Drops null and undefined entries. */
    export const compact = (object: { readonly [key: string]: Optional<JsonValue> }): JsonObject =>
        Object.fromEntries(Object.entries(object).filter((entry): entry is [string, JsonValue] => isDefined(entry[1])))

    export const medianOf = (values: ArrayLike<Maybe<number>>, digits: int): Nullable<number> => round(median(values), digits)

    /** The median, or {median, min, max} when the rounded values differ; null without any. */
    export const spread = (values: ArrayLike<Maybe<number>>, digits: int): Nullable<JsonValue> => {
        const ascending = sorted(values)
        if (ascending.length === 0) {return null}
        const min = round(ascending[0], digits), max = round(ascending[ascending.length - 1], digits)
        const middle = round(percentile(ascending, 0.5), digits)
        return min === max ? middle : {median: middle, min, max}
    }

    /** The note's frames clamped to the channels; holdFrame is note-off (or the end when unknown). */
    export const noteRegion = (channels: AudioMetrics.Channels, {startFrame, endFrame, offFrame}: SoundNote): NoteRegion => {
        const total = frameCount(channels)
        const start = clamp(startFrame, 0, total), end = clamp(endFrame, start, total)
        const hold = isDefined(offFrame) ? clamp(offFrame, start, end) : end
        return {startFrame: start, endFrame: end, holdFrame: hold > start ? hold : end}
    }

    /** At most `max` items, spread evenly. */
    export const sample = <T>(items: ReadonlyArray<T>, max: int): ReadonlyArray<T> => {
        if (items.length <= max) {return items}
        return Array.from({length: max}, (_value, index) => items[Math.floor((index + 0.5) * items.length / max)])
    }

    /** Rows (note index first) thinned to MaxListedNotes and a size budget, without all-null or (from 4 rows) constant columns. */
    export const noteTable = (columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<JsonValue>>,
                              totalNotes: int): JsonObject => {
        const informative = (index: int): boolean => rows.length < 4
            ? rows.some(row => row[index] !== null)
            : rows.some(row => JSON.stringify(row[index]) !== JSON.stringify(rows[0][index]))
        const kept = columns.map((_column, index) => index).filter(index => index === 0 || informative(index))
        const narrow = rows.map(row => kept.map(index => row[index]))
        let listed = sample(narrow, MaxListedNotes)
        while (listed.length > 4 && JSON.stringify(listed).length > MaxTableChars) {listed = sample(narrow, listed.length - 2)}
        const omitted = Math.max(0, totalNotes - listed.length)
        return {
            columns: kept.map(index => columns[index]), rows: listed,
            ...(omitted > 0 ? {listedNotes: listed.length, omittedNotes: omitted} : {})
        }
    }
}
