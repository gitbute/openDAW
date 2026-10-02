import {describe, expect, it} from "vitest"
import {Option} from "@opendaw/lib-std"
import {midiToHz} from "@opendaw/lib-dsp"
import {ModulationRate} from "@/agent/analysis/descriptors/dsp/ModulationRate"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import {AgentRender} from "./AgentRender"
import type {ViewRequest} from "./ListenViews"
import {ViewContext, ViewKit} from "./ViewKit"
import {ViewMath} from "./ViewMath"
import {Scope, ScopeView} from "./ScopeView"
import {Spectrum, SpectrumView} from "./SpectrumView"
import {Movement, MovementView} from "./MovementView"
import {Stereo, StereoView} from "./StereoView"

const SampleRate = 48_000

// records what the view code draws (no canvas in node), see Views.test.ts
const createRecorder = () => {
    const texts: Array<string> = []
    const images: Array<{ x: number, y: number, width: number, height: number }> = []
    const methods: Record<string, unknown> = {
        fillText: (text: string) => {texts.push(text)},
        measureText: (text: string) => ({width: text.length * 6}),
        createImageData: (width: number, height: number) => ({width, height, data: new Uint8ClampedArray(width * height * 4)}),
        putImageData: (image: { width: number, height: number }, x: number, y: number) => {
            images.push({x, y, width: image.width, height: image.height})
        }
    }
    const context = new Proxy(methods, {
        get: (target, key: string) => Reflect.has(target, key) ? target[key] : () => {},
        set: (target, key: string, value) => {
            target[key] = value
            return true
        }
    }) as unknown as ViewContext
    return {context, texts, images}
}

const sine = (frequency: number, amplitude: number, frames: number): Float32Array =>
    Float32Array.from({length: frames}, (_value, index) => amplitude * Math.sin(2 * Math.PI * frequency * index / SampleRate))

const saw = (frequency: number, amplitude: number, frames: number): Float32Array => {
    const channel = new Float32Array(frames)
    let phase = 0.0
    for (let index = 0; index < frames; index++) {
        phase = (phase + frequency / SampleRate) % 1.0
        channel[index] = amplitude * (2 * phase - 1)
    }
    return channel
}

const noise = (frames: number, seed: number): Float32Array => {
    let state = seed
    return Float32Array.from({length: frames}, () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        return state / 0x7fffffff - 0.5
    })
}

const note = (index: number, startFrame: number, endFrame: number, pitch?: number, offFrame?: number): SoundNote =>
    ({index, startFrame, endFrame, offFrame, pitch})

const createRender = (mix: ReadonlyArray<Float32Array>, bars: number = 1): AgentRender => ({
    sampleRate: SampleRate, mix, stems: [], bars: {from: 1, to: bars},
    startSeconds: 0, durationSeconds: mix[0].length / SampleRate, tailSeconds: 0,
    barStartFrames: Array.from({length: bars}, (_value, index) => index * 2 * SampleRate).filter(frame => frame < mix[0].length),
    stepSeconds: 0.125, bpm: 120, signature: [4, 4], warnings: []
})

const request = (mix: ReadonlyArray<Float32Array>, notes: ReadonlyArray<SoundNote>, compact: boolean): ViewRequest =>
    ({render: createRender(mix), notes, compact, title: compact ? "Variation A" : undefined})

