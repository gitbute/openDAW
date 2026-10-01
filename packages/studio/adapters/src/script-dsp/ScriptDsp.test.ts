import {beforeAll, describe, expect, it} from "vitest"
import {FFT} from "@opendaw/lib-dsp"
import {ScriptDsp} from "./ScriptDsp"
import {ScriptCompiler} from "../ScriptCompiler"
import {ScriptDeclaration} from "../ScriptDeclaration"

const SampleRate = 48000
const N = 65536

// Loads the library exactly as device code sees it: the generated source, evaluated as a function body.
const loadDsp = (names: ReadonlyArray<string> = ScriptDsp.blockNames) => new Function(`${ScriptDsp.include(names)}\nreturn Dsp`)()

const blackmanHarris = (index: number, length: number): number => {
    const t = index / length
    return 0.35875 - 0.48829 * Math.cos(2 * Math.PI * t) + 0.14128 * Math.cos(4 * Math.PI * t) - 0.01168 * Math.cos(6 * Math.PI * t)
}

const powerSpectrum = (signal: Float32Array): Float32Array => {
    const length = signal.length
    const real = new Float32Array(length), imag = new Float32Array(length)
    signal.forEach((value, index) => real[index] = value * blackmanHarris(index, length))
    new FFT(length).process(real, imag)
    const power = new Float32Array(length / 2)
    power.forEach((_, index) => power[index] = real[index] * real[index] + imag[index] * imag[index])
    return power
}

// Energy outside the expected harmonics (aliases) relative to the harmonic energy, between 20 Hz and limitHz.
const aliasRatioDb = (signal: Float32Array, f0: number, limitHz: number = 20000): number => {
    const power = powerSpectrum(signal)
    const marked = new Uint8Array(power.length)
    for (let harmonic = 1; harmonic * f0 < SampleRate / 2; harmonic++) {
        const bin = harmonic * f0 * signal.length / SampleRate
        for (let index = Math.floor(bin - 6); index <= Math.ceil(bin + 6); index++) {
            if (index >= 0 && index < marked.length) {marked[index] = 1}
        }
    }
    let harmonicPower = 0, aliasPower = 0
    const low = Math.ceil(20 * signal.length / SampleRate), high = Math.min(power.length, Math.floor(limitHz * signal.length / SampleRate))
    for (let index = low; index < high; index++) {
        if (marked[index] === 1) {harmonicPower += power[index]} else {aliasPower += power[index]}
    }
    return 10 * Math.log10(aliasPower / harmonicPower)
}

const render = (next: () => number, length: number = N, warmup: number = 2048): Float32Array => {
    for (let index = 0; index < warmup; index++) {next()}
    const out = new Float32Array(length)
    for (let index = 0; index < length; index++) {out[index] = next()}
    return out
}

const magnitudeDb = (impulse: Float32Array, hz: number): number => {
    const length = impulse.length
    const real = Float32Array.from(impulse), imag = new Float32Array(length)
    new FFT(length).process(real, imag)
    const bin = Math.round(hz * length / SampleRate)
    return 10 * Math.log10(real[bin] * real[bin] + imag[bin] * imag[bin])
}

const impulseResponse = (process: (x: number) => number, length: number = 16384, amplitude: number = 1): Float32Array =>
    Float32Array.from({length}, (_, index) => process(index === 0 ? amplitude : 0) / amplitude)

const sine = (hz: number, amplitude: number = 1) => {
    let phase = 0
    return (): number => {
        phase += hz / SampleRate
        if (phase >= 1) {phase -= 1}
        return Math.sin(2 * Math.PI * phase) * amplitude
    }
}

const isClean = (value: number): boolean => value === 0 || Math.abs(value) > 1e-37

beforeAll(() => {Object.assign(globalThis, {sampleRate: SampleRate})})

