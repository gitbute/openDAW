import {dbToGain} from "@opendaw/lib-dsp"
import {int} from "@opendaw/lib-std"

export type ProbeTest = "frequency" | "harmonics" | "transfer" | "imd" | "dynamics" | "impulse"

export type SignalStep = { readonly levelDb: number, readonly amp: number, readonly duration: number }

export type SweepSegment = {
    readonly kind: "sweep", readonly start: number, readonly duration: number, readonly tail: number
    readonly fromHz: number, readonly toHz: number, readonly levelDb: number, readonly amp: number
}

export type StepsSegment = {
    readonly kind: "steps", readonly start: number, readonly duration: number, readonly hz: number
    readonly ramp: number, readonly steps: ReadonlyArray<SignalStep>
}

export type TwoToneSegment = {
    readonly kind: "twoTone", readonly start: number, readonly duration: number, readonly levelDb: number
    readonly lowHz: number, readonly highHz: number, readonly lowAmp: number, readonly highAmp: number
}

export type ImpulseSegment = { readonly kind: "impulse", readonly start: number, readonly levelDb: number, readonly amp: number }

export type SignalSegment = SweepSegment | StepsSegment | TwoToneSegment | ImpulseSegment

export type ProbeSettings = { readonly sineHz: number, readonly imdLevelDb: number }

export type ProbePlan = { readonly test: ProbeTest, readonly segment: SignalSegment, readonly seconds: number }

export type StepWindow = { readonly levelDb: number, readonly amp: number, readonly startFrame: int, readonly endFrame: int }

export namespace ProbeSignals {
    export const Tests: ReadonlyArray<ProbeTest> = ["frequency", "harmonics", "transfer", "imd", "dynamics", "impulse"]
    export const Lead = 0.05
    export const Fade = 0.005
    export const PreGain = 4.0
    export const MinImpulseTail = 2.0
    export const HarmonicLevels: ReadonlyArray<number> = [-24, -12, -6, 0]
    export const HarmonicStepSeconds = 0.4
    export const HarmonicWindowSeconds = 0.25
    export const TransferLevels: ReadonlyArray<number> = Array.from({length: 19}, (_value, index) => -48 + index * 3)
    export const TransferStepSeconds = 0.12
    export const TransferWindowSeconds = 0.05
    export const ToneHz = 1000
    export const ImdLowHz = 60
    export const ImdHighHz = 7000
    export const ImdWindowSeconds = 0.4
    export const DynamicsSteps: ReadonlyArray<readonly [number, number]> = [[-30, 0.3], [-6, 0.5], [-30, 0.8]]
    export const SweepSeconds = 1.5
    export const SweepTail = 1.0
    export const DefaultSettings: ProbeSettings = {sineHz: 100, imdLevelDb: -6}

    export const isTest = (value: unknown): value is ProbeTest => Tests.some(test => test === value)

    // integer cycles inside the harmonics window, so the harmonic fit is exact
    export const snapHz = (hz: number): number => {
        const resolution = 1 / HarmonicWindowSeconds
        return Math.max(resolution, Math.round(hz / resolution) * resolution)
    }

    const steps = (levels: ReadonlyArray<number>, duration: number): ReadonlyArray<SignalStep> =>
        levels.map(levelDb => ({levelDb, amp: dbToGain(levelDb), duration}))

    const stepsSegment = (hz: number, ramp: number, list: ReadonlyArray<SignalStep>): StepsSegment =>
        ({kind: "steps", start: Lead, duration: list.reduce((sum, {duration}) => sum + duration, 0), hz, ramp, steps: list})

    export const segmentOf = (test: ProbeTest, {sineHz, imdLevelDb}: ProbeSettings): SignalSegment => {
        switch (test) {
            case "frequency":
                return {kind: "sweep", start: Lead, duration: SweepSeconds, tail: SweepTail, fromHz: 16, toHz: 22000, levelDb: -18, amp: dbToGain(-18)}
            case "harmonics":
                return stepsSegment(snapHz(sineHz), 0.002, steps(HarmonicLevels, HarmonicStepSeconds))
            case "transfer":
                return stepsSegment(ToneHz, 0.001, steps(TransferLevels, TransferStepSeconds))
            case "imd": {
                const amp = dbToGain(imdLevelDb)
                return {kind: "twoTone", start: Lead, duration: 0.6, levelDb: imdLevelDb, lowHz: ImdLowHz, highHz: ImdHighHz, lowAmp: amp * 0.8, highAmp: amp * 0.2}
            }
            case "dynamics":
                return stepsSegment(ToneHz, 0.0002, DynamicsSteps.map(([levelDb, duration]) => ({levelDb, amp: dbToGain(levelDb), duration})))
            case "impulse":
                return {kind: "impulse", start: Lead, levelDb: -6, amp: dbToGain(-6)}
        }
    }