describe("ViewMath pitch", () => {
    const whole = (channel: Float32Array) => ({startFrame: 0, endFrame: channel.length})
    it("finds the fundamental of a saw and a low bass without a played pitch", () => {
        const saw82 = saw(82.41, 0.5, 16384)
        expect(ViewMath.fundamental([saw82], whole(saw82), SampleRate, undefined).unwrap().frequency).toBeCloseTo(82.41, 0)
        const saw41 = saw(41.2, 0.5, 16384)
        expect(ViewMath.fundamental([saw41, saw41], whole(saw41), SampleRate, undefined).unwrap().frequency).toBeCloseTo(41.2, 0)
    })
    it("finds no pitch in silence or noise", () => {
        const silence = new Float32Array(8192)
        expect(ViewMath.fundamental([silence], whole(silence), SampleRate, undefined).isEmpty()).toBe(true)
        const hiss = noise(16384, 7)
        expect(ViewMath.fundamental([hiss], whole(hiss), SampleRate, undefined).isEmpty()).toBe(true)
    })
    it("prefers the played pitch over a subharmonic of a chord, but follows an octave-shifted instrument", () => {
        const chord = Float32Array.from({length: 16384}, (_value, index) =>
            [220, 261.63, 329.63].reduce((sum, frequency) => sum + 0.2 * Math.sin(2 * Math.PI * frequency * index / SampleRate), 0))
        const chordFundamental = ViewMath.fundamental([chord], whole(chord), SampleRate, 57).unwrap()
        expect(chordFundamental.source).toBe("note pitch")
        expect(chordFundamental.frequency).toBeCloseTo(220, 3)
        const lowE = saw(midiToHz(40), 0.5, 16384)
        const octaveDown = ViewMath.fundamental([lowE], whole(lowE), SampleRate, 52).unwrap()
        expect(octaveDown.source).toBe("autocorrelation")
        expect(octaveDown.frequency).toBeCloseTo(midiToHz(40), 0)
    })
    it("only reads the analysed range of a long render", () => {
        const long = new Float32Array(10 * SampleRate)
        long.set(saw(110, 0.5, SampleRate), 4 * SampleRate)
        const fundamental = ViewMath.fundamental([long], {startFrame: 4 * SampleRate, endFrame: 5 * SampleRate}, SampleRate, undefined)
        expect(fundamental.unwrap().frequency).toBeCloseTo(110, 0)
    })
})

describe("ViewMath notes", () => {
    const quietFirst = (() => {
        const channel = new Float32Array(3 * SampleRate)
        channel.set(sine(220, 0.001, SampleRate), 0)
        channel.set(sine(220, 0.5, SampleRate), SampleRate)
        channel.set(sine(220, 0.2, SampleRate), 2 * SampleRate)
        return [channel]
    })()
    const notes = [note(1, 0, SampleRate), note(2, SampleRate, 2 * SampleRate), note(3, 2 * SampleRate, 3 * SampleRate)]
    it("picks the loudest note and the first audible one", () => {
        expect(ViewMath.loudestNote(quietFirst, notes).unwrap().index).toBe(2)
        expect(ViewMath.firstAudibleNote(quietFirst, notes).unwrap().index).toBe(2)
        expect(ViewMath.firstAudibleNote(quietFirst, notes.slice(2)).unwrap().index).toBe(3)
        expect(ViewMath.loudestNote(quietFirst, []).isEmpty()).toBe(true)
    })
    it("takes the sustain after the attack and before the note-off", () => {
        expect(ViewMath.sustainSpan(note(1, 1000, 49_000, 60, 25_000), SampleRate)).toEqual({startFrame: 1000 + 2400, endFrame: 25_000})
        expect(ViewMath.sustainSpan(note(1, 0, 960), SampleRate)).toEqual({startFrame: 240, endFrame: 960})
    })
    it("cuts four periods for the close-up, starting on an upward zero crossing", () => {
        const signal = sine(100, 0.5, SampleRate)
        const span = ViewMath.closeUpSpan([signal], {startFrame: 0, endFrame: SampleRate}, SampleRate, Option.wrap(480))
        expect(span.endFrame - span.startFrame).toBe(1920)
        expect(signal[span.startFrame - 1]).toBeLessThan(0)
        expect(signal[span.startFrame]).toBeGreaterThanOrEqual(0)
        const unknown = ViewMath.closeUpSpan([signal], {startFrame: 0, endFrame: SampleRate}, SampleRate, Option.None)
        expect(unknown.endFrame - unknown.startFrame).toBe(960)
        const tiny = ViewMath.closeUpSpan([signal], {startFrame: 10, endFrame: 110}, SampleRate, Option.wrap(480))
        expect(tiny).toEqual({startFrame: 10, endFrame: 110})
    })
})

