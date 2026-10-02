import {clamp, int, isDefined, Nullable} from "@opendaw/lib-std"
import {midiToHz} from "@opendaw/lib-dsp"
import type {JsonValue} from "@opendaw/studio-codex"
import type {SoundDescriptor, SoundNote, SoundTarget} from "../SoundTarget"
import {EnvelopeFollower} from "./dsp/EnvelopeFollower"
import {MeasureMath} from "./dsp/MeasureMath"

const MaxNotes = 48
const DefaultPeriodSeconds = 0.02
const GateDb = 12.0
const ReleaseDb = 40.0

const {round} = MeasureMath

export type NoteEnvelope = {
    readonly note: int
    readonly attackMs: number
    readonly peakDbfs: number
    readonly decayMs: Nullable<number>
    readonly sustainDb: Nullable<number>
    readonly releaseMs: Nullable<number>
    readonly releaseCut: boolean
    readonly tailDbPerS: Nullable<number>
    readonly transientDb: Nullable<number>
    readonly amDepthDb: Nullable<number>
    readonly gates: int
}

const levelDb = (values: Float32Array, peak: number): Float32Array =>
    values.map(value => MeasureMath.amplitudeDb(value / peak))

const countGates = (db: Float32Array, from: int, to: int): int => {
    let gates = 0, high = MeasureMath.FloorDb, low = high, falling = true
    for (let hop = from; hop < to; hop++) {
        const value = Math.max(db[hop], -50.0)
        if (falling) {
            if (value > high) {high = value}
            if (value < high - GateDb) {
                falling = false
                low = value
            }
        } else {
            if (value < low) {low = value}
            if (value > low + GateDb) {
                gates++
                falling = true
                high = value
            }
        }
    }
    return gates
}

const modulationDepth = (db: Float32Array, from: int, to: int): Nullable<number> => {
    if (to - from < 30) {return null}
    const floored = Float32Array.from(db.subarray(from, to), value => Math.max(value, -60.0))
    const {slope, intercept} = MeasureMath.linearFit(floored)
    const residual = MeasureMath.sorted(floored.map((value, index) => value - (intercept + slope * index)))
    return MeasureMath.percentile(residual, 0.95) - MeasureMath.percentile(residual, 0.05)
}

export const analyseEnvelope = (target: SoundTarget, note: SoundNote): Nullable<NoteEnvelope> => {
    const {sampleRate} = target
    const {startFrame, endFrame, holdFrame} = MeasureMath.noteRegion(target.channels, note)
    const mono = MeasureMath.mono(target.channels, startFrame, endFrame)
    if (mono.length < 8) {return null}
    const period = isDefined(note.pitch) ? clamp(1.05 / midiToHz(note.pitch), 0.002, 0.034) : DefaultPeriodSeconds
    const {values, hopFrames, hopSeconds} = EnvelopeFollower.peak(mono, sampleRate, period)
    const hopMs = hopSeconds * 1000.0
    const holdHops = clamp(Math.ceil((holdFrame - startFrame) / hopFrames), 1, values.length)
    let peakHop = 0
    for (let hop = 0; hop < holdHops; hop++) {if (values[hop] > values[peakHop]) {peakHop = hop}}
    const peak = values[peakHop]
    if (peak < 1e-5) {return null}
    const db = levelDb(values, peak)
    let onset = 0
    while (onset < peakHop && values[onset] < 0.1 * peak) {onset++}
    let rise = onset
    while (rise < peakHop && values[rise] < 0.9 * peak) {rise++}
    let samplePeak = 0.0
    for (let index = 0; index < mono.length; index++) {samplePeak = Math.max(samplePeak, Math.abs(mono[index]))}
    const sustainFrom = peakHop + Math.floor(0.6 * (holdHops - peakHop))
    const sustainTo = Math.max(sustainFrom + 1, holdHops - 2)
    const plateauDb = holdHops - peakHop >= 20 ? MeasureMath.median(db.subarray(sustainFrom, sustainTo)) : NaN
    const driftDb = Math.abs(MeasureMath.linearFit(db, sustainFrom, sustainTo).slope * (sustainTo - sustainFrom))
    const sustainDb = plateauDb > -50.0 && driftDb <= 3.0 ? plateauDb : null
    let decayEnd = peakHop
    if (isDefined(sustainDb)) {
        const threshold = sustainDb + Math.max(1.0, -0.1 * sustainDb)
        while (decayEnd < holdHops && db[decayEnd] > threshold) {decayEnd++}
    }
    let releaseMs: Nullable<number> = null, releaseCut = false, tailDbPerS: Nullable<number> = null
    if (!isDefined(note.offFrame) || !isDefined(sustainDb)) {
        let tailEnd = peakHop
        while (tailEnd < holdHops && db[tailEnd] > -ReleaseDb) {tailEnd++}
        if (tailEnd - peakHop >= 10) {tailDbPerS = MeasureMath.linearFit(db, peakHop, tailEnd).slope / hopSeconds}
    }
    if (isDefined(note.offFrame)) {
        const offHop = Math.min(values.length - 1, holdHops)
        const level = values[Math.max(0, offHop - 1)]
        if (level > peak * 1e-3) {
            const floorDb = MeasureMath.amplitudeDb(level / peak) - ReleaseDb
            let hop = offHop
            while (hop < values.length && db[hop] > floorDb) {hop++}
            if (hop < values.length) {
                releaseMs = (hop - offHop) * hopMs
            } else if (values.length - offHop >= 20) {
                releaseCut = true
                const {slope} = MeasureMath.linearFit(db, offHop, values.length)
                releaseMs = slope < -1e-3 ? Math.min(20000.0, ReleaseDb / -slope * hopMs) : null
            }
        }
    }
    const onsetFrame = onset * hopFrames
    const transientEnd = onsetFrame + Math.round(0.02 * sampleRate)
    const transientRms = MeasureMath.rms(mono, onsetFrame, transientEnd)
    const sustainRms = isDefined(sustainDb) ? MeasureMath.rms(mono, sustainFrom * hopFrames, holdHops * hopFrames)
        : MeasureMath.rms(mono, transientEnd, transientEnd + Math.round(0.1 * sampleRate))
    const gateEnd = isDefined(note.offFrame) ? holdHops : values.length
    return {
        note: note.index,
        attackMs: (rise - onset) * hopMs,
        peakDbfs: MeasureMath.amplitudeDb(samplePeak),
        decayMs: isDefined(sustainDb) ? (decayEnd - peakHop) * hopMs : null,
        sustainDb,
        releaseMs,
        releaseCut,
        tailDbPerS,
        transientDb: sustainRms > 1e-6 && transientRms > 1e-6 ? 20.0 * Math.log10(transientRms / sustainRms) : null,
        amDepthDb: modulationDepth(db, decayEnd, holdHops),
        gates: countGates(db, peakHop, gateEnd)
    }
}

