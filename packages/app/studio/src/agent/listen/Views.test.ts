import {describe, expect, it} from "vitest"
import {deflateSync} from "node:zlib"
import {PPQN} from "@opendaw/lib-dsp"
import {AgentRender, AgentRenderStem} from "./AgentRender"
import {ViewContext, ViewKit} from "./ViewKit"
import {Spectrogram} from "./SpectrogramView"
import {Loudness} from "./LoudnessView"
import {PianoRoll, PianoRollNote} from "./PianoRollView"

const SampleRate = 48_000

// Records what the view code draws. There is no canvas polyfill in node, so this checks the drawing
// code paths and labels, while pixel content is tested on the pure raster functions.
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

// a crude "track": a new pitch every 16th note plus a noise burst on every beat
const music = (frames: number, seed: number): Float32Array => {
    const channel = new Float32Array(frames)
    const sixteenth = SampleRate / 8
    let random = seed
    for (let index = 0; index < frames; index++) {
        const step = Math.floor(index / sixteenth)
        const frequency = 110 * Math.pow(2, ((step * 7 + seed) % 24) / 12)
        const inStep = (index % sixteenth) / sixteenth
        random = (random * 1103515245 + 12345) & 0x7fffffff
        const noise = step % 4 === 0 && inStep < 0.3 ? (random / 0x7fffffff - 0.5) * (0.3 - inStep) : 0
        channel[index] = 0.3 * Math.sin(2 * Math.PI * frequency * index / SampleRate) * (1 - inStep) + noise
    }
    return channel
}

const createRender = (stems: ReadonlyArray<AgentRenderStem>, mix: ReadonlyArray<Float32Array>, bars: number): AgentRender => ({
    sampleRate: SampleRate, mix, stems, bars: {from: 1, to: bars},
    startSeconds: 0, durationSeconds: mix[0].length / SampleRate, tailSeconds: 0,
    barStartFrames: Array.from({length: bars}, (_value, index) => index * 2 * SampleRate),
    stepSeconds: 0.125, bpm: 120, signature: [4, 4], warnings: []
})

describe("ViewKit", () => {
    it("thins out bar labels when bars get dense", () => {
        const rect = {x: 40, y: 0, width: 940, height: 100}
        const frames = Array.from({length: 64}, (_value, index) => index * 1000)
        const ticks = ViewKit.barTicks(frames, 1, 64_000, rect)
        expect(ticks).toHaveLength(64)
        expect(ticks[0]).toEqual({x: 40, bar: 1, labeled: true})
        expect(ticks.filter(tick => tick.labeled).map(tick => tick.bar).slice(0, 3)).toEqual([1, 3, 5])
        expect(ViewKit.barTicks(frames.slice(0, 8), 5, 8000, rect).every(tick => tick.labeled)).toBe(true)
    })
    it("maps frequencies on a log axis", () => {
        expect(ViewKit.logUnit(30, 30, 20_000)).toBe(0)
        expect(ViewKit.logUnit(20_000, 30, 20_000)).toBeCloseTo(1, 10)
        expect(ViewKit.logUnit(Math.sqrt(30 * 20_000), 30, 20_000)).toBeCloseTo(0.5, 10)
        expect(ViewKit.formatHz(1000)).toBe("1k")
        expect(ViewKit.formatHz(12_500)).toBe("12.5k")
        expect(ViewKit.formatHz(200)).toBe("200")
    })
    it("quantizes the heat map", () => {
        expect(ViewKit.heatColor(0)).toEqual([0, 0, 4])
        expect(ViewKit.heatColor(1)).toEqual([252, 255, 164])
        const distinct = new Set(Array.from({length: 1000}, (_value, index) => ViewKit.heatColor(index / 999).join(",")))
        expect(distinct.size).toBeLessThanOrEqual(ViewKit.HeatLevels)
    })
    it("clamps view sizes", () => {
        expect(ViewKit.clampSize(4000, 4000)).toEqual([1024, 512])
        expect(ViewKit.clampSize(10, 10)).toEqual([64, 64])
    })
})

