import {clamp, int, isDefined, Nullable} from "@opendaw/lib-std"
import type {JsonValue} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundNote, SoundTarget} from "../SoundTarget"
import {FftCache} from "./dsp/FftCache"
import {HarmonicSpectrum} from "./dsp/HarmonicSpectrum"
import {MeasureMath} from "./dsp/MeasureMath"
import {PitchYin} from "./dsp/PitchYin"

const MaxNotes = 24
const MaxHarmonics = 128
const ListedHarmonics = 8
const FloorDb = -80.0
const BandLowHz = 40.0

const {round} = MeasureMath

export type Overtones = {
    readonly hnrDb: number
    readonly harmonics: int
    readonly oddEvenDb: Nullable<number>
    readonly levelsDb: ReadonlyArray<number>
    readonly inharmonicCents: Nullable<number>
}

export type NoteTimbre = {
    readonly note: int
    readonly centroidHz: number
    readonly rolloffHz: number
    readonly flatness: number
    readonly overtones: Nullable<Overtones>
    readonly envelope: ReadonlyArray<HarmonicSpectrum.EnvelopeBand>
    readonly resonancesHz: ReadonlyArray<number>
}

const overtonesOf = (spectrum: HarmonicSpectrum.Spectrum, partials: ReadonlyArray<HarmonicSpectrum.Partial>,
                     f0: number, highHz: number): Nullable<Overtones> => {
    if (partials.length === 0) {return null}
    const strongest = partials.reduce((max, partial) => Math.max(max, partial.power), 0.0)
    if (strongest <= 0.0) {return null}
    const levelsDb = partials.map(partial => Math.max(FloorDb, MeasureMath.powerDb(partial.power / strongest)))
    const pairs: Array<number> = []
    for (let odd = 3; odd + 1 <= Math.min(levelsDb.length, 16); odd += 2) {
        pairs.push(levelsDb[odd - 1] - 0.5 * (levelsDb[odd - 2] + levelsDb[odd]))
    }
    const harmonicPower = partials.reduce((sum, partial) => sum + partial.power, 0.0)
    const coveredHz = Math.min(highHz, (partials[partials.length - 1].harmonic + 0.5) * f0)
    const noise = Math.max(HarmonicSpectrum.bandPower(spectrum, 0.5 * f0, coveredHz) - harmonicPower, harmonicPower * 1e-8)
    const fitted = partials.filter(partial => partial.harmonic <= 16 && levelsDb[partial.harmonic - 1] >= -40.0)
    const weight = fitted.reduce((sum, partial) => sum + partial.power * partial.harmonic * partial.harmonic, 0.0)
    const fittedF0 = weight > 0.0 ? fitted.reduce((sum, partial) => sum + partial.power * partial.harmonic * partial.hz, 0.0) / weight : f0
    const deviation = fitted.reduce((sum, partial) =>
        sum + partial.power * Math.abs(1200.0 * Math.log2(partial.hz / (partial.harmonic * fittedF0))), 0.0)
    const fittedPower = fitted.reduce((sum, partial) => sum + partial.power, 0.0)
    return {
        hnrDb: Math.min(80.0, 10.0 * Math.log10(harmonicPower / noise)),
        harmonics: levelsDb.filter(level => level >= -40.0).length,
        oddEvenDb: pairs.length > 0 ? MeasureMath.mean(pairs) : null,
        levelsDb: levelsDb.slice(0, ListedHarmonics),
        inharmonicCents: fitted.length >= 3 && fittedPower > 0.0 ? deviation / fittedPower : null
    }
}