describe("ViewMath envelope and axes", () => {
    it("measures peak and RMS per column", () => {
        const {peak, rms} = ViewMath.envelope([sine(100, 0.5, SampleRate), sine(100, 0.5, SampleRate)], 100, 960)
        expect(peak).toHaveLength(100)
        peak.forEach(value => expect(value).toBeCloseTo(0.5, 2))
        rms.slice(1, 99).forEach(value => expect(value).toBeCloseTo(0.5 * Math.SQRT1_2, 2))
    })
    it("survives more columns than samples and silence", () => {
        const {peak, rms} = ViewMath.envelope([sine(1000, 1, 100)], 900, 20)
        expect(peak).toHaveLength(900)
        expect(Array.from(peak).every(Number.isFinite) && Array.from(rms).every(Number.isFinite)).toBe(true)
        expect(ViewMath.envelope([new Float32Array(1000)], 10, 100).peak.every(value => value === 0)).toBe(true)
        expect(ViewMath.envelope([], 10, 100).peak).toHaveLength(10)
    })
    it("adapts the envelope window to the pitch and the render length", () => {
        expect(ViewMath.envelopeFrames(SampleRate, Option.wrap(41.2), SampleRate)).toBe(Math.round(SampleRate * 2 / 41.2))
        expect(ViewMath.envelopeFrames(SampleRate, Option.wrap(1000), SampleRate)).toBe(480)
        expect(ViewMath.envelopeFrames(SampleRate, Option.None, SampleRate)).toBe(1200)
        expect(ViewMath.envelopeFrames(SampleRate, Option.None, 960)).toBe(120)
    })
    it("chooses readable time ticks", () => {
        expect(ViewKit.timeTicks(2.5, 950, 72)).toEqual([0, 0.2, 0.4, 0.6000000000000001, 0.8, 1, 1.2000000000000002,
            1.4000000000000001, 1.6, 1.8, 2, 2.2, 2.4000000000000004])
        expect(ViewKit.timeTicks(60, 950, 72)).toHaveLength(13)
        expect(ViewKit.timeTicks(0, 950, 72)).toEqual([])
        expect(ViewKit.formatSeconds(0.004, 0.002)).toBe("4ms")
        expect(ViewKit.formatSeconds(1.5, 0.5)).toBe("1.5s")
        expect(ViewKit.formatSeconds(10, 5)).toBe("10s")
    })
    it("keeps full scale in view for loud close-ups", () => {
        expect(Scope.amplitudeRange(1.0)).toBeCloseTo(1.1, 6)
        expect(Scope.amplitudeRange(1.5)).toBeCloseTo(1.575, 6)
        expect(Scope.amplitudeRange(0.4)).toBe(0.5)
        expect(Scope.amplitudeRange(0)).toBe(0.02)
    })
})

