import {ScriptDspBlock} from "./ScriptDspBlock"

const svf: ScriptDspBlock = {
    name: "svf",
    requires: [],
    exports: ["Svf"],
    doc: String.raw`- new Dsp.Svf(mode = Dsp.LP) [about 6 ns, setParams about 40 ns]: zero-delay-feedback (TPT) state variable filter, 12 dB/oct, stable under audio-rate cutoff modulation (call setParams per sample if needed). setParams(cutoffHz, q) (cutoff 10..0.49 x sampleRate, q 0.05..50, 0.707 = Butterworth, 5-20 resonant), .mode LP BP (unity peak) HP NOTCH PEAK ALLPASS, process(x) returns the selected mode and sets .lp .bp .hp, processBlock(buffer, s0, s1) in place, reset(). Cascade two for 24 dB/oct.`,
    source: String.raw`
Dsp.Svf = class Svf {
    constructor(mode = Dsp.LP) {
        this.mode = mode
        this.ic1 = 0
        this.ic2 = 0
        this.a1 = 0
        this.a2 = 0
        this.a3 = 0
        this.k = 1
        this.lp = 0
        this.bp = 0
        this.hp = 0
        this.setParams(1000, 0.707)
    }
    setParams(cutoff, q) {
        const hz = Dsp.clamp(cutoff, 10, sampleRate * 0.49)
        const g = Math.tan(Math.PI * hz / sampleRate), k = 1 / Dsp.clamp(q, 0.05, 50)
        const a1 = 1 / (1 + g * (g + k))
        this.k = k
        this.a1 = a1
        this.a2 = g * a1
        this.a3 = g * this.a2
    }
    reset() {
        this.ic1 = 0
        this.ic2 = 0
    }
    process(x) {
        const input = x - x === 0 ? x : 0
        const v3 = input - this.ic2
        const v1 = this.a1 * this.ic1 + this.a2 * v3
        const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
        const ic1 = 2 * v1 - this.ic1, ic2 = 2 * v2 - this.ic2
        if (ic1 > -1e9 && ic1 < 1e9 && ic2 > -1e9 && ic2 < 1e9) {
            this.ic1 = ic1 + 1e-20 - 1e-20
            this.ic2 = ic2 + 1e-20 - 1e-20
        } else {
            this.ic1 = 0
            this.ic2 = 0
        }
        const k = this.k, hp = input - k * v1 - v2
        this.lp = v2
        this.bp = v1
        this.hp = hp
        switch (this.mode) {
            case 1: return k * v1
            case 2: return hp
            case 3: return input - k * v1
            case 4: return v2 - hp
            case 5: return input - 2 * k * v1
            default: return v2
        }
    }
    processBlock(buffer, s0, s1) {
        for (let index = s0; index < s1; index++) {buffer[index] = this.process(buffer[index])}
    }
}
`
}