describe("ScriptDsp linking", () => {
    it("resolves dependencies in order and always includes core", () => {
        expect(ScriptDsp.resolve(["tables"]).map(block => block.name)).toEqual(["core", "fft", "wavetable", "tables"])
        expect(ScriptDsp.resolve(["shaper", "shaper"]).map(block => block.name)).toEqual(["core", "halfband", "shaper"])
    })
    it("links exactly the blocks the code references", () => {
        const code = "class Processor { constructor() { this.filter = new Dsp.Svf(Dsp.LP) } process() {} }"
        const linked = ScriptDsp.link(code)
        expect(linked.endsWith(code)).toBe(true)
        expect(linked).toContain("v1: core, svf.")
        expect(linked).not.toContain("Dsp.Shaper = class")
    })
    it("re-linking replaces the library instead of stacking it", () => {
        const code = "class Processor { constructor() { this.osc = new Dsp.Osc() } process() {} }"
        const twice = ScriptDsp.link(ScriptDsp.link(code).replace("Dsp.Osc()", "Dsp.Osc(); this.lfo = new Dsp.Lfo()"))
        expect(twice.match(/openDAW DSP library v1/g)?.length).toBe(1)
        expect(twice).toContain("v1: core, osc, lfo.")
        expect(ScriptDsp.strip(twice)).toBe(code.replace("Dsp.Osc()", "Dsp.Osc(); this.lfo = new Dsp.Lfo()"))
    })
    it("collapses the library to one line for reading", () => {
        const collapsed = ScriptDsp.collapse(ScriptDsp.link("const f = new Dsp.Svf()"))
        expect(collapsed).toBe("// openDAW DSP library v1: core, svf (collapsed, added by Dsp.link)\nconst f = new Dsp.Svf()")
    })
    it("reports unknown blocks and members with the available names", () => {
        expect(() => ScriptDsp.include(["reverb"])).toThrow(/Unknown DSP block 'reverb'. Available: core/)
        expect(() => ScriptDsp.link("new Dsp.Reverb()")).toThrow(/Unknown Dsp.Reverb. Available: .*Svf/)
    })
    it("never emits script declaration directives from library code", () => {
        const library = ScriptDsp.include(ScriptDsp.blockNames)
        expect(library).not.toMatch(/^\/\/ @/m)
        ScriptDsp.examples.forEach(example => {
            const linked = ScriptDsp.link(example.code)
            expect(ScriptDeclaration.parseParams(linked)).toEqual(ScriptDeclaration.parseParams(example.code))
            expect(ScriptDeclaration.parseSamples(linked)).toEqual(ScriptDeclaration.parseSamples(example.code))
            expect(ScriptDeclaration.parseLabel(linked).unwrap()).toBe(ScriptDeclaration.parseLabel(example.code).unwrap())
        })
    })
    it("every export is defined by its block", () => {
        const Dsp = loadDsp()
        ScriptDsp.blocks.forEach(block => block.exports.forEach(name => expect(Dsp[name], `${block.name}: ${name}`).toBeDefined()))
        expect(Object.isFrozen(Dsp)).toBe(true)
    })
    it("documents every block for the device reference", () => {
        const reference = ScriptDsp.reference("Apparat")
        ScriptDsp.blocks.forEach(block => expect(block.doc.length).toBeGreaterThan(40))
        expect(reference).toContain("Dsp.link(code)")
        ScriptDsp.examples.forEach(example => expect(reference).toContain(example.name))
    })
})

