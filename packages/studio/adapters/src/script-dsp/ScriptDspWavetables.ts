import {ScriptDspBlock} from "./ScriptDspBlock"

const fft: ScriptDspBlock = {
    name: "fft",
    requires: [],
    exports: ["Fft"],
    doc: String.raw`- Dsp.Fft.get(size) [setup only]: cached radix-2 complex FFT, transform(re, im, inverse) in place on Float64Arrays (no scaling).`,
    source: String.raw`
Dsp.Fft = class Fft {
    static #cache = {}
    static get(size) {return Fft.#cache[size] || (Fft.#cache[size] = new Fft(size))}
    constructor(size) {
        this.size = size
        const half = size >> 1, bits = Math.round(Math.log2(size))
        this.cos = new Float64Array(half)
        this.sin = new Float64Array(half)
        for (let index = 0; index < half; index++) {
            this.cos[index] = Math.cos(Dsp.TAU * index / size)
            this.sin[index] = Math.sin(Dsp.TAU * index / size)
        }
        this.reverse = new Uint32Array(size)
        for (let index = 0; index < size; index++) {
            let reversed = 0
            for (let bit = 0; bit < bits; bit++) {reversed |= ((index >> bit) & 1) << (bits - 1 - bit)}
            this.reverse[index] = reversed
        }
    }
    transform(re, im, inverse) {
        const size = this.size, reverse = this.reverse, cos = this.cos, sin = this.sin
        const sign = inverse ? -1 : 1
        for (let index = 0; index < size; index++) {
            const other = reverse[index]
            if (other > index) {
                const real = re[index], imag = im[index]
                re[index] = re[other]
                im[index] = im[other]
                re[other] = real
                im[other] = imag
            }
        }
        for (let length = 2; length <= size; length <<= 1) {
            const half = length >> 1, step = size / length
            for (let start = 0; start < size; start += length) {
                for (let k = 0; k < half; k++) {
                    const c = cos[k * step], s = sign * sin[k * step]
                    const a = start + k, b = a + half
                    const real = re[b] * c + im[b] * s
                    const imag = im[b] * c - re[b] * s
                    re[b] = re[a] - real
                    im[b] = im[a] - imag
                    re[a] += real
                    im[a] += imag
                }
            }
        }
    }
}
`
}

