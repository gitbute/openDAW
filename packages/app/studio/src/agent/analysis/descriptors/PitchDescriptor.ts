import {int, isDefined, Nullable, Optional} from "@opendaw/lib-std"
import {hzToMidi, midiToHz} from "@opendaw/lib-dsp"
import {NoteNames} from "@/agent/NoteNames"
import type {JsonValue} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundNote, SoundTarget} from "../SoundTarget"
import {MeasureMath} from "./dsp/MeasureMath"
import {ModulationRate} from "./dsp/ModulationRate"
import {PitchYin} from "./dsp/PitchYin"

const MaxNotes = 32
const MaxFrames = 48
const HopSeconds = 0.015
const GlideSeconds = 0.03
const VibratoHopSeconds = 0.01
const VibratoWindowSeconds = 1.5
const MinVibratoSeconds = 0.5
const VibratoMinHz = 3.0
const VibratoMaxHz = 10.0
const MinVibratoCents = 3.0

export const harmonicLock = (midi: number, requested: Optional<int>): int => {
    if (!isDefined(requested)) {return 1}
    const ratio = Math.pow(2.0, (midi - requested) / 12.0)
    const harmonic = Math.round(ratio)
    const isOctave = (harmonic & (harmonic - 1)) === 0
    return harmonic >= 3 && !isOctave && Math.abs(ratio - harmonic) < 0.03 * harmonic ? harmonic : 1
}

const isOctaveError = (cents: number): boolean => {
    const octaves = Math.round(cents / 1200.0)
    return octaves !== 0 && Math.abs(cents - octaves * 1200.0) < 80.0
}

const {round} = MeasureMath

export type Vibrato = { readonly hz: number, readonly cents: number }

export type NotePitch = {
    readonly note: int
    readonly periodicity: number
    readonly pitched: boolean
    readonly hz: number
    readonly centsOff: number
    readonly vsRequestedCents: Nullable<number>
    readonly stabilityCents: number
    readonly glideCents: number
    readonly vibrato: Nullable<Vibrato>
    /** > 1: the periodicity locked onto this harmonic of the played pitch (weak fundamental); hz is corrected. */
    readonly harmonic: int
}

type Frame = { readonly startFrame: int, readonly cents: number, readonly periodicity: number, readonly rms: number }

const noteName = (hz: number): string => `${NoteNames.ofHz(hz)}/${Math.max(0, Math.min(127, Math.round(hzToMidi(hz))))}`

const roundHz = (hz: number): Nullable<number> => round(hz, hz < 100.0 ? 1 : 0)

const centsOf = (hz: number): number => 1200.0 * Math.log2(hz / 440.0)

/** Rate and depth (± cents) of a periodic pitch wobble between 3 and 10 Hz in a uniformly hopped cents track. */
export const detectVibrato = (cents: ArrayLike<number>, hopSeconds: number): Nullable<Vibrato> => {
    if (cents.length < 12) {return null}
    const frameRate = 1.0 / hopSeconds
    const {residual} = ModulationRate.trend(cents, frameRate)
    const minHz = Math.max(VibratoMinHz, 2.0 * frameRate / cents.length)
    return ModulationRate.periodicity(residual, frameRate, minHz, VibratoMaxHz)
        .map(({rateHz}): Vibrato => ({hz: rateHz, cents: 0.5 * ModulationRate.depth(residual, frameRate, rateHz)}))
        .map(vibrato => vibrato.cents >= MinVibratoCents ? vibrato : null)
        .unwrapOrNull()
}