describe("ScriptDsp examples compile and render through the script registry", () => {
    ScriptDsp.examples.forEach(example => {
        it(example.name, () => {
            const uuid = `dsp-example-${example.name.replace(/\W+/g, "-")}`
            const config = {headerTag: "apparat", registryName: "apparatProcessors", functionName: "apparat"}
            new Function(ScriptCompiler.wrap(config, uuid, 1, ScriptDsp.link(example.code)))()
            const registry = Reflect.get(Reflect.get(globalThis, "openDAW"), "apparatProcessors")
            const processor = new registry[uuid].create()
            processor.samples = {wavetable: null}
            ScriptDeclaration.parseParams(example.code).forEach(({label, defaultValue}) => processor.paramChanged(label, defaultValue))
            const left = new Float32Array(128), right = new Float32Array(128)
            let peak = 0, sum = 0, count = 0, finite = true
            processor.noteOn(36, 0.9, 0, 1)
            processor.noteOn(43, 0.9, 0, 2)
            for (let index = 0; index < 1500; index++) {
                if (index === 700) {processor.noteOff(2)}
                if (index === 1000) {processor.noteOff(1)}
                left.fill(0)
                right.fill(0)
                processor.process([left, right], {s0: 0, s1: 128, index, bpm: 140, p0: index * 128 / SampleRate * 140 / 60 * 960, p1: 0, flags: 5})
                for (let frame = 0; frame < 128; frame++) {
                    finite = finite && Number.isFinite(left[frame]) && Number.isFinite(right[frame])
                    peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]))
                    if (index < 1000) {
                        sum += left[frame]
                        count++
                    }
                }
            }
            expect(finite).toBe(true)
            expect(peak).toBeGreaterThan(0.05)
            expect(peak).toBeLessThan(2)
            expect(Math.abs(sum / count)).toBeLessThan(0.01)
            expect(Math.max(...left.map(Math.abs))).toBeLessThan(1e-3)
        })
    })
})

describe("Osc (BLEP/BLAMP)", () => {
    const shapes: ReadonlyArray<[string, (Dsp: ReturnType<typeof loadDsp>) => number]> =
        [["saw", Dsp => Dsp.SAW], ["square", Dsp => Dsp.SQUARE], ["pulse 25%", Dsp => Dsp.PULSE], ["triangle", Dsp => Dsp.TRIANGLE]]
    const notes = [440.3, 1760.7, 2793.83, 4186.01]
    it("keeps aliasing below -80 dB under 20 kHz up to C8", () => {
        const Dsp = loadDsp(["osc"])
        const report: Array<string> = []
        shapes.forEach(([name, shapeOf]) => notes.forEach(hz => {
            const osc = new Dsp.Osc(shapeOf(Dsp))
            osc.setFrequency(hz)
            osc.setWidth(0.25)
            const ratio = aliasRatioDb(render(() => osc.next()), hz)
            report.push(`${name} ${hz} Hz: ${ratio.toFixed(1)} dB`)
            expect(ratio, `${name} ${hz}`).toBeLessThan(-80)
        }))
        console.info(`Osc alias ratio (<20 kHz):\n${report.join("\n")}`)
    })
    it("the measurement detects aliasing of a naive saw", () => {
        let phase = 0
        const naive = render(() => {
            phase += 2793.83 / SampleRate
            if (phase >= 1) {phase -= 1}
            return 2 * phase - 1
        })
        expect(aliasRatioDb(naive, 2793.83)).toBeGreaterThan(-25)
    })
    it("hard sync stays band-limited", () => {
        const Dsp = loadDsp(["osc"])
        const master = new Dsp.Osc(Dsp.SAW), slave = new Dsp.Osc(Dsp.SAW)
        master.setFrequency(1234.5)
        slave.setFrequency(1234.5 * 2.71)
        const ratio = aliasRatioDb(render(() => {
            master.advance()
            return slave.next(master.syncOut)
        }), 1234.5)
        console.info(`hard sync alias ratio: ${ratio.toFixed(1)} dB`)
        expect(ratio).toBeLessThan(-80)
    })
    it("has no DC with an asymmetric pulse (levels 1.6 and -0.4 at 20% width)", () => {
        const Dsp = loadDsp(["osc"])
        const osc = new Dsp.Osc(Dsp.PULSE)
        osc.setFrequency(110)
        osc.setWidth(0.2)
        const signal = render(() => osc.next(), SampleRate)
        expect(Math.abs(signal.reduce((sum, value) => sum + value, 0) / signal.length)).toBeLessThan(1e-3)
        expect(Math.max(...signal)).toBeLessThan(1.6 * 1.15)
        expect(Math.min(...signal)).toBeGreaterThan(-0.4 - 0.2)
    })
    it("width, shape and phase changes are click-free", () => {
        const Dsp = loadDsp(["osc"])
        const osc = new Dsp.Osc(Dsp.PULSE)
        osc.setFrequency(100)
        let maxStep = 0, previous = 0
        for (let index = 0; index < 20000; index++) {
            if (index % 997 === 0) {osc.setWidth(0.1 + 0.8 * ((index / 997) % 2))}
            if (index === 10007) {osc.setShape(Dsp.SAW)}
            if (index === 15013) {osc.reset(0.5)}
            const value = osc.next()
            if (index > 100) {maxStep = Math.max(maxStep, Math.abs(value - previous))}
            previous = value
        }
        expect(maxStep).toBeLessThan(1.5)
    })
})

