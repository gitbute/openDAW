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
import {
    InstrumentSemantics,
    SupportedInstrumentBox as MappedInstrumentBox,
    InstrumentSemanticGroup
} from "./InstrumentSemantics"
import {SemanticFieldSpec, SemanticFields} from "./SemanticFields"

export type DeviceCategory = "instrument" | "midi-effect" | "audio-effect"

export type SupportedPublicInstrumentBox =
    | MappedInstrumentBox
    | ApparatDeviceBox
    | PlayfieldDeviceBox

export type SupportedMidiEffectBox =
    | ArpeggioDeviceBox
    | PitchDeviceBox
    | SpielwerkDeviceBox
    | VelocityDeviceBox
    | ZeitgeistDeviceBox

export type SupportedAudioEffectBox =
    | AudioEffectCompositeBox
    | StereoCompositeBox
    | FrequencySplitBox
    | AutotuneDeviceBox
    | CompressorDeviceBox
    | ConvolverDeviceBox
    | CrusherDeviceBox
    | DattorroReverbDeviceBox
    | DelayDeviceBox
    | FoldDeviceBox
    | ReverbDeviceBox
    | GateDeviceBox
    | MaximizerDeviceBox
    | RevampDeviceBox
    | StereoToolDeviceBox
    | TidalDeviceBox
    | NeuralAmpDeviceBox
    | VocoderDeviceBox
    | WaveshaperDeviceBox
    | WerkstattDeviceBox

export type SupportedDeviceBox =
    | SupportedPublicInstrumentBox
    | SupportedMidiEffectBox
    | SupportedAudioEffectBox

export type DeviceSemanticType =
    | "Apparat"
    | "Cubed"
    | "MIDIOutput"
    | "Nano"
    | "Neon"
    | "Playfield"
    | "Soundfont"
    | "Tape"
    | "Vaporisateur"
    | "Arpeggio"
    | "Pitch"
    | "Spielwerk"
    | "Velocity"
    | "Zeitgeist"
    | "AudioEffectComposite"
    | "StereoComposite"
    | "FrequencySplit"
    | "Autotune"
    | "Compressor"
    | "Convolver"
    | "Crusher"
    | "DattorroReverb"
    | "Delay"
    | "Fold"
    | "Reverb"
    | "Gate"
    | "Maximizer"
    | "Revamp"
    | "StereoTool"
    | "Tidal"
    | "NeuralAmp"
    | "Vocoder"
    | "Waveshaper"
    | "Werkstatt"

export type DeviceSemanticGroup = InstrumentSemanticGroup

export type DeviceSemantic = {
    /** The provider-neutral device category. */
    readonly category: DeviceCategory
    /** The public device identity, normally matching its factory key. */
    readonly type: DeviceSemanticType
    /** The original live box; semantic leaves point into this box. */
    readonly box: SupportedDeviceBox
    /** Only controls without an equivalent generic parameter need to be listed here. */
    readonly spec: SemanticFieldSpec
    /** Alias for callers that prefer the term `fields`. */
    readonly fields: SemanticFieldSpec
    readonly groups: ReadonlyArray<DeviceSemanticGroup>
}

export const SupportedPublicInstrumentBoxNames = [
    "ApparatDeviceBox",
    "CubedDeviceBox",
    "NeonDeviceBox",
    "MIDIOutputDeviceBox",
    "NanoDeviceBox",
    "PlayfieldDeviceBox",
    "SoundfontDeviceBox",
    "TapeDeviceBox",
    "VaporisateurDeviceBox"
] as const

export const SupportedMidiEffectBoxNames = [
    "ArpeggioDeviceBox",
    "PitchDeviceBox",
    "SpielwerkDeviceBox",
    "VelocityDeviceBox",
    "ZeitgeistDeviceBox"
] as const

export const SupportedAudioEffectBoxNames = [
    "AudioEffectCompositeBox",
    "StereoCompositeBox",
    "FrequencySplitBox",
    "AutotuneDeviceBox",
    "CompressorDeviceBox",
    "ConvolverDeviceBox",
    "CrusherDeviceBox",
    "DattorroReverbDeviceBox",
    "DelayDeviceBox",
    "FoldDeviceBox",
    "ReverbDeviceBox",
    "GateDeviceBox",
    "MaximizerDeviceBox",
    "RevampDeviceBox",
    "StereoToolDeviceBox",
    "TidalDeviceBox",
    "NeuralAmpDeviceBox",
    "VocoderDeviceBox",
    "WaveshaperDeviceBox",
    "WerkstattDeviceBox"
] as const

