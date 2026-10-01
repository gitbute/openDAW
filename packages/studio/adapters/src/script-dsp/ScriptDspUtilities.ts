import {ScriptDspBlock} from "./ScriptDspBlock"

const core: ScriptDspBlock = {
    name: "core",
    requires: [],
    exports: ["VERSION", "TAU", "SINE", "SAW", "SQUARE", "TRIANGLE", "PULSE", "RAMP", "SH", "SMOOTH",
        "LP", "BP", "HP", "NOTCH", "PEAK", "ALLPASS", "TANH", "SOFT", "HARD", "FOLD", "SINEFOLD", "ASYM",
        "clamp", "finite", "lerp", "mtof", "ftom", "dbToGain", "gainToDb", "tanh", "flush", "coef", "seed", "random"],
    doc: String.raw`- core (always included): constants Dsp.SINE SAW SQUARE TRIANGLE PULSE RAMP SH SMOOTH (waveforms), Dsp.LP BP HP NOTCH PEAK ALLPASS (filter modes), Dsp.TANH SOFT HARD FOLD SINEFOLD ASYM (shaper curves). Functions: Dsp.mtof(note) (fractional MIDI note to Hz, A4=440), Dsp.ftom(hz), Dsp.dbToGain(db), Dsp.gainToDb(gain), Dsp.clamp(value, min, max) (NaN gives min), Dsp.finite(value, fallback), Dsp.lerp(a, b, t), Dsp.tanh(x) (fast rational, exact ±1 beyond ±3), Dsp.coef(seconds) (one-pole coefficient), Dsp.random() (deterministic 0..1, renders repeat exactly), Dsp.seed(int).`,
    source: String.raw`
const TAU = Math.PI * 2
Object.assign(Dsp, {
    VERSION: 1, TAU,
    SINE: 0, SAW: 1, SQUARE: 2, TRIANGLE: 3, PULSE: 4, RAMP: 5, SH: 6, SMOOTH: 7,
    LP: 0, BP: 1, HP: 2, NOTCH: 3, PEAK: 4, ALLPASS: 5,
    TANH: 0, SOFT: 1, HARD: 2, FOLD: 3, SINEFOLD: 4, ASYM: 5
})
Dsp.clamp = (value, min, max) => value >= min ? (value <= max ? value : max) : min
Dsp.finite = (value, fallback) => typeof value === "number" && value - value === 0 ? value : fallback
Dsp.lerp = (from, to, amount) => from + (to - from) * amount
Dsp.mtof = note => 440 * Math.pow(2, (note - 69) / 12)
Dsp.ftom = hz => 69 + 12 * Math.log2(hz / 440)
Dsp.dbToGain = db => Math.pow(10, db / 20)
Dsp.gainToDb = gain => 20 * Math.log10(gain > 1e-12 ? gain : 1e-12)
Dsp.tanh = x => x <= -3 ? -1 : x >= 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x)
Dsp.flush = x => x + 1e-20 - 1e-20
Dsp.coef = seconds => seconds > 0 ? Math.exp(-1 / (seconds * sampleRate)) : 0
let randomState = 0x2545F491
Dsp.seed = value => {randomState = (value | 0) || 0x2545F491}
Dsp.random = () => {
    let state = randomState
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    randomState = state
    return (state >>> 0) / 4294967296
}
`
}

const smoother: ScriptDspBlock = {
    name: "smoother",
    requires: [],
    exports: ["Smoother"],
    doc: String.raw`- new Dsp.Smoother(seconds = 0.02, value = 0) [very low]: one-pole parameter smoother (seconds = time constant, 99% after 4.6x). set(target), snap(value), next() returns the smoothed value (also .value), setTime(seconds). Use for every parameter that is modulated or set by paramChanged (cutoff, gain, position).`,
    source: String.raw`
Dsp.Smoother = class Smoother {
    constructor(seconds = 0.02, value = 0) {
        this.value = Dsp.finite(value, 0)
        this.target = this.value
        this.coef = 0
        this.setTime(seconds)
    }
    setTime(seconds) {this.coef = Dsp.coef(Dsp.finite(seconds, 0))}
    set(target) {this.target = Dsp.finite(target, this.target)}
    snap(value) {this.value = this.target = Dsp.finite(value, this.target)}
    next() {
        this.value = this.target + (this.value - this.target) * this.coef + 1e-20 - 1e-20
        return this.value
    }
}
`
}