describe("Spectrogram", () => {
    it("lays out the mix and up to six stem rows inside the image", () => {
        [0, 1, 6].forEach(stemCount => {
            const {mix, stems, legend} = Spectrogram.layout(1024, 512, stemCount)
            expect(stems).toHaveLength(stemCount)
            const rects = [mix, ...stems, legend]
            rects.forEach(rect => {
                expect(rect.x).toBeGreaterThanOrEqual(0)
                expect(rect.x + rect.width).toBeLessThanOrEqual(1024)
                expect(rect.y + rect.height).toBeLessThanOrEqual(512)
            })
            ;[mix, ...stems].forEach(rect => {
                expect(rect.width % Spectrogram.CellSize).toBe(0)
                expect(rect.height % Spectrogram.CellSize).toBe(0)
                expect(rect.height).toBeGreaterThanOrEqual(16)
            })
            stems.forEach((rect, index) => {
                const above = index === 0 ? mix : stems[index - 1]
                expect(rect.y).toBeGreaterThanOrEqual(above.y + above.height)
            })
        })
    })
    it("puts a sine into the right log-frequency row at the right level", () => {
        const channel = sine(1000, 0.5, SampleRate * 2)
        const rows = 120
        const values = Spectrogram.analyse([channel, channel], SampleRate, 20, rows, 30, 20_000)
        const row = Math.floor(ViewKit.logUnit(1000, 30, 20_000) * rows)
        const column = 10
        expect(values[column * rows + row]).toBeGreaterThan(-8.5)
        expect(values[column * rows + row]).toBeLessThan(-5)
        expect(values[column * rows + 10]).toBeLessThan(-60)
        expect(values[column * rows + rows - 5]).toBeLessThan(-60)
    })
    it("keeps a busy 8-bar spectrogram with 6 stems well below 150 KB", () => {
        const frames = 16 * SampleRate
        const channels = Array.from({length: 6}, (_value, index) => music(frames, index + 1))
        const mix = Float32Array.from({length: frames}, (_value, index) => channels.reduce((sum, channel) => sum + channel[index] / 3, 0))
        const {mix: mixRect, stems: stemRects} = Spectrogram.layout(1024, 512, 6)
        const rasterBytes = [mixRect, ...stemRects].map((rect, index) => {
            const columns = rect.width / Spectrogram.CellSize
            const rows = rect.height / Spectrogram.CellSize
            const signal = index === 0 ? mix : channels[index - 1]
            const fftSize = index === 0 ? Spectrogram.FftSize : Spectrogram.StemFftSize
            const values = Spectrogram.analyse([signal, signal], SampleRate, columns, rows, 30, 20_000, fftSize)
            const data = new Uint8ClampedArray(rect.width * rect.height * 4)
            Spectrogram.rasterize(values, columns, rows, -96, 0, data, rect.width)
            const scanlines = new Uint8Array(rect.height * (rect.width * 4 + 1))
            for (let y = 0; y < rect.height; y++) {
                scanlines.set(data.subarray(y * rect.width * 4, (y + 1) * rect.width * 4), y * (rect.width * 4 + 1) + 1)
            }
            return deflateSync(scanlines).length
        }).reduce((sum, bytes) => sum + bytes, 0)
        expect(rasterBytes).toBeLessThan(150_000)
    })
    it("draws labels, bar numbers, frequency ticks and one raster per row", async () => {
        const frames = 8 * SampleRate
        const stems: ReadonlyArray<AgentRenderStem> = [
            {label: "Bass", unitUuid: "a", channels: [sine(55, 0.5, frames), sine(55, 0.5, frames)], silent: false, feeds: []},
            {label: "Lead", unitUuid: "b", channels: [new Float32Array(frames), new Float32Array(frames)], silent: true, feeds: []}
        ]
        const {context, texts, images} = createRecorder()
        await Spectrogram.draw(context, createRender(stems, stems[0].channels, 4), 1024, 512)
        expect(images).toHaveLength(3)
        expect(texts).toEqual(expect.arrayContaining(["Mix", "Bass", "Lead (silent)", "1", "2", "3", "4", "1k", "100", "dBFS"]))
        expect(texts.some(text => text.startsWith("Spectrogram") && text.includes("bars 1-4"))).toBe(true)
    })
})