const Columns = ["note", "attackMs", "peakDbfs", "decayMs", "sustainDb", "releaseMs", "releaseCut", "tailDbPerS", "transientDb",
    "amDepthDb", "gates"]

const noteRow = (envelope: NoteEnvelope): ReadonlyArray<JsonValue> => [
    envelope.note, round(envelope.attackMs, 0), round(envelope.peakDbfs, 1), round(envelope.decayMs, 0),
    round(envelope.sustainDb, 1), round(envelope.releaseMs, 0), envelope.releaseCut ? true : null, round(envelope.tailDbPerS, 0),
    round(envelope.transientDb, 1), round(envelope.amDepthDb, 1), envelope.gates > 0 ? envelope.gates : null]

export const EnvelopeDescriptor: SoundDescriptor = {
    key: "envelope",
    summary: "envelope: attackMs (10-90%), decayMs/sustainDb (vs peak), releaseMs (to -40 dB), transientDb, amDepthDb, gates",
    describe: (target: SoundTarget): JsonValue => {
        const analysed = MeasureMath.sample(target.notes, MaxNotes)
            .map(note => analyseEnvelope(target, note))
            .filter((envelope): envelope is NoteEnvelope => isDefined(envelope))
        if (analysed.length === 0) {return {count: 0}}
        const pick = <K extends keyof NoteEnvelope>(key: K): Array<NoteEnvelope[K]> => analysed.map(envelope => envelope[key])
        const releaseCut = analysed.filter(envelope => envelope.releaseCut).length
        const gated = analysed.filter(envelope => envelope.gates >= 2).length
        return MeasureMath.compact({
            count: analysed.length,
            attackMs: MeasureMath.spread(pick("attackMs"), 0),
            peakDbfs: MeasureMath.medianOf(pick("peakDbfs"), 1),
            decayMs: MeasureMath.medianOf(pick("decayMs"), 0),
            sustainDb: MeasureMath.medianOf(pick("sustainDb"), 1),
            releaseMs: MeasureMath.spread(pick("releaseMs"), 0),
            releaseCutNotes: releaseCut > 0 ? releaseCut : undefined,
            tailDbPerS: MeasureMath.medianOf(pick("tailDbPerS"), 0),
            transientDb: MeasureMath.medianOf(pick("transientDb"), 1),
            amDepthDb: MeasureMath.medianOf(pick("amDepthDb"), 1),
            gatedNotes: gated > 0 ? gated : undefined,
            perNote: target.focused ? MeasureMath.noteTable(Columns, analysed.map(noteRow), target.notes.length) : undefined
        })
    }
}