const adsr: ScriptDspBlock = {
    name: "adsr",
    requires: [],
    exports: ["Adsr"],
    doc: String.raw`- new Dsp.Adsr() [very low]: click-free envelope 0..1. setParams(attack, decay, sustain, release) seconds (attack/release min 1 ms, decay/release reach -60 dB at the given time, sustain 0..1, changes glide). gateOn() restarts from the current level (no click on retrigger or steal), gateOff(), kill(seconds = 0.005) fast fade for reset()/steal, next() returns the level (also .level), .active is false once the release ended (free the voice then).`,
    source: String.raw`
Dsp.Adsr = class Adsr {
    constructor() {
        this.level = 0
        this.stage = 0
        this.attackStep = 0
        this.decayCoef = 0
        this.sustain = 1
        this.releaseCoef = 0
        this.killCoef = 0
        this.setParams(0.005, 0.2, 0.7, 0.3)
    }
    setParams(attack, decay, sustain, release) {
        const time = (seconds, min) => Dsp.clamp(seconds, min, 60) * sampleRate
        this.attackStep = 1 / time(attack, 0.001)
        this.decayCoef = Math.exp(-6.907755 / time(decay, 0.001))
        this.sustain = Dsp.clamp(sustain, 0, 1)
        this.releaseCoef = Math.exp(-6.907755 / time(release, 0.001))
    }
    get active() {return this.stage !== 0}
    gateOn() {this.stage = 1}
    gateOff() {if (this.stage !== 0 && this.stage !== 4) {this.stage = 3}}
    kill(seconds = 0.005) {
        if (this.stage === 0) {return}
        this.killCoef = Math.exp(-6.907755 / (Dsp.clamp(seconds, 0.0005, 1) * sampleRate))
        this.stage = 4
    }
    next() {
        let level = this.level
        switch (this.stage) {
            case 1:
                level += this.attackStep
                if (level >= 1) {
                    level = 1
                    this.stage = 2
                }
                break
            case 2:
                level = this.sustain + (level - this.sustain) * this.decayCoef
                if (level < 1e-4 && this.sustain < 1e-4) {
                    level = 0
                    this.stage = 0
                }
                break
            case 3:
                level *= this.releaseCoef
                if (level < 1e-4) {
                    level = 0
                    this.stage = 0
                }
                break
            case 4:
                level *= this.killCoef
                if (level < 1e-4) {
                    level = 0
                    this.stage = 0
                }
                break
        }
        this.level = level
        return level
    }
}
`
}

const lfo: ScriptDspBlock = {
    name: "lfo",
    requires: [],
    exports: ["Lfo"],
    doc: String.raw`- new Dsp.Lfo(shape = Dsp.SINE) [about 10-30 ns per call]: bipolar -1..1, shapes SINE TRIANGLE SAW (rising) RAMP (falling) SQUARE SH (sample and hold) SMOOTH (smooth random). setRate(hz) (0..sampleRate/2), sync(bpm, beats) (one cycle per beats quarter notes, e.g. 0.25 = 1/16), lock(ppqn, beats, offset = 0) sets the phase from the transport (call at block start with block.p0 while playing, flags & 4, for grid-locked wobbles), next() per sample, advance(samples) per block (control rate), reset(phase = 0), .phase 0..1.`,
    source: String.raw`
Dsp.Lfo = class Lfo {
    constructor(shape = Dsp.SINE) {
        this.shape = shape
        this.phase = 0
        this.inc = 0
        this.value = 0
        this.held = 0
        this.previous = 0
        this.setRate(1)
    }
    setRate(hz) {this.inc = Dsp.clamp(hz / sampleRate, 0, 0.5)}
    sync(bpm, beats) {this.setRate(Dsp.clamp(bpm, 1, 999) / 60 / Dsp.clamp(beats, 1 / 64, 1024))}
    lock(ppqn, beats, offset = 0) {
        const cycle = ppqn / 960 / Dsp.clamp(beats, 1 / 64, 1024) + Dsp.finite(offset, 0)
        const phase = cycle - Math.floor(cycle)
        if (phase < this.phase - 0.5) {this.#wrap()}
        this.phase = Dsp.finite(phase, 0)
    }
    reset(phase = 0) {this.phase = Dsp.clamp(phase - Math.floor(phase), 0, 0.999999)}
    #wrap() {
        this.previous = this.held
        this.held = Dsp.random() * 2 - 1
    }
    #evaluate(phase) {
        switch (this.shape) {
            case 0: return Math.sin(phase * 6.283185307179586)
            case 1: return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase
            case 2: return 2 * phase - 1
            case 5: return 1 - 2 * phase
            case 4: return phase < 0.5 ? 1 : -1
            case 6: return this.held
            case 7: return this.previous + (this.held - this.previous) * phase * phase * (3 - 2 * phase)
            default: return Math.sin(phase * 6.283185307179586)
        }
    }
    next() {
        let phase = this.phase + this.inc
        if (phase >= 1) {
            phase -= 1
            this.#wrap()
        }
        this.phase = phase
        return this.value = this.#evaluate(phase)
    }
    advance(samples) {
        let phase = this.phase + this.inc * samples
        if (phase >= 1) {
            phase -= Math.floor(phase)
            this.#wrap()
        }
        this.phase = phase
        return this.value = this.#evaluate(phase)
    }
}
`
}

