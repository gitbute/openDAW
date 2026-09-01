import {Box} from "@opendaw/lib-box"
import {
    ApparatDeviceBox,
    ArpeggioDeviceBox,
    AudioEffectCompositeBox,
    AutotuneDeviceBox,
    CompressorDeviceBox,
    ConvolverDeviceBox,
    CrusherDeviceBox,
    CubedDeviceBox,
    DattorroReverbDeviceBox,
    DelayDeviceBox,
    FoldDeviceBox,
    FrequencySplitBox,
    GateDeviceBox,
    MIDIOutputDeviceBox,
    MaximizerDeviceBox,
    NanoDeviceBox,
    NeuralAmpDeviceBox,
    NeonDeviceBox,
    PitchDeviceBox,
    PlayfieldDeviceBox,
    RevampDeviceBox,
    ReverbDeviceBox,
    SoundfontDeviceBox,
    SpielwerkDeviceBox,
    StereoCompositeBox,
    StereoToolDeviceBox,
    TapeDeviceBox,
    TidalDeviceBox,
    VaporisateurDeviceBox,
    VelocityDeviceBox,
    VocoderDeviceBox,
    WaveshaperDeviceBox,
    WerkstattDeviceBox,
    ZeitgeistDeviceBox
} from "@opendaw/studio-boxes"
import {Neon} from "../devices/instruments/NeonDeviceBoxAdapter"
import {SemanticFieldSpec} from "./SemanticFields"

export type DeviceCategory = "instrument" | "midi-effect" | "audio-effect"

export type DeviceSemanticGroup = {
    readonly prefix: string
    readonly label: string
}

export type DeviceSemantic = {
    readonly category: DeviceCategory
    readonly type: string
    readonly box: Box
    readonly spec: SemanticFieldSpec
    readonly groups: ReadonlyArray<DeviceSemanticGroup>
}

const cubedSpec = (box: CubedDeviceBox): SemanticFieldSpec => ({
    tuning: box.tuning,
    cutoff: box.cutoff,
    resonance: box.resonance,
    envMod: box.envMod,
    decay: box.decay,
    accent: box.accent,
    volume: box.volume,
    waveform: box.waveform,
    patternIndex: box.patternIndex
})

const neonSpec = (box: NeonDeviceBox): SemanticFieldSpec => ({
    lineSelect: box.lineSelect,
    modulation: box.modulation,
    octave: box.octave,
    detune: box.detune,
    tune: box.tune,
    glideTime: box.glideTime,
    voicingMode: box.voicingMode,
    vibrato: {
        wave: box.vibrato.wave,
        delay: box.vibrato.delay,
        rate: box.vibrato.rate,
        depth: box.vibrato.depth
    },
    lines: box.lines.fields().map(line => ({
        wave1: line.wave1,
        wave2: line.wave2,
        dcwKeyFollow: line.dcwKeyFollow,
        dcaKeyFollow: line.dcaKeyFollow
    })),
    envelopes: box.envelopes.fields().map(envelope => ({
        rate1: envelope.rate1,
        rate2: envelope.rate2,
        rate3: envelope.rate3,
        rate4: envelope.rate4,
        rate5: envelope.rate5,
        rate6: envelope.rate6,
        rate7: envelope.rate7,
        rate8: envelope.rate8,
        level1: envelope.level1,
        level2: envelope.level2,
        level3: envelope.level3,
        level4: envelope.level4,
        level5: envelope.level5,
        level6: envelope.level6,
        level7: envelope.level7,
        level8: envelope.level8,
        sustain: envelope.sustain,
        end: envelope.end
    }))
})

const vaporisateurSpec = (box: VaporisateurDeviceBox): SemanticFieldSpec => ({
    cutoff: box.cutoff,
    resonance: box.resonance,
    filterOrder: box.filterOrder,
    attack: box.attack,
    decay: box.decay,
    sustain: box.sustain,
    release: box.release,
    filterEnvelope: box.filterEnvelope,
    filterKeyboard: box.filterKeyboard,
    voicingMode: box.voicingMode,
    glideTime: box.glideTime,
    unisonCount: box.unisonCount,
    unisonDetune: box.unisonDetune,
    unisonStereo: box.unisonStereo,
    lfo: {
        waveform: box.lfo.waveform,
        rate: box.lfo.rate,
        sync: box.lfo.sync,
        targetTune: box.lfo.targetTune,
        targetCutoff: box.lfo.targetCutoff,
        targetVolume: box.lfo.targetVolume
    },
    oscillators: box.oscillators.fields().map(oscillator => ({
        waveform: oscillator.waveform,
        volume: oscillator.volume,
        octave: oscillator.octave,
        tune: oscillator.tune
    })),
    noise: {
        attack: box.noise.attack,
        hold: box.noise.hold,
        release: box.noise.release,
        volume: box.noise.volume
    }
})