describe("Wavetable", () => {
    it("keeps mip-mapped aliasing below -80 dB for saw and sync tables up to C8", () => {
        const Dsp = loadDsp(["tables"])
        const report: Array<string> = []
        const cases: ReadonlyArray<[string, ReturnType<typeof loadDsp>, number]> =
            [["basic saw", Dsp.Tables.basic(), 2 / 3], ["sync", Dsp.Tables.sync(), 0.8], ["fm", Dsp.Tables.fm(), 1], ["fold", Dsp.Tables.fold(), 1]]
        cases.forEach(([name, table, position]) => [440.3, 1760.7, 2793.83, 4186.01].forEach(hz => {
            const osc = new Dsp.WavetableOsc(table)
            osc.position = position
            osc.setFrequency(hz)
            const ratio = aliasRatioDb(render(() => osc.next()), hz, SampleRate / 2)
            report.push(`${name} ${hz} Hz: ${ratio.toFixed(1)} dB`)
            expect(ratio, `${name} ${hz}`).toBeLessThan(-78)
        }))
        console.info(`Wavetable alias ratio (full band):\n${report.join("\n")}`)
    })
    it("loads Serum-style 2048-sample frames from audio and morphs between them", () => {
        const Dsp = loadDsp(["wavetable"])
        const frames = 4, size = 2048
        const data = new Float32Array(frames * size)
        for (let frame = 0; frame < frames; frame++) {
            for (let index = 0; index < size; index++) {data[frame * size + index] = 0.5 * Math.sin(2 * Math.PI * (frame + 1) * index / size)}
        }
        const table = Dsp.Wavetable.fromAudio({sampleRate: 44100, numberOfFrames: data.length, numberOfChannels: 1, frames: [data]})
        expect(table.frames).toBe(4)
        const osc = new Dsp.WavetableOsc(table)
        osc.setFrequency(187.5)
        osc.position = 1
        const power = powerSpectrum(render(() => osc.next()))
        const binOf = (hz: number) => Math.round(hz * N / SampleRate)
        expect(power[binOf(750)]).toBeGreaterThan(power[binOf(187.5)] * 1e6)
        osc.position = 0
        const fundamental = powerSpectrum(render(() => osc.next()))
        expect(fundamental[binOf(187.5)]).toBeGreaterThan(fundamental[binOf(750)] * 1e6)
    })
    it("accepts a single cycle of any length", () => {
        const Dsp = loadDsp(["wavetable"])
        const data = Float32Array.from({length: 600}, (_, index) => index < 300 ? 1 : -1)
        const table = Dsp.Wavetable.fromAudio({sampleRate: 48000, numberOfFrames: 600, numberOfChannels: 1, frames: [data]})
        const osc = new Dsp.WavetableOsc(table)
        osc.setFrequency(100)
        const signal = render(() => osc.next(), N)
        expect(aliasRatioDb(signal, 100, SampleRate / 2)).toBeLessThan(-70)
        expect(Math.max(...signal.map(Math.abs))).toBeGreaterThan(0.9)
    })
    it("slot falls back, detects a sample swap and rebuilds once", () => {
        const Dsp = loadDsp(["tables"])
        const fallback = Dsp.Tables.basic()
        const slot = new Dsp.WavetableSlot(fallback)
        expect(slot.update(null)).toBe(fallback)
        const first = Float32Array.from({length: 4096}, (_, index) => Math.sin(2 * Math.PI * index / 2048))
        const audio = {sampleRate: 48000, numberOfFrames: 4096, numberOfChannels: 1, frames: [first]}
        const loaded = slot.update(audio)
        expect(loaded).not.toBe(fallback)
        expect(loaded.frames).toBe(2)
        expect(slot.update({...audio, frames: [first]})).toBe(loaded)
        const second = Float32Array.from(first, value => value * 0.5)
        expect(slot.update({...audio, frames: [second]})).not.toBe(loaded)
        expect(slot.update(null)).toBe(fallback)
        const other = Dsp.Tables.pwm()
        slot.setFallback(other)
        expect(slot.update(null)).toBe(other)
    })
    it("every built-in table renders finite audio near unit peak across positions", () => {
        const Dsp = loadDsp(["tables"])
        const names = ["basic", "sawSquare", "pwm", "harmonicSweep", "formant", "fm", "sync", "fold"]
        names.forEach(name => {
            const osc = new Dsp.WavetableOsc(Dsp.Tables[name]())
            osc.setFrequency(55)
            let peak = 0, finite = true
            for (let index = 0; index < SampleRate; index++) {
                osc.position = index / SampleRate
                const value = osc.next()
                finite = finite && Number.isFinite(value)
                peak = Math.max(peak, Math.abs(value))
            }
            expect(finite, name).toBe(true)
            expect(peak, name).toBeGreaterThan(0.5)
            expect(peak, name).toBeLessThan(1.3)
        })
    })
    it("unison keeps its level constant over the voice count", () => {
        const Dsp = loadDsp(["unison"])
        const rms = (count: number): number => {
            const unison = new Dsp.Unison(count)
            unison.setDetune(30)
            unison.setFrequency(110)
            unison.reset(true)
            const signal = render(() => unison.next(), SampleRate)
            return Math.sqrt(signal.reduce((sum, value) => sum + value * value, 0) / signal.length)
        }
        const reference = rms(1)
        ;[3, 7, 12].forEach(count => expect(Math.abs(20 * Math.log10(rms(count) / reference)), `${count}`).toBeLessThan(3))
    })
})