const ladder: ScriptDspBlock = {
    name: "ladder",
    requires: [],
    exports: ["Ladder"],
    doc: String.raw`- new Dsp.Ladder() [about 50 ns, setParams about 40 ns]: zero-delay-feedback 4-pole (24 dB/oct) transistor ladder low-pass with a saturating input stage, self-oscillates near resonance 1. setParams(cutoffHz, resonance, drive = 1) (cutoff 10..0.45 x sampleRate, resonance 0..1.1, drive 0.1..50: more drive = louder and dirtier), .compensation 0..1 (default 0.5) restores bass lost to resonance, process(x) returns LP4 and sets .lp2, processBlock(buffer, s0, s1), reset().`,
    source: String.raw`
Dsp.Ladder = class Ladder {
    constructor() {
        this.s1 = 0
        this.s2 = 0
        this.s3 = 0
        this.s4 = 0
        this.G = 0
        this.G2 = 0
        this.G3 = 0
        this.G4 = 0
        this.k = 0
        this.drive = 1
        this.compensation = 0.5
        this.lp2 = 0
        this.setParams(1000, 0, 1)
    }
    setParams(cutoff, resonance, drive = 1) {
        const hz = Dsp.clamp(cutoff, 10, sampleRate * 0.45)
        const g = Math.tan(Math.PI * hz / sampleRate), G = g / (1 + g)
        this.G = G
        this.G2 = G * G
        this.G3 = this.G2 * G
        this.G4 = this.G3 * G
        this.k = 4 * Dsp.clamp(resonance, 0, 1.1)
        this.drive = Dsp.clamp(drive, 0.1, 50)
    }
    reset() {this.s1 = this.s2 = this.s3 = this.s4 = 0}
    process(x) {
        const input = x - x === 0 ? x : 0
        const G = this.G, k = this.k, s1 = this.s1, s2 = this.s2, s3 = this.s3, s4 = this.s4
        const feedback = (1 - G) * (this.G3 * s1 + this.G2 * s2 + G * s3 + s4)
        const u = Dsp.tanh((input * this.drive * (1 + this.compensation * k) - k * feedback) / (1 + k * this.G4))
        let v = (u - s1) * G
        const y1 = v + s1
        const n1 = y1 + v
        v = (y1 - s2) * G
        const y2 = v + s2
        const n2 = y2 + v
        v = (y2 - s3) * G
        const y3 = v + s3
        const n3 = y3 + v
        v = (y3 - s4) * G
        const y4 = v + s4
        const n4 = y4 + v
        if (n4 > -1e6 && n4 < 1e6 && n1 > -1e6 && n1 < 1e6) {
            this.s1 = n1 + 1e-20 - 1e-20
            this.s2 = n2 + 1e-20 - 1e-20
            this.s3 = n3 + 1e-20 - 1e-20
            this.s4 = n4 + 1e-20 - 1e-20
        } else {
            this.reset()
        }
        this.lp2 = y2
        return y4
    }
    processBlock(buffer, s0, s1) {
        for (let index = s0; index < s1; index++) {buffer[index] = this.process(buffer[index])}
    }
}
`
}

const comb: ScriptDspBlock = {
    name: "comb",
    requires: [],
    exports: ["Comb"],
    doc: String.raw`- new Dsp.Comb(maxSeconds = 0.05) [about 30 ns]: fractional (cubic Hermite) delay comb, tunable to pitch. setFrequency(hz) (resonates at hz and its harmonics, up to sampleRate/3) or setDelay(samples), .feedback -0.999..0.999 (negative = odd harmonics, an octave down), .feedforward (FIR comb amount), .blend (direct path, default 1), .damping 0..0.99 one-pole low-pass in the loop (darker decay), process(x), reset(). High feedback raises the level (about 1/(1-|feedback|)).`,
    source: String.raw`
Dsp.Comb = class Comb {
    constructor(maxSeconds = 0.05) {
        let size = 64
        const needed = Math.ceil(Dsp.clamp(maxSeconds, 0.001, 4) * sampleRate) + 8
        while (size < needed) {size <<= 1}
        this.buffer = new Float32Array(size)
        this.mask = size - 1
        this.write = 0
        this.delay = Math.min(100, size - 8)
        this.feedback = 0
        this.feedforward = 0
        this.blend = 1
        this.damping = 0
        this.lowpass = 0
    }
    setDelay(samples) {this.delay = Dsp.clamp(samples, 3, this.buffer.length - 8)}
    setFrequency(hz) {this.setDelay(sampleRate / Dsp.clamp(hz, 1, sampleRate / 3))}
    reset() {
        this.buffer.fill(0)
        this.lowpass = 0
    }
    process(x) {
        const input = x - x === 0 ? x : 0
        const buffer = this.buffer, mask = this.mask
        const read = this.write - this.delay, base = Math.floor(read), t = read - base
        const ym1 = buffer[(base - 1) & mask], y0 = buffer[base & mask], y1 = buffer[(base + 1) & mask], y2 = buffer[(base + 2) & mask]
        const c1 = 0.5 * (y1 - ym1)
        const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2
        const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1)
        const delayed = ((c3 * t + c2) * t + c1) * t + y0
        const damping = Dsp.clamp(this.damping, 0, 0.99)
        this.lowpass = delayed + (this.lowpass - delayed) * damping + 1e-20 - 1e-20
        let v = input + Dsp.clamp(this.feedback, -0.999, 0.999) * this.lowpass
        if (!(v > -1e4 && v < 1e4)) {v = 0}
        buffer[this.write] = v + 1e-20 - 1e-20
        this.write = (this.write + 1) & mask
        return this.blend * v + this.feedforward * delayed
    }
}
`
}

