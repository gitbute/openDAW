import {asDefined, int, isDefined, isNotNull, Option, Procedure, UUID} from "@opendaw/lib-std"
import {Box, PrimitiveField, PrimitiveValues} from "@opendaw/lib-box"
import {AudioUnitType, IconSymbol, VoicingMode} from "@opendaw/studio-enums"
import {AudioBusBox, AudioUnitBox, AuxSendBox, TrackBox, VaporisateurDeviceBox} from "@opendaw/studio-boxes"
import {
    AudioUnitFactory,
    CaptureBox,
    InstrumentFactories,
    InstrumentSemantics,
    ProjectSkeleton,
    SemanticFields
} from "@opendaw/studio-adapters"
import {AuxAudioUnitImpl, GroupAudioUnitImpl, InstrumentAudioUnitImpl, ProjectImpl, SendImpl} from "./impl"
import {MIDIEffectFactory} from "./MIDIEffectFactory"
import {AudioEffectFactory} from "./AudioEffectFactory"
import {NoteTrackWriter} from "./NoteTrackWriter"
import {ValueTrackWriter} from "./ValueTrackWriter"
import {AnyDevice, AudioUnit, Nano, Vaporisateur} from "./Api"
import {AudioTrackWriter} from "./AudioTrackWriter"
import {AudioFileBoxfactory} from "./AudioFileBoxfactory"

export namespace AudioUnitBoxFactory {
    export const create = (skeleton: ProjectSkeleton, project: ProjectImpl): void => {
        const {boxGraph, mandatoryBoxes: {rootBox, primaryAudioBusBox, primaryAudioUnitBox}} = skeleton
        let audioUnitIndex: int = 0
        const devices: Map<AnyDevice, Box> = new Map()
        const busMap: Map<AudioUnit, AudioBusBox> = new Map([[project.output, primaryAudioBusBox]])
        const audioUnitMap: Map<AudioUnit, AudioUnitBox> = new Map([[project.output, primaryAudioUnitBox]])
        const awaitedSends: Array<[SendImpl, AuxSendBox]> = []
        const noteTrackWriter = new NoteTrackWriter()
        const valueTrackWriter = new ValueTrackWriter()
        const createSend = (sends: ReadonlyArray<SendImpl>, audioUnitBox: AudioUnitBox) => {
            awaitedSends.push(...(sends.map((send: SendImpl, index: int): [SendImpl, AuxSendBox] =>
                [send, AuxSendBox.create(boxGraph, UUID.generate(), box => {
                    box.index.setValue(index)
                    box.audioUnit.refer(audioUnitBox.auxSends)
                    box.sendGain.setValue(send.amount)
                    box.sendPan.setValue(send.pan)
                    // TODO mode "pre" | "post"
                })])))
        }
        project.instrumentUnits.forEach((audioUnit: InstrumentAudioUnitImpl) => {
            const {
                instrument, midiEffects, audioEffects, noteTracks, audioTracks, valueTracks,
                volume, panning, mute, solo, sends
            } = audioUnit
            const factory = InstrumentFactories.Named[instrument.name]
            const capture: Option<CaptureBox> = AudioUnitFactory.trackTypeToCapture(boxGraph, factory.trackType)
            const audioUnitBox = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, capture)
            devices.set(audioUnit, audioUnitBox)
            audioUnitBox.index.setValue(audioUnitIndex++)
            audioUnitBox.mute.setValue(mute)
            audioUnitBox.solo.setValue(solo)
            audioUnitBox.volume.setValue(volume)
            audioUnitBox.panning.setValue(panning)
            if (factory === InstrumentFactories.Nano) {
                const constructorFn = instrument.constructorFn as Procedure<Nano> | undefined
                let sample: Nano["sample"] | undefined
                if (isDefined(constructorFn)) {
                    const wrapper = {sample: undefined as Nano["sample"] | undefined} as Nano
                    constructorFn(wrapper)
                    sample = wrapper.sample
                }
                factory.create(boxGraph, audioUnitBox.input, factory.defaultName, factory.defaultIcon,
                    isDefined(sample) ? AudioFileBoxfactory.create(boxGraph, sample) : undefined)
            } else if (factory === InstrumentFactories.Vaporisateur) {
                const deviceBox = factory.create(boxGraph, audioUnitBox.input, factory.defaultName, factory.defaultIcon)
                const constructorFn = instrument.constructorFn as Procedure<Vaporisateur> | undefined
                if (isDefined(constructorFn)) {
                    constructorFn(createVaporisateurWrapper(deviceBox))
                }
            } else {
                factory.create(boxGraph, audioUnitBox.input, factory.defaultName, factory.defaultIcon)
            }
            midiEffects.forEach((effect) => devices.set(effect, MIDIEffectFactory.write(boxGraph, audioUnitBox, effect)))
            audioEffects.forEach((effect) => devices.set(effect, AudioEffectFactory.write(boxGraph, audioUnitBox, effect)))
            const indexRef = {index: 0}
            noteTrackWriter.write(boxGraph, audioUnitBox, noteTracks, indexRef)
            valueTrackWriter.write(boxGraph, devices, audioUnitBox, valueTracks, indexRef)
            AudioTrackWriter.write(boxGraph, audioUnitBox, audioTracks, indexRef)
            if (indexRef.index === 0) { // create a default track if none existed
                TrackBox.create(boxGraph, UUID.generate(), box => {
                    box.type.setValue(factory.trackType)
                    box.index.setValue(0)
                    box.target.refer(audioUnitBox)
                    box.tracks.refer(audioUnitBox.tracks)
                })
            }
            createSend(sends, audioUnitBox)
            audioUnitMap.set(audioUnit, audioUnitBox)
        })
        const convertBusUnits = (audioUnit: GroupAudioUnitImpl | AuxAudioUnitImpl,
                                 type: string, icon: IconSymbol, color: string) => {
            const audioBusBox = AudioBusBox.create(boxGraph, UUID.generate(), box => {
                box.collection.refer(rootBox.audioBusses)
                box.label.setValue(audioUnit.label)
                box.icon.setValue(IconSymbol.toName(icon))
                box.color.setValue(color)
            })
            const audioUnitBox = AudioUnitBox.create(boxGraph, UUID.generate(), box => {
                box.type.setValue(type)
                box.collection.refer(rootBox.audioUnits)
                box.index.setValue(audioUnitIndex++)
            })
            busMap.set(audioUnit, audioBusBox)
            audioUnitMap.set(audioUnit, audioUnitBox)
            audioBusBox.output.refer(audioUnitBox.input)
            createSend(audioUnit.sends, audioUnitBox)
            devices.set(audioUnit, audioUnitBox)
            audioUnit.audioEffects.forEach((effect) =>
                devices.set(effect, AudioEffectFactory.write(boxGraph, audioUnitBox, effect)))
            valueTrackWriter.write(boxGraph, devices, audioUnitBox, audioUnit.valueTracks, {index: 0})
        }

