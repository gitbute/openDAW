import {describe, expect, it} from "vitest"
import {MeasureMath} from "@/agent/analysis/descriptors/dsp/MeasureMath"
import {ProbeMeasure} from "./ProbeMeasure"
import {ProbeSignals, StepsSegment, SweepSegment, TwoToneSegment} from "./ProbeSignals"

// Synthetic input/output pairs with known answers. The input is produced by the real generator code (evaluated
// here like the engine would), so the measurements see exactly what the chain would receive.

const SampleRate = 48_000

type Generator = { noteOn(pitch: number, velocity: number, cent: number, id: number): void, process(output: ReadonlyArray<Float32Array>, block: { s0: number, s1: number }): void }

const generate = (test: Parameters<typeof ProbeSignals.plan>[0], seconds?: number): Float32Array => {
    const plan = ProbeSignals.plan(test)
    const frames = Math.round((seconds ?? plan.seconds) * SampleRate)
    const create = new Function("sampleRate", `${ProbeSignals.generatorCode(plan.segment)}\nreturn Processor`)
    const ProcessorClass = create(SampleRate) as new () => Generator
    const processor = new ProcessorClass()
    const left = new Float32Array(frames)
    const right = new Float32Array(frames)
    processor.noteOn(60, 1, 0, 1)
    for (let s0 = 0; s0 < frames; s0 += 128) {processor.process([left, right], {s0, s1: Math.min(frames, s0 + 128)})}
    return left.map(sample => sample * ProbeSignals.PreGain)
}

const shape = (input: Float32Array, curve: (value: number) => number): Float32Array => input.map(curve)

const onePole = (input: Float32Array, cutoffHz: number): Float32Array => {
    const coefficient = 1 - Math.exp(-2 * Math.PI * cutoffHz / SampleRate)
    let state = 0
    return input.map(sample => state += coefficient * (sample - state))
}

const segmentOf = (test: Parameters<typeof ProbeSignals.plan>[0], kind: string) => {
    const {segment} = ProbeSignals.plan(test)
    if (segment.kind !== kind) {throw new Error(`unexpected ${segment.kind}`)}
    return segment
}

describe("generator", () => {
    it("plays the planned levels exactly and starts one frame after the segment start", () => {
        const input = generate("transfer")
        const segment = segmentOf("transfer", "steps") as StepsSegment
        const windows = ProbeSignals.stepWindows(segment, SampleRate, ProbeSignals.TransferWindowSeconds)
        windows.forEach(({amp, startFrame, endFrame}) => {
            let peak = 0
            for (let index = startFrame; index < endFrame; index++) {peak = Math.max(peak, Math.abs(input[index]))}
            expect(peak / amp).toBeCloseTo(1, 4)
        })
        expect(input[ProbeSignals.startFrame(segment, SampleRate)]).toBe(0)
        expect(ProbeMeasure.alignment(input, ProbeSignals.firstSoundFrame(segment, SampleRate), 100)).toBe(0)
        const impulse = generate("impulse", 0.2)
        expect(impulse[Math.round(ProbeSignals.Lead * SampleRate)]).toBeCloseTo(0.5012, 4)
        expect(impulse.reduce((count, sample) => sample !== 0 ? count + 1 : count, 0)).toBe(1)
    })
})

describe("frequency", () => {
    const segment = segmentOf("frequency", "sweep") as SweepSegment
    const from = ProbeSignals.startFrame(segment, SampleRate)
    const to = from + Math.round((segment.duration + segment.tail) * SampleRate)
    const input = generate("frequency")
    it("is flat for a gain stage", () => {
        const result = ProbeMeasure.frequency(input, input.map(sample => sample * 0.5), SampleRate, from, to)
        result.bands.forEach(({db}) => expect(db).toBeCloseTo(-6.02, 1))
        expect(result.minus3dbHighHz).toBeUndefined()
        expect(result.minus3dbLowHz).toBeUndefined()
    })
    it("finds -3 dB at 1 kHz and -6 dB/oct above it for a one-pole lowpass", () => {
        const result = ProbeMeasure.frequency(input, onePole(input, 1000), SampleRate, from, to)
        expect(result.minus3dbHighHz).toBeGreaterThan(940)
        expect(result.minus3dbHighHz).toBeLessThan(1060)
        expect(result.highSlopeDbPerOct).toBeCloseTo(10 * Math.log10(5 / 17), 0)
        expect(result.bands[0].db).toBeCloseTo(0, 1)
        expect(result.gainAt1kDb).toBeCloseTo(-3, 0)
        expect(result.passbandDb).toBeCloseTo(0, 1)
        expect(result.peak).toBeUndefined()
        expect(result.dip).toBeUndefined()
    })
    it("reports no roll-off for comb filtering (dry plus a 30 ms echo)", () => {
        const echo = Math.round(0.03 * SampleRate)
        const result = ProbeMeasure.frequency(input, input.map((sample, index) => sample + 0.7 * (input[index - echo] ?? 0)), SampleRate, from, to)
        expect(result.minus3dbLowHz).toBeUndefined()
        expect(result.minus3dbHighHz).toBeUndefined()
        expect(result.passbandDb).toBeGreaterThan(0)
    })
})