const formant: ScriptDspBlock = {
    name: "formant",
    requires: [],
    exports: ["Formant"],
    doc: String.raw`- new Dsp.Formant() [about 85 ns]: vowel filter, 5 parallel band-passes with bass-voice formants. setVowel(vowel, shift = 0, width = 1): vowel 0..4 = a e i o u (fractional morphs, log-frequency interpolation), shift in semitones (-24..24) moves all formants, width 0.25..4 scales bandwidths; changes are applied at most every 16 samples, so calling it per sample from an LFO is fine. .mix 0..1 (wet), process(x), reset(). Feed it a bright source (saw, wavetable, distortion) for talking/growl basses.`,
    source: String.raw`
const VOWELS = [
    [600, 1040, 2250, 2450, 2750, 0, -7, -9, -9, -20, 60, 70, 110, 120, 130],
    [400, 1620, 2400, 2800, 3100, 0, -12, -9, -12, -18, 40, 80, 100, 120, 120],
    [250, 1750, 2600, 3050, 3340, 0, -30, -16, -22, -28, 60, 90, 100, 120, 120],
    [400, 750, 2400, 2600, 2900, 0, -11, -21, -20, -40, 40, 80, 100, 120, 120],
    [350, 600, 2400, 2675, 2950, 0, -20, -32, -28, -36, 40, 80, 100, 120, 120]
]
Dsp.Formant = class Formant {
    constructor() {
        this.ic1 = new Float64Array(5)
        this.ic2 = new Float64Array(5)
        this.a1 = new Float64Array(5)
        this.a2 = new Float64Array(5)
        this.a3 = new Float64Array(5)
        this.weight = new Float64Array(5)
        this.vowel = 0
        this.shift = 0
        this.width = 1
        this.mix = 1
        this.dirty = true
        this.countdown = 0
    }
    setVowel(vowel, shift = 0, width = 1) {
        const nextVowel = Dsp.clamp(vowel, 0, 4), nextShift = Dsp.clamp(shift, -24, 24), nextWidth = Dsp.clamp(width, 0.25, 4)
        if (nextVowel === this.vowel && nextShift === this.shift && nextWidth === this.width) {return}
        this.vowel = nextVowel
        this.shift = nextShift
        this.width = nextWidth
        this.dirty = true
    }
    reset() {
        this.ic1.fill(0)
        this.ic2.fill(0)
    }
    #update() {
        const from = Math.min(3, Math.floor(this.vowel)), amount = this.vowel - from
        const first = VOWELS[from], second = VOWELS[from + 1], ratio = Math.pow(2, this.shift / 12)
        for (let band = 0; band < 5; band++) {
            const center = Dsp.clamp(Math.exp(Dsp.lerp(Math.log(first[band]), Math.log(second[band]), amount)) * ratio, 40, sampleRate * 0.45)
            const bandwidth = Math.max(20, Dsp.lerp(first[band + 10], second[band + 10], amount) * this.width * 1.5)
            const g = Math.tan(Math.PI * center / sampleRate), k = bandwidth / center
            const a1 = 1 / (1 + g * (g + k))
            this.a1[band] = a1
            this.a2[band] = g * a1
            this.a3[band] = g * g * a1
            this.weight[band] = k * Dsp.dbToGain(Dsp.lerp(first[band + 5], second[band + 5], amount)) * 3
        }
    }
    process(x) {
        if (this.countdown > 0) {this.countdown--}
        if (this.dirty && this.countdown === 0) {
            this.#update()
            this.dirty = false
            this.countdown = 16
        }
        const input = x - x === 0 ? x : 0
        const ic1 = this.ic1, ic2 = this.ic2, a1 = this.a1, a2 = this.a2, a3 = this.a3, weight = this.weight
        let sum = 0
        for (let band = 0; band < 5; band++) {
            const s1 = ic1[band], s2 = ic2[band]
            const v3 = input - s2
            const v1 = a1[band] * s1 + a2[band] * v3
            const v2 = s2 + a2[band] * s1 + a3[band] * v3
            ic1[band] = 2 * v1 - s1 + 1e-20 - 1e-20
            ic2[band] = 2 * v2 - s2 + 1e-20 - 1e-20
            sum += weight[band] * v1
        }
        if (!(sum > -1e6 && sum < 1e6)) {
            this.reset()
            sum = 0
        }
        return input + (sum - input) * this.mix
    }
}
`
}

export const ScriptDspFilterBlocks: ReadonlyArray<ScriptDspBlock> = [svf, ladder, comb, formant]
