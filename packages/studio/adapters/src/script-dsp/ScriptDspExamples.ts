import {ScriptDspExample} from "./ScriptDspBlock"

const growlBass = String.raw`// @label Growl Bass
// @group Wavetable orange
// @sample wavetable
// @param wtTable      5     0     7      int
// @param wtPosition   0.3
// @group Motion purple
// @param wobbleBeats  0.5   0.0625  4    exp   beats
// @param wobbleDepth  0.6
// @group Tone red
// @param vowel        1     0     4      linear
// @param vowelMix     0.7
// @param drive        6     1     40     exp
// @param cutoff       3000  80    18000  exp   Hz
// @param resonance    0.3
// @group Voice green
// @param sub          0.5
// @param glide        0.04  0.001 1      exp   s
// @param release      0.12  0.005 2      exp   s
// @param volume       0.7

// Built-in table when no wavetable sample is loaded (Serum/Vital WAVs: 2048-sample frames)
const TABLES = ["basic", "sawSquare", "pwm", "harmonicSweep", "formant", "fm", "sync", "fold"]

class GrowlVoice {
    constructor(synth) {
        this.synth = synth
        this.unison = new Dsp.Unison(3, () => new Dsp.WavetableOsc(synth.table))
        this.unison.setDetune(14)
        this.unison.setSpread(0)
        this.sub = new Dsp.Osc(Dsp.SINE)
        this.env = new Dsp.Adsr()
        this.pitch = new Dsp.Smoother(0.02, 36)
        this.position = new Dsp.Smoother(0.005, 0.3)
        this.formant = new Dsp.Formant()
        this.shaper = new Dsp.Shaper(Dsp.ASYM, 4)
        this.filter = new Dsp.Ladder()
        this.velocity = 1
    }
    get active() {return this.env.active}
    start(note, velocity, legato) {
        const synth = this.synth
        this.pitch.setTime(synth.glide / 3)
        this.pitch.set(note)
        this.velocity = 0.5 + 0.5 * velocity
        if (legato) {return}
        this.pitch.snap(note)
        this.unison.reset(true)
        this.env.setParams(0.002, 0.3, 1, synth.release)
        this.env.gateOn()
    }
    release() {this.env.gateOff()}
    stop() {this.env.kill()}
    render(left, right, s0, s1) {
        const synth = this.synth, oscs = this.unison.oscs, motion = synth.motion
        for (let index = 0; index < oscs.length; index++) {oscs[index].setTable(synth.table)}
        this.formant.mix = synth.vowelMix
        this.shaper.drive = synth.drive
        this.filter.setParams(synth.cutoff, synth.resonance, 1)
        for (let i = s0; i < s1; i++) {
            const hz = Dsp.mtof(this.pitch.next())
            this.unison.setFrequency(hz)
            this.sub.setFrequency(hz * 0.5)
            const wobble = motion[i] * synth.wobbleDepth
            this.position.set(synth.wtPosition + wobble * (1 - synth.wtPosition))
            this.unison.setPosition(this.position.next())
            this.formant.setVowel(synth.vowel + wobble * 2)
            let x = this.unison.next()
            x = this.formant.process(x)
            x = this.shaper.process(x)
            x = this.filter.process(x) * 0.5
            const out = (x + this.sub.next() * synth.sub * 0.6) * this.env.next() * this.velocity * synth.volume
            left[i] += out
            right[i] += out
        }
    }
}

class Processor {
    constructor() {
        this.slot = new Dsp.WavetableSlot(Dsp.Tables.fm())
        this.table = this.slot.table
        this.lfo = new Dsp.Lfo(Dsp.SINE)
        this.motion = new Float32Array(128)
        this.wtPosition = 0.3
        this.wobbleBeats = 0.5
        this.wobbleDepth = 0.6
        this.vowel = 1
        this.vowelMix = 0.7
        this.drive = 6
        this.cutoff = 3000
        this.resonance = 0.3
        this.sub = 0.5
        this.glide = 0.04
        this.release = 0.12
        this.volume = 0.7
        this.voices = new Dsp.Voices(1, () => new GrowlVoice(this))
        this.voices.mono = true
    }
    paramChanged(name, value) {
        if (name === "wtTable") {
            this.slot.setFallback(Dsp.Tables[TABLES[value]]())
        } else {
            this[name] = value
        }
    }
    noteOn(pitch, velocity, cent, id) {this.voices.noteOn(pitch, velocity, cent, id)}
    noteOff(id) {this.voices.noteOff(id)}
    reset() {this.voices.reset()}
    process(output, block) {
        this.table = this.slot.update(this.samples.wavetable)
        this.lfo.sync(block.bpm, this.wobbleBeats)
        if (block.s0 === 0 && (block.flags & 4) !== 0) {this.lfo.lock(block.p0, this.wobbleBeats)}
        for (let i = block.s0; i < block.s1; i++) {this.motion[i] = (this.lfo.next() + 1) * 0.5}
        this.voices.process(output, block)
    }
}
`