export const analyseTimbre = (target: SoundTarget, note: SoundNote): Nullable<NoteTimbre> => {
    const {sampleRate} = target
    const {startFrame, holdFrame} = MeasureMath.noteRegion(target.channels, note)
    const skip = Math.round(Math.min(0.03 * sampleRate, 0.25 * (holdFrame - startFrame)))
    const segment = MeasureMath.mono(target.channels, startFrame + skip, holdFrame)
    if (segment.length < 256 || MeasureMath.rms(segment) < 1e-5) {return null}
    const tracker = new PitchYin.Tracker(segment, sampleRate)
    const probe = tracker.probe()
    const f0 = isDefined(probe) && probe.periodicity >= PitchYin.VoicedPeriodicity ? probe.hz : null
    const wanted = isDefined(f0) ? clamp(FftCache.ceilPow2(10.0 * sampleRate / f0), 4096, 16384) : 8192
    const size = Math.min(wanted, Math.max(2048, FftCache.ceilPow2(segment.length)))
    const spectrum = HarmonicSpectrum.welch(segment, sampleRate, size)
    const highHz = Math.min(20000.0, 0.95 * sampleRate / 2)
    const partials = isDefined(f0) ? HarmonicSpectrum.partials(spectrum, f0, MaxHarmonics, highHz) : null
    const envelope = HarmonicSpectrum.envelope(spectrum, BandLowHz, Math.min(16000.0, highHz), partials, FloorDb)
    return {
        note: note.index,
        centroidHz: HarmonicSpectrum.centroid(spectrum, 20.0, highHz),
        rolloffHz: HarmonicSpectrum.rolloff(spectrum, 20.0, highHz, 0.85),
        flatness: HarmonicSpectrum.flatness(spectrum, BandLowHz, Math.min(16000.0, highHz)),
        overtones: isDefined(f0) && isDefined(partials) ? overtonesOf(spectrum, partials, f0, highHz) : null,
        envelope,
        resonancesHz: HarmonicSpectrum.resonances(envelope, 3, isDefined(partials) ? 3.0 : 4.0)
    }
}

const Columns = ["note", "centroidHz", "rolloffHz", "flatness", "hnrDb", "harmonics", "oddEvenDb", "inharmonicCents", "resonanceHz"]

const noteRow = ({note, centroidHz, rolloffHz, flatness, overtones, resonancesHz}: NoteTimbre): ReadonlyArray<JsonValue> => [
    note, round(centroidHz, 0), round(rolloffHz, 0), round(flatness, 2), round(overtones?.hnrDb, 1), overtones?.harmonics ?? null,
    round(overtones?.oddEvenDb, 1), round(overtones?.inharmonicCents, 0), round(resonancesHz[0], 0)]

export const TimbreDescriptor: SoundDescriptor = {
    key: "timbre",
    summary: "timbre: centroidHz, rolloffHz, flatness (0 tonal..1 noise), hnrDb, oddEvenDb, harmonicsDb, resonancesHz",
    describe: (target: SoundTarget): JsonValue => {
        const analysed = MeasureMath.sample(target.notes, MaxNotes)
            .map(note => analyseTimbre(target, note))
            .filter((timbre): timbre is NoteTimbre => isDefined(timbre))
        if (analysed.length === 0) {return {count: 0}}
        const overtones = analysed.map(timbre => timbre.overtones).filter((entry): entry is Overtones => isDefined(entry))
        const harmonicsDb: Array<Nullable<number>> = []
        for (let harmonic = 0; harmonic < ListedHarmonics; harmonic++) {
            const levels = overtones.map(entry => entry.levelsDb[harmonic])
            if (levels.every(level => !isDefined(level))) {break}
            harmonicsDb.push(MeasureMath.medianOf(levels, 0))
        }
        const meanEnvelope = analysed[0].envelope.map(({hz}, index) => {
            const present = analysed.map(timbre => timbre.envelope[index]).filter(band => isDefined(band.db))
            return present.length === 0 ? {hz, db: null}
                : {hz: MeasureMath.median(present.map(band => band.hz)), db: MeasureMath.median(present.map(band => band.db))}
        })
        const resonancesHz = HarmonicSpectrum.resonances(meanEnvelope, 3).map(hz => round(hz, 0))
        return MeasureMath.compact({
            count: analysed.length,
            pitched: overtones.length < analysed.length ? overtones.length : undefined,
            centroidHz: MeasureMath.spread(analysed.map(timbre => timbre.centroidHz), 0),
            rolloffHz: MeasureMath.medianOf(analysed.map(timbre => timbre.rolloffHz), 0),
            flatness: MeasureMath.medianOf(analysed.map(timbre => timbre.flatness), 2),
            hnrDb: MeasureMath.medianOf(overtones.map(entry => entry.hnrDb), 1),
            harmonics: MeasureMath.medianOf(overtones.map(entry => entry.harmonics), 0),
            oddEvenDb: MeasureMath.medianOf(overtones.map(entry => entry.oddEvenDb), 1),
            harmonicsDb: harmonicsDb.length > 0 ? harmonicsDb : undefined,
            inharmonicCents: MeasureMath.medianOf(overtones.map(entry => entry.inharmonicCents), 0),
            resonancesHz: resonancesHz.length > 0 ? resonancesHz : undefined,
            perNote: target.focused ? MeasureMath.noteTable(Columns, analysed.map(noteRow), target.notes.length) : undefined
        })
    }
}