    export const secondsOf = (segment: SignalSegment): number => {
        switch (segment.kind) {
            case "sweep":
                return segment.start + segment.duration + segment.tail
            case "impulse":
                return segment.start + MinImpulseTail
            default:
                return segment.start + segment.duration + 0.05
        }
    }

    export const plan = (test: ProbeTest, settings: ProbeSettings = DefaultSettings): ProbePlan => {
        const segment = segmentOf(test, settings)
        return {test, segment, seconds: secondsOf(segment)}
    }

    export const startFrame = (segment: SignalSegment, sampleRate: number): int => Math.round(segment.start * sampleRate)

    // the generator's first non-zero sample: an impulse sounds at once, faded tones one frame later
    export const firstSoundFrame = (segment: SignalSegment, sampleRate: number): int =>
        startFrame(segment, sampleRate) + (segment.kind === "impulse" ? 0 : 1)

    // the last `seconds` of every step, ending where its fade begins
    export const stepWindows = (segment: StepsSegment, sampleRate: number, seconds: number): ReadonlyArray<StepWindow> => {
        const windowFrames = Math.round(seconds * sampleRate)
        let begin = segment.start
        return segment.steps.map(({levelDb, amp, duration}) => {
            begin += duration
            const endFrame = Math.round((begin - Fade) * sampleRate)
            return {levelDb, amp, startFrame: endFrame - windowFrames, endFrame}
        })
    }

    export const PreGainCode = [
        "class Processor {",
        "    process({src, out}, {s0, s1}) {",
        "        const [srcL, srcR] = src",
        "        const [outL, outR] = out",
        `        for (let index = s0; index < s1; index++) {outL[index] = srcL[index] * ${PreGain}; outR[index] = srcR[index] * ${PreGain}}`,
        "    }",
        "}"
    ].join("\n")

    const GeneratorBody = `const fade = (time, duration) => {
    const edge = Math.min(time, duration - time)
    if (edge <= 0) {return 0}
    return edge >= FADE ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * edge / FADE)
}
const stepAmp = (time) => {
    let begin = 0
    let previous = SEGMENT.steps[0].amp
    for (const step of SEGMENT.steps) {
        if (time < begin + step.duration) {
            const into = time - begin
            return into < SEGMENT.ramp ? previous + (step.amp - previous) * into / SEGMENT.ramp : step.amp
        }
        previous = step.amp
        begin += step.duration
    }
    return 0
}
const signalAt = (offset) => {
    if (offset < 0) {return 0}
    const time = offset / sampleRate
    if (SEGMENT.kind === "impulse") {return offset === 0 ? SEGMENT.amp : 0}
    if (time >= SEGMENT.duration) {return 0}
    const envelope = fade(time, SEGMENT.duration)
    if (SEGMENT.kind === "sweep") {
        const span = SEGMENT.duration / Math.log(SEGMENT.toHz / SEGMENT.fromHz)
        return SEGMENT.amp * envelope * Math.sin(2 * Math.PI * SEGMENT.fromHz * span * (Math.exp(time / span) - 1))
    }
    if (SEGMENT.kind === "twoTone") {
        return envelope * (SEGMENT.lowAmp * Math.sin(2 * Math.PI * SEGMENT.lowHz * time)
            + SEGMENT.highAmp * Math.sin(2 * Math.PI * SEGMENT.highHz * time))
    }
    return envelope * stepAmp(time) * Math.sin(2 * Math.PI * SEGMENT.hz * time)
}
class Processor {
    frame = -1
    noteOn(pitch, velocity, cent, id) {if (this.frame < 0) {this.frame = 0}}
    noteOff(id) {}
    reset() {}
    process(output, block) {
        if (this.frame < 0) {return}
        const [left, right] = output
        const startFrame = Math.round(SEGMENT.start * sampleRate)
        for (let index = block.s0; index < block.s1; index++) {
            const value = signalAt(this.frame - startFrame) / PRE_GAIN
            left[index] = value
            right[index] = value
            this.frame++
        }
    }
}`

    export const generatorCode = (segment: SignalSegment): string => [
        `const SEGMENT = ${JSON.stringify(segment)}`,
        `const FADE = ${Fade}`,
        `const PRE_GAIN = ${PreGain}`,
        GeneratorBody
    ].join("\n")
}
