import {int, isDefined, Maybe, Nullable, Optional} from "@opendaw/lib-std"
import type {JsonObject} from "@opendaw/studio-codex"
import {DecayTime} from "@/agent/analysis/descriptors/dsp/DecayTime"
import {FftCache} from "@/agent/analysis/descriptors/dsp/FftCache"
import {MeasureMath} from "@/agent/analysis/descriptors/dsp/MeasureMath"
import {ProbePlan, ProbeSignals, StepsSegment, StepWindow} from "./ProbeSignals"

export type CurvePoint = { readonly hz: number, readonly db: number }

export type TimePoint = { readonly ms: number, readonly db: number }

export type FrequencyResult = {
    readonly bands: ReadonlyArray<CurvePoint>
    readonly curve: ReadonlyArray<CurvePoint>
    readonly gainAt1kDb: number
    readonly passbandDb: number
    readonly spreadDb: number
    readonly peak: Optional<CurvePoint>
    readonly dip: Optional<CurvePoint>
    readonly minus3dbLowHz: Optional<number>
    readonly minus3dbHighHz: Optional<number>
    readonly lowSlopeDbPerOct: Optional<number>
    readonly highSlopeDbPerOct: Optional<number>
}

export type HarmonicLevel = {
    readonly levelDb: number
    readonly gainDb: number
    readonly thdPercent: number
    readonly harmonicsDb: ReadonlyArray<number>
    readonly oddDb: number
    readonly evenDb: number
    readonly residualDb: number
}

export type HarmonicCharacter = "clean" | "odd" | "even" | "mixed"

export type HarmonicsResult = { readonly hz: number, readonly levels: ReadonlyArray<HarmonicLevel>, readonly character: HarmonicCharacter }

export type TransferStep = {
    readonly levelDb: number
    readonly outDb: Nullable<number>
    readonly outPeakDb: Nullable<number>
    readonly gainDb: Nullable<number>
}

export type TransferResult = {
    readonly steps: ReadonlyArray<TransferStep>
    readonly gainDb: number
    readonly compressionStartDb: Optional<number>
    readonly ratioAtTop: Optional<number>
    readonly limiting: boolean
    readonly ceilingDb: Nullable<number>
    readonly gateBelowDb: Optional<number>
}

export type ImdResult = {
    readonly levelDb: number
    readonly imdPercent: number
    readonly products: ReadonlyArray<CurvePoint>
    readonly lowGainDb: number
    readonly highGainDb: number
}

export type DynamicsResult = {
    readonly gainLowDb: number
    readonly gainHighDb: number
    readonly gainReductionDb: number
    readonly attackMs: Optional<number>
    readonly releaseMs: Optional<number>
    readonly releaseIncomplete: boolean
    readonly latencyMs: number
    readonly curve: ReadonlyArray<TimePoint>
}

export type ImpulseResult = {
    readonly firstArrivalMs: Optional<number>
    readonly peakMs: Optional<number>
    readonly wetOnsetMs: Optional<number>
    readonly rt60Ms: Optional<number>
    readonly rt60Fit: Optional<string>
    readonly edtMs: Optional<number>
    readonly echoesMs: ReadonlyArray<number>
    readonly echoSpacingMs: Optional<number>
    readonly energyGainDb: number
    readonly energyLeftDb: ReadonlyArray<TimePoint>
    readonly envelope: ReadonlyArray<TimePoint>
    readonly decay: ReadonlyArray<TimePoint>
}

export type ProbeResult =
    | { readonly test: "frequency", readonly result: FrequencyResult }
    | { readonly test: "harmonics", readonly result: HarmonicsResult }
    | { readonly test: "transfer", readonly result: TransferResult }
    | { readonly test: "imd", readonly result: ImdResult }
    | { readonly test: "dynamics", readonly result: DynamicsResult }
    | { readonly test: "impulse", readonly result: ImpulseResult }

