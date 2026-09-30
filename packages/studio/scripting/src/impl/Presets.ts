import {Box, Field, IndexedBox} from "@opendaw/lib-box"
import {Attempt, isDefined, panic} from "@opendaw/lib-std"
import {AudioUnitBox, InstrumentCompositeCellBox} from "@opendaw/studio-boxes"
import {AudioUnitType} from "@opendaw/studio-enums"
import {Dx7Sysex, EffectPointerType, PresetDecoder, PresetHeader, TubularPreset} from "@opendaw/studio-adapters"
import {AnyDevice} from "../Api"
import {ScriptPreset} from "../ScriptHostProtocol"
import {Context} from "./Context"
import {Facade} from "./Common"
import {Facades} from "./Facades"
import {AudioUnitFacade, AudioUnitImpls, InstrumentAudioUnitImpl} from "./AudioUnits"
import {EffectFacade} from "./devices/EffectChain"
import {InstrumentCompositeLayerImpl, InstrumentFacade, TubularImpl} from "./devices/Instruments"
import {AudioEffectImpls} from "./devices/AudioEffects"
import {MIDIEffectImpls} from "./devices/MIDIEffects"

export namespace Presets {
    const succeed = (attempt: Attempt<void, string>, preset: ScriptPreset): void => {
        if (attempt.isFailure()) {panic(new Error(`Cannot apply preset '${preset.name}': ${attempt.failureReason()}`))}
    }

    const instrumentOf = (context: Context, audioUnitBox: AudioUnitBox): AnyDevice => {
        const unit = AudioUnitImpls.wrap(context, audioUnitBox)
        return unit instanceof InstrumentAudioUnitImpl ? unit.instrument : panic("Not an instrument unit")
    }

    const chainKindOf = (preset: ScriptPreset): PresetHeader.ChainKind =>
        preset.category === "midi-effect" || preset.category === "midi-effect-chain"
            ? PresetHeader.ChainKind.Midi : PresetHeader.ChainKind.Audio

    const wrapEffect = (context: Context, kind: PresetHeader.ChainKind, box: Box): AnyDevice =>
        kind === PresetHeader.ChainKind.Midi ? MIDIEffectImpls.wrap(context, box) : AudioEffectImpls.wrap(context, box)

    const insert = (context: Context, preset: ScriptPreset, field: Field, index: number): AnyDevice => {
        const kind = chainKindOf(preset)
        succeed(PresetDecoder.insertEffectChain(preset.buffer, field as Field<EffectPointerType>, index, kind), preset)
        return wrapEffect(context, kind, IndexedBox.collectIndexedBoxes(field)[index])
    }

    const appendTo = (context: Context, preset: ScriptPreset, audioUnitBox: AudioUnitBox): AnyDevice => {
        const field = chainKindOf(preset) === PresetHeader.ChainKind.Midi ? audioUnitBox.midiEffects : audioUnitBox.audioEffects
        return insert(context, preset, field, IndexedBox.collectIndexedBoxes(field).length)
    }

    const replaceInstrument = (context: Context, preset: ScriptPreset, audioUnitBox: AudioUnitBox): AnyDevice => {
        if (audioUnitBox.type.getValue() !== AudioUnitType.Instrument) {
            return panic(new TypeError(`'${preset.name}' is an instrument preset and needs an instrument unit`))
        }
        const keep = preset.category === "instrument"
        succeed(PresetDecoder.replaceAudioUnit(preset.buffer, audioUnitBox,
            {keepMIDIEffects: keep, keepAudioEffects: keep, keepTimeline: keep}), preset)
        return instrumentOf(context, audioUnitBox)
    }

    const applyToInstrument = (context: Context, preset: ScriptPreset, box: Box): AnyDevice => {
        const hostBox = Facades.parentBox(box)
        if (hostBox instanceof InstrumentCompositeCellBox) {
            if (preset.category !== "instrument") {
                return panic(new TypeError(`'${preset.name}' (${preset.category}) cannot be loaded into a composite layer`))
            }
            succeed(PresetDecoder.replaceLayerInstrument(preset.buffer, hostBox), preset)
            return InstrumentCompositeLayerImpl.wrap(context, hostBox).instrument
        }
        return applyToUnit(context, preset, Facades.audioUnitBoxOf(box))
    }

    const applyToUnit = (context: Context, preset: ScriptPreset, audioUnitBox: AudioUnitBox): AnyDevice => {
        switch (preset.category) {
            case "instrument":
            case "audio-unit":
                return replaceInstrument(context, preset, audioUnitBox)
            default:
                return appendTo(context, preset, audioUnitBox)
        }
    }

    const applyToEffect = (context: Context, preset: ScriptPreset, effect: EffectFacade): AnyDevice => {
        const isMidi = MIDIEffectImpls.isBox(effect.box)
        const matches = (preset.category === "midi-effect" && isMidi) || (preset.category === "audio-effect" && !isMidi)
        if (!matches) {
            return preset.category === "instrument" || preset.category === "audio-unit"
                ? replaceInstrument(context, preset, Facades.audioUnitBoxOf(effect.box))
                : appendTo(context, preset, Facades.audioUnitBoxOf(effect.box))
        }
        const created = insert(context, preset, effect.hostField, effect.index)
        effect.remove()
        return created
    }

    export const apply = (target: Facade, preset: ScriptPreset): AnyDevice => {
        const context = target.context
        return context.edit(() => {
            if (target instanceof EffectFacade) {return applyToEffect(context, preset, target)}
            if (target instanceof InstrumentFacade) {return applyToInstrument(context, preset, target.box)}
            if (target instanceof AudioUnitFacade) {return applyToUnit(context, preset, target.box)}
            return panic(new TypeError(`applyPreset: ${target.constructor.name} cannot hold a preset`))
        })
    }

    export const loadTubularVoice = (target: TubularImpl, voice: Uint8Array): void => {
        if (!isDefined(voice) || voice.length !== Dx7Sysex.PATCH_SIZE) {
            return panic(new RangeError(`loadTubularVoice: expected ${Dx7Sysex.PATCH_SIZE} bytes of voice data`))
        }
        target.context.edit(() => TubularPreset.apply(target.box, voice))
    }
}