describe("Filters", () => {
    it("SVF has the textbook 12 dB/oct responses", () => {
        const Dsp = loadDsp(["svf"])
        const response = (mode: number, q: number = Math.SQRT1_2) => {
            const filter = new Dsp.Svf(mode)
            filter.setParams(1000, q)
            return impulseResponse(x => filter.process(x))
        }
        const lowpass = response(Dsp.LP)
        expect(Math.abs(magnitudeDb(lowpass, 100))).toBeLessThan(0.1)
        expect(Math.abs(magnitudeDb(lowpass, 1000) + 3.01)).toBeLessThan(0.2)
        expect(magnitudeDb(lowpass, 8000)).toBeLessThan(-34)
        const highpass = response(Dsp.HP)
        expect(magnitudeDb(highpass, 125)).toBeLessThan(-34)
        expect(Math.abs(magnitudeDb(highpass, 15000))).toBeLessThan(0.2)
        expect(Math.abs(magnitudeDb(response(Dsp.BP, 4), 1000))).toBeLessThan(0.2)
        expect(magnitudeDb(response(Dsp.NOTCH, 4), 1000)).toBeLessThan(-40)
        expect(magnitudeDb(response(Dsp.LP, 10), 1000)).toBeGreaterThan(19)
    })
    it("ladder rolls off at 24 dB/oct and self-oscillates", () => {
        const Dsp = loadDsp(["ladder"])
        const ladder = new Dsp.Ladder()
        ladder.setParams(500, 0, 1)
        const response = impulseResponse(x => ladder.process(x), 16384, 0.001)
        const passband = magnitudeDb(response, 50)
        expect(Math.abs(magnitudeDb(response, 500) - passband + 12)).toBeLessThan(1.5)
        expect(magnitudeDb(response, 4000) - passband).toBeLessThan(-66)
        const ringing = new Dsp.Ladder()
        ringing.setParams(440, 1.05, 1)
        const tail = render(() => ringing.process(0), 8192, 0)
        ringing.process(0.1)
        const sustained = render(() => ringing.process(0), SampleRate, 0)
        expect(Math.max(...tail.map(Math.abs))).toBe(0)
        expect(Math.max(...sustained.subarray(SampleRate - 4800).map(Math.abs))).toBeGreaterThan(0.05)
    })
    it("SVF and ladder stay stable under audio-rate cutoff modulation at high resonance", () => {
        const Dsp = loadDsp(["svf", "ladder", "noise"])
        const noise = new Dsp.Noise(7)
        const modulator = sine(1800)
        const svf = new Dsp.Svf(Dsp.LP), ladder = new Dsp.Ladder()
        let svfPeak = 0, ladderPeak = 0, finite = true
        for (let index = 0; index < SampleRate * 4; index++) {
            const cutoff = 30 * Math.pow(2, 9.4 * (0.5 + 0.5 * modulator()))
            svf.setParams(cutoff, 20)
            ladder.setParams(cutoff, 1.1, 4)
            const input = noise.white() * 0.5
            const a = svf.process(input), b = ladder.process(input)
            finite = finite && Number.isFinite(a) && Number.isFinite(b)
            svfPeak = Math.max(svfPeak, Math.abs(a))
            ladderPeak = Math.max(ladderPeak, Math.abs(b))
        }
        expect(finite).toBe(true)
        console.info(`modulated peaks: svf ${svfPeak.toFixed(2)}, ladder ${ladderPeak.toFixed(2)}`)
        expect(svfPeak).toBeLessThan(60)
        expect(ladderPeak).toBeLessThan(4)
    })
    it("comb resonates at the tuned pitch", () => {
        const Dsp = loadDsp(["comb"])
        const comb = new Dsp.Comb()
        comb.setFrequency(220)
        comb.feedback = 0.95
        const response = impulseResponse(x => comb.process(x), N)
        const power = powerSpectrum(response)
        const from = Math.round(150 * N / SampleRate)
        let best = from
        for (let index = from; index < Math.round(300 * N / SampleRate); index++) {
            if (power[index] > power[best]) {best = index}
        }
        expect(Math.abs(best * SampleRate / N - 220)).toBeLessThan(2.2)
    })
    it("formant filter peaks at the first formant of the vowel", () => {
        const Dsp = loadDsp(["formant"])
        const peakHz = (vowel: number): number => {
            const formant = new Dsp.Formant()
            formant.setVowel(vowel)
            formant.process(0)
            const power = powerSpectrum(impulseResponse(x => formant.process(x), N))
            let best = 1
            for (let index = 1; index < power.length; index++) {if (power[index] > power[best]) {best = index}}
            return best * SampleRate / N
        }
        expect(Math.abs(peakHz(0) - 600)).toBeLessThan(60)
        expect(Math.abs(peakHz(2) - 250)).toBeLessThan(40)
        expect(Math.abs(peakHz(4) - 350)).toBeLessThan(50)
    })
})

