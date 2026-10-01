import {AudioData} from "@opendaw/lib-dsp"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {applyUpdateTasks, BoxGraph, UpdateTask} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {Arrays, Option, UUID} from "@opendaw/lib-std"
import {Api, Project, Sample} from "../Api"
import {MixdownRequest, ScriptHostProtocol, ScriptPreset} from "../ScriptHostProtocol"
import {ApiImpl} from "../impl/ApiImpl"
import {ProjectImpl} from "../impl/ProjectImpl"

export class FakeHost implements ScriptHostProtocol {
    readonly opened: Array<{ buffer: ArrayBufferLike, name: string }> = []
    readonly samples: Array<Sample> = []
    readonly dialogs: Array<{ headline: string, message: string }> = []
    readonly applied: Array<ReadonlyArray<UpdateTask<BoxIO.TypeMap>>> = []
    readonly rendered: Array<{ buffer: ArrayBufferLike, options: MixdownRequest }> = []
    readonly saved: Array<{ byteLength: number, fileName: string, mimeType: string }> = []
    readonly presets: Map<string, ScriptPreset> = new Map()
    readonly voices: Map<string, Uint8Array> = new Map()
    current: { graph: BoxGraph<BoxIO.TypeMap>, name: string } | null = null

    async hasProject(): Promise<boolean> {return this.current !== null}
    async showInfo(headline: string, message: string): Promise<void> {this.dialogs.push({headline, message})}

    openProject(buffer: ArrayBufferLike, name?: string): void {
        this.opened.push({buffer, name: name ?? ""})
        const graph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
        graph.fromArrayBuffer(buffer, false)
        this.current = {graph, name: name ?? ""}
    }
    applyUpdates(updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>, checksum: Int8Array): void {
        if (this.current === null) {throw new Error("No project")}
        const {graph} = this.current
        if (!Arrays.equals(graph.checksum(), checksum)) {throw new Error("Checksum mismatch")}
        graph.beginTransaction()
        applyUpdateTasks(graph, updates)
        graph.endTransaction()
        this.applied.push(updates)
    }
    async fetchProject(): Promise<{ buffer: ArrayBuffer, name: string }> {
        if (this.current === null) {throw new Error("No project")}
        return {buffer: ProjectSkeleton.encode(this.current.graph) as ArrayBuffer, name: this.current.name}
    }
    async addSample(data: AudioData, name: string, bpm?: number): Promise<Sample> {
        const sample: Sample = {
            uuid: UUID.toString(UUID.generate()), name, duration: data.numberOfFrames / data.sampleRate,
            bpm: bpm ?? 0, sample_rate: data.sampleRate
        }
        this.samples.push(sample)
        return sample
    }
    async listSamples(): Promise<ReadonlyArray<Sample>> {return this.samples}
    async renderMixdown(buffer: ArrayBufferLike, options: MixdownRequest): Promise<AudioData> {
        this.rendered.push({buffer, options})
        const sampleRate = options.sampleRate ?? 48000
        return AudioData.create(sampleRate, sampleRate, 2)
    }
    async saveFile(buffer: ArrayBuffer, fileName: string, mimeType: string): Promise<void> {
        this.saved.push({byteLength: buffer.byteLength, fileName, mimeType})
    }
    async fetchPreset(uuid: string): Promise<ScriptPreset> {
        const preset = this.presets.get(uuid)
        if (preset === undefined) {throw new Error(`Unknown preset ${uuid}`)}
        return preset
    }
    async fetchTubularVoice(cartridge: string, voice: number | string): Promise<Uint8Array> {
        const data = this.voices.get(`${cartridge}/${voice}`)
        if (data === undefined) {throw new Error(`Unknown voice ${cartridge}/${voice}`)}
        return data
    }
}

export const createFixture = (): { api: Api, host: FakeHost, project: Project } => {
    const host = new FakeHost()
    const api = new ApiImpl(host)
    const project = api.newProject("Test")
    return {api, host, project}
}

export const sample = (name: string = "Kick", duration: number = 1.0, bpm: number = 0): Sample =>
    ({uuid: UUID.toString(UUID.generate()), name, duration, bpm, sample_rate: 48000})

export const impl = (project: Project): ProjectImpl => project as ProjectImpl
