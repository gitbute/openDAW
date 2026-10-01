import {ScriptDspBlock} from "./ScriptDspBlock"

const halfband: ScriptDspBlock = {
    name: "halfband",
    requires: [],
    exports: ["Halfband"],
    doc: String.raw`- new Dsp.Halfband(coefs) [low]: polyphase IIR half-band filter (two allpass chains, elliptic design). Dsp.Halfband.design(count, transition) returns coefficients, Dsp.Halfband.STEEP (10 coefficients, base rate x2, flat to 0.46 x sampleRate) and Dsp.Halfband.FAST (4, x2 to x4). upsample(x) sets .out0 .out1 (two samples at twice the rate), downsample(first, second) returns one sample, reset(). Use one instance per direction and stage.`,
    source: String.raw`
const design = (count, transition) => {
    let k = Math.tan((1 - transition * 2) * Math.PI / 4)
    k *= k
    const root = Math.pow(1 - k * k, 0.25)
    const e = 0.5 * (1 - root) / (1 + root), e4 = e * e * e * e
    const q = e * (1 + e4 * (2 + e4 * (15 + 150 * e4)))
    const order = count * 2 + 1
    const coefs = new Float64Array(count)
    for (let index = 0; index < count; index++) {
        const c = index + 1
        let numerator = 0
        for (let i = 0, sign = 1; i < 100; i++, sign = -sign) {
            const term = Math.pow(q, i * (i + 1)) * Math.sin((i * 2 + 1) * c * Math.PI / order) * sign
            numerator += term
            if (Math.abs(term) < 1e-30) {break}
        }
        numerator *= Math.pow(q, 0.25)
        let denominator = 0.5
        for (let i = 1, sign = -1; i < 100; i++, sign = -sign) {
            const term = Math.pow(q, i * i) * Math.cos(i * 2 * c * Math.PI / order) * sign
            denominator += term
            if (Math.abs(term) < 1e-30) {break}
        }
        const ww = numerator / denominator, wwsq = ww * ww
        const x = Math.sqrt((1 - wwsq * k) * (1 - wwsq / k)) / (1 + wwsq)
        coefs[index] = (1 - x) / (1 + x)
    }
    return coefs
}
Dsp.Halfband = class Halfband {
    static design(count, transition) {return design(Dsp.clamp(count | 0, 1, 32), Dsp.clamp(transition, 0.001, 0.45))}
    constructor(coefs) {
        this.coefs = coefs
        this.x = new Float64Array(coefs.length)
        this.y = new Float64Array(coefs.length)
        this.out0 = 0
        this.out1 = 0
    }
    reset() {
        this.x.fill(0)
        this.y.fill(0)
    }
    #run(even, odd) {
        const coefs = this.coefs, x = this.x, y = this.y, count = coefs.length
        let index = 0
        for (; index + 1 < count; index += 2) {
            const t0 = (even - y[index]) * coefs[index] + x[index]
            x[index] = even
            y[index] = t0
            even = t0
            const t1 = (odd - y[index + 1]) * coefs[index + 1] + x[index + 1]
            x[index + 1] = odd
            y[index + 1] = t1
            odd = t1
        }
        if (index < count) {
            const t0 = (even - y[index]) * coefs[index] + x[index]
            x[index] = even
            y[index] = t0
            even = t0
        }
        this.out0 = even
        this.out1 = odd
    }
    upsample(input) {this.#run(input, input)}
    downsample(first, second) {
        this.#run(second, first)
        return 0.5 * (this.out0 + this.out1)
    }
}
Dsp.Halfband.STEEP = design(10, 0.04)
Dsp.Halfband.FAST = design(4, 0.2)
`
}