describe("Spectrum", () => {
    const spectrumOf = (channel: Float32Array) => Spectrum.analyse([channel], [], SampleRate).spectrum
    it("reads a full-scale sine as 0 dB at its frequency", () => {
        const spectrum = spectrumOf(sine(1000, 1, SampleRate))
        expect(spectrum.binHz).toBeCloseTo(SampleRate / 16384, 6)
        expect(ViewMath.peakDbNear(spectrum, 1000, 10)).toBeCloseTo(0, 0)
        expect(ViewMath.peakDbNear(spectrum, 3000, 10)).toBeLessThan(-90)
    })
    it("measures the 1/n harmonic series of a saw", () => {
        const spectrum = spectrumOf(saw(110, 0.5, SampleRate))
        const levels = Spectrum.harmonicLevels(spectrum, 110, 20_000)
        expect(levels).toHaveLength(16)
        expect(levels[1].db - levels[0].db).toBeCloseTo(-6.02, 0)
        expect(levels[2].db - levels[0].db).toBeCloseTo(-9.54, 0)
        expect(levels[7].db - levels[0].db).toBeCloseTo(-18.06, 0)
    })
    it("shows odd harmonics only for a hard-clipped sine", () => {
        const clipped = sine(110, 3, SampleRate).map(value => Math.max(-1, Math.min(1, value)))
        const levels = Spectrum.harmonicLevels(spectrumOf(clipped), 110, 20_000)
        expect(levels[2].db - levels[0].db).toBeGreaterThan(-15)
        expect(levels[1].db - levels[0].db).toBeLessThan(-60)
        expect(levels[3].db - levels[0].db).toBeLessThan(-60)
    })
    it("picks the loudest note and keeps short notes analysable", () => {
        const channel = new Float32Array(2 * SampleRate)
        channel.set(saw(55, 0.1, SampleRate), 0)
        channel.set(saw(82.41, 0.5, SampleRate), SampleRate)
        const target = Spectrum.analyse([channel], [note(1, 0, SampleRate, 33), note(2, SampleRate, 2 * SampleRate, 40)], SampleRate)
        expect(target.note.index).toBe(2)
        expect(target.fundamental.unwrap().frequency).toBeCloseTo(82.41, 0)
        const short = Spectrum.analyse([saw(220, 0.5, 960)], [], SampleRate)
        expect(short.note.index).toBe(0)
        expect(short.spectrum.db.every(Number.isFinite)).toBe(true)
    })
    it("draws the peak of each pixel column", () => {
        const spectrum = spectrumOf(sine(1000, 1, SampleRate))
        const {max, min} = Spectrum.pixelLine(spectrum, 900, 20_000)
        const column = Math.floor(900 * Math.log(1000 / 20) / Math.log(1000))
        expect(Math.max(max[column - 1], max[column], max[column + 1])).toBeGreaterThan(-3)
        expect(max[100]).toBeLessThan(-90)
        expect(Array.from(min).every((value, index) => value <= max[index] + 1e-6)).toBe(true)
    })
})

describe("Movement", () => {
    it("follows the centroid of a sine", () => {
        const analysis = Movement.analyse([sine(1000, 0.5, SampleRate)], SampleRate, 100, 50)
        Array.from(analysis.centroid.slice(5, 95)).forEach(value => expect(value).toBeGreaterThan(900))
        Array.from(analysis.centroid.slice(5, 95)).forEach(value => expect(value).toBeLessThan(1100))
        Array.from(analysis.rmsDb.slice(5, 95)).forEach(value => expect(value).toBeCloseTo(-9.03, 0))
    })
    it("leaves the centroid empty where it is silent", () => {
        const channel = new Float32Array(SampleRate)
        channel.set(sine(500, 0.5, SampleRate / 2))
        const analysis = Movement.analyse([channel], SampleRate, 100, 50)
        expect(Number.isNaN(analysis.centroid[90])).toBe(true)
        expect(analysis.centroid[20]).toBeCloseTo(500, -2)
    })
    it("detects a 4 Hz filter wobble as 1/8 at 120 BPM and no rate on a steady tone", () => {
        const frames = 2 * SampleRate
        const channel = new Float32Array(frames)
        let low = 0.0, band = 0.0
        const source = saw(55, 1, frames)
        for (let index = 0; index < frames; index++) {
            const cutoff = 150 * Math.pow(30, 0.5 - 0.5 * Math.cos(2 * Math.PI * 4 * index / SampleRate))
            const gain = 2 * Math.sin(Math.PI * cutoff / SampleRate)
            low += gain * band
            band += gain * (source[index] - low - 0.3 * band)
            channel[index] = 0.5 * low
        }
        const columns = Math.floor(Movement.layout(1024, 512, false).spectrogram.width / Movement.CellSize)
        const analysis = Movement.analyse([channel], SampleRate, columns, 160)
        const {brightness} = Movement.rates(analysis)
        expect(brightness.unwrap()).toBeCloseTo(4, 0)
        expect(ModulationRate.tempoSync(brightness.unwrap(), 120)).toBe("1/8")
        const steady = Movement.analyse([saw(55, 0.5, frames)], SampleRate, columns, 160)
        expect(Movement.rates(steady).brightness.isEmpty()).toBe(true)
    })
    it("scales the FFT with the window length", () => {
        expect(Movement.fftSize(960)).toBe(512)
        expect(Movement.fftSize(SampleRate)).toBe(2048)
        expect(Movement.fftSize(60 * SampleRate)).toBe(2048)
    })
})

