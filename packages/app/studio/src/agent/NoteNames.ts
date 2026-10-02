import {int} from "@opendaw/lib-std"
import {hzToMidi, MidiKeys} from "@opendaw/lib-dsp"

/** Note names for the agent in scientific pitch notation (C4 = MIDI 60, A4 = 440 Hz), as tutorials and references use them. */
export namespace NoteNames {
    export const Convention = "C4 = MIDI 60, A4 = 440 Hz"

    export const ofMidi = (midi: int): string => `${MidiKeys.Names.English[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`

    export const ofHz = (hz: number): string => {
        const midi = Math.round(hzToMidi(hz))
        return midi >= 0 && midi < 128 ? ofMidi(midi) : "-"
    }
}