const wavetable: ScriptDspBlock = {
    name: "wavetable",
    requires: ["fft"],
    exports: ["Wavetable", "WavetableOsc", "WavetableSlot"],
    doc: String.raw`- Dsp.Wavetable [setup only]: frames of single cycles stored as harmonic spectra, rendered into 17 half-octave mip levels when the table is created (never inside process) (brick-wall band-limited, aliasing below -84 dB; max 512 harmonics, 76 KB per frame). Build once in the constructor and share it between voices. Sources: Dsp.Wavetable.fromAudio(audio, frameSize = 2048) (Serum/Vital WAV loaded via // @sample: frames = length / 2048, max 256; a shorter sample is one cycle), Dsp.Wavetable.fromFunction(frames, (phase, x) => value, oversample = 4) (x = frame position 0..1), Dsp.Wavetable.fromSpectrum(frames, (x, cos, sin, frame) => {...}) (fill harmonic amplitudes, index = harmonic 1..1023), or Dsp.Tables. Tables are peak-normalised. .frames.
- new Dsp.WavetableOsc(table) [about 20 ns]: mip-mapped, 4-point Hermite interpolated, frame morph. setFrequency(hz) (picks the mip level, cheap enough per sample), .position 0..1 morphs between adjacent frames (smooth it, e.g. Dsp.Smoother), next() returns about -1..1, nextPM(offset) with phase modulation in cycles, reset(phase = 0), setTable(table).
- new Dsp.WavetableSlot(fallbackTable, frameSize = 2048) [very low per block]: wavetable from a // @sample slot. In process(): const table = this.slot.update(this.samples.wavetable), then osc.setTable(table) per voice. Returns the fallback until a sample is loaded; detects sample swaps and rebuilds once. setFallback(table) switches the built-in table.`,
    source: String.raw`
const HARMONICS = 1024
const LEVEL_HARMONICS = [512, 362, 256, 181, 128, 90, 64, 45, 32, 22, 16, 11, 8, 5, 4, 2, 1]
const LEVELS = LEVEL_HARMONICS.length
const LEVEL_SIZES = new Int32Array(LEVELS)
const LEVEL_OFFSETS = new Int32Array(LEVELS)
let FRAME_FLOATS = 0
for (let level = 0; level < LEVELS; level++) {
    let size = 512
    while (size < LEVEL_HARMONICS[level] * 16 && size < 2048) {size <<= 1}
    LEVEL_SIZES[level] = size
    LEVEL_OFFSETS[level] = FRAME_FLOATS
    FRAME_FLOATS += size + 3
}
const scratch = {}
const scratchOf = size => scratch[size] || (scratch[size] = {re: new Float64Array(size), im: new Float64Array(size)})
Dsp.Wavetable = class Wavetable {
    constructor(frames) {
        this.frames = Dsp.clamp(frames | 0, 1, 1024)
        this.cos = new Float32Array(this.frames * HARMONICS)
        this.sin = new Float32Array(this.frames * HARMONICS)
        this.ready = new Uint8Array(this.frames)
        this.built = new Uint8Array(this.frames * LEVELS)
        this.data = new Array(this.frames).fill(null)
        this.gain = 1
        this.source = null
        this.frameSize = 0
    }
    static fromAudio(audio, frameSize = 2048) {
        const length = audio.numberOfFrames
        const left = audio.frames[0], right = audio.numberOfChannels > 1 ? audio.frames[1] : left
        let size = Dsp.clamp(frameSize | 0, 16, 65536), frames = 1
        if (length >= size) {frames = Math.min(256, Math.floor(length / size))} else {size = length}
        const table = new Wavetable(frames)
        const source = new Float32Array(frames * size)
        let peak = 0
        for (let index = 0; index < source.length; index++) {
            const value = Dsp.finite((left[index] + right[index]) * 0.5, 0)
            source[index] = value
            if (value > peak) {peak = value} else if (-value > peak) {peak = -value}
        }
        table.source = source
        table.frameSize = size
        table.gain = peak > 1e-9 ? 1 / peak : 1
        return table.prepare()
    }
    static fromFunction(frames, generator, oversample = 4) {
        const table = new Wavetable(frames)
        let factor = 1
        while (factor < oversample && factor < 16) {factor <<= 1}
        const size = 2048 * factor, scale = 2 / size
        const {re, im} = scratchOf(size), transform = Dsp.Fft.get(size)
        let peak = 0
        for (let frame = 0; frame < table.frames; frame++) {
            const x = table.frames > 1 ? frame / (table.frames - 1) : 0
            for (let index = 0; index < size; index++) {
                const value = Dsp.finite(generator(index / size, x), 0)
                re[index] = value
                im[index] = 0
                if (value > peak) {peak = value} else if (-value > peak) {peak = -value}
            }
            transform.transform(re, im, false)
            const base = frame * HARMONICS
            for (let harmonic = 1; harmonic < HARMONICS; harmonic++) {
                table.cos[base + harmonic] = re[harmonic] * scale
                table.sin[base + harmonic] = -im[harmonic] * scale
            }
            table.ready[frame] = 1
        }
        table.gain = peak > 1e-9 ? 1 / peak : 1
        return table.prepare()
    }
    static fromSpectrum(frames, fill) {
        const table = new Wavetable(frames)
        for (let frame = 0; frame < table.frames; frame++) {
            const x = table.frames > 1 ? frame / (table.frames - 1) : 0
            const base = frame * HARMONICS
            fill(x, table.cos.subarray(base, base + HARMONICS), table.sin.subarray(base, base + HARMONICS), frame)
            table.cos[base] = 0
            table.sin[base] = 0
            table.ready[frame] = 1
        }
        let peak = 0
        for (let frame = 0; frame < table.frames; frame++) {
            const data = table.frameData(frame, 0)
            for (let index = 1; index <= LEVEL_SIZES[0]; index++) {
                const value = Math.abs(data[index])
                if (value > peak) {peak = value}
            }
        }
        if (peak > 1e-9) {
            table.gain = 1 / peak
            table.built.fill(0)
        }
        return table.prepare()
    }
    frameData(frame, level) {
        if (this.built[frame * LEVELS + level] === 0) {this.#build(frame, level)}
        return this.data[frame]
    }
    prepare() {
        for (let frame = 0; frame < this.frames; frame++) {
            for (let level = 0; level < LEVELS; level++) {this.frameData(frame, level)}
        }
        return this
    }
    #spectrum(frame) {
        if (this.ready[frame] === 1) {return}
        this.ready[frame] = 1
        const source = this.source
        if (source === null) {return}
        const size = this.frameSize, base = frame * HARMONICS, offset = frame * size
        const top = Math.min(HARMONICS - 1, Math.floor(size / 2) - 1), scale = 2 / size
        if ((size & (size - 1)) === 0) {
            const {re, im} = scratchOf(size)
            for (let index = 0; index < size; index++) {
                re[index] = source[offset + index]
                im[index] = 0
            }
            Dsp.Fft.get(size).transform(re, im, false)
            for (let harmonic = 1; harmonic <= top; harmonic++) {
                this.cos[base + harmonic] = re[harmonic] * scale
                this.sin[base + harmonic] = -im[harmonic] * scale
            }
            return
        }
        for (let harmonic = 1; harmonic <= top; harmonic++) {
            const stepCos = Math.cos(Dsp.TAU * harmonic / size), stepSin = Math.sin(Dsp.TAU * harmonic / size)
            let rotCos = 1, rotSin = 0, sumCos = 0, sumSin = 0
            for (let index = 0; index < size; index++) {
                const value = source[offset + index]
                sumCos += value * rotCos
                sumSin += value * rotSin
                const nextCos = rotCos * stepCos - rotSin * stepSin
                rotSin = rotSin * stepCos + rotCos * stepSin
                rotCos = nextCos
            }
            this.cos[base + harmonic] = sumCos * scale
            this.sin[base + harmonic] = sumSin * scale
        }
    }
    #build(frame, level) {
        this.#spectrum(frame)
        let data = this.data[frame]
        if (data === null) {data = this.data[frame] = new Float32Array(FRAME_FLOATS)}
        const size = LEVEL_SIZES[level], offset = LEVEL_OFFSETS[level]
        const top = Math.min(LEVEL_HARMONICS[level], size / 2 - 1)
        const {re, im} = scratchOf(size)
        re.fill(0)
        im.fill(0)
        const base = frame * HARMONICS, gain = this.gain * 0.5
        for (let harmonic = 1; harmonic <= top; harmonic++) {
            const c = this.cos[base + harmonic] * gain, s = this.sin[base + harmonic] * gain
            re[harmonic] = c
            im[harmonic] = -s
            re[size - harmonic] = c
            im[size - harmonic] = s
        }
        Dsp.Fft.get(size).transform(re, im, true)
        data[offset] = re[size - 1]
        for (let index = 0; index < size; index++) {data[offset + 1 + index] = re[index]}
        data[offset + size + 1] = re[0]
        data[offset + size + 2] = re[1]
        this.built[frame * LEVELS + level] = 1
    }
}
Dsp.WavetableOsc = class WavetableOsc {
    constructor(table) {
        this.table = table
        this.phase = 0
        this.inc = 0
        this.level = 0
        this.position = 0
        this.cachedTable = null
        this.cachedFrame = -1
        this.cachedLevel = -1
        this.data0 = null
        this.data1 = null
        this.offset = 0
        this.size = LEVEL_SIZES[0]
    }
    setTable(table) {this.table = table}
    setFrequency(hz) {
        const raw = hz / sampleRate
        const inc = raw > 0 ? (raw < 0.5 ? raw : 0.4999) : 0
        this.inc = inc
        let level = this.level
        while (level > 0 && LEVEL_HARMONICS[level - 1] * inc <= 0.5) {level--}
        while (level < LEVELS - 1 && LEVEL_HARMONICS[level] * inc > 0.5) {level++}
        this.level = level
    }
    reset(phase = 0) {this.phase = Dsp.clamp(phase - Math.floor(phase), 0, 0.999999)}
    #locate(frame) {
        const table = this.table, level = this.level
        this.data0 = table.frameData(frame, level)
        this.data1 = frame + 1 < table.frames ? table.frameData(frame + 1, level) : this.data0
        this.offset = LEVEL_OFFSETS[level]
        this.size = LEVEL_SIZES[level]
        this.cachedTable = table
        this.cachedFrame = frame
        this.cachedLevel = level
    }
    #read(phase) {
        const table = this.table, last = table.frames - 1, position = this.position
        const scaled = position > 0 ? (position < 1 ? position * last : last) : 0
        const frame = scaled | 0, mix = scaled - frame
        if (frame !== this.cachedFrame || this.level !== this.cachedLevel || table !== this.cachedTable) {this.#locate(frame)}
        const x = phase * this.size, index = x | 0, t = x - index, at = this.offset + index
        const data0 = this.data0, data1 = this.data1
        const ym1 = data0[at] + (data1[at] - data0[at]) * mix
        const y0 = data0[at + 1] + (data1[at + 1] - data0[at + 1]) * mix
        const y1 = data0[at + 2] + (data1[at + 2] - data0[at + 2]) * mix
        const y2 = data0[at + 3] + (data1[at + 3] - data0[at + 3]) * mix
        const c1 = 0.5 * (y1 - ym1)
        const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2
        const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1)
        return ((c3 * t + c2) * t + c1) * t + y0
    }
    next() {
        const out = this.#read(this.phase)
        const phase = this.phase + this.inc
        this.phase = phase >= 1 ? phase - 1 : phase
        return out
    }
    nextPM(offset) {
        let phase = this.phase + (offset - offset === 0 ? offset : 0)
        phase -= Math.floor(phase)
        const out = this.#read(phase < 1 ? phase : 0)
        const next = this.phase + this.inc
        this.phase = next >= 1 ? next - 1 : next
        return out
    }
}
Dsp.WavetableSlot = class WavetableSlot {
    constructor(fallback, frameSize = 2048) {
        this.fallback = fallback
        this.table = fallback
        this.frameSize = frameSize
        this.length = -1
        this.offset = -1
        this.keys = new Float64Array(3)
    }
    setFallback(table) {
        this.fallback = table
        if (this.length === -1) {this.table = table}
    }
    update(audio) {
        if (audio === null || audio === undefined || !(audio.numberOfFrames >= 16)) {
            if (this.length !== -1) {
                this.table = this.fallback
                this.length = -1
            }
            return this.table
        }
        const channel = audio.frames[0], length = audio.numberOfFrames
        const first = Dsp.finite(channel[0], 0), middle = Dsp.finite(channel[length >> 1], 0), last = Dsp.finite(channel[length - 1], 0)
        const keys = this.keys
        if (length === this.length && channel.byteOffset === this.offset && first === keys[0] && middle === keys[1] && last === keys[2]) {return this.table}
        this.length = length
        this.offset = channel.byteOffset
        keys[0] = first
        keys[1] = middle
        keys[2] = last
        this.table = Dsp.Wavetable.fromAudio(audio, this.frameSize)
        return this.table
    }
}
`
}

