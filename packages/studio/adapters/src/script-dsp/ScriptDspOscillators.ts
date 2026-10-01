import {ScriptDspBlock} from "./ScriptDspBlock"

const osc: ScriptDspBlock = {
    name: "osc",
    requires: [],
    exports: ["Osc"],
    doc: String.raw`- new Dsp.Osc(shape = Dsp.SAW) [about 5-15 ns, more for high notes]: band-limited SINE SAW SQUARE PULSE TRIANGLE (32-tap Kaiser-windowed sinc BLEP/BLAMP, aliasing below -85 dB under 20 kHz; output is 16 samples late). setFrequency(hz) (0..0.45 x sampleRate), setShape(shape) and setWidth(0.01..0.99) (pulse width; PULSE is DC-free, so narrow pulses peak above 1) are click-free, next(syncOffset) returns -1..1, reset(phase = 0) click-free phase reset. Hard sync: master.advance() (phase only, cheap) then slave.next(master.syncOut); .syncOut is >= 0 (fraction of a sample ago) when the oscillator wrapped this sample, else -1.`,
    source: String.raw`
const ZC = 16, RES = 64, TAPS = 32, MASK = 31
let STEP = null, RAMP = null
const buildTables = () => {
    const length = TAPS * RES + 1
    const bessel = x => {
        let sum = 1, term = 1
        for (let k = 1; k < 64; k++) {
            term *= (x / (2 * k)) * (x / (2 * k))
            sum += term
            if (term < 1e-17 * sum) {break}
        }
        return sum
    }
    const beta = 9, norm = bessel(beta)
    const impulse = new Float64Array(length)
    for (let index = 0; index < length; index++) {
        const t = index / RES - ZC
        const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
        const ratio = t / ZC
        impulse[index] = sinc * bessel(beta * Math.sqrt(Math.max(0, 1 - ratio * ratio))) / norm
    }
    STEP = new Float64Array(length + 1)
    RAMP = new Float64Array(length + 1)
    let sum = 0
    for (let index = 1; index < length; index++) {
        sum += (impulse[index - 1] + impulse[index]) * 0.5
        STEP[index] = sum
    }
    for (let index = 0; index < length; index++) {STEP[index] /= sum}
    const half = (length - 1) / 2
    for (let index = 0; index <= half; index++) {
        const symmetric = (STEP[index] + 1 - STEP[length - 1 - index]) * 0.5
        STEP[index] = symmetric
        STEP[length - 1 - index] = 1 - symmetric
    }
    let area = 0
    for (let index = 1; index < length; index++) {
        area += (STEP[index - 1] + STEP[index]) * 0.5 / RES
        RAMP[index] = area
    }
    STEP[length] = STEP[length - 1]
    RAMP[length] = RAMP[length - 1]
}
Dsp.Osc = class Osc {
    constructor(shape = Dsp.SAW) {
        if (STEP === null) {buildTables()}
        this.shape = shape
        this.phase = 0
        this.inc = 0
        this.width = 0.5
        this.ring = new Float64Array(TAPS)
        this.pos = 0
        this.syncOut = -1
    }
    setFrequency(hz) {
        const inc = hz / sampleRate
        this.inc = inc > 0 ? (inc < 0.45 ? inc : 0.45) : 0
    }
    setShape(shape) {
        if (shape === this.shape) {return}
        const before = this.#naive(this.phase), slope = this.#slope(this.phase)
        this.shape = shape
        this.#blep(0.999, this.#naive(this.phase) - before)
        this.#blamp(0.999, this.#slope(this.phase) - slope)
    }
    setWidth(width) {
        const clamped = Dsp.clamp(width, 0.01, 0.99)
        if (clamped === this.width) {return}
        const before = this.#naive(this.phase)
        this.width = clamped
        if (this.shape === 4) {this.#blep(0.999, this.#naive(this.phase) - before)}
    }
    reset(phase = 0) {
        const target = Dsp.clamp(phase - Math.floor(phase), 0, 0.999999)
        this.#jump(this.phase, target, 0.999)
        this.phase = target
    }
    advance() {
        let phase = this.phase + this.inc
        this.syncOut = -1
        if (phase >= 1) {
            phase -= 1
            this.syncOut = this.inc > 0 ? Math.min(phase / this.inc, 0.999) : 0
        }
        this.phase = phase
    }
    next(sync) {
        const inc = this.inc, previous = this.phase
        let phase
        this.syncOut = -1
        if (sync >= 0 && sync < 1) {
            const atEvent = previous + inc * (1 - sync)
            this.#events(previous, atEvent, sync)
            if (atEvent >= 1) {this.syncOut = Math.min(sync + (atEvent - 1) / inc, 0.999)}
            this.#jump(atEvent >= 1 ? atEvent - 1 : atEvent, 0, sync)
            phase = inc * sync
            this.#events(0, phase, 0)
        } else {
            phase = previous + inc
            this.#events(previous, phase, 0)
            if (phase >= 1) {
                phase -= 1
                this.syncOut = Math.min(phase / inc, 0.999)
            }
        }
        this.phase = phase
        const ring = this.ring, pos = this.pos
        ring[(pos + ZC) & MASK] += this.#naive(phase)
        const out = ring[pos]
        ring[pos] = 0
        this.pos = (pos + 1) & MASK
        return out
    }
    #naive(phase) {
        switch (this.shape) {
            case 0: return Math.sin(6.283185307179586 * phase)
            case 1: return 2 * phase - 1
            case 2: return phase < 0.5 ? 1 : -1
            case 3: return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase
            case 4: return (phase < this.width ? 1 : -1) - (2 * this.width - 1)
            default: return 0
        }
    }
    #slope(phase) {
        switch (this.shape) {
            case 0: return 6.283185307179586 * this.inc * Math.cos(6.283185307179586 * phase)
            case 1: return 2 * this.inc
            case 3: return phase < 0.5 ? 4 * this.inc : -4 * this.inc
            default: return 0
        }
    }
    #jump(from, to, offset) {
        const step = this.#naive(to) - this.#naive(from)
        if (step !== 0) {this.#blep(offset, step)}
        if (this.shape === 0 || this.shape === 3) {
            const bend = this.#slope(to) - this.#slope(from)
            if (bend !== 0) {this.#blamp(offset, bend)}
        }
    }
    #events(from, to, end) {
        const inc = this.inc
        if (inc <= 0) {return}
        switch (this.shape) {
            case 1:
                if (from < 1 && to >= 1) {this.#blep(end + (to - 1) / inc, -2)}
                break
            case 2:
            case 4: {
                const width = this.shape === 2 ? 0.5 : this.width
                if (from < width && to >= width) {this.#blep(end + (to - width) / inc, -2)}
                if (from < 1 && to >= 1) {this.#blep(end + (to - 1) / inc, 2)}
                if (from < 1 + width && to >= 1 + width) {this.#blep(end + (to - 1 - width) / inc, -2)}
                break
            }
            case 3: {
                const bend = 8 * inc
                if (from < 0.5 && to >= 0.5) {this.#blamp(end + (to - 0.5) / inc, -bend)}
                if (from < 1 && to >= 1) {this.#blamp(end + (to - 1) / inc, bend)}
                if (from < 1.5 && to >= 1.5) {this.#blamp(end + (to - 1.5) / inc, -bend)}
                break
            }
        }
    }
    #blep(offset, height) {
        const d = offset > 0 ? (offset < 0.999 ? offset : 0.999) : 0
        const position = d * RES, base = position | 0, frac = position - base
        const ring = this.ring, pos = this.pos
        for (let k = 0; k < TAPS; k++) {
            const index = k * RES + base
            let value = STEP[index] + (STEP[index + 1] - STEP[index]) * frac
            if (k >= ZC) {value -= 1}
            ring[(pos + k) & MASK] += height * value
        }
    }
    #blamp(offset, height) {
        const d = offset > 0 ? (offset < 0.999 ? offset : 0.999) : 0
        const position = d * RES, base = position | 0, frac = position - base
        const ring = this.ring, pos = this.pos
        for (let k = 0; k < TAPS; k++) {
            const index = k * RES + base
            let value = RAMP[index] + (RAMP[index + 1] - RAMP[index]) * frac
            if (k >= ZC) {value -= k - ZC + d}
            ring[(pos + k) & MASK] += height * value
        }
    }
}
`
}

