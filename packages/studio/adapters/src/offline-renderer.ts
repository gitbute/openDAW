import {Nullable} from "@opendaw/lib-std"
import {ExportConfiguration} from "./EngineProcessorAttachment"

export interface OfflineEngineInitializeConfig {
    sampleRate: number
    numberOfChannels: number
    syncStreamBuffer: SharedArrayBuffer
    controlFlagsBuffer: SharedArrayBuffer
    project: ArrayBufferLike
    exportConfiguration?: ExportConfiguration
    variant?: Record<string, unknown> // extras for an alternative engine worker (e.g. the WASM artifacts url)
    profileScripts?: boolean
}

export interface ScriptDeviceLoad {
    uuid: string
    processSeconds: number
    worstQuantumSeconds: number
    overBudgetQuanta: number
}

export interface ScriptLoadReport {
    sampleRate: number
    quantumFrames: number
    renderedQuanta: number
    measuredQuanta: number
    devices: ReadonlyArray<ScriptDeviceLoad>
}

export interface OfflineEngineRenderConfig {
    silenceThresholdDb?: number
    silenceDurationSeconds?: number
    maxDurationSeconds?: number
}

export interface OfflineEngineProtocol {
    initialize(enginePort: MessagePort, config: OfflineEngineInitializeConfig): Promise<void>
    addModule(code: string): Promise<void>
    render(config: OfflineEngineRenderConfig): Promise<Float32Array[]>
    step(samples: number): Promise<Float32Array[]>
    scriptLoad(): Promise<Nullable<ScriptLoadReport>>
    stop(): void
}