/** Cents on a fixed hop over the middle of [from, to); unvoiced frames and octave jumps are interpolated. */
const vibratoTrack = (tracker: PitchYin.Tracker, sampleRate: number, maxPeriod: number, from: int, to: int,
                      centerCents: number): Nullable<Float64Array> => {
    const span = Math.min(to - from, Math.round(VibratoWindowSeconds * sampleRate))
    const first = from + ((to - from - span) >> 1)
    const hop = VibratoHopSeconds * sampleRate
    if (span < MinVibratoSeconds * sampleRate) {return null}
    const count = Math.floor(span / hop) + 1
    const cents = new Float64Array(count).fill(NaN)
    let valid = 0
    for (let index = 0; index < count; index++) {
        const estimate = tracker.estimate(Math.round(first + index * hop), maxPeriod)
        if (!isDefined(estimate) || estimate.periodicity < PitchYin.VoicedPeriodicity) {continue}
        const value = centsOf(estimate.hz)
        if (Math.abs(value - centerCents) >= 600.0) {continue}
        cents[index] = value
        valid++
    }
    if (valid < 0.75 * count) {return null}
    let last = -1
    for (let index = 0; index <= count; index++) {
        if (index < count && Number.isNaN(cents[index])) {continue}
        const left = last >= 0 ? cents[last] : cents[index], right = index < count ? cents[index] : cents[last]
        for (let gap = last + 1; gap < index; gap++) {cents[gap] = left + (right - left) * (gap - last) / (index - last)}
        last = index
    }
    return cents
}

export const analysePitch = (target: SoundTarget, note: SoundNote): Nullable<NotePitch> => {
    const {sampleRate} = target
    const {startFrame, holdFrame} = MeasureMath.noteRegion(target.channels, note)
    const mono = MeasureMath.mono(target.channels, startFrame, holdFrame)
    if (mono.length < sampleRate * 0.01 || MeasureMath.rms(mono) < 1e-5) {return null}
    const tracker = new PitchYin.Tracker(mono, sampleRate)
    const probe = tracker.probe()
    const unpitched = (periodicity: number): NotePitch => ({
        note: note.index, periodicity, pitched: false, hz: NaN, centsOff: NaN,
        vsRequestedCents: null, stabilityCents: NaN, glideCents: NaN, vibrato: null, harmonic: 1
    })
    if (!isDefined(probe) || probe.periodicity < PitchYin.VoicedPeriodicity) {return unpitched(probe?.periodicity ?? 0.0)}
    const maxPeriod = Math.min(1.0 / PitchYin.MinHz, 2.2 / probe.hz)
    const window = Math.min(mono.length, tracker.windowFrames(maxPeriod))
    const first = window >> 1, last = Math.max(first, mono.length - (window >> 1))
    const hop = Math.max(HopSeconds * sampleRate, (last - first) / (MaxFrames - 1))
    const frames: Array<Frame> = []
    for (let center = first; center <= last; center += hop) {
        const frame = Math.round(center)
        const estimate = tracker.estimate(frame, maxPeriod)
        if (!isDefined(estimate)) {continue}
        frames.push({
            startFrame: frame - (window >> 1), cents: centsOf(estimate.hz),
            periodicity: estimate.periodicity, rms: MeasureMath.rms(mono, frame - (window >> 1), frame + (window >> 1))
        })
    }
    const loudest = frames.reduce((max, frame) => Math.max(max, frame.rms), 0.0)
    const voiced = frames.filter(frame => frame.periodicity >= PitchYin.VoicedPeriodicity && frame.rms > loudest * 0.03)
    const glideFrames = Math.ceil(GlideSeconds * sampleRate)
    const settled = voiced.filter(frame => frame.startFrame >= glideFrames)
    const stable = settled.length >= 3 ? settled : voiced
    if (stable.length === 0) {return unpitched(probe.periodicity)}
    const centerCents = MeasureMath.median(stable.map(frame => frame.cents))
    const near = stable.filter(frame => Math.abs(frame.cents - centerCents) < 600.0).map(frame => frame.cents)
    const nearMean = MeasureMath.mean(near)
    const stabilityCents = Math.sqrt(near.reduce((sum, value) => sum + (value - nearMean) ** 2, 0.0) / near.length)
    const track = vibratoTrack(tracker, sampleRate, maxPeriod, Math.min(last, glideFrames + first), last, centerCents)
    const vibrato = isDefined(track) ? detectVibrato(track, VibratoHopSeconds) : null
    const measured = 69.0 + (isDefined(track) && isDefined(vibrato) ? MeasureMath.mean(track) : centerCents) / 100.0
    const harmonic = harmonicLock(measured, note.pitch)
    const midi = measured - 12.0 * Math.log2(harmonic)
    return {
        note: note.index,
        periodicity: MeasureMath.median(stable.map(frame => frame.periodicity)),
        pitched: true,
        hz: midiToHz(midi),
        centsOff: 100.0 * (midi - Math.round(midi)),
        vsRequestedCents: isDefined(note.pitch) ? 100.0 * (midi - note.pitch) : null,
        stabilityCents,
        glideCents: (voiced.find(frame => !isOctaveError(frame.cents - centerCents)) ?? voiced[0]).cents - centerCents,
        vibrato,
        harmonic
    }
}

