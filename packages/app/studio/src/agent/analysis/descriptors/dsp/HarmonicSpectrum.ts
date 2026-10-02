import {int, isDefined, Nullable} from "@opendaw/lib-std"
import {Window} from "@opendaw/lib-dsp"
import {FftCache} from "./FftCache"

/** Welch power spectra of a segment, harmonic partials and a 1/6-octave spectral envelope. */
export namespace HarmonicSpectrum {
    /** Power per bin, scaled so a sine of amplitude A peaks at A^2 (a full-scale sine reads 0 dB). */
    export type Spectrum = { readonly power: Float64Array, readonly binHz: number }
    export type Partial = { readonly harmonic: int, readonly hz: number, readonly power: number }
    export type EnvelopeBand = { readonly hz: number, readonly db: Nullable<number> }

    const FramePoints = 32768
    const LobeBins = 4

    /** Mean power of half-overlapping Blackman-Harris frames spread over the segment (zero-padded when shorter than `size`). */
    export const welch = (segment: Float32Array, sampleRate: number, size: int,
                          maxFrames: int = Math.max(2, FramePoints / size)): Spectrum => {
        const length = Math.min(size, segment.length)
        const power = new Float64Array((size >> 1) + 1)
        if (length < 2) {return {power, binHz: sampleRate / size}}
        const window = length === size
            ? FftCache.window(Window.Type.BlackmanHarris, size)
            : Window.create(Window.Type.BlackmanHarris, length)
        const frames = length < size ? 1 : Math.min(maxFrames, 1 + Math.floor((segment.length - size) / (size >> 1)))
        const fft = FftCache.fft(size)
        const real = new Float32Array(size), imag = new Float32Array(size)
        let gain = 0.0
        for (let index = 0; index < length; index++) {gain += window[index]}
        const scale = 4.0 / (gain * gain * frames)
        for (let frame = 0; frame < frames; frame++) {
            const offset = frames === 1 ? Math.max(0, (segment.length - length) >> 1)
                : Math.round(frame * (segment.length - size) / (frames - 1))
            real.fill(0.0)
            imag.fill(0.0)
            for (let index = 0; index < length; index++) {real[index] = segment[offset + index] * window[index]}
            fft.process(real, imag)
            for (let bin = 0; bin < power.length; bin++) {power[bin] += (real[bin] * real[bin] + imag[bin] * imag[bin]) * scale}
        }
        return {power, binHz: sampleRate / size}
    }

    export const bandPower = ({power, binHz}: Spectrum, lowHz: number, highHz: number): number => {
        let sum = 0.0
        const to = Math.min(power.length - 1, Math.floor(highHz / binHz))
        for (let bin = Math.max(1, Math.ceil(lowHz / binHz)); bin <= to; bin++) {sum += power[bin]}
        return sum
    }

    /** Magnitude-weighted mean frequency of the band. */
    export const centroid = ({power, binHz}: Spectrum, lowHz: number, highHz: number): number => {
        let weighted = 0.0, sum = 0.0
        const to = Math.min(power.length - 1, Math.floor(highHz / binHz))
        for (let bin = Math.max(1, Math.ceil(lowHz / binHz)); bin <= to; bin++) {
            const magnitude = Math.sqrt(power[bin])
            weighted += magnitude * bin * binHz
            sum += magnitude
        }
        return sum > 0.0 ? weighted / sum : NaN
    }

    /** Frequency below which `fraction` of the band's magnitude lies. */
    export const rolloff = ({power, binHz}: Spectrum, lowHz: number, highHz: number, fraction: number): number => {
        const from = Math.max(1, Math.ceil(lowHz / binHz)), to = Math.min(power.length - 1, Math.floor(highHz / binHz))
        let total = 0.0
        for (let bin = from; bin <= to; bin++) {total += Math.sqrt(power[bin])}
        if (total <= 0.0) {return NaN}
        let sum = 0.0
        for (let bin = from; bin <= to; bin++) {
            sum += Math.sqrt(power[bin])
            if (sum >= fraction * total) {return bin * binHz}
        }
        return to * binHz
    }

    /** Geometric over arithmetic mean of the (lightly smoothed) power: 0 tonal, 1 white noise. */
    export const flatness = ({power, binHz}: Spectrum, lowHz: number, highHz: number): number => {
        const from = Math.max(1, Math.ceil(lowHz / binHz)), to = Math.min(power.length - 1, Math.floor(highHz / binHz))
        const radius = 4
        let logSum = 0.0, sum = 0.0, count = 0
        for (let bin = from; bin <= to; bin++) {
            let local = 0.0
            for (let offset = -radius; offset <= radius; offset++) {local += power[Math.max(1, Math.min(power.length - 1, bin + offset))]}
            local = local / (2 * radius + 1) + 1e-24
            logSum += Math.log(local)
            sum += local
            count++
        }
        return count > 0 && sum > 1e-20 * count ? Math.min(1.0, Math.exp(logSum / count) / (sum / count)) : NaN
    }