const dc: ScriptDspBlock = {
    name: "dc",
    requires: [],
    exports: ["DcBlocker"],
    doc: String.raw`- new Dsp.DcBlocker(hz = 10) [very low]: one-pole high-pass removing DC (after asymmetric shaping, feedback loops). process(x).`,
    source: String.raw`
Dsp.DcBlocker = class DcBlocker {
    constructor(hz = 10) {
        this.coef = Math.exp(-Dsp.TAU * Dsp.clamp(hz, 0.1, 500) / sampleRate)
        this.x1 = 0
        this.y1 = 0
    }
    process(x) {
        const input = x - x === 0 ? x : 0
        const y = input - this.x1 + this.coef * this.y1
        this.x1 = input
        this.y1 = y + 1e-20 - 1e-20
        return y
    }
}
`
}

const noise: ScriptDspBlock = {
    name: "noise",
    requires: [],
    exports: ["Noise"],
    doc: String.raw`- new Dsp.Noise(seed = 1) [very low]: white() -1..1 (xorshift, deterministic), pink() (Paul Kellet filter, about -1..1), next() = white().`,
    source: String.raw`
Dsp.Noise = class Noise {
    constructor(seed = 1) {
        this.state = (seed | 0) || 1
        this.b0 = 0
        this.b1 = 0
        this.b2 = 0
        this.b3 = 0
        this.b4 = 0
        this.b5 = 0
        this.b6 = 0
    }
    white() {
        let state = this.state
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        this.state = state
        return state / 2147483648
    }
    next() {return this.white()}
    pink() {
        const white = this.white()
        this.b0 = 0.99886 * this.b0 + white * 0.0555179
        this.b1 = 0.99332 * this.b1 + white * 0.0750759
        this.b2 = 0.969 * this.b2 + white * 0.153852
        this.b3 = 0.8665 * this.b3 + white * 0.3104856
        this.b4 = 0.55 * this.b4 + white * 0.5329522
        this.b5 = -0.7616 * this.b5 - white * 0.016898
        const pink = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362
        this.b6 = white * 0.115926
        return pink * 0.11
    }
}
`
}

const fm: ScriptDspBlock = {
    name: "fm",
    requires: [],
    exports: ["FmOp"],
    doc: String.raw`- new Dsp.FmOp() [very low]: table sine operator for FM/PM. setFrequency(hz), next(pm = 0) where pm is phase modulation in radians (modulator output x index), .feedback 0..1 self-modulation (DX7-style, averaged), reset(phase = 0). High indices alias: keep index x ratio moderate or use a wavetable from Dsp.Tables.fm().`,
    source: String.raw`
const SINE_SIZE = 4096
const SINE = new Float32Array(SINE_SIZE + 1)
for (let index = 0; index <= SINE_SIZE; index++) {SINE[index] = Math.sin(Dsp.TAU * index / SINE_SIZE)}
Dsp.FmOp = class FmOp {
    constructor() {
        this.phase = 0
        this.inc = 0
        this.feedback = 0
        this.y1 = 0
        this.y2 = 0
    }
    setFrequency(hz) {this.inc = Dsp.clamp(hz / sampleRate, 0, 0.4999)}
    reset(phase = 0) {this.phase = Dsp.clamp(phase - Math.floor(phase), 0, 0.999999)}
    next(pm = 0) {
        let phase = this.phase + (pm - pm === 0 ? pm : 0) * 0.15915494309189535 + this.feedback * 0.25 * (this.y1 + this.y2)
        phase -= Math.floor(phase)
        const position = phase * SINE_SIZE
        const index = position | 0
        const y = SINE[index] + (SINE[index + 1] - SINE[index]) * (position - index)
        this.y2 = this.y1
        this.y1 = y
        const next = this.phase + this.inc
        this.phase = next >= 1 ? next - 1 : next
        return y
    }
}
`
}