describe("Shaper and halfband", () => {
    it("half-band coefficients reject images by more than 100 dB", () => {
        const Dsp = loadDsp(["halfband"])
        ;[0.1, 0.2, 0.4, 0.45].forEach(frequency => {
            const up = new Dsp.Halfband(Dsp.Halfband.STEEP)
            const out = new Float32Array(N)
            let phase = 0, write = 0
            for (let index = 0; index < N / 2 + 1024; index++) {
                phase += frequency
                up.upsample(Math.sin(2 * Math.PI * phase))
                if (index >= 1024) {
                    out[write++] = up.out0
                    out[write++] = up.out1
                }
            }
            const power = powerSpectrum(out)
            const at = (normalized: number) => Math.max(...power.subarray(Math.round(normalized * N) - 4, Math.round(normalized * N) + 5))
            expect(10 * Math.log10(at(0.5 - frequency / 2) / at(frequency / 2)), `${frequency}`).toBeLessThan(-100)
        })
    })
    it("oversampling removes the aliasing of hard drive", () => {
        const Dsp = loadDsp(["shaper"])
        const ratios = [1, 2, 4].map(factor => {
            const shaper = new Dsp.Shaper(Dsp.TANH, factor)
            shaper.drive = 8
            const source = sine(4567.8, 0.8)
            return aliasRatioDb(render(() => shaper.process(source())), 4567.8)
        })
        console.info(`tanh drive 8 at 4567.8 Hz alias ratio: x1 ${ratios[0].toFixed(1)}, x2 ${ratios[1].toFixed(1)}, x4 ${ratios[2].toFixed(1)} dB`)
        expect(ratios[0]).toBeGreaterThan(-30)
        expect(ratios[1]).toBeLessThan(-38)
        expect(ratios[2]).toBeLessThan(-80)
    })
    it("every curve is finite, bounded and free of DC", () => {
        const Dsp = loadDsp(["shaper"])
        ;[Dsp.TANH, Dsp.SOFT, Dsp.HARD, Dsp.FOLD, Dsp.SINEFOLD, Dsp.ASYM].forEach(type => {
            const shaper = new Dsp.Shaper(type, 4)
            shaper.drive = 5
            shaper.bias = 0.3
            const source = sine(110)
            const signal = render(() => shaper.process(source()), SampleRate, SampleRate)
            expect(signal.every(Number.isFinite)).toBe(true)
            expect(Math.max(...signal.map(Math.abs)), `${type}`).toBeLessThan(2.5)
            expect(Math.abs(signal.reduce((sum, value) => sum + value, 0) / signal.length), `${type}`).toBeLessThan(2e-3)
        })
    })
    it("crusher quantises to the bit depth", () => {
        const Dsp = loadDsp(["crusher"])
        const crusher = new Dsp.Crusher()
        crusher.setBits(2)
        expect([0.1, 0.4, -0.7, 0.9].map(value => crusher.process(value))).toEqual([0, 0.5, -0.5, 1])
    })
})

