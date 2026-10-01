import {AudioData, ppqn, seconds} from "@opendaw/lib-dsp"
import {UpdateTask} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {int} from "@opendaw/lib-std"
import {Sample} from "./Api"

export type ScriptPresetCategory =
    "instrument" | "audio-effect" | "midi-effect" | "audio-unit" | "audio-effect-chain" | "midi-effect-chain"

export type ScriptPreset = {
    readonly uuid: string
    readonly name: string
    readonly category: ScriptPresetCategory
    readonly buffer: ArrayBuffer
}

export type MixdownRange = { readonly from: ppqn, readonly to: ppqn, readonly tail: seconds }

// A validated Project.mixdown call: units travel as audio unit uuids
export type MixdownRequest = {
    readonly sampleRate: int
    readonly units?: ReadonlyArray<string>
    readonly range?: MixdownRange
}

export interface ScriptHostProtocol {
    openProject(buffer: ArrayBufferLike, name?: string): void
    // Replays a script's edits onto the open project as one undoable step. `checksum` is the graph the
    // script started from, so the host can refuse when the project changed in the meantime.
    applyUpdates(updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>, checksum: Int8Array): void
    hasProject(): Promise<boolean>
    fetchProject(): Promise<{ buffer: ArrayBuffer, name: string }>
    showInfo(headline: string, message: string): Promise<void>
    addSample(data: AudioData, name: string, bpm?: number): Promise<Sample>
    listSamples(): Promise<ReadonlyArray<Sample>>
    renderMixdown(buffer: ArrayBufferLike, request: MixdownRequest): Promise<AudioData>
    saveFile(buffer: ArrayBuffer, fileName: string, mimeType: string): Promise<void>
    fetchPreset(uuid: string): Promise<ScriptPreset>
    fetchTubularVoice(cartridge: string, voice: int | string): Promise<Uint8Array>
}