    /** Partial peaks near h * f0 (within 3%), each summed over its main lobe, up to `maxHarmonics` or `maxHz`. */
    export const partials = ({power, binHz}: Spectrum, f0: number, maxHarmonics: int, maxHz: number): ReadonlyArray<Partial> => {
        const result: Array<Partial> = []
        const spacing = f0 / binHz
        const lobe = Math.max(1, Math.min(LobeBins, Math.floor(spacing / 2) - 1))
        let tracked = spacing, strongest = 0.0
        for (let harmonic = 1; harmonic <= maxHarmonics; harmonic++) {
            const expected = harmonic * tracked
            if (expected * binHz > maxHz || expected + lobe + 1 >= power.length) {break}
            const reach = Math.max(1, Math.min(0.03 * expected, spacing * 0.4))
            const from = Math.max(1, Math.floor(expected - reach)), to = Math.min(power.length - 2, Math.ceil(expected + reach))
            let peak = from
            for (let bin = from; bin <= to; bin++) {if (power[bin] > power[peak]) {peak = bin}}
            let sum = 0.0
            for (let bin = Math.max(1, peak - lobe); bin <= Math.min(power.length - 1, peak + lobe); bin++) {sum += power[bin]}
            const left = Math.log(power[peak - 1] + 1e-30), center = Math.log(power[peak] + 1e-30)
            const right = Math.log(power[peak + 1] + 1e-30)
            const denominator = left - 2.0 * center + right
            const offset = Math.abs(denominator) > 1e-12 ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator)) : 0.0
            result.push({harmonic, hz: (peak + offset) * binHz, power: sum})
            strongest = Math.max(strongest, sum)
            if (sum > strongest * 1e-5) {tracked = (peak + offset) / harmonic}
        }
        return result
    }

    /** 1/6-octave envelope in dB below its maximum: smoothed band power, or the strongest partial per band (null when empty). */
    export const envelope = ({power, binHz}: Spectrum, lowHz: number, highHz: number,
                             partials: Nullable<ReadonlyArray<Partial>>, floorDb: number): ReadonlyArray<EnvelopeBand> => {
        const raw: Array<{ hz: number, power: Nullable<number> }> = []
        const ratio = Math.pow(2.0, 1.0 / 6.0)
        for (let low = lowHz; low * ratio <= highHz; low *= ratio) {
            const high = low * ratio
            if (isDefined(partials)) {
                const inside = partials.filter(partial => partial.hz >= low && partial.hz < high)
                const strongest = inside.reduce<Nullable<Partial>>((best, partial) =>
                    !isDefined(best) || partial.power > best.power ? partial : best, null)
                raw.push(isDefined(strongest) ? {hz: strongest.hz, power: strongest.power} : {hz: low * Math.sqrt(ratio), power: null})
                continue
            }
            const from = Math.max(1, Math.ceil(low / binHz)), to = Math.min(power.length - 1, Math.floor(high / binHz))
            let sum = 0.0, weighted = 0.0
            for (let bin = from; bin <= to; bin++) {
                sum += power[bin]
                weighted += power[bin] * bin * binHz
            }
            raw.push({hz: sum > 0.0 ? weighted / sum : low * Math.sqrt(ratio), power: to - from >= 2 ? sum : null})
        }
        const smoothed = isDefined(partials) ? raw : raw.map((band, index) => isDefined(band.power) ? {
            hz: band.hz,
            power: 0.25 * (raw[Math.max(0, index - 1)].power ?? band.power) + 0.5 * band.power
                + 0.25 * (raw[Math.min(raw.length - 1, index + 1)].power ?? band.power)
        } : band)
        const loudest = smoothed.reduce((max, band) => Math.max(max, band.power ?? 0.0), 1e-30)
        return smoothed.map(({hz, power: bandPower}) => ({
            hz, db: isDefined(bandPower) ? Math.max(floorDb, 10.0 * Math.log10(Math.max(bandPower, 1e-30) / loudest)) : null
        }))
    }

    /** The strongest interior local maxima of an envelope that stand at least `prominenceDb` above both neighbouring valleys. */
    export const resonances = (envelope: ReadonlyArray<EnvelopeBand>, count: int, prominenceDb: number = 3.0): ReadonlyArray<number> => {
        const bands = envelope.filter((band): band is { hz: number, db: number } => isDefined(band.db))
        const peaks: Array<{ hz: number, db: number }> = []
        for (let index = 1; index < bands.length - 1; index++) {
            const {hz, db} = bands[index]
            if (bands[index - 1].db >= db || bands[index + 1].db > db) {continue}
            let leftValley = db, rightValley = db
            for (let left = index - 1; left >= 0 && bands[left].db <= db; left--) {leftValley = Math.min(leftValley, bands[left].db)}
            for (let right = index + 1; right < bands.length && bands[right].db <= db; right++) {
                rightValley = Math.min(rightValley, bands[right].db)
            }
            if (db - Math.max(leftValley, rightValley) >= prominenceDb) {peaks.push({hz, db})}
        }
        return peaks.sort((first, second) => second.db - first.db).slice(0, count).map(({hz}) => hz)
    }
}