describe("Robustness", () => {
    it("NaN inputs and NaN parameters never produce NaN", () => {
        const Dsp = loadDsp()
        const svf = new Dsp.Svf(), ladder = new Dsp.Ladder(), comb = new Dsp.Comb(), formant = new Dsp.Formant()
        const shaper = new Dsp.Shaper(Dsp.TANH, 4), dc = new Dsp.DcBlocker(), crusher = new Dsp.Crusher()
        svf.setParams(NaN, NaN)
        ladder.setParams(NaN, NaN, NaN)
        comb.setFrequency(NaN)
        formant.setVowel(NaN, NaN, NaN)
        const processors = [svf, ladder, comb, formant, shaper, dc, crusher]
        for (let index = 0; index < 1000; index++) {
            const input = index % 3 === 0 ? NaN : index % 3 === 1 ? Infinity : Math.sin(index)
            processors.forEach(processor => expect(Number.isFinite(processor.process(input))).toBe(true))
        }
        const osc = new Dsp.Osc(), wavetable = new Dsp.WavetableOsc(Dsp.Tables.basic()), lfo = new Dsp.Lfo(), smoother = new Dsp.Smoother()
        osc.setFrequency(NaN)
        wavetable.setFrequency(NaN)
        wavetable.position = NaN
        lfo.setRate(NaN)
        smoother.set(NaN)
        for (let index = 0; index < 1000; index++) {
            expect(Number.isFinite(osc.next() + wavetable.next() + lfo.next() + smoother.next())).toBe(true)
        }
    })
    it("recursive states decay to exact zero instead of denormals", () => {
        const Dsp = loadDsp()
        const svf = new Dsp.Svf(), ladder = new Dsp.Ladder(), comb = new Dsp.Comb(), formant = new Dsp.Formant()
        const shaper = new Dsp.Shaper(Dsp.TANH, 4), dc = new Dsp.DcBlocker(), smoother = new Dsp.Smoother(0.05, 1)
        comb.setFrequency(1000)
        comb.feedback = 0.9
        smoother.set(0)
        const processors = [svf, ladder, comb, formant, shaper, dc]
        for (let index = 0; index < SampleRate * 20; index++) {
            const input = index === 0 ? 1 : 0
            processors.forEach(processor => processor.process(input))
            smoother.next()
        }
        const states = [svf.ic1, svf.ic2, ladder.s1, ladder.s2, ladder.s3, ladder.s4, comb.lowpass, dc.y1, smoother.value,
            ...comb.buffer, ...formant.ic1, ...formant.ic2, ...shaper.up1.y, ...shaper.down1.y, shaper.dcY]
        expect(states.every(isClean)).toBe(true)
    })
})