describe("Stereo", () => {
    it("maps the goniometer with mid up and side across", () => {
        expect(ViewMath.gonioPoint(1, 1, 1)).toEqual([0, 1])
        expect(ViewMath.gonioPoint(1, -1, 1)).toEqual([-1, 0])
        expect(ViewMath.gonioPoint(1, 0, 1)).toEqual([-0.5, 0.5])
        expect(ViewMath.gonioPoint(0, 1, 2)).toEqual([1, 1])
    })
    it("puts a mono signal on the vertical line", () => {
        const channel = sine(220, 0.5, SampleRate)
        const density = ViewMath.gonioDensity(channel, channel, 64, ViewMath.gonioGain(channel, channel))
        let center = 0
        let total = 0
        density.forEach((count, index) => {
            total += count
            if (index % 64 === 32) {center += count}
        })
        expect(total).toBe(SampleRate)
        expect(center).toBe(total)
    })
    it("scales quiet signals up and leaves silence alone", () => {
        const quiet = sine(220, 0.05, SampleRate)
        expect(ViewMath.gonioGain(quiet, quiet)).toBeCloseTo(0.9 / 0.05, 0)
        expect(ViewMath.gonioGain(new Float32Array(100), new Float32Array(100))).toBe(1)
    })
    it("measures correlation over time", () => {
        const channel = sine(220, 0.5, SampleRate)
        const inverted = channel.map(value => -value)
        expect(Array.from(ViewMath.correlationCurve(channel, channel, 10, 2400)).every(value => Math.abs(value - 1) < 1e-6)).toBe(true)
        expect(Array.from(ViewMath.correlationCurve(channel, inverted, 10, 2400)).every(value => Math.abs(value + 1) < 1e-6)).toBe(true)
        expect(ViewMath.correlationCurve(new Float32Array(1000), new Float32Array(1000), 10, 100).every(Number.isNaN)).toBe(true)
    })
    it("measures width per octave band", () => {
        const mono = noise(SampleRate, 1)
        const monoBands = ViewMath.octaveBands(mono, mono, SampleRate)
        expect(monoBands.map(({centerHz}) => centerHz)).toEqual(ViewMath.OctaveCenters)
        monoBands.forEach(({correlation, widthDb}) => {
            expect(correlation).toBeCloseTo(1, 6)
            expect(widthDb).toBe(-60)
        })
        ViewMath.octaveBands(noise(4 * SampleRate, 1), noise(4 * SampleRate, 2), SampleRate).slice(3).forEach(({correlation, widthDb}) => {
            expect(Math.abs(correlation)).toBeLessThan(0.15)
            expect(Math.abs(widthDb)).toBeLessThan(1.5)
        })
        const summary = Stereo.summarize(mono, mono.map(value => value * 0.5))
        expect(summary.correlation).toBeCloseTo(1, 6)
        expect(summary.balanceDb).toBeCloseTo(-6.02, 1)
        expect(Stereo.summarize(mono, mono).identical).toBe(true)
    })
})

