import {AudioData} from "@opendaw/lib-dsp"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {int, isDefined, isNull, panic} from "@opendaw/lib-std"
import {AnyAudioUnit, AnyDevice, Api, Project, Sample, Tubular} from "../Api"
import {ScriptHostProtocol} from "../ScriptHostProtocol"
import {ProjectImpl} from "./ProjectImpl"
import {Guard} from "./Guard"
import {Facade} from "./Common"
import {Presets} from "./Presets"
import {TubularImpl} from "./devices/Instruments"

export class ApiImpl implements Api {
    readonly #protocol: ScriptHostProtocol

    constructor(protocol: ScriptHostProtocol) {this.#protocol = protocol}

    newProject(name?: string): Project {
        const skeleton = ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false})
        return new ProjectImpl(this.#protocol, skeleton, isDefined(name) ? Guard.string(name, "name") : "Scripted Project")
    }

    hasProject(): Promise<boolean> {return this.#protocol.hasProject()}

    showInfo(headline: string, message: string): Promise<void> {
        return this.#protocol.showInfo(Guard.string(headline, "headline"), Guard.string(message, "message"))
    }

    async getProject(): Promise<Project> {
        const {buffer, name} = await this.#protocol.fetchProject()
        const project = new ProjectImpl(this.#protocol, ProjectSkeleton.decode(buffer), name)
        project.context.startRecording()
        return project
    }

    async addSample(data: AudioData, name: string, bpm?: number): Promise<Sample> {
        if (typeof data !== "object" || isNull(data) || !Array.isArray(data.frames)) {
            return panic(new TypeError("addSample: expected AudioData"))
        }
        if (!(data.numberOfFrames > 0)) {return panic(new RangeError("addSample: audio data is empty"))}
        const tempo = isDefined(bpm) ? Guard.finite(bpm, "bpm") : undefined
        if (isDefined(tempo) && tempo !== 0 && (tempo < 30 || tempo > 1000)) {
            return panic(new RangeError(`addSample: bpm must be 0 (none) or within 30 to 1000, got ${tempo}`))
        }
        return this.#protocol.addSample(data, Guard.string(name, "name"), tempo)
    }

    listSamples(): Promise<ReadonlyArray<Sample>> {return this.#protocol.listSamples()}

    async saveFile(data: ArrayBuffer | ArrayBufferView, fileName: string, mimeType?: string): Promise<void> {
        const buffer = toArrayBuffer(data)
        const name = Guard.string(fileName, "fileName").trim()
        if (name.length === 0) {return panic(new RangeError("saveFile: fileName is empty"))}
        if (/[\\/]/.test(name)) {return panic(new RangeError("saveFile: fileName must not contain path separators"))}
        const type = isDefined(mimeType) ? Guard.string(mimeType, "mimeType") : "application/octet-stream"
        return this.#protocol.saveFile(buffer, name, type)
    }

    async applyPreset(target: AnyAudioUnit | AnyDevice, preset: string): Promise<AnyDevice> {
        if (!(target instanceof Facade)) {return panic(new TypeError("applyPreset: expected a unit or a device"))}
        const loaded = await this.#protocol.fetchPreset(Guard.string(preset, "preset"))
        return Presets.apply(target, loaded)
    }

    async loadTubularVoice(target: Tubular, cartridge: string, voice: int | string): Promise<void> {
        if (!(target instanceof TubularImpl)) {return panic(new TypeError("loadTubularVoice: expected a Tubular instrument"))}
        const name = Guard.string(cartridge, "cartridge")
        if (typeof voice !== "string" && !Number.isInteger(voice)) {
            return panic(new TypeError("loadTubularVoice: voice must be an index or a name"))
        }
        Presets.loadTubularVoice(target, await this.#protocol.fetchTubularVoice(name, voice))
    }
}

const toArrayBuffer = (data: unknown): ArrayBuffer => {
    if (data instanceof ArrayBuffer) {return data}
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    }
    return panic(new TypeError("saveFile: expected an ArrayBuffer or a typed array"))
}