export const SupportedDeviceBoxNames = [
    ...SupportedPublicInstrumentBoxNames,
    ...SupportedMidiEffectBoxNames,
    ...SupportedAudioEffectBoxNames
] as const

const emptySpec = (): SemanticFieldSpec => ({})

const device = <BOX extends SupportedDeviceBox>(
    category: DeviceCategory,
    type: DeviceSemanticType,
    box: BOX,
    spec: SemanticFieldSpec = emptySpec(),
    groups: ReadonlyArray<DeviceSemanticGroup> = []
): DeviceSemantic => ({category, type, box, spec, fields: spec, groups})

const isSupportedInstrument = (box: Box): box is SupportedPublicInstrumentBox =>
    box instanceof ApparatDeviceBox
    || box instanceof CubedDeviceBox
    || box instanceof NeonDeviceBox
    || box instanceof MIDIOutputDeviceBox
    || box instanceof NanoDeviceBox
    || box instanceof PlayfieldDeviceBox
    || box instanceof SoundfontDeviceBox
    || box instanceof TapeDeviceBox
    || box instanceof VaporisateurDeviceBox

const isSupportedMidiEffect = (box: Box): box is SupportedMidiEffectBox =>
    box instanceof ArpeggioDeviceBox
    || box instanceof PitchDeviceBox
    || box instanceof SpielwerkDeviceBox
    || box instanceof VelocityDeviceBox
    || box instanceof ZeitgeistDeviceBox

const isSupportedAudioEffect = (box: Box): box is SupportedAudioEffectBox =>
    box instanceof AudioEffectCompositeBox
    || box instanceof StereoCompositeBox
    || box instanceof FrequencySplitBox
    || box instanceof AutotuneDeviceBox
    || box instanceof CompressorDeviceBox
    || box instanceof ConvolverDeviceBox
    || box instanceof CrusherDeviceBox
    || box instanceof DattorroReverbDeviceBox
    || box instanceof DelayDeviceBox
    || box instanceof FoldDeviceBox
    || box instanceof ReverbDeviceBox
    || box instanceof GateDeviceBox
    || box instanceof MaximizerDeviceBox
    || box instanceof RevampDeviceBox
    || box instanceof StereoToolDeviceBox
    || box instanceof TidalDeviceBox
    || box instanceof NeuralAmpDeviceBox
    || box instanceof VocoderDeviceBox
    || box instanceof WaveshaperDeviceBox
    || box instanceof WerkstattDeviceBox

export const isSupportedDeviceBox = (box: Box): box is SupportedDeviceBox =>
    isSupportedInstrument(box) || isSupportedMidiEffect(box) || isSupportedAudioEffect(box)

const typeOf = (box: SupportedDeviceBox): DeviceSemanticType =>
    box.name.replace(/DeviceBox$|Box$/, "") as DeviceSemanticType

/**
 * Canonical semantic mappings for public instruments and effects.
 *
 * Ordinary effect controls are deliberately not copied here: their
 * AutomatableParameterFieldAdapter is already the canonical generic parameter
 * surface. This mapping only promotes fields that need a provider-neutral
 * semantic route in addition to that surface.
 */
export namespace DeviceSemantics {
    export const forBox = (box: Box): DeviceSemantic | null => {
        if (isSupportedInstrument(box)) {
            const instrument = InstrumentSemantics.forBox(box)
            if (instrument !== null) {
                return device("instrument", instrument.type, box, instrument.spec, instrument.groups)
            }
            return device("instrument", typeOf(box), box)
        }
        if (isSupportedMidiEffect(box)) {
            return device("midi-effect", typeOf(box), box)
        }
        if (isSupportedAudioEffect(box)) {
            // `mono` is a stable user-facing NeuralAmp switch that is not
            // represented by its generic named-parameter set. All other public
            // effect controls are already exposed through generic parameters.
            const spec = box instanceof NeuralAmpDeviceBox
                ? {mono: box.mono}
                : emptySpec()
            return device("audio-effect", typeOf(box), box, spec)
        }
        return null
    }

    export const paths = (box: Box): ReadonlyArray<string> => {
        const semantics = forBox(box)
        return semantics === null ? [] : SemanticFields.paths(semantics.spec)
    }
}
