import {
    AudioData,
    Chord,
    ClassicWaveform,
    dbToGain,
    FFT,
    gainToDb,
    Interpolation,
    midiToHz,
    Mixing,
    PPQN,
    WavFile
} from "@opendaw/lib-dsp"
import {AudioSendRouting, TransientPlayMode, VoicingMode} from "@opendaw/studio-enums"
import {ScriptHostProtocol} from "./ScriptHostProtocol"
import {ScriptExecutionContext} from "./ScriptExecutionProtocol"
import {Api} from "./Api"
import {ApiImpl} from "./impl/ApiImpl"
import {DspLibraryImpl} from "./impl/DspLibraryImpl"

export namespace ScriptGlobals {
    export const create = (api: Api, context: ScriptExecutionContext): Record<string, unknown> => ({
        ...context,
        openDAW: api,
        AudioData, WavFile, midiToHz, PPQN, FFT, Chord, Interpolation, dbToGain, gainToDb,
        ClassicWaveform, VoicingMode, Mixing, TransientPlayMode, AudioSendRouting, Dsp: DspLibraryImpl
    })
}

export class ScriptRunner {
    readonly #api: Api

    constructor(protocol: ScriptHostProtocol, api: Api = new ApiImpl(protocol)) {this.#api = api}

    get api(): Api {return this.#api}

    async run(jsCode: string, context: ScriptExecutionContext): Promise<unknown> {
        Object.assign(globalThis, ScriptGlobals.create(this.#api, context))
        // Runs as a function body, not a module, so a script may `return` early
        const AsyncFunction = (async () => {}).constructor as new (body: string) => () => Promise<unknown>
        return new AsyncFunction(jsCode.replace(/^\s*export\s*\{\s*\};?/m, ""))()
    }
}