const supersawLead = String.raw`// @label Supersaw Lead
// @group Oscillator orange
// @param detune     25     0     100    linear  ct
// @param blend      0.6
// @param width      1
// @group Filter blue
// @param cutoff     2500   60    18000  exp     Hz
// @param resonance  1.2    0.5   12     exp
// @param envAmount  2      0     6      linear  oct
// @group Envelope green
// @param attack     0.005  0.001 2      exp     s
// @param decay      0.4    0.01  4      exp     s
// @param sustain    0.6
// @param release    0.4    0.01  4      exp     s
// @param volume     0.3

class SupersawVoice {
    constructor(synth) {
        this.synth = synth
        this.unison = new Dsp.Unison(7)
        this.filterLeft = new Dsp.Svf(Dsp.LP)
        this.filterRight = new Dsp.Svf(Dsp.LP)
        this.amp = new Dsp.Adsr()
        this.mod = new Dsp.Adsr()
        this.velocity = 1
        this.version = -1
    }
    get active() {return this.amp.active}
    start(note, velocity, legato) {
        const synth = this.synth
        this.unison.setFrequency(Dsp.mtof(note))
        if (!this.amp.active) {this.unison.reset(true)}
        this.amp.setParams(synth.attack, synth.decay, synth.sustain, synth.release)
        this.mod.setParams(synth.attack, synth.decay * 0.6, 0.2, synth.release)
        this.velocity = velocity
        this.amp.gateOn()
        this.mod.gateOn()
    }
    release() {
        this.amp.gateOff()
        this.mod.gateOff()
    }
    stop() {
        this.amp.kill()
        this.mod.kill()
    }
    render(left, right, s0, s1) {
        const synth = this.synth
        if (this.version !== synth.version) {
            this.version = synth.version
            this.unison.setDetune(synth.detune)
            this.unison.setBlend(synth.blend)
            this.unison.setSpread(synth.width)
        }
        const gain = this.velocity * synth.volume
        for (let i = s0; i < s1; i++) {
            const mod = this.mod.next()
            if ((i & 7) === 0) {
                const cutoff = synth.cutoff * Math.pow(2, synth.envAmount * mod * (0.5 + 0.5 * this.velocity))
                this.filterLeft.setParams(cutoff, synth.resonance)
                this.filterRight.setParams(cutoff, synth.resonance)
            }
            this.unison.next()
            const level = this.amp.next() * gain
            left[i] += this.filterLeft.process(this.unison.left) * level
            right[i] += this.filterRight.process(this.unison.right) * level
        }
    }
}

class Processor {
    constructor() {
        this.detune = 25
        this.blend = 0.6
        this.width = 1
        this.cutoff = 2500
        this.resonance = 1.2
        this.envAmount = 2
        this.attack = 0.005
        this.decay = 0.4
        this.sustain = 0.6
        this.release = 0.4
        this.volume = 0.3
        this.version = 0
        this.voices = new Dsp.Voices(8, () => new SupersawVoice(this))
    }
    paramChanged(name, value) {
        this[name] = value
        this.version++
    }
    noteOn(pitch, velocity, cent, id) {this.voices.noteOn(pitch, velocity, cent, id)}
    noteOff(id) {this.voices.noteOff(id)}
    reset() {this.voices.reset()}
    process(output, block) {this.voices.process(output, block)}
}
`