const voices: ScriptDspBlock = {
    name: "voices",
    requires: [],
    exports: ["Voices"],
    doc: String.raw`- new Dsp.Voices(count, index => new MyVoice(this)) [very low]: allocation-free voice manager. Forward noteOn(pitch, velocity, cent, id), noteOff(id), reset() and process(output, block) to it. Poly: free voice, else steal the oldest released, else the oldest held. .mono = true: one voice, note stack (returning to held notes), .legato = true (default) glides without retrigger. Your voice class implements start(note, velocity, legato) (note = pitch + cent/100, fractional MIDI), release(), stop() (fast fade, called on reset), render(left, right, s0, s1) adding into the buffers, and an .active boolean (or getter, e.g. return this.env.active). .activeCount.`,
    source: String.raw`
Dsp.Voices = class Voices {
    constructor(count, factory) {
        this.count = Dsp.clamp(count | 0, 1, 64)
        this.voices = []
        for (let index = 0; index < this.count; index++) {this.voices.push(factory(index))}
        this.ids = new Float64Array(this.count).fill(-1)
        this.order = new Float64Array(this.count)
        this.counter = 0
        this.mono = false
        this.legato = true
        this.stackIds = new Float64Array(32)
        this.stackNotes = new Float64Array(32)
        this.stackVelocities = new Float64Array(32)
        this.stackSize = 0
    }
    get activeCount() {
        let count = 0
        for (let index = 0; index < this.count; index++) {if (this.voices[index].active) {count++}}
        return count
    }
    noteOn(pitch, velocity, cent, id) {
        const note = pitch + Dsp.finite(cent, 0) / 100
        if (this.mono) {
            const held = this.stackSize > 0
            if (this.stackSize === 32) {
                this.stackIds.copyWithin(0, 1)
                this.stackNotes.copyWithin(0, 1)
                this.stackVelocities.copyWithin(0, 1)
                this.stackSize--
            }
            this.stackIds[this.stackSize] = id
            this.stackNotes[this.stackSize] = note
            this.stackVelocities[this.stackSize] = velocity
            this.stackSize++
            this.ids[0] = id
            this.voices[0].start(note, velocity, held && this.legato && this.voices[0].active)
            return
        }
        let chosen = -1
        for (let index = 0; index < this.count; index++) {
            if (!this.voices[index].active) {
                chosen = index
                break
            }
        }
        let oldest = Infinity
        if (chosen < 0) {
            for (let index = 0; index < this.count; index++) {
                if (this.ids[index] < 0 && this.order[index] < oldest) {
                    oldest = this.order[index]
                    chosen = index
                }
            }
        }
        if (chosen < 0) {
            for (let index = 0; index < this.count; index++) {
                if (this.order[index] < oldest) {
                    oldest = this.order[index]
                    chosen = index
                }
            }
        }
        this.ids[chosen] = id
        this.order[chosen] = ++this.counter
        this.voices[chosen].start(note, velocity, false)
    }
    noteOff(id) {
        if (this.mono) {
            let found = -1
            for (let index = 0; index < this.stackSize; index++) {if (this.stackIds[index] === id) {found = index}}
            if (found >= 0) {
                this.stackIds.copyWithin(found, found + 1, this.stackSize)
                this.stackNotes.copyWithin(found, found + 1, this.stackSize)
                this.stackVelocities.copyWithin(found, found + 1, this.stackSize)
                this.stackSize--
            }
            if (this.ids[0] !== id) {return}
            if (this.stackSize > 0) {
                const top = this.stackSize - 1
                this.ids[0] = this.stackIds[top]
                this.voices[0].start(this.stackNotes[top], this.stackVelocities[top], this.legato)
            } else {
                this.ids[0] = -1
                this.voices[0].release()
            }
            return
        }
        for (let index = 0; index < this.count; index++) {
            if (this.ids[index] === id) {
                this.ids[index] = -1
                this.voices[index].release()
            }
        }
    }
    reset() {
        for (let index = 0; index < this.count; index++) {this.voices[index].stop()}
        this.ids.fill(-1)
        this.stackSize = 0
    }
    process(output, block) {
        const left = output[0], right = output[1]
        for (let index = 0; index < this.count; index++) {
            const voice = this.voices[index]
            if (voice.active) {voice.render(left, right, block.s0, block.s1)}
        }
    }
}
`
}

export const ScriptDspUtilityBlocks: ReadonlyArray<ScriptDspBlock> = [core, smoother, adsr, lfo, dc, noise, fm, voices]