describe("harmonics", () => {
    const segment = segmentOf("harmonics", "steps") as StepsSegment
    const windows = ProbeSignals.stepWindows(segment, SampleRate, ProbeSignals.HarmonicWindowSeconds)
    const input = generate("harmonics")
    it("measures a pure second harmonic exactly (x + 0.1 x^2)", () => {
        const result = ProbeMeasure.harmonics(input, shape(input, value => value + 0.1 * value * value), SampleRate, segment.hz, windows)
        const loudest = result.levels[3]
        expect(loudest.levelDb).toBe(0)
        expect(loudest.thdPercent).toBeCloseTo(5, 2)
        expect(loudest.harmonicsDb[0]).toBeCloseTo(-26.02, 1)
        expect(loudest.oddDb).toBe(MeasureMath.FloorDb)
        expect(result.character).toBe("even")
        expect(result.levels[0].thdPercent).toBeCloseTo(5 * Math.pow(10, -24 / 20), 2)
    })
    it("measures a pure third harmonic exactly (x - 0.1 x^3)", () => {
        const result = ProbeMeasure.harmonics(input, shape(input, value => value - 0.1 * value ** 3), SampleRate, segment.hz, windows)
        const loudest = result.levels[3]
        expect(loudest.thdPercent).toBeCloseTo(0.025 / 0.925 * 100, 2)
        expect(loudest.gainDb).toBeCloseTo(20 * Math.log10(0.925), 2)
        expect(loudest.residualDb).toBeLessThan(-100)
        expect(result.character).toBe("odd")
    })
    it("shows tanh saturation as odd harmonics growing with level", () => {
        const result = ProbeMeasure.harmonics(input, shape(input, value => Math.tanh(2 * value)), SampleRate, segment.hz, windows)
        const thd = result.levels.map(level => level.thdPercent)
        expect(thd[0]).toBeLessThan(thd[1])
        expect(thd[1]).toBeLessThan(thd[2])
        expect(thd[2]).toBeLessThan(thd[3])
        expect(result.levels[3].evenDb).toBeLessThan(-100)
        expect(result.character).toBe("odd")
        const clean = ProbeMeasure.harmonics(input, input, SampleRate, segment.hz, windows)
        expect(clean.character).toBe("clean")
        expect(clean.levels[3].gainDb).toBeCloseTo(0, 3)
    })
    it("reports only THD for clean levels and no floor values", () => {
        const clean = ProbeMeasure.toJson({test: "harmonics", result: ProbeMeasure.harmonics(input, input, SampleRate, segment.hz, windows)})
        expect(clean.levels).toEqual([-24, -12, -6, 0].map(inDb => ({inDb, gainDb: 0, thdPct: 0})))
        const even = ProbeMeasure.toJson({test: "harmonics",
            result: ProbeMeasure.harmonics(input, shape(input, value => value + 0.1 * value * value), SampleRate, segment.hz, windows)})
        const levels = Array.isArray(even.levels) ? even.levels : []
        expect(levels[3]).toMatchObject({inDb: 0, thdPct: 5, evenDb: -26})
        expect(levels[3]).not.toHaveProperty("oddDb")
        expect(levels[3]).toHaveProperty("h2toH10Db", [-26, null, null, null, null, null, null, null, null])
    })
})