const reeseBass = String.raw`// @label Reese Bass
// @group Oscillator orange
// @param detune     18    0     60     linear  ct
// @param movement   0.35
// @param rate       0.2   0.01  4      exp     Hz
// @param width      0.4
// @group Filter blue
// @param cutoff     900   60    8000   exp     Hz
// @param resonance  0.25
// @param drive      3     1     20     exp
// @group Voice green
// @param sub        0.6
// @param glide      0.03  0.001 0.5    exp     s
// @param release    0.15  0.005 2      exp     s
// @param volume     0.7

class ReeseVoice {
    constructor(synth) {
        this.synth = synth
        this.unison = new Dsp.Unison(4)
        this.unison.setBlend(1)
        this.sub = new Dsp.Osc(Dsp.SINE)
        this.drift = new Dsp.Lfo(Dsp.SMOOTH)
        this.sweep = new Dsp.Lfo(Dsp.TRIANGLE)
        this.filterLeft = new Dsp.Ladder()
        this.filterRight = new Dsp.Ladder()
        this.shaperLeft = new Dsp.Shaper(Dsp.SOFT, 2)
        this.shaperRight = new Dsp.Shaper(Dsp.SOFT, 2)
        this.env = new Dsp.Adsr()
        this.pitch = new Dsp.Smoother(0.01, 36)
        this.velocity = 1
    }
    get active() {return this.env.active}
    start(note, velocity, legato) {
        const synth = this.synth
        this.pitch.setTime(synth.glide / 3)
        this.pitch.set(note)
        this.velocity = 0.6 + 0.4 * velocity
        if (legato) {return}
        this.pitch.snap(note)
        this.unison.reset(true)
        this.env.setParams(0.004, 0.5, 1, synth.release)
        this.env.gateOn()
    }
    release() {this.env.gateOff()}
    stop() {this.env.kill()}
    render(left, right, s0, s1) {
        const synth = this.synth, movement = synth.movement
        this.drift.setRate(synth.rate * 1.7)
        this.sweep.setRate(synth.rate)
        this.unison.setSpread(synth.width)
        const drift = this.drift.advance(s1 - s0), sweep = this.sweep.advance(s1 - s0)
        this.unison.setDetune(synth.detune * (1 + 0.5 * movement * drift))
        const cutoff = synth.cutoff * Math.pow(2, 1.5 * movement * sweep)
        this.filterLeft.setParams(cutoff, synth.resonance, synth.drive)
        this.filterRight.setParams(cutoff, synth.resonance, synth.drive)
        for (let i = s0; i < s1; i++) {
            const hz = Dsp.mtof(this.pitch.next())
            this.unison.setFrequency(hz)
            this.sub.setFrequency(hz * 0.5)
            this.unison.next()
            const level = this.env.next() * this.velocity * synth.volume
            const sub = this.sub.next() * synth.sub * 0.7
            left[i] += (this.shaperLeft.process(this.filterLeft.process(this.unison.left)) * 0.6 + sub) * level
            right[i] += (this.shaperRight.process(this.filterRight.process(this.unison.right)) * 0.6 + sub) * level
        }
    }
}

class Processor {
    constructor() {
        this.detune = 18
        this.movement = 0.35
        this.rate = 0.2
        this.width = 0.4
        this.cutoff = 900
        this.resonance = 0.25
        this.drive = 3
        this.sub = 0.6
        this.glide = 0.03
        this.release = 0.15
        this.volume = 0.7
        this.voices = new Dsp.Voices(1, () => new ReeseVoice(this))
        this.voices.mono = true
    }
    paramChanged(name, value) {this[name] = value}
    noteOn(pitch, velocity, cent, id) {this.voices.noteOn(pitch, velocity, cent, id)}
    noteOff(id) {this.voices.noteOff(id)}
    reset() {this.voices.reset()}
    process(output, block) {this.voices.process(output, block)}
}
`

export const ScriptDspExamples: ReadonlyArray<ScriptDspExample> = [
    {
        name: "DSP Growl Bass", device: "Apparat", code: growlBass,
        summary: "mono wavetable growl: FM/sync/fold/formant tables or a // @sample WAV, tempo-locked wobble on position and vowel, formant filter, 4x oversampled distortion, ladder, sub"
    },
    {
        name: "DSP Supersaw Lead", device: "Apparat", code: supersawLead,
        summary: "8-voice 7-saw supersaw, stereo spread, SVF with filter envelope"
    },
    {
        name: "DSP Reese Bass", device: "Apparat", code: reeseBass,
        summary: "mono detuned saws with drifting detune, driven ladder, 2x soft clip, sub"
    }
]
