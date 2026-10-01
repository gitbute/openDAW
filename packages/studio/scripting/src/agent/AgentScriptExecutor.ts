import {asInstanceOf, int, isNull, Nullable, panic, tryCatch} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {AudioData} from "@opendaw/lib-dsp"
import {UpdateTask} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {AnyAudioUnit, AnyDevice, Api, Project, Sample, Tubular} from "../Api"
import {MixdownRequest, ScriptHostProtocol, ScriptPreset} from "../ScriptHostProtocol"
import {ScriptExecutionContext} from "../ScriptExecutionProtocol"
import {ScriptRunner} from "../ScriptRunner"
import {ApiImpl} from "../impl/ApiImpl"
import {ProjectImpl} from "../impl/ProjectImpl"
import {AgentScriptEdits, AgentScriptExecutionProtocol, AgentScriptOutcome} from "./AgentScriptProtocol"
import {ScriptLogs} from "./ScriptLogs"
import {ScriptErrors} from "./ScriptErrors"
import {ScriptValues} from "./ScriptValues"

// Keeps a run's edits local: openInStudio() is buffered and committed by the studio once the script completes.
class AgentScriptSession implements ScriptHostProtocol {
    readonly #remote: ScriptHostProtocol
    readonly #logs: ScriptLogs
    readonly #buffered: Array<UpdateTask<BoxIO.TypeMap>>
    #origin: Nullable<Int8Array>

    constructor(remote: ScriptHostProtocol, logs: ScriptLogs) {
        this.#remote = remote
        this.#logs = logs
        this.#buffered = []
        this.#origin = null
    }

    openProject(): void {
        panic("run_script edits the live project: use openDAW.getProject() instead of newProject().openInStudio()")
    }
    applyUpdates(updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>, checksum: Int8Array): void {
        if (isNull(this.#origin)) {this.#origin = checksum}
        this.#buffered.push(...updates)
    }
    hasProject(): Promise<boolean> {return this.#remote.hasProject()}
    fetchProject(): Promise<{ buffer: ArrayBuffer, name: string }> {return this.#remote.fetchProject()}
    async showInfo(headline: string, message: string): Promise<void> {this.#logs.push(`[showInfo] ${headline}: ${message}`)}
    addSample(data: AudioData, name: string, bpm?: number): Promise<Sample> {return this.#remote.addSample(data, name, bpm)}
    listSamples(): Promise<ReadonlyArray<Sample>> {return this.#remote.listSamples()}
    renderMixdown(buffer: ArrayBufferLike, request: MixdownRequest): Promise<AudioData> {
        return this.#remote.renderMixdown(buffer, request)
    }
    saveFile(buffer: ArrayBuffer, fileName: string, mimeType: string): Promise<void> {
        return this.#remote.saveFile(buffer, fileName, mimeType)
    }
    fetchPreset(uuid: string): Promise<ScriptPreset> {return this.#remote.fetchPreset(uuid)}
    fetchTubularVoice(cartridge: string, voice: int | string): Promise<Uint8Array> {
        return this.#remote.fetchTubularVoice(cartridge, voice)
    }

    takeEdits(project: ProjectImpl): Nullable<AgentScriptEdits> {
        const checksum = this.#origin ?? project.context.origin
        const updates = [...this.#buffered, ...project.context.takeUpdates()]
        return updates.length === 0 || isNull(checksum) ? null : {updates, checksum}
    }
}

// Every getProject() of one run returns the same copy, so all edits land in a single change set.
class AgentApi implements Api {
    readonly #api: Api
    #project: Nullable<Promise<ProjectImpl>>

    constructor(protocol: ScriptHostProtocol) {
        this.#api = new ApiImpl(protocol)
        this.#project = null
    }

    get tracked(): Nullable<Promise<ProjectImpl>> {return this.#project}

    newProject(name?: string): Project {return this.#api.newProject(name)}
    hasProject(): Promise<boolean> {return this.#api.hasProject()}
    getProject(): Promise<Project> {
        if (isNull(this.#project)) {
            this.#project = this.#api.getProject().then(project => asInstanceOf(project, ProjectImpl))
        }
        return this.#project
    }
    showInfo(headline: string, message: string): Promise<void> {return this.#api.showInfo(headline, message)}
    addSample(data: AudioData, name: string, bpm?: number): Promise<Sample> {return this.#api.addSample(data, name, bpm)}
    listSamples(): Promise<ReadonlyArray<Sample>> {return this.#api.listSamples()}
    saveFile(data: ArrayBuffer | ArrayBufferView, fileName: string, mimeType?: string): Promise<void> {
        return this.#api.saveFile(data, fileName, mimeType)
    }
    applyPreset(target: AnyAudioUnit | AnyDevice, preset: string): Promise<AnyDevice> {
        return this.#api.applyPreset(target, preset)
    }
    loadTubularVoice(target: Tubular, cartridge: string, voice: int | string): Promise<void> {
        return this.#api.loadTubularVoice(target, cartridge, voice)
    }
}

type Change = Pick<AgentScriptOutcome, "edits" | "invalid">

const Unchanged: Change = {edits: null, invalid: null}

export class AgentScriptExecutor implements AgentScriptExecutionProtocol {
    readonly #remote: ScriptHostProtocol
    readonly #lineOffset: int
    readonly #maxReturnLength: int

    constructor(remote: ScriptHostProtocol, maxReturnLength: int = 16_000) {
        this.#remote = remote
        this.#lineOffset = ScriptErrors.probeLineOffset()
        this.#maxReturnLength = maxReturnLength
    }

    async executeAgentScript(script: string, context: ScriptExecutionContext): Promise<AgentScriptOutcome> {
        const logs = new ScriptLogs()
        const session = new AgentScriptSession(this.#remote, logs)
        const api = new AgentApi(session)
        const capture = logs.capture(console)
        const result = await Promises.tryCatch(new ScriptRunner(session, api).run(script, context))
        const change = result.status === "resolved" ? await this.#collect(session, api) : Unchanged
        capture.terminate()
        return result.status === "rejected"
            ? {logs: logs.lines(), returned: "null", error: ScriptErrors.describe(result.error, this.#lineOffset), ...Unchanged}
            : {logs: logs.lines(), returned: ScriptValues.toJson(result.value, this.#maxReturnLength), error: null, ...change}
    }

    async #collect(session: AgentScriptSession, api: AgentApi): Promise<Change> {
        if (isNull(api.tracked)) {return Unchanged}
        const tracked = await Promises.tryCatch(api.tracked)
        if (tracked.status === "rejected") {return Unchanged}
        const project = tracked.value
        const edits = session.takeEdits(project)
        if (isNull(edits)) {return Unchanged}
        const validation = tryCatch(() => project.validate())
        return {edits, invalid: validation.status === "failure" ? ScriptValues.format(validation.error) : null}
    }
}