describe("Envelopes, LFO and voices", () => {
    it("ADSR never jumps: retrigger, steal and release are continuous", () => {
        const Dsp = loadDsp(["adsr"])
        const env = new Dsp.Adsr()
        env.setParams(0.001, 0.05, 0.5, 0.05)
        let previous = 0, maxStep = 0
        const run = (samples: number) => {
            for (let index = 0; index < samples; index++) {
                const level = env.next()
                maxStep = Math.max(maxStep, Math.abs(level - previous))
                previous = level
            }
        }
        env.gateOn()
        run(4800)
        env.gateOn()
        run(30)
        env.gateOff()
        run(20)
        env.gateOn()
        run(4800)
        env.kill()
        run(4800)
        expect(env.active).toBe(false)
        expect(previous).toBe(0)
        expect(maxStep).toBeLessThanOrEqual(1 / (0.001 * SampleRate) + 1e-9)
    })
    it("ADSR release reaches -60 dB at the release time and frees the voice", () => {
        const Dsp = loadDsp(["adsr"])
        const env = new Dsp.Adsr()
        env.setParams(0.001, 0.01, 1, 0.1)
        env.gateOn()
        render(() => env.next(), 4800, 0)
        env.gateOff()
        const release = render(() => env.next(), 4800, 0)
        expect(Math.abs(20 * Math.log10(release[4799]) + 60)).toBeLessThan(0.5)
        render(() => env.next(), 4800, 0)
        expect(env.active).toBe(false)
    })
    it("LFO sync and transport lock follow the grid", () => {
        const Dsp = loadDsp(["lfo"])
        const lfo = new Dsp.Lfo(Dsp.SAW)
        lfo.sync(120, 1)
        expect(lfo.inc * SampleRate).toBeCloseTo(2, 9)
        lfo.lock(960 * 3 + 480, 1)
        expect(lfo.phase).toBeCloseTo(0.5, 9)
        lfo.lock(960 * 8, 0.25)
        expect(lfo.phase).toBeCloseTo(0, 9)
    })
    it("voices allocate, steal the oldest and return to held notes in mono legato", () => {
        const Dsp = loadDsp(["voices"])
        type Event = { readonly voice: number, readonly note: number, readonly legato: boolean }
        const events: Array<Event> = []
        const voices = new Dsp.Voices(2, (index: number) => ({
            active: false,
            start(note: number, _velocity: number, legato: boolean) {
                this.active = true
                events.push({voice: index, note, legato})
            },
            release() {this.active = false},
            stop() {this.active = false},
            render() {}
        }))
        voices.noteOn(60, 1, 0, 1)
        voices.noteOn(62, 1, 0, 2)
        voices.noteOn(64, 1, 50, 3)
        expect(events.map(({voice, note}) => [voice, note])).toEqual([[0, 60], [1, 62], [0, 64.5]])
        voices.reset()
        events.length = 0
        voices.mono = true
        voices.noteOn(40, 1, 0, 10)
        voices.noteOn(43, 1, 0, 11)
        voices.noteOff(11)
        voices.noteOff(10)
        expect(events).toEqual([{voice: 0, note: 40, legato: false}, {voice: 0, note: 43, legato: true}, {voice: 0, note: 40, legato: true}])
        expect(voices.activeCount).toBe(0)
    })
})