const nanoSpec = (box: NanoDeviceBox): SemanticFieldSpec => ({
    volume: box.volume,
    release: box.release
})

const tapeSpec = (box: TapeDeviceBox): SemanticFieldSpec => ({
    flutter: box.flutter,
    wow: box.wow,
    noise: box.noise,
    saturation: box.saturation
})

const soundfontSpec = (box: SoundfontDeviceBox): SemanticFieldSpec => ({
    presetIndex: box.presetIndex
})

const midiOutputSpec = (box: MIDIOutputDeviceBox): SemanticFieldSpec => ({
    channel: box.channel
})

const boxGroups = (length: number,
                   prefix: (index: number) => string,
                   label: (index: number) => string): ReadonlyArray<DeviceSemanticGroup> =>
    Array.from({length}, (_, index) => ({prefix: prefix(index), label: label(index)}))

const neonGroups = (): ReadonlyArray<DeviceSemanticGroup> =>
    boxGroups(6, index => `envelopes.${index}`, index => Neon.envelopeContext(index)?.label ?? `Envelope ${index}`)

const device = (category: DeviceCategory,
                type: string,
                box: Box,
                spec: SemanticFieldSpec = {},
                groups: ReadonlyArray<DeviceSemanticGroup> = []): DeviceSemantic =>
    ({category, type, box, spec, groups})

const typeOf = (box: Box): string => box.name.replace(/DeviceBox$|Box$/, "")

export namespace DeviceSemantics {
    export const forBox = (box: Box): DeviceSemantic | null => {
        if (box instanceof CubedDeviceBox) {
            return device("instrument", "Cubed", box, cubedSpec(box))
        }
        if (box instanceof MIDIOutputDeviceBox) {
            return device("instrument", "MIDIOutput", box, midiOutputSpec(box))
        }
        if (box instanceof NanoDeviceBox) {
            return device("instrument", "Nano", box, nanoSpec(box))
        }
        if (box instanceof NeonDeviceBox) {
            return device("instrument", "Neon", box, neonSpec(box), neonGroups())
        }
        if (box instanceof SoundfontDeviceBox) {
            return device("instrument", "Soundfont", box, soundfontSpec(box))
        }
        if (box instanceof TapeDeviceBox) {
            return device("instrument", "Tape", box, tapeSpec(box))
        }
        if (box instanceof VaporisateurDeviceBox) {
            return device("instrument", "Vaporisateur", box, vaporisateurSpec(box))
        }
        if (box instanceof ApparatDeviceBox || box instanceof PlayfieldDeviceBox) {
            return device("instrument", typeOf(box), box)
        }

        if (
            box instanceof ArpeggioDeviceBox
            || box instanceof PitchDeviceBox
            || box instanceof SpielwerkDeviceBox
            || box instanceof VelocityDeviceBox
            || box instanceof ZeitgeistDeviceBox
        ) {
            return device("midi-effect", typeOf(box), box)
        }

        if (box instanceof CompressorDeviceBox || box instanceof GateDeviceBox || box instanceof VocoderDeviceBox) {
            return device("audio-effect", typeOf(box), box, {sideChain: box.sideChain})
        }
        if (box instanceof NeuralAmpDeviceBox) {
            return device("audio-effect", typeOf(box), box, {mono: box.mono})
        }
        if (
            box instanceof AudioEffectCompositeBox
            || box instanceof StereoCompositeBox
            || box instanceof FrequencySplitBox
            || box instanceof AutotuneDeviceBox
            || box instanceof ConvolverDeviceBox
            || box instanceof CrusherDeviceBox
            || box instanceof DattorroReverbDeviceBox
            || box instanceof DelayDeviceBox
            || box instanceof FoldDeviceBox
            || box instanceof ReverbDeviceBox
            || box instanceof MaximizerDeviceBox
            || box instanceof RevampDeviceBox
            || box instanceof StereoToolDeviceBox
            || box instanceof TidalDeviceBox
            || box instanceof WaveshaperDeviceBox
            || box instanceof WerkstattDeviceBox
        ) {
            return device("audio-effect", typeOf(box), box)
        }
        return null
    }
}