const shaper: ScriptDspBlock = {
    name: "shaper",
    requires: ["halfband"],
    exports: ["Shaper"],
    doc: String.raw`- new Dsp.Shaper(type = Dsp.TANH, oversample = 2) [x1 about 25 ns, x2 about 75 ns, x4 about 190 ns]: waveshaper with half-band polyphase IIR oversampling (1, 2 or 4; stopband about -100 dB). Curves: TANH, SOFT (cubic), HARD (clip), FOLD (triangle foldback), SINEFOLD (sin(x pi/2), smooth folding), ASYM (positive soft clip at 1, negative at 0.6: even harmonics). .drive (pre-gain, 1..100), .bias (-1..1, adds even harmonics), .mix 0..1 (dry/wet, phase-aligned), .output (post-gain); DC is removed internally. process(x), processBlock(buffer, s0, s1), setOversample(factor), shape(x) is the bare curve. Shaping the summed mono bus instead of every voice saves CPU.`,
    source: String.raw`
const curve = (type, d) => {
    switch (type) {
        case 1: return d <= -1 ? -1 : d >= 1 ? 1 : 1.5 * d - 0.5 * d * d * d
        case 2: return d < -1 ? -1 : d > 1 ? 1 : d
        case 3: {
            let fold = (d + 1) * 0.25
            fold -= Math.floor(fold)
            return 1 - 4 * Math.abs(fold - 0.5)
        }
        case 4: return Math.sin(d * 1.5707963267948966)
        case 5: {
            const n = d * 1.6666666666666667
            return d >= 0 ? (d >= 3 ? 1 : d * (27 + d * d) / (27 + 9 * d * d)) : (n <= -3 ? -0.6 : 0.6 * n * (27 + n * n) / (27 + 9 * n * n))
        }
        default: return d <= -3 ? -1 : d >= 3 ? 1 : d * (27 + d * d) / (27 + 9 * d * d)
    }
}
Dsp.Shaper = class Shaper {
    constructor(type = Dsp.TANH, oversample = 2) {
        this.type = type
        this.drive = 1
        this.bias = 0
        this.mix = 1
        this.output = 1
        this.factor = 2
        this.up1 = new Dsp.Halfband(Dsp.Halfband.STEEP)
        this.down1 = new Dsp.Halfband(Dsp.Halfband.STEEP)
        this.up2 = new Dsp.Halfband(Dsp.Halfband.FAST)
        this.down2 = new Dsp.Halfband(Dsp.Halfband.FAST)
        this.dcCoef = Math.exp(-Dsp.TAU * 5 / sampleRate)
        this.dcX = 0
        this.dcY = 0
        this.setOversample(oversample)
    }
    setOversample(factor) {this.factor = factor >= 4 ? 4 : factor >= 2 ? 2 : 1}
    shape(x) {return curve(this.type, x * Dsp.clamp(this.drive, 0, 100) + this.bias)}
    process(x) {
        const input = x - x === 0 ? x : 0
        const type = this.type, drive = Dsp.clamp(this.drive, 0, 100), bias = this.bias, mix = Dsp.clamp(this.mix, 0, 1)
        let y
        if (this.factor === 1) {
            y = input + (curve(type, input * drive + bias) - input) * mix
        } else if (this.factor === 2) {
            const up = this.up1
            up.upsample(input + 1e-18)
            const first = up.out0, second = up.out1
            y = this.down1.downsample(first + (curve(type, first * drive + bias) - first) * mix,
                second + (curve(type, second * drive + bias) - second) * mix)
        } else {
            const up1 = this.up1, up2 = this.up2, down2 = this.down2
            up1.upsample(input + 1e-18)
            const later = up1.out1
            up2.upsample(up1.out0)
            let first = up2.out0, second = up2.out1
            const a = down2.downsample(first + (curve(type, first * drive + bias) - first) * mix,
                second + (curve(type, second * drive + bias) - second) * mix)
            up2.upsample(later)
            first = up2.out0
            second = up2.out1
            const b = down2.downsample(first + (curve(type, first * drive + bias) - first) * mix,
                second + (curve(type, second * drive + bias) - second) * mix)
            y = this.down1.downsample(a, b)
        }
        const out = y - this.dcX + this.dcCoef * this.dcY
        this.dcX = y
        this.dcY = out > -1e6 && out < 1e6 ? out + 1e-20 - 1e-20 : 0
        return this.dcY * this.output
    }
    processBlock(buffer, s0, s1) {
        for (let index = s0; index < s1; index++) {buffer[index] = this.process(buffer[index])}
    }
}
`
}

const crusher: ScriptDspBlock = {
    name: "crusher",
    requires: [],
    exports: ["Crusher"],
    doc: String.raw`- new Dsp.Crusher() [very low]: bit reduction and sample-rate reduction (aliasing on purpose). setBits(1..24), setRate(hz) (hold rate, up to sampleRate), .mix 0..1, process(x).`,
    source: String.raw`
Dsp.Crusher = class Crusher {
    constructor() {
        this.step = 0
        this.inc = 1
        this.phase = 1
        this.held = 0
        this.mix = 1
        this.setBits(24)
    }
    setBits(bits) {this.step = 2 / Math.pow(2, Dsp.clamp(bits, 1, 24))}
    setRate(hz) {this.inc = Dsp.clamp(hz / sampleRate, 0.0001, 1)}
    process(x) {
        const input = x - x === 0 ? x : 0
        this.phase += this.inc
        if (this.phase >= 1) {
            this.phase -= Math.floor(this.phase)
            this.held = Math.round(input / this.step) * this.step
        }
        return input + (this.held - input) * this.mix
    }
}
`
}

export const ScriptDspShaperBlocks: ReadonlyArray<ScriptDspBlock> = [halfband, shaper, crusher]