describe("transfer", () => {
    const segment = segmentOf("transfer", "steps") as StepsSegment
    const windows = ProbeSignals.stepWindows(segment, SampleRate, ProbeSignals.TransferWindowSeconds)
    const input = generate("transfer")
    it("finds the ceiling of a hard clip at -6 dBFS", () => {
        const result = ProbeMeasure.transfer(input, shape(input, value => Math.max(-0.5, Math.min(0.5, value))), windows)
        expect(result.ceilingDb).toBeCloseTo(-6.02, 1)
        expect(result.gainDb).toBeCloseTo(0, 2)
        expect(result.compressionStartDb).toBeGreaterThanOrEqual(-6)
        expect(result.compressionStartDb).toBeLessThanOrEqual(3)
        expect(result.ratioAtTop).toBeGreaterThan(3)
    })
    it("reads threshold and ratio of an ideal 4:1 compressor at -20 dBFS", () => {
        const output = new Float32Array(input.length)
        windows.forEach(({levelDb}, index) => {
            const begin = Math.round((segment.start + index * ProbeSignals.TransferStepSeconds) * SampleRate)
            const end = Math.round((segment.start + (index + 1) * ProbeSignals.TransferStepSeconds) * SampleRate)
            const gain = levelDb > -20 ? Math.pow(10, -(levelDb + 20) * 0.75 / 20) : 1
            for (let frame = begin; frame < end; frame++) {output[frame] = input[frame] * gain}
        })
        const result = ProbeMeasure.transfer(input, output, windows)
        expect(result.compressionStartDb).toBe(-18)
        expect(result.ratioAtTop).toBeCloseTo(4, 1)
        expect(result.steps[result.steps.length - 1].outDb).toBeCloseTo(-20 + 26 / 4, 1)
    })
    it("is unity for a gain stage and sees a gate", () => {
        const half = ProbeMeasure.transfer(input, input.map(sample => sample * 0.5), windows)
        expect(half.gainDb).toBeCloseTo(-6.02, 2)
        expect(half.compressionStartDb).toBeUndefined()
        expect(half.ratioAtTop).toBeCloseTo(1, 2)
        expect(half.ceilingDb).toBeCloseTo(0, 1)
        const gated = ProbeMeasure.transfer(input, input.map(sample => Math.abs(sample) < 0.01 ? sample * 0.01 : sample), windows)
        expect(gated.gateBelowDb).toBe(-42)
    })
    it("reports a closed gate as null levels, not floor values", () => {
        const output = input.slice()
        windows.forEach(({levelDb}, index) => {
            const begin = Math.round((segment.start + index * ProbeSignals.TransferStepSeconds) * SampleRate)
            if (levelDb < -40) {output.fill(0, begin, begin + Math.round(ProbeSignals.TransferStepSeconds * SampleRate))}
        })
        const result = ProbeMeasure.transfer(input, output, windows)
        expect(result.steps.slice(0, 3).map(({outDb, outPeakDb, gainDb}) => [outDb, outPeakDb, gainDb])).toEqual([[null, null, null], [null, null, null], [null, null, null]])
        expect(result.gateBelowDb).toBe(-42)
        const json = ProbeMeasure.toJson({test: "transfer", result})
        expect(Array.isArray(json.outDb) && json.outDb.slice(0, 4)).toEqual([null, null, null, -39])
        expect(json.gainDb).toBe(0)
        expect(json.outPeakDb).toBeUndefined()
    })
})

describe("imd", () => {
    it("measures SMPTE IMD of x + 0.1 x^2 as 0.1 * the low tone amplitude", () => {
        const segment = segmentOf("imd", "twoTone") as TwoToneSegment
        const input = generate("imd")
        const to = ProbeSignals.startFrame(segment, SampleRate) + Math.round((segment.duration - ProbeSignals.Fade) * SampleRate)
        const from = to - Math.round(ProbeSignals.ImdWindowSeconds * SampleRate)
        const result = ProbeMeasure.imd(input, shape(input, value => value + 0.1 * value * value), SampleRate, segment.levelDb,
            segment.lowHz, segment.highHz, from, to)
        expect(result.imdPercent).toBeCloseTo(Math.SQRT2 * 0.1 * segment.lowAmp * 100, 2)
        expect(result.products.slice(0, 2).map(({hz}) => hz).sort()).toEqual([6940, 7060])
        expect(result.highGainDb).toBeCloseTo(0, 2)
        const clean = ProbeMeasure.imd(input, input, SampleRate, segment.levelDb, segment.lowHz, segment.highHz, from, to)
        expect(clean.imdPercent).toBeLessThan(0.001)
    })
})

