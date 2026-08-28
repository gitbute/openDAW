import {Box} from "@opendaw/lib-box"
import {NeonDeviceBox, VaporisateurDeviceBox} from "@opendaw/studio-boxes"
import {Neon} from "../devices/instruments/NeonDeviceBoxAdapter"
import {SemanticFieldSpec, SemanticFields} from "./SemanticFields"

export type SupportedInstrumentBox = NeonDeviceBox | VaporisateurDeviceBox

export type InstrumentSemanticGroup = {
    readonly prefix: string
    readonly label: string
}

export type InstrumentSemantic = {
    /** Human-readable instrument identity, for example `Neon`. */
    readonly type: "Neon" | "Vaporisateur"
    /** The original live box; semantic leaves point into this box. */
    readonly box: SupportedInstrumentBox
    /** Canonical nested semantic field mapping. */
    readonly spec: SemanticFieldSpec
    /** Alias for callers that prefer the term `fields`. */
    readonly fields: SemanticFieldSpec
    readonly groups: ReadonlyArray<InstrumentSemanticGroup>
}

export const SupportedInstrumentBoxNames = ["NeonDeviceBox", "VaporisateurDeviceBox"] as const

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

const withFields = <BOX extends SupportedInstrumentBox>(
    type: InstrumentSemantic["type"], box: BOX, spec: SemanticFieldSpec,
    groups: ReadonlyArray<InstrumentSemanticGroup> = []): InstrumentSemantic => ({
    type,
    box,
    spec,
    fields: spec,
    groups
})

const neonGroups = (): ReadonlyArray<InstrumentSemanticGroup> =>
    boxGroups(6, index => `envelopes.${index}`, index => Neon.envelopeContext(index)?.label ?? `Envelope ${index}`)

const boxGroups = (length: number,
                   prefix: (index: number) => string,
                   label: (index: number) => string): ReadonlyArray<InstrumentSemanticGroup> =>
    Array.from({length}, (_, index) => ({prefix: prefix(index), label: label(index)}))

export const isSupportedInstrumentBox = (box: Box): box is SupportedInstrumentBox =>
    box instanceof NeonDeviceBox || box instanceof VaporisateurDeviceBox

/** Canonical semantic mappings for the supported instrument boxes. */
export namespace InstrumentSemantics {
    /** Return a live semantic mapping for a real supported instrument box. */
    export const forBox = (box: Box): InstrumentSemantic | null => {
        if (box instanceof NeonDeviceBox) {
            const spec = neonSpec(box)
            return withFields("Neon", box, spec, neonGroups())
        }
        if (box instanceof VaporisateurDeviceBox) {
            const spec = vaporisateurSpec(box)
            return withFields("Vaporisateur", box, spec)
        }
        return null
    }

    /** Return the semantic leaf paths for a supported instrument box. */
    export const paths = (box: Box): ReadonlyArray<string> => {
        const semantics = forBox(box)
        return semantics === null ? [] : SemanticFields.paths(semantics.spec)
    }
}