describe("view drawing", () => {
    const frames = SampleRate
    const bass = saw(55, 0.5, frames)
    const notes = [note(1, 0, frames / 2, 33, frames / 3), note(2, frames / 2, frames, 33)]
    it("draws the scope with note labels, units and the close-up caption", () => {
        const {context, texts} = createRecorder()
        Scope.draw(context, request([bass, bass], notes, false), 1024, 512)
        expect(texts).toEqual(expect.arrayContaining(["n1", "n2", "0 dB", "0", "1"]))
        expect(texts.some(text => text.startsWith("Waveform close-up of note 1") && text.includes("55.0 Hz"))).toBe(true)
        expect(texts.some(text => text.endsWith("ms"))).toBe(true)
    })
    it("draws the spectrum with harmonic marks", () => {
        const {context, texts} = createRecorder()
        Spectrum.draw(context, request([bass], notes, false), 1024, 448)
        expect(texts).toEqual(expect.arrayContaining(["H1", "2", "3", "1k", "Hz"]))
        expect(texts.some(text => text.startsWith("Harmonic levels re H1 (dB): H2 -6"))).toBe(true)
    })
    it("draws movement with a spectrogram raster and the centroid range", () => {
        const {context, texts, images} = createRecorder()
        Movement.draw(context, request([bass], notes, true), 512, 200)
        expect(images).toHaveLength(1)
        expect(texts.some(text => text.startsWith("Variation A - movement"))).toBe(true)
        expect(texts.some(text => text.startsWith("brightness (centroid)"))).toBe(true)
    })
    it("draws a mono signal as mono in the stereo view", () => {
        const {context, texts, images} = createRecorder()
        Stereo.draw(context, request([bass], notes, false), 1024, 512)
        expect(images).toHaveLength(1)
        expect(texts).toEqual(expect.arrayContaining(["M (mono)", "L = R (mono)", "1.00", "32", "16k"]))
    })
    it("says silent instead of drawing empty plots", () => {
        const silence = [new Float32Array(frames), new Float32Array(frames)]
        ;[Scope.draw, Spectrum.draw, Movement.draw, Stereo.draw].forEach(draw => {
            const {context, texts} = createRecorder()
            draw(context, request(silence, [], true), 512, 200)
            expect(texts).toContain("silent")
        })
    })
    it("survives a 20 ms window in every view", () => {
        const short = saw(110, 0.5, 960)
        ;[Scope.draw, Spectrum.draw, Movement.draw, Stereo.draw].forEach(draw => {
            const {context, texts} = createRecorder()
            draw(context, request([short, short], [note(1, 0, 960, 45)], false), 1024, 512)
            expect(texts.length).toBeGreaterThan(5)
        })
    })
    it("numbers the bars of a cropped render from bars.from", () => {
        const render = AgentRender.crop(createRender([saw(55, 0.5, 8 * SampleRate)], 4), {startFrame: 3 * SampleRate, endFrame: 8 * SampleRate})
        const {context, texts} = createRecorder()
        Scope.draw(context, {render, notes: [], compact: false, title: undefined}, 1024, 512)
        expect(texts.some(text => text.includes("bars 3-4"))).toBe(true)
        expect(texts).toEqual(expect.arrayContaining(["3", "4"]))
    })
    it("labels movement cycles with the descriptor's tempo-sync names", () => {
        const wobble = Float32Array.from({length: 2 * SampleRate}, (_value, index) =>
            0.5 * (1 + 0.8 * Math.sin(2 * Math.PI * 4 * index / SampleRate)) * Math.sin(2 * Math.PI * 220 * index / SampleRate))
        const {context, texts} = createRecorder()
        Movement.draw(context, request([wobble], [], false), 1024, 512)
        expect(texts.some(text => text.includes("loudness cycles at 4.00 Hz (1/8 at 120 BPM)"))).toBe(true)
    })
    it("registers as listen views with distinct keys", () => {
        const views = [ScopeView, SpectrumView, MovementView, StereoView]
        expect(views.map(({key}) => key)).toEqual(["scope", "spectrum", "movement", "stereo"])
        views.forEach(({summary}) => expect(summary.startsWith(`${summary.split(":")[0]}:`)).toBe(true))
        views.forEach(({summary}) => expect(summary.length).toBeLessThanOrEqual(90))
        expect(views.filter(({usesNotes}) => usesNotes === true).map(({key}) => key)).toEqual(["scope", "spectrum", "movement"])
    })
})