        // TODO Colors need to be in code and written to CSS
        // Then use ColorCodes!
        project.auxUnits.forEach(unit => convertBusUnits(
            unit, AudioUnitType.Aux, IconSymbol.Flask, "var(--color-orange)"))
        project.groupUnits.forEach(unit => convertBusUnits(
            unit, AudioUnitType.Bus, IconSymbol.AudioBus, "var(--color-blue)"))

        awaitedSends.forEach(([send, box]) =>
            box.targetBus.refer(asDefined(busMap.get(send.target), "Could not find AudioBus").input))

        const {output: {mute, solo, volume, panning}} = project
        primaryAudioUnitBox.mute.setValue(mute)
        primaryAudioUnitBox.solo.setValue(solo)
        primaryAudioUnitBox.volume.setValue(volume)
        primaryAudioUnitBox.panning.setValue(panning)
        primaryAudioUnitBox.index.setValue(audioUnitIndex)

        // connect
        const audioUnits: ReadonlyArray<AudioUnit> = [
            ...project.instrumentUnits,
            ...project.auxUnits,
            ...project.groupUnits
        ]
        audioUnits.forEach((audioUnit: AudioUnit) => {
            const {output} = audioUnit
            // undefined means we connect this to the primary output
            // null means this is intended to be unplugged
            const audioBusBox = output === undefined
                ? primaryAudioBusBox : output === null
                    ? null : asDefined(busMap.get(output), "Could not find AudioBus")
            if (isNotNull(audioBusBox)) {
                const audioUnitBox = asDefined(audioUnitMap.get(audioUnit), "audio unit not found in map")
                audioUnitBox.output.refer(audioBusBox.input)
            }
        })
    }

    const createVaporisateurWrapper = (box: VaporisateurDeviceBox): Vaporisateur => {
        const semantics = InstrumentSemantics.forBox(box)
        if (semantics === null) {throw new Error("No shared semantics for Vaporisateur")}
        const fieldAt = <T extends PrimitiveValues>(path: string): PrimitiveField<T> => {
            const field = SemanticFields.resolve(semantics.spec, path)
            if (field === undefined) {throw new Error(`No shared Vaporisateur field at '${path}'`)}
            return field as PrimitiveField<T>
        }
        const read = <T extends PrimitiveValues>(path: string): T => fieldAt<T>(path).getValue()
        const write = <T extends PrimitiveValues>(path: string, value: T): void => fieldAt<T>(path).setValue(value)
        return {
            // Instrument base (readonly, not used in constructor)
            get audioUnit() {return undefined as any},
            // Filter
            get cutoff() {return read<number>("cutoff")},
            set cutoff(v) {write("cutoff", v)},
            get resonance() {return read<number>("resonance")},
            set resonance(v) {write("resonance", v)},
            get filterOrder() {return read<number>("filterOrder") as 1 | 2 | 3 | 4},
            set filterOrder(v) {write("filterOrder", v)},
            get filterEnvelope() {return read<number>("filterEnvelope")},
            set filterEnvelope(v) {write("filterEnvelope", v)},
            get filterKeyboard() {return read<number>("filterKeyboard")},
            set filterKeyboard(v) {write("filterKeyboard", v)},
            // Envelope
            get attack() {return read<number>("attack")},
            set attack(v) {write("attack", v)},
            get decay() {return read<number>("decay")},
            set decay(v) {write("decay", v)},
            get sustain() {return read<number>("sustain")},
            set sustain(v) {write("sustain", v)},
            get release() {return read<number>("release")},
            set release(v) {write("release", v)},
            // Voice
            get voicingMode() {return read<number>("voicingMode") as VoicingMode},
            set voicingMode(v) {write("voicingMode", v)},
            get glideTime() {return read<number>("glideTime")},
            set glideTime(v) {write("glideTime", v)},
            // Unison
            get unisonCount() {return read<number>("unisonCount") as 1 | 3 | 5},
            set unisonCount(v) {write("unisonCount", v)},
            get unisonDetune() {return read<number>("unisonDetune")},
            set unisonDetune(v) {write("unisonDetune", v)},
            get unisonStereo() {return read<number>("unisonStereo")},
            set unisonStereo(v) {write("unisonStereo", v)},
            // LFO
            lfo: {
                get waveform() {return read<number>("lfo.waveform") as ClassicWaveform},
                set waveform(v) {write("lfo.waveform", v)},
                get rate() {return read<number>("lfo.rate")},
                set rate(v) {write("lfo.rate", v)},
                get sync() {return read<boolean>("lfo.sync")},
                set sync(v) {write("lfo.sync", v)},
                get targetTune() {return read<number>("lfo.targetTune")},
                set targetTune(v) {write("lfo.targetTune", v)},
                get targetCutoff() {return read<number>("lfo.targetCutoff")},
                set targetCutoff(v) {write("lfo.targetCutoff", v)},
                get targetVolume() {return read<number>("lfo.targetVolume")},
                set targetVolume(v) {write("lfo.targetVolume", v)}
            },
            // Oscillators
            oscillators: [
                {
                    get waveform() {return read<number>("oscillators.0.waveform") as ClassicWaveform},
                    set waveform(v) {write("oscillators.0.waveform", v)},
                    get volume() {return read<number>("oscillators.0.volume")},
                    set volume(v) {write("oscillators.0.volume", v)},
                    get octave() {return read<number>("oscillators.0.octave")},
                    set octave(v) {write("oscillators.0.octave", v)},
                    get tune() {return read<number>("oscillators.0.tune")},
                    set tune(v) {write("oscillators.0.tune", v)}
                },
                {
                    get waveform() {return read<number>("oscillators.1.waveform") as ClassicWaveform},
                    set waveform(v) {write("oscillators.1.waveform", v)},
                    get volume() {return read<number>("oscillators.1.volume")},
                    set volume(v) {write("oscillators.1.volume", v)},
                    get octave() {return read<number>("oscillators.1.octave")},
                    set octave(v) {write("oscillators.1.octave", v)},
                    get tune() {return read<number>("oscillators.1.tune")},
                    set tune(v) {write("oscillators.1.tune", v)}
                }
            ],
            // Noise
            noise: {
                get attack() {return read<number>("noise.attack")},
                set attack(v) {write("noise.attack", v)},
                get hold() {return read<number>("noise.hold")},
                set hold(v) {write("noise.hold", v)},
                get release() {return read<number>("noise.release")},
                set release(v) {write("noise.release", v)},
                get volume() {return read<number>("noise.volume")},
                set volume(v) {write("noise.volume", v)}
            }
        }
    }
}