const unison: ScriptDspBlock = {
    name: "unison",
    requires: ["osc"],
    exports: ["Unison"],
    doc: String.raw`- new Dsp.Unison(count = 7, index => oscillator) [count x oscillator]: detuned stack (supersaw by default: count Dsp.Osc saws; pass a factory for wavetable unison, e.g. () => new Dsp.WavetableOsc(table)). setDetune(cents) total spread (0..100, 10-30 typical), setSpread(0..1) stereo width, setBlend(0..1) side voices against the center (JP-8000 curve), setFrequency(hz), setPosition(0..1) forwards to wavetable oscillators, reset(randomPhase = true) on note start (deterministic random phases), next() returns mono and sets .left/.right. Level stays constant over count (power-normalised). .oscs[i] for direct access.`,
    source: String.raw`
Dsp.Unison = class Unison {
    constructor(count = 7, factory) {
        this.count = Dsp.clamp(count | 0, 1, 16)
        this.oscs = []
        for (let index = 0; index < this.count; index++) {this.oscs.push(typeof factory === "function" ? factory(index) : new Dsp.Osc(Dsp.SAW))}
        this.ratios = new Float64Array(this.count)
        this.gainLeft = new Float64Array(this.count)
        this.gainRight = new Float64Array(this.count)
        this.detune = 20
        this.spread = 1
        this.blend = 0.5
        this.frequency = 0
        this.left = 0
        this.right = 0
        this.#update()
    }
    setDetune(cents) {
        this.detune = Dsp.clamp(cents, 0, 1200)
        this.#update()
        this.setFrequency(this.frequency)
    }
    setSpread(spread) {
        this.spread = Dsp.clamp(spread, 0, 1)
        this.#update()
    }
    setBlend(blend) {
        this.blend = Dsp.clamp(blend, 0, 1)
        this.#update()
    }
    setFrequency(hz) {
        this.frequency = Dsp.finite(hz, 0)
        for (let index = 0; index < this.count; index++) {this.oscs[index].setFrequency(this.frequency * this.ratios[index])}
    }
    setPosition(position) {
        for (let index = 0; index < this.count; index++) {this.oscs[index].position = position}
    }
    reset(randomPhase = true) {
        for (let index = 0; index < this.count; index++) {this.oscs[index].reset(randomPhase ? Dsp.random() : 0)}
    }
    #update() {
        const count = this.count, blend = this.blend
        const center = 0.99785 - 0.55366 * blend
        const side = 0.044372 + 1.2841 * blend - 0.73764 * blend * blend
        let power = 0
        for (let index = 0; index < count; index++) {
            const offset = count === 1 ? 0 : 2 * index / (count - 1) - 1
            this.ratios[index] = Math.pow(2, offset * this.detune * 0.5 / 1200)
            const gain = count === 1 || Math.abs(offset) < 1e-9 ? center : side
            const angle = (offset * this.spread + 1) * Math.PI * 0.25
            this.gainLeft[index] = gain * Math.cos(angle) * Math.SQRT2
            this.gainRight[index] = gain * Math.sin(angle) * Math.SQRT2
            power += gain * gain
        }
        const norm = power > 0 ? 1 / Math.sqrt(power) : 1
        for (let index = 0; index < count; index++) {
            this.gainLeft[index] *= norm
            this.gainRight[index] *= norm
        }
    }
    next() {
        const oscs = this.oscs, gainLeft = this.gainLeft, gainRight = this.gainRight
        let left = 0, right = 0
        for (let index = 0; index < this.count; index++) {
            const sample = oscs[index].next()
            left += sample * gainLeft[index]
            right += sample * gainRight[index]
        }
        this.left = left
        this.right = right
        return (left + right) * 0.5
    }
}
`
}

export const ScriptDspOscillatorBlocks: ReadonlyArray<ScriptDspBlock> = [osc, unison]