describe("Loudness", () => {
    it("measures the RMS of a full-scale sine as -3 dB", () => {
        const curve = Loudness.rmsCurve([sine(440, 1, SampleRate)], 6000, 19_200)
        expect(curve).toHaveLength(8)
        curve.forEach(value => expect(value).toBeCloseTo(-3.01, 1))
    })
    it("windows over neighbouring hops", () => {
        const channel = new Float32Array(4000)
        channel.fill(1, 1000, 2000)
        expect(Array.from(Loudness.rmsCurve([channel], 1000, 1000)).map(value => Math.round(value))).toEqual([-200, 0, -200, -200])
        const smooth = Loudness.rmsCurve([channel], 1000, 3000)
        expect(smooth[0]).toBeCloseTo(10 * Math.log10(1 / 2), 5)
        expect(smooth[2]).toBeCloseTo(10 * Math.log10(1 / 3), 5)
    })
    it("draws a legend with integrated RMS per stem", () => {
        const frames = 4 * SampleRate
        const stems: ReadonlyArray<AgentRenderStem> = [
            {label: "Pad", unitUuid: "a", channels: [sine(220, 0.5, frames), sine(220, 0.5, frames)], silent: false, feeds: []}
        ]
        const {context, texts} = createRecorder()
        Loudness.draw(context, createRender(stems, stems[0].channels, 2), 1024, 384)
        expect(texts).toEqual(expect.arrayContaining(["Mix -9.0 dB", "Pad -9.0 dB", "1", "2", "0", "-60"]))
    })
})

describe("PianoRoll", () => {
    const range = {startPpqn: 0, endPpqn: 4 * PPQN.Bar, ppqnPerBar: PPQN.Bar}
    const notes: ReadonlyArray<PianoRollNote> = [
        {pitch: 36, position: 0, duration: PPQN.Quarter, velocity: 1, track: "Bass"},
        {pitch: 60, position: PPQN.Bar, duration: PPQN.Bar, velocity: 0.5, track: "Keys"},
        {pitch: 67, position: 3.5 * PPQN.Bar, duration: PPQN.Bar, velocity: 0.8, track: "Keys"},
        {pitch: 90, position: 5 * PPQN.Bar, duration: PPQN.Bar, velocity: 0.8, track: "Lead"}
    ]
    it("pads the pitch range to at least an octave", () => {
        expect(PianoRoll.pitchRange([notes[1]])).toEqual([55, 66])
        expect(PianoRoll.pitchRange(notes.slice(0, 3))).toEqual([35, 68])
    })
    it("clips notes to the range and places them on their pitch row", () => {
        const rect = {x: 40, y: 20, width: 800, height: 340}
        const clipped = PianoRoll.noteRect(notes[2], range, rect, 35, 68)
        expect(clipped.x).toBeCloseTo(40 + 700, 6)
        expect(clipped.width).toBeCloseTo(100, 6)
        expect(clipped.y).toBeCloseTo(20 + (68 - 67) * 10, 6)
        expect(clipped.height).toBeCloseTo(10, 6)
        expect(PianoRoll.isVisible(notes[3], range)).toBe(false)
    })
    it("labels every pitch only when rows are tall enough", () => {
        expect(PianoRoll.labeledPitch(61, 12)).toBe(true)
        expect(PianoRoll.labeledPitch(61, 5)).toBe(false)
        expect(PianoRoll.labeledPitch(64, 5)).toBe(true)
        expect(PianoRoll.labeledPitch(60, 1)).toBe(true)
    })
    it("draws tracks in the legend and pitch names", () => {
        const {context, texts} = createRecorder()
        PianoRoll.draw(context, notes, range, 1024, 512)
        expect(texts).toEqual(expect.arrayContaining(["Bass", "Keys", "Lead", "C2", "C4", "1", "4"]))
        expect(texts.some(text => text.includes("3 notes"))).toBe(true)
    })
})
