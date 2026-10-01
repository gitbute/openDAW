import {beforeAll, describe, expect, it} from "vitest"
import {ScriptDsp} from "./ScriptDsp"
import {ScriptDeclaration} from "../ScriptDeclaration"

const SampleRate = 48000
const Quantum = 128
const BudgetNanosPerFrame = 1e9 / SampleRate

type Block = { readonly s0: number, readonly s1: number, readonly index: number, readonly bpm: number, readonly p0: number, readonly p1: number, readonly flags: number }
type Renderer = { process(output: ReadonlyArray<Float32Array>, block: Block): void }

const BenchPatch = String.raw`
class BenchVoice {
    constructor(table, index) {
        this.osc = new Dsp.WavetableOsc(table)
        this.osc.setFrequency(55 * Math.pow(2, index / 3))
        this.filter = new Dsp.Svf(Dsp.LP)
        this.shaper = new Dsp.Shaper(Dsp.TANH, 2)
        this.shaper.drive = 4
        this.env = new Dsp.Adsr()
        this.env.gateOn()
        this.lfo = new Dsp.Lfo(Dsp.TRIANGLE)
        this.lfo.setRate(0.5 + index * 0.1)
    }
    render(left, right, s0, s1) {
        for (let i = s0; i < s1; i++) {
            const motion = this.lfo.next()
            this.osc.position = 0.5 + 0.5 * motion
            if ((i & 7) === 0) {this.filter.setParams(800 * Math.pow(2, 2 * motion), 2)}
            const out = this.shaper.process(this.filter.process(this.osc.next())) * this.env.next() * 0.1
            left[i] += out
            right[i] += out
        }
    }
}
class Processor {
    constructor() {
        const table = Dsp.Tables.fm()
        table.prepare()
        this.voices = []
        for (let index = 0; index < 8; index++) {this.voices.push(new BenchVoice(table, index))}
    }
    process(output, block) {
        for (let index = 0; index < 8; index++) {this.voices[index].render(output[0], output[1], block.s0, block.s1)}
    }
}`

beforeAll(() => {Object.assign(globalThis, {sampleRate: SampleRate})})

// Same loop shape as the engine: process(output, block) per 128-frame quantum after the host cleared the output.
const measureLoad = (processor: Renderer, seconds: number): number => {
    const left = new Float32Array(Quantum), right = new Float32Array(Quantum)
    const quanta = Math.round(seconds * SampleRate / Quantum)
    const run = (count: number, offset: number): void => {
        for (let index = 0; index < count; index++) {
            left.fill(0)
            right.fill(0)
            const p0 = (offset + index) * Quantum / SampleRate * 2 * 960
            processor.process([left, right], {s0: 0, s1: Quantum, index, bpm: 120, p0, p1: p0, flags: 5})
        }
    }
    run(quanta, 0)
    const start = performance.now()
    run(quanta, quanta)
    return (performance.now() - start) * 1e6 / (quanta * Quantum)
}

const instantiate = (code: string): Renderer => {
    const Processor = new Function(`${ScriptDsp.link(code)}\nreturn Processor`)()
    return new Processor()
}

describe("ScriptDsp CPU", () => {
    it("8 voices of wavetable + SVF + 2x shaper stay within a quarter of the real-time budget", () => {
        const nanos = measureLoad(instantiate(BenchPatch), 2)
        const load = nanos / BudgetNanosPerFrame
        console.info(`8 voices wavetable+svf+shaper x2: ${nanos.toFixed(0)} ns per frame, ${(nanos / 8).toFixed(0)} ns per voice, ` +
            `${(load * 100).toFixed(1)}% of the ${BudgetNanosPerFrame.toFixed(0)} ns budget at ${SampleRate} Hz`)
        expect(load).toBeLessThan(0.25)
    })
    it("example instruments stay well inside the real-time budget", () => {
        const report: Array<string> = []
        ScriptDsp.examples.forEach(example => {
            const processor = instantiate(example.code)
            Object.assign(processor, {samples: {wavetable: null}})
            const receiver = Reflect.get(processor, "paramChanged").bind(processor)
            ScriptDeclaration.parseParams(example.code).forEach(({label, defaultValue}) => receiver(label, defaultValue))
            const noteOn = Reflect.get(processor, "noteOn").bind(processor)
            ;[36, 40, 43, 48, 52, 55, 60, 64].forEach((pitch, index) => noteOn(pitch, 0.8, 0, index + 1))
            const nanos = measureLoad(processor, 2)
            report.push(`${example.name}: ${nanos.toFixed(0)} ns per frame (${(nanos / BudgetNanosPerFrame * 100).toFixed(1)}%)`)
            expect(nanos / BudgetNanosPerFrame, example.name).toBeLessThan(0.25)
        })
        console.info(`example load with 8 held notes:\n${report.join("\n")}`)
    })
})