describe("dynamics", () => {
    const segment = segmentOf("dynamics", "steps") as StepsSegment
    const input = generate("dynamics")
    // gain reduction in dB follows a one-pole toward -12 dB above -20 dBFS (10 ms attack, 100 ms release)
    const compress = (attackMs: number, releaseMs: number, latency: number = 0): Float32Array => {
        const start = ProbeSignals.startFrame(segment, SampleRate)
        const rise = start + Math.round(0.3 * SampleRate)
        const fall = rise + Math.round(0.5 * SampleRate)
        const attack = Math.exp(-1000 / (attackMs * SampleRate))
        const release = Math.exp(-1000 / (releaseMs * SampleRate))
        let reduction = 0
        const output = new Float32Array(input.length)
        for (let frame = 0; frame < input.length; frame++) {
            const target = frame >= rise && frame < fall ? -12 : 0
            reduction = target < reduction ? target + (reduction - target) * attack : target + (reduction - target) * release
            if (frame + latency < output.length) {output[frame + latency] = input[frame] * Math.pow(10, reduction / 20)}
        }
        return output
    }
    it("measures 10 ms attack, 100 ms release and 12 dB reduction", () => {
        const result = ProbeMeasure.dynamics(input, compress(10, 100), SampleRate, segment, 0)
        expect(result.gainReductionDb).toBeCloseTo(12, 1)
        expect(result.attackMs).toBeGreaterThan(9)
        expect(result.attackMs).toBeLessThan(11.5)
        expect(result.releaseMs).toBeGreaterThan(97)
        expect(result.releaseMs).toBeLessThan(104)
        expect(result.latencyMs).toBeCloseTo(0, 1)
    })
    it("compensates latency and flags a release longer than the window", () => {
        const result = ProbeMeasure.dynamics(input, compress(5, 2000, 240), SampleRate, segment, 0)
        expect(result.latencyMs).toBeCloseTo(5, 0)
        expect(result.attackMs).toBeGreaterThan(4)
        expect(result.attackMs).toBeLessThan(6.5)
        expect(result.releaseMs, "a lower bound: the whole quiet window").toBeGreaterThan(780)
        expect(result.releaseIncomplete).toBe(true)
        expect(ProbeMeasure.toJson({test: "dynamics", result})).toMatchObject({releaseMs: 794, releaseIncomplete: true})
    })
    it("reports no attack or release for a linear chain", () => {
        const result = ProbeMeasure.dynamics(input, input.map(sample => sample * 0.5), SampleRate, segment, 0)
        expect(result.gainReductionDb).toBeCloseTo(0, 2)
        expect(result.gainLowDb).toBeCloseTo(-6.02, 1)
        expect(result.attackMs).toBeUndefined()
        expect(result.releaseIncomplete).toBe(false)
    })
})

describe("impulse", () => {
    const frames = 4 * SampleRate
    const impulseFrame = 2400
    const dry = (): Float32Array => {
        const channel = new Float32Array(frames)
        channel[impulseFrame] = 0.5
        return channel
    }
    it("estimates RT60 of an exponentially decaying noise tail", () => {
        let seed = 7
        const random = (): number => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            return seed / 0x7fffffff * 2 - 1
        }
        const rt60 = 0.8
        const predelay = Math.round(0.02 * SampleRate)
        const left = new Float32Array(frames)
        const right = new Float32Array(frames)
        for (let index = impulseFrame + predelay; index < frames; index++) {
            const decay = Math.pow(10, -3 * (index - impulseFrame - predelay) / (rt60 * SampleRate))
            left[index] = 0.1 * random() * decay
            right[index] = 0.1 * random() * decay
        }
        const result = ProbeMeasure.impulse([dry(), dry()], [left, right], SampleRate, impulseFrame)
        expect(result.rt60Ms).toBeGreaterThan(760)
        expect(result.rt60Ms).toBeLessThan(840)
        expect(result.rt60Fit).toBe("T30")
        expect(result.firstArrivalMs).toBeCloseTo(20, 0)
        expect(result.wetOnsetMs).toBeLessThan(25)
        expect(result.energyLeftDb.find(({ms}) => ms === 500)?.db).toBeLessThan(-30)
    })
    it("finds the echoes of a feedback delay and their spacing", () => {
        const output = new Float32Array(frames)
        for (let echo = 0; echo < 8; echo++) {output[impulseFrame + echo * Math.round(0.25 * SampleRate)] = 0.5 * Math.pow(0.5, echo)}
        const result = ProbeMeasure.impulse([dry()], [output], SampleRate, impulseFrame)
        expect(result.echoesMs.slice(0, 4)).toEqual([0, 250, 500, 750])
        expect(result.echoSpacingMs).toBe(250)
        expect(result.firstArrivalMs).toBe(0)
        expect(result.wetOnsetMs).toBe(250)
        expect(result.rt60Ms).toBeGreaterThan(2000)
        expect(result.rt60Ms).toBeLessThan(3000)
    })
    it("reports an instant decay and unity energy for a dry chain", () => {
        const result = ProbeMeasure.impulse([dry()], [dry()], SampleRate, impulseFrame)
        expect(result.rt60Ms).toBeLessThan(1)
        expect(result.energyGainDb).toBeCloseTo(0, 3)
        expect(result.wetOnsetMs).toBeUndefined()
        expect(result.echoesMs).toEqual([0])
    })
})