const tables: ScriptDspBlock = {
    name: "tables",
    requires: ["wavetable"],
    exports: ["Tables"],
    doc: String.raw`- Dsp.Tables [setup only: 5-15 ms on first use, then cached and shared]: procedurally generated wavetables (no files needed). basic() 4 frames sine, triangle, saw, square; sawSquare(frames = 16) saw to square; pwm(frames = 32) pulse width 50% to 4%; harmonicSweep(frames = 64) a resonant peak sweeping harmonics 1..64 over a saw; formant(frames = 33) vowels a e i o u (formants scale with pitch, "yoi" growls); fm(frames = 32, ratio = 2) 2-operator FM, index 0 to 8; sync(frames = 32) hard-synced saw, slave ratio 1 to 8 (tearing growl); fold(frames = 32) sine wavefolder, drive 1 to 8 (dubstep grit).`,
    source: String.raw`
const cache = {}
const memo = (key, build) => cache[key] || (cache[key] = build())
const VOWEL_TABLE = [
    [600, 1040, 2250, 2450, 2750, 0, -7, -9, -9, -20, 60, 70, 110, 120, 130],
    [400, 1620, 2400, 2800, 3100, 0, -12, -9, -12, -18, 40, 80, 100, 120, 120],
    [250, 1750, 2600, 3050, 3340, 0, -30, -16, -22, -28, 60, 90, 100, 120, 120],
    [400, 750, 2400, 2600, 2900, 0, -11, -21, -20, -40, 40, 80, 100, 120, 120],
    [350, 600, 2400, 2675, 2950, 0, -20, -32, -28, -36, 40, 80, 100, 120, 120]
]
Dsp.Tables = {
    basic: () => memo("basic", () => Dsp.Wavetable.fromSpectrum(4, (x, cos, sin, frame) => {
        for (let harmonic = 1; harmonic < 1024; harmonic++) {
            const odd = (harmonic & 1) === 1
            if (frame === 0) {sin[harmonic] = harmonic === 1 ? 1 : 0}
            if (frame === 1) {sin[harmonic] = odd ? 8 / (Math.PI * Math.PI * harmonic * harmonic) * (((harmonic - 1) >> 1) & 1 ? -1 : 1) : 0}
            if (frame === 2) {sin[harmonic] = 2 / (Math.PI * harmonic)}
            if (frame === 3) {sin[harmonic] = odd ? 4 / (Math.PI * harmonic) : 0}
        }
    })),
    sawSquare: (frames = 16) => memo("sawSquare" + frames, () => Dsp.Wavetable.fromSpectrum(frames, (x, cos, sin) => {
        for (let harmonic = 1; harmonic < 1024; harmonic++) {
            sin[harmonic] = 2 / (Math.PI * harmonic) * ((harmonic & 1) === 1 ? 1 + x : 1 - x)
        }
    })),
    pwm: (frames = 32) => memo("pwm" + frames, () => Dsp.Wavetable.fromSpectrum(frames, (x, cos, sin) => {
        const width = 0.5 - 0.46 * x
        for (let harmonic = 1; harmonic < 1024; harmonic++) {
            const angle = Dsp.TAU * harmonic * width, scale = 2 / (Math.PI * harmonic)
            cos[harmonic] = scale * Math.sin(angle)
            sin[harmonic] = scale * (1 - Math.cos(angle))
        }
    })),
    harmonicSweep: (frames = 64) => memo("harmonicSweep" + frames, () => Dsp.Wavetable.fromSpectrum(frames, (x, cos, sin) => {
        const center = Math.pow(2, x * 6)
        for (let harmonic = 1; harmonic < 1024; harmonic++) {
            const distance = Math.log2(harmonic / center) / 0.25
            sin[harmonic] = (0.15 + 2.5 * Math.exp(-0.5 * distance * distance)) / harmonic
        }
    })),
    formant: (frames = 33) => memo("formant" + frames, () => Dsp.Wavetable.fromSpectrum(frames, (x, cos, sin) => {
        const vowel = x * 4, from = Math.min(3, Math.floor(vowel)), amount = vowel - from
        const first = VOWEL_TABLE[from], second = VOWEL_TABLE[from + 1]
        const centers = [], gains = [], halfWidths = []
        for (let band = 0; band < 5; band++) {
            centers.push(Math.exp(Dsp.lerp(Math.log(first[band]), Math.log(second[band]), amount)))
            gains.push(Dsp.dbToGain(Dsp.lerp(first[band + 5], second[band + 5], amount)))
            halfWidths.push(Math.max(40, 0.75 * Dsp.lerp(first[band + 10], second[band + 10], amount)))
        }
        for (let harmonic = 1; harmonic < 1024; harmonic++) {
            const hz = harmonic * 100
            let envelope = 0
            for (let band = 0; band < 5; band++) {
                const distance = (hz - centers[band]) / halfWidths[band]
                envelope += gains[band] / (1 + distance * distance)
            }
            sin[harmonic] = (envelope + 0.03) / Math.sqrt(harmonic)
        }
    })),
    fm: (frames = 32, ratio = 2) => memo("fm" + frames + ":" + ratio, () => {
        const factor = Math.max(1, Math.round(ratio))
        return Dsp.Wavetable.fromFunction(frames, (phase, x) => Math.sin(Dsp.TAU * phase + 8 * x * Math.sin(Dsp.TAU * factor * phase)), 1)
    }),
    sync: (frames = 32) => memo("sync" + frames, () => Dsp.Wavetable.fromFunction(frames, (phase, x) => {
        const slave = phase * (1 + 7 * x)
        return 2 * (slave - Math.floor(slave)) - 1
    }, 4)),
    fold: (frames = 32) => memo("fold" + frames, () => Dsp.Wavetable.fromFunction(frames, (phase, x) => Math.sin(Math.PI * 0.5 * (1 + 7 * x) * Math.sin(Dsp.TAU * phase)), 1))
}
`
}

export const ScriptDspWavetableBlocks: ReadonlyArray<ScriptDspBlock> = [fft, wavetable, tables]