const Columns = ["note", "name", "centsOff", "vsRequestedCents", "stabilityCents", "glideCents", "vibratoHz", "vibratoCents",
    "periodicity"]

const noteRow = (pitch: NotePitch): ReadonlyArray<JsonValue> => pitch.pitched
    ? [pitch.note, noteName(pitch.hz), round(pitch.centsOff, 0), round(pitch.vsRequestedCents, 0), round(pitch.stabilityCents, 0),
        round(pitch.glideCents, 0), round(pitch.vibrato?.hz, 1), round(pitch.vibrato?.cents, 0), null]
    : [pitch.note, null, null, null, null, null, null, null, round(pitch.periodicity, 2)]

export const PitchDescriptor: SoundDescriptor = {
    key: "pitch",
    summary: "pitch: hz, range as name/MIDI (C4 = MIDI 60), centsOff, vsRequestedCents, stability, glide, vibrato",
    describe: (target: SoundTarget): JsonValue => {
        const analysed = MeasureMath.sample(target.notes, MaxNotes)
            .map(note => analysePitch(target, note))
            .filter((pitch): pitch is NotePitch => isDefined(pitch))
        if (analysed.length === 0) {return {count: 0}}
        const pitched = analysed.filter(pitch => pitch.pitched)
        const unpitched = analysed.length - pitched.length
        const periodicity = MeasureMath.medianOf(analysed.map(pitch => pitch.periodicity), 2)
        const perNote = target.focused ? MeasureMath.noteTable(Columns, analysed.map(noteRow), target.notes.length) : undefined
        if (pitched.length === 0) {return MeasureMath.compact({count: analysed.length, unpitched, periodicity, perNote})}
        const hz = pitched.map(pitch => pitch.hz)
        const vibratos = pitched.map(pitch => pitch.vibrato).filter((vibrato): vibrato is Vibrato => isDefined(vibrato))
        const locked = pitched.filter(pitch => pitch.harmonic > 1)
        const lowest = noteName(Math.min(...hz)), highest = noteName(Math.max(...hz))
        return MeasureMath.compact({
            count: analysed.length,
            unpitched: unpitched > 0 ? unpitched : undefined,
            periodicity,
            hz: roundHz(MeasureMath.median(hz)),
            range: lowest === highest ? lowest : `${lowest}..${highest}`,
            centsOff: MeasureMath.spread(pitched.map(pitch => pitch.centsOff), 0),
            vsRequestedCents: MeasureMath.spread(pitched.map(pitch => pitch.vsRequestedCents), 0),
            stabilityCents: MeasureMath.medianOf(pitched.map(pitch => pitch.stabilityCents), 0),
            glideCents: MeasureMath.spread(pitched.map(pitch => pitch.glideCents), 0),
            vibratoNotes: vibratos.length > 0 ? vibratos.length : undefined,
            vibratoHz: MeasureMath.medianOf(vibratos.map(vibrato => vibrato.hz), 1),
            vibratoCents: MeasureMath.medianOf(vibratos.map(vibrato => vibrato.cents), 0),
            weakFundamentalNotes: locked.length > 0 ? locked.length : undefined,
            lockedHarmonic: locked.length > 0 ? MeasureMath.medianOf(locked.map(pitch => pitch.harmonic), 0) : undefined,
            perNote
        })
    }
}