export namespace ProbeMeasure {
    export const ThirdOctaves: ReadonlyArray<number> = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
        800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]
    export const EnergyLeftAtMs: ReadonlyArray<number> = [50, 200, 500, 1000, 2000]
    export const CleanThdPercent = 0.01
    const Harmonics = 10
    const {FloorDb, amplitudeDb, powerDb, round, rms, mean, median} = MeasureMath

    // frames the signal is late against the expected first non-zero frame
    export const alignment = (signal: Float32Array, expected: int, reach: int): int => {
        const from = Math.max(0, expected - reach)
        const to = Math.min(signal.length, expected + reach + 1)
        for (let index = from; index < to; index++) {
            if (Math.abs(signal[index]) > 1e-9) {return index - expected}
        }
        return 0
    }

    const peak = (signal: Float32Array, from: int, to: int): number => {
        let max = 0.0
        for (let index = from; index < to; index++) {max = Math.max(max, Math.abs(signal[index]))}
        return max
    }

    const powerSpectrum = (signal: Float32Array, from: int, to: int, size: int): Float64Array => {
        const real = new Float32Array(size)
        const imag = new Float32Array(size)
        real.set(signal.subarray(Math.max(0, from), Math.min(signal.length, to, from + size)))
        FftCache.fft(size).process(real, imag)
        const cumulative = new Float64Array(size / 2 + 1)
        for (let bin = 0; bin < size / 2; bin++) {cumulative[bin + 1] = cumulative[bin] + real[bin] * real[bin] + imag[bin] * imag[bin]}
        return cumulative
    }

    export const curveAt = (curve: ReadonlyArray<CurvePoint>, hz: number): number => {
        if (curve.length === 0) {return NaN}
        if (hz <= curve[0].hz) {return curve[0].db}
        for (let index = 1; index < curve.length; index++) {
            const {hz: upperHz, db: upperDb} = curve[index]
            if (hz <= upperHz) {
                const {hz: lowerHz, db: lowerDb} = curve[index - 1]
                return lowerDb + (upperDb - lowerDb) * Math.log(hz / lowerHz) / Math.log(upperHz / lowerHz)
            }
        }
        return curve[curve.length - 1].db
    }

    // must stay below for an octave (at least half one at the curve end): a roll-off, not a comb dip
    const crossing = (curve: ReadonlyArray<CurvePoint>, from: int, direction: 1 | -1, threshold: number): Optional<number> => {
        for (let index = from + direction; index >= 0 && index < curve.length; index += direction) {
            const {hz, db} = curve[index]
            const following = direction === 1 ? curve.slice(index, index + 13) : curve.slice(Math.max(0, index - 12), index + 1)
            if (db < threshold && following.length >= 7 && following.every(point => point.db < threshold)) {
                const {hz: previousHz, db: previousDb} = curve[index - direction]
                const ratio = (previousDb - threshold) / (previousDb - db)
                return previousHz * Math.pow(hz / previousHz, ratio)
            }
        }
        return undefined
    }

    export const frequency = (input: Float32Array, output: Float32Array, sampleRate: number, from: int, to: int): FrequencyResult => {
        const size = FftCache.ceilPow2(to - from)
        const inputPower = powerSpectrum(input, from, to, size)
        const outputPower = powerSpectrum(output, from, to, size)
        const binHz = sampleRate / size
        const bandDb = (centerHz: number, halfWidth: number): number => {
            const low = Math.min(size / 2 - 1, Math.ceil(centerHz / halfWidth / binHz))
            const high = Math.min(size / 2, Math.max(low + 1, Math.ceil(centerHz * halfWidth / binHz)))
            const inputSum = inputPower[high] - inputPower[low]
            const outputSum = outputPower[high] - outputPower[low]
            return inputSum > 1e-20 ? powerDb(outputSum / inputSum) : NaN
        }
        const third = Math.pow(2, 1 / 6)
        const bands = ThirdOctaves.map((hz, index) => ({hz, db: bandDb(1000 * Math.pow(2, (index - 17) / 3), third)}))
        const twelfth = Math.pow(2, 1 / 24)
        const curve = Array.from({length: 120}, (_value, index) => 20 * Math.pow(2, index / 12))
            .map(hz => ({hz, db: bandDb(hz, twelfth)})).filter(({db}) => Number.isFinite(db))
        const smoothed = curve.map((_point, index) => powerDb(curve.slice(Math.max(0, index - 6), index + 7)
            .reduce((sum, {db}, _position, all) => sum + 10 ** (db / 10) / all.length, 0)))
        const referenceIndex = smoothed.reduce((best, db, index) => db > smoothed[best] ? index : best, 0)
        const passbandDb = smoothed[referenceIndex] ?? NaN
        const minus3dbLowHz = crossing(curve, referenceIndex, -1, passbandDb - 3)
        const minus3dbHighHz = crossing(curve, referenceIndex, 1, passbandDb - 3)
        const finite = bands.filter(({db}) => Number.isFinite(db))
        const notches = finite.filter((band, index) => index > 0 && index < finite.length - 1
            && band.db < finite[index - 1].db && band.db < finite[index + 1].db)
        const highest = finite.slice(1, -1).reduce<Optional<CurvePoint>>((best, band) => !isDefined(best) || band.db > best.db ? band : best, undefined)
        const lowest = notches.reduce<Optional<CurvePoint>>((best, band) => !isDefined(best) || band.db < best.db ? band : best, undefined)
        const highSlopeDbPerOct = isDefined(minus3dbHighHz) && minus3dbHighHz * 4 <= 20000
            ? curveAt(curve, minus3dbHighHz * 4) - curveAt(curve, minus3dbHighHz * 2) : undefined
        const lowSlopeDbPerOct = isDefined(minus3dbLowHz) && minus3dbLowHz / 4 >= 20
            ? curveAt(curve, minus3dbLowHz / 2) - curveAt(curve, minus3dbLowHz / 4) : undefined
        return {
            bands, curve, gainAt1kDb: bands[17].db, passbandDb,
            spreadDb: finite.reduce((max, {db}) => Math.max(max, db), -Infinity) - finite.reduce((min, {db}) => Math.min(min, db), Infinity),
            peak: isDefined(highest) && highest.db >= passbandDb + 1 ? highest : undefined,
            dip: isDefined(lowest) && lowest.db <= passbandDb - 1 ? lowest : undefined,
            minus3dbLowHz, minus3dbHighHz, lowSlopeDbPerOct, highSlopeDbPerOct
        }
    }

    const harmonicLevel = (input: Float32Array, output: Float32Array, sampleRate: number, hz: number,
                           {levelDb, startFrame, endFrame}: StepWindow): HarmonicLevel => {
        const orders = Array.from({length: Harmonics}, (_value, index) => index + 1).filter(order => order * hz < sampleRate * 0.5)
        const fits = orders.map(order => MeasureMath.sine(output, sampleRate, order * hz, startFrame, endFrame))
        const fundamental = fits[0].amplitude
        const inputFundamental = MeasureMath.sine(input, sampleRate, hz, startFrame, endFrame).amplitude
        const count = endFrame - startFrame
        const offset = mean(output, startFrame, endFrame)
        let residual = 0.0
        for (let index = startFrame; index < endFrame; index++) {
            let value = output[index] - offset
            fits.forEach(({cos, sin}, order) => {
                const phase = 2 * Math.PI * (order + 1) * hz * (index - startFrame) / sampleRate
                value -= cos * Math.cos(phase) + sin * Math.sin(phase)
            })
            residual += value * value
        }
        const ratios = fits.slice(1).map(({amplitude}) => fundamental > 0 ? amplitude / fundamental : 0)
        const energy = (parity: 0 | 1): number => ratios.reduce((sum, ratio, index) => (index + 2) % 2 === parity ? sum + ratio * ratio : sum, 0)
        const total = energy(0) + energy(1)
        return {
            levelDb, gainDb: amplitudeDb(inputFundamental > 0 ? fundamental / inputFundamental : 0),
            thdPercent: Math.sqrt(total) * 100, harmonicsDb: ratios.map(ratio => amplitudeDb(ratio)),
            oddDb: powerDb(energy(1)), evenDb: powerDb(energy(0)),
            residualDb: amplitudeDb(fundamental > 0 ? Math.sqrt(residual / Math.max(1, count)) / (fundamental / Math.SQRT2) : 0)
        }
    }

    export const characterOf = ({thdPercent, oddDb, evenDb}: HarmonicLevel): HarmonicCharacter => {
        if (thdPercent < CleanThdPercent) {return "clean"}
        if (oddDb > evenDb + 6) {return "odd"}
        if (evenDb > oddDb + 6) {return "even"}
        return "mixed"
    }

    export const harmonics = (input: Float32Array, output: Float32Array, sampleRate: number, hz: number,
                              windows: ReadonlyArray<StepWindow>): HarmonicsResult => {
        const levels = windows.map(window => harmonicLevel(input, output, sampleRate, hz, window))
        const loudest = levels[levels.length - 1]
        return {hz, levels, character: isDefined(loudest) ? characterOf(loudest) : "clean"}
    }

    export const transfer = (input: Float32Array, output: Float32Array, windows: ReadonlyArray<StepWindow>): TransferResult => {
        const steps = windows.map(({levelDb, amp, startFrame, endFrame}): TransferStep => {
            const inputRms = rms(input, startFrame, endFrame)
            const outputRms = rms(output, startFrame, endFrame)
            if (inputRms <= 0 || amplitudeDb(outputRms) <= FloorDb) {return {levelDb, gainDb: null, outDb: null, outPeakDb: null}}
            const pathGain = amp > 0 ? inputRms / (amp / Math.SQRT2) : 1.0
            const gainDb = amplitudeDb(outputRms / inputRms)
            const outPeakDb = amplitudeDb(peak(output, startFrame, endFrame) / Math.max(1e-12, pathGain))
            return {levelDb, gainDb, outDb: levelDb + gainDb, outPeakDb: outPeakDb > FloorDb ? outPeakDb : null}
        })
        const gainOf = ({gainDb}: TransferStep): number => gainDb ?? -Infinity
        const reference = steps.filter(({levelDb}) => levelDb >= -36 && levelDb <= -18).map(gainOf)
        const gainDb = median(reference.length > 0 ? reference : steps.map(gainOf))
        const compression = steps.find(step => step.levelDb >= -36 && gainOf(step) <= gainDb - 1)
        const gated = steps.filter(step => step.levelDb < -18 && gainOf(step) < gainDb - 6)
        const top = steps[steps.length - 1]
        const below = steps.find(step => isDefined(top) && step.levelDb === top.levelDb - 6)
        const slope = isDefined(top?.outDb) && isDefined(below?.outDb) ? (top.outDb - below.outDb) / 6 : 1
        const peaks = steps.flatMap(({outPeakDb}) => isDefined(outPeakDb) ? [outPeakDb] : [])
        return {
            steps, gainDb, compressionStartDb: compression?.levelDb,
            ratioAtTop: slope > 0.01 ? 1 / slope : undefined, limiting: slope <= 0.01,
            ceilingDb: peaks.length > 0 ? Math.max(...peaks) : null,
            gateBelowDb: gated.length > 0 ? gated[gated.length - 1].levelDb : undefined
        }
    }

    export const imd = (input: Float32Array, output: Float32Array, sampleRate: number, levelDb: number,
                        lowHz: number, highHz: number, from: int, to: int): ImdResult => {
        const amplitudeAt = (signal: Float32Array, hz: number): number => MeasureMath.sine(signal, sampleRate, hz, from, to).amplitude
        const carrier = amplitudeAt(output, highHz)
        const products = [1, 2, 3, 4, 5].flatMap(order => [highHz - order * lowHz, highHz + order * lowHz])
            .filter(hz => hz > 0 && hz < sampleRate * 0.5)
            .map(hz => ({hz, amp: amplitudeAt(output, hz)}))
        const sum = products.reduce((total, {amp}) => total + amp * amp, 0)
        const gain = (hz: number): number => {
            const reference = amplitudeAt(input, hz)
            return reference > 0 ? amplitudeDb(amplitudeAt(output, hz) / reference) : FloorDb
        }
        return {
            levelDb, imdPercent: carrier > 0 ? Math.sqrt(sum) / carrier * 100 : 0,
            products: products.map(({hz, amp}) => ({hz, db: amplitudeDb(carrier > 0 ? amp / carrier : 0)}))
                .sort((first, second) => second.db - first.db).slice(0, 3),
            lowGainDb: gain(lowHz), highGainDb: gain(highHz)
        }
    }

    const envelope = (signal: Float32Array, period: int): Float64Array => {
        const result = new Float64Array(signal.length)
        const half = Math.floor(period / 2)
        let sum = 0.0
        for (let index = 0; index < signal.length + half; index++) {
            if (index < signal.length) {sum += signal[index] * signal[index]}
            if (index - period >= 0 && index - period < signal.length) {sum -= signal[index - period] * signal[index - period]}
            const center = index - half
            if (center >= 0 && center < signal.length) {result[center] = Math.sqrt(Math.max(0, sum) / period)}
        }
        return result
    }

    const crossingFrame = (values: Float64Array, from: int, to: int, threshold: number): int => {
        for (let index = from; index < to; index++) {if (values[index] >= threshold) {return index}}
        return from
    }

    // -20 dB: a dry path marks the onset before a reverb builds up
    const OnsetShare = 0.1

    // attack and release are the times to 63 % of the gain change (one time constant)
    export const dynamics = (input: Float32Array, output: Float32Array, sampleRate: number, segment: StepsSegment, offset: int): DynamicsResult => {
        const period = Math.max(2, Math.round(sampleRate / segment.hz))
        const inputEnvelope = envelope(input, period)
        const outputEnvelope = envelope(output, period)
        const boundaries = segment.steps.reduce<Array<int>>((frames, {duration}) =>
            [...frames, frames[frames.length - 1] + Math.round(duration * sampleRate)], [ProbeSignals.startFrame(segment, sampleRate) + offset])
        const [start, rise, fall, end] = boundaries
        const settled = Math.round(0.05 * sampleRate)
        const inputOnset = crossingFrame(inputEnvelope, start, rise, inputEnvelope[start + settled] * OnsetShare)
        const outputOnset = crossingFrame(outputEnvelope, start, rise, mean(outputEnvelope, rise - settled * 2, rise - settled) * OnsetShare)
        const latency = Math.max(0, Math.min(Math.round(0.1 * sampleRate), outputOnset - inputOnset))
        const last = Math.min(end - Math.round(ProbeSignals.Fade * sampleRate) - period, output.length - latency - 1)
        const gain = new Float64Array(last - start)
        for (let index = start; index < last; index++) {
            gain[index - start] = amplitudeDb(outputEnvelope[index + latency] / Math.max(1e-12, inputEnvelope[index]))
        }
        const at = (frame: int): int => Math.max(0, Math.min(gain.length, frame - start))
        const gainLowDb = mean(gain, at(rise - Math.round(0.1 * sampleRate)), at(rise - Math.round(0.01 * sampleRate)))
        const gainHighDb = mean(gain, at(fall - Math.round(0.06 * sampleRate)), at(fall - Math.round(0.01 * sampleRate)))
        const audible = gainLowDb > FloorDb + 1 && gainHighDb > FloorDb + 1
        const reduction = audible ? gainLowDb - gainHighDb : NaN
        const share = (index: int): number => (gainLowDb - gain[index]) / reduction
        const measurable = Math.abs(reduction) >= 0.5
        const find = (from: int, to: int, predicate: (index: int) => boolean): Optional<int> => {
            for (let index = from; index < to; index++) {if (predicate(index)) {return index}}
            return undefined
        }
        const attack = measurable ? find(at(rise), at(fall), index => share(index) >= 1 - Math.exp(-1)) : undefined
        const release = measurable ? find(at(fall), gain.length, index => share(index) <= Math.exp(-1)) : undefined
        const toMs = (frames: int): number => frames / sampleRate * 1000
        const hop = Math.max(1, Math.round(sampleRate / 1000))
        const curve: Array<TimePoint> = []
        const reference = audible ? gainLowDb : 0
        for (let index = 0; index < gain.length; index += hop) {curve.push({ms: toMs(index), db: gain[index] - reference})}
        const releaseIncomplete = measurable && !isDefined(release)
        return {
            gainLowDb, gainHighDb, gainReductionDb: reduction,
            attackMs: isDefined(attack) ? toMs(attack - at(rise)) : undefined,
            releaseMs: isDefined(release) ? toMs(release - at(fall)) : releaseIncomplete ? toMs(gain.length - at(fall)) : undefined,
            releaseIncomplete, latencyMs: toMs(latency), curve
        }
    }

    const after = (channels: ReadonlyArray<Float32Array>, from: int): ReadonlyArray<Float32Array> =>
        channels.map(channel => channel.subarray(Math.min(channel.length, from)))

    const firstBelow = (values: Float64Array, threshold: number): Optional<int> => {
        for (let index = 0; index < values.length; index++) {if (values[index] <= threshold) {return index}}
        return undefined
    }

    type DecayFit = { readonly rt60Ms: number, readonly fit: string }

    // T30, else T20, else T10, never the last 10 % where the window truncation bends the decay
    const decayFit = (decay: Float64Array, sampleRate: number): Optional<DecayFit> => {
        const usable = Math.floor(decay.length * 0.9)
        const start = firstBelow(decay, -5)
        if (!isDefined(start)) {return undefined}
        for (const [name, depth] of [["T30", -35], ["T20", -25], ["T10", -15]] as const) {
            const stop = firstBelow(decay, depth)
            if (!isDefined(stop) || stop > usable) {continue}
            if (stop - start < 8) {return {rt60Ms: (stop + 1) / sampleRate * 1000 * 60 / -depth, fit: name}}
            const slope = MeasureMath.linearFit(decay, start, stop).slope * sampleRate
            return slope < 0 ? {rt60Ms: -60 / slope * 1000, fit: name} : undefined
        }
        return undefined
    }

    export const impulse = (input: ReadonlyArray<Float32Array>, output: ReadonlyArray<Float32Array>, sampleRate: number,
                            impulseFrame: int): ImpulseResult => {
        const tail = after(output, impulseFrame)
        const power = MeasureMath.blockPower(tail, 1)
        const inputEnergy = MeasureMath.blockPower(after(input, impulseFrame), 1).reduce((sum, value) => sum + value, 0)
        const total = power.reduce((sum, value) => sum + value, 0)
        const toMs = (frames: number): number => frames / sampleRate * 1000
        const decay = new Float64Array(power.length)
        let remaining = 0.0
        for (let index = power.length - 1; index >= 0; index--) {
            remaining += power[index]
            decay[index] = powerDb(total > 0 ? remaining / total : 0)
        }
        const peakFrame = power.reduce((best, value, index) => value > power[best] ? index : best, 0)
        const peakPower = power[peakFrame] ?? 0
        const audible = total > 1e-20
        const firstArrival = audible ? power.findIndex(value => value >= peakPower * 1e-4) : -1
        const {db, hop: binFrames} = DecayTime.envelope(tail, sampleRate, 0.001)
        const bins = Array.from(db)
        const maxDb = bins.reduce((max, value) => Math.max(max, value), FloorDb)
        const echoBins = audible ? bins.flatMap((value, bin) => {
            if (value < maxDb - 40) {return []}
            const neighbours = bins.slice(Math.max(0, bin - 3), bin + 4)
            if (neighbours.some((other, index) => other > value || (other === value && index < Math.min(3, bin)))) {return []}
            return value >= median(bins.slice(Math.max(0, bin - 15), bin + 16)) + 10 ? [bin] : []
        }) : []
        const echoesMs = echoBins.slice(0, 8).map(bin => {
            let best = bin * binFrames
            for (let index = bin * binFrames; index < (bin + 1) * binFrames; index++) {if (power[index] > power[best]) {best = index}}
            return toMs(best)
        })
        const gaps = echoesMs.slice(1).map((time, index) => time - echoesMs[index])
        const regular = gaps.length === 1 || (gaps.length > 1 && Math.max(...gaps) <= Math.min(...gaps) * 1.25)
        const firstBin = firstArrival >= 0 ? Math.floor(firstArrival / binFrames) : -1
        const later = bins.slice(firstBin + 2)
        const laterMax = later.reduce((max, value) => Math.max(max, value), FloorDb)
        const wetBin = firstBin >= 0 && laterMax > maxDb - 60 ? later.findIndex(value => value >= laterMax - 20) : -1
        const fit = audible ? decayFit(decay, sampleRate) : undefined
        const edtStop = firstBelow(decay, -10)
        const edt = isDefined(edtStop) && edtStop > 8 ? MeasureMath.linearFit(decay, 0, edtStop).slope * sampleRate : undefined
        const envelopePoints: Array<TimePoint> = bins.map((value, bin) => ({ms: bin, db: value - maxDb}))
        const decayPoints: Array<TimePoint> = []
        for (let index = 0; index < decay.length; index += binFrames) {decayPoints.push({ms: toMs(index), db: decay[index]})}
        return {
            firstArrivalMs: firstArrival >= 0 ? toMs(firstArrival) : undefined,
            peakMs: audible ? toMs(peakFrame) : undefined,
            wetOnsetMs: wetBin >= 0 ? wetBin + firstBin + 2 : undefined,
            rt60Ms: fit?.rt60Ms, rt60Fit: fit?.fit,
            edtMs: isDefined(edt) && edt < 0 ? -60 / edt * 1000 : isDefined(edtStop) && audible ? toMs(edtStop) * 6 : undefined,
            echoesMs, echoSpacingMs: regular ? median(gaps) : undefined,
            energyGainDb: inputEnergy > 0 ? powerDb(total / inputEnergy) : FloorDb,
            energyLeftDb: EnergyLeftAtMs.filter(ms => Math.round(ms * sampleRate / 1000) < decay.length)
                .map(ms => ({ms, db: decay[Math.round(ms * sampleRate / 1000)]})),
            envelope: envelopePoints, decay: decayPoints
        }
    }

    export const analyse = ({test, segment}: ProbePlan, dry: ReadonlyArray<Float32Array>, wet: ReadonlyArray<Float32Array>,
                            sampleRate: number): ProbeResult => {
        const input = MeasureMath.mono(dry)
        const output = MeasureMath.mono(wet)
        const offset = alignment(input, ProbeSignals.firstSoundFrame(segment, sampleRate), Math.round(ProbeSignals.Lead * sampleRate))
        const shift = (window: StepWindow): StepWindow => ({...window, startFrame: window.startFrame + offset, endFrame: window.endFrame + offset})
        const startFrame = ProbeSignals.startFrame(segment, sampleRate) + offset
        switch (segment.kind) {
            case "sweep":
                return {test: "frequency", result: frequency(input, output, sampleRate, startFrame,
                        startFrame + Math.round((segment.duration + segment.tail) * sampleRate))}
            case "twoTone": {
                const to = startFrame + Math.round((segment.duration - ProbeSignals.Fade) * sampleRate)
                return {test: "imd", result: imd(input, output, sampleRate, segment.levelDb, segment.lowHz, segment.highHz,
                        to - Math.round(ProbeSignals.ImdWindowSeconds * sampleRate), to)}
            }
            case "impulse":
                return {test: "impulse", result: impulse(dry, wet, sampleRate, startFrame)}
            case "steps": {
                if (test === "dynamics") {return {test, result: dynamics(input, output, sampleRate, segment, offset)}}
                if (test === "harmonics") {
                    return {test, result: harmonics(input, output, sampleRate, segment.hz,
                            ProbeSignals.stepWindows(segment, sampleRate, ProbeSignals.HarmonicWindowSeconds).map(shift))}
                }
                return {test: "transfer", result: transfer(input, output,
                        ProbeSignals.stepWindows(segment, sampleRate, ProbeSignals.TransferWindowSeconds).map(shift))}
            }
        }
    }

    const hzKey = (hz: number): string => `${hz}Hz`

    const level = (value: Maybe<number>, digits: int = 1): Nullable<number> =>
        isDefined(value) && value > FloorDb ? round(value, digits) : null

    const percent = (value: number): Nullable<number> => round(value, value < 1 ? 3 : 2)

    const harmonicJson = ({levelDb, gainDb, thdPercent, harmonicsDb, oddDb, evenDb, residualDb}: HarmonicLevel): JsonObject => {
        if (gainDb <= FloorDb) {return {inDb: levelDb, silent: true}}
        return MeasureMath.compact({
            inDb: levelDb, gainDb: level(gainDb), thdPct: percent(thdPercent), residualDb: level(residualDb),
            ...(thdPercent < CleanThdPercent ? {} : {oddDb: level(oddDb), evenDb: level(evenDb), h2toH10Db: harmonicsDb.map(value => level(value, 0))})
        })
    }

    export const toJson = (probe: ProbeResult): JsonObject => {
        switch (probe.test) {
            case "frequency": {
                const {bands, gainAt1kDb, passbandDb, spreadDb, peak: peakBand, dip, minus3dbLowHz, minus3dbHighHz, lowSlopeDbPerOct, highSlopeDbPerOct} = probe.result
                return MeasureMath.compact({
                    inputDb: -18, gainAt1kDb: level(gainAt1kDb), passbandDb: level(passbandDb), spreadDb: round(spreadDb, 1),
                    peakHz: peakBand?.hz, peakDb: level(peakBand?.db), dipHz: dip?.hz, dipDb: level(dip?.db),
                    minus3dbLowHz: round(minus3dbLowHz, 0), minus3dbHighHz: round(minus3dbHighHz, 0),
                    lowSlopeDbPerOct: round(lowSlopeDbPerOct, 1), highSlopeDbPerOct: round(highSlopeDbPerOct, 1),
                    bandsDb: Object.fromEntries(bands.map(({hz, db}) => [hzKey(hz), level(db)]))
                })
            }
            case "harmonics": {
                const {hz, levels, character} = probe.result
                return {hz, character, levels: levels.map(harmonicJson)}
            }
            case "transfer": {
                const {steps, gainDb, compressionStartDb, ratioAtTop, limiting, ceilingDb, gateBelowDb} = probe.result
                const crestChanges = steps.some(({outDb, outPeakDb}) => isDefined(outDb) && isDefined(outPeakDb) && Math.abs(outPeakDb - outDb) >= 1)
                return MeasureMath.compact({
                    gainDb: level(gainDb), compressionStartDb: round(compressionStartDb, 0), ratioAtTop: round(ratioAtTop, 1),
                    limiting: limiting ? true : undefined, ceilingDbfs: level(ceilingDb), gateBelowDb: round(gateBelowDb, 0),
                    inDb: steps.map(({levelDb}) => levelDb), outDb: steps.map(({outDb}) => level(outDb)),
                    outPeakDb: crestChanges ? steps.map(({outPeakDb}) => level(outPeakDb)) : undefined
                })
            }
            case "imd": {
                const {levelDb, imdPercent, products, lowGainDb, highGainDb} = probe.result
                const strongest = products.flatMap(({hz, db}) => db > FloorDb ? [{hz, db: round(db, 1)}] : [])
                return MeasureMath.compact({
                    inDb: levelDb, imdPct: percent(imdPercent), strongest: strongest.length > 0 ? strongest : undefined,
                    gain60HzDb: level(lowGainDb), gain7kHzDb: level(highGainDb)
                })
            }
            case "dynamics": {
                const {gainLowDb, gainHighDb, gainReductionDb, attackMs, releaseMs, releaseIncomplete, latencyMs} = probe.result
                return MeasureMath.compact({
                    gainAtMinus30Db: level(gainLowDb), gainAtMinus6Db: level(gainHighDb), gainReductionDb: round(gainReductionDb, 1),
                    attackMs: round(attackMs, 1), releaseMs: round(releaseMs, 1), releaseIncomplete: releaseIncomplete ? true : undefined,
                    latencyMs: round(latencyMs, 2)
                })
            }
            case "impulse": {
                const {firstArrivalMs, peakMs, wetOnsetMs, rt60Ms, rt60Fit, edtMs, echoesMs, echoSpacingMs, energyGainDb, energyLeftDb} = probe.result
                const left = energyLeftDb.filter(({db}) => db > FloorDb)
                return MeasureMath.compact({
                    firstArrivalMs: round(firstArrivalMs, 2), peakMs: round(peakMs, 2), wetOnsetMs: round(wetOnsetMs, 0),
                    rt60Ms: round(rt60Ms, 0), rt60Fit: isDefined(rt60Fit) && (rt60Ms ?? 0) >= 5 ? rt60Fit : undefined, edtMs: round(edtMs, 0),
                    echoesMs: echoesMs.length > 1 ? echoesMs.map(value => round(value, 1)) : undefined,
                    echoSpacingMs: echoesMs.length > 1 ? round(echoSpacingMs, 1) : undefined, energyGainDb: level(energyGainDb),
                    energyLeftDb: left.length > 0 ? Object.fromEntries(left.map(({ms, db}) => [`${ms}ms`, round(db, 1)])) : undefined
                })
            }
        }
    }
}
