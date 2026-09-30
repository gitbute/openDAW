import {DefaultObservableValue, Option, Optional, panic, RuntimeNotifier, SortedSet, UUID} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {Files} from "@opendaw/lib-dom"
import {RouteLocation} from "@opendaw/lib-jsx"
import {AudioData, WavFile} from "@opendaw/lib-dsp"
import {BoxGraph, UpdateTask} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {ProjectSkeleton, Sample} from "@opendaw/studio-adapters"
import {AudioContexts, OfflineEngineRenderer, Project} from "@opendaw/studio-core"
import {MixdownOptions, ScriptHostProtocol} from "@opendaw/studio-scripting"
import type {StudioService} from "@/service/StudioService"
import {ScriptEdits} from "./ScriptEdits"
import {ScriptAssetHost} from "@/agent/catalog/ScriptAssetHost"

const isMimeType = (value: string): value is `${string}/${string}` => /^[^/]+\/[^/]+$/.test(value)
const isExtension = (value: string): value is `.${string}` => value.length > 1 && value.startsWith(".")
const acceptTypes = (fileName: string, mimeType: string): Optional<Array<FilePickerAcceptType>> => {
    const extension = fileName.substring(fileName.lastIndexOf("."))
    if (!isMimeType(mimeType) || !isExtension(extension)) {return undefined}
    return [{description: mimeType, accept: {[mimeType]: [extension]}}]
}

type Resources = Omit<ScriptHostProtocol, "openProject" | "applyUpdates" | "showInfo">

const resources = (service: StudioService, pendingSamples: SortedSet<UUID.Bytes, UUID.Bytes>): Resources => ({
    ...ScriptAssetHost.create(service),
    hasProject: async (): Promise<boolean> => service.projectProfileService.getValue().nonEmpty(),
    fetchProject: async (): Promise<{ buffer: ArrayBuffer; name: string }> => {
        return service.projectProfileService.getValue().match({
            none: () => panic("No project available"),
            some: ({project, meta}) => ({
                buffer: ProjectSkeleton.encode(project.boxGraph) as ArrayBuffer,
                name: meta.name
            })
        })
    },
    addSample: async (data: AudioData, name: string): Promise<Sample> => {
        const sample = await service.sampleService.importFile({
            name, arrayBuffer: WavFile.encodeFloats(data)
        })
        const uuid = UUID.parse(sample.uuid)
        service.optProject.match({
            none: () => {pendingSamples.add(uuid)},
            some: project => {project.trackUserCreatedSample(uuid)}
        })
        return sample
    },
    listSamples: async (): Promise<ReadonlyArray<Sample>> => service.sampleService.list(),
    renderMixdown: async (buffer: ArrayBufferLike, {sampleRate}: MixdownOptions): Promise<AudioData> => {
        const project = Project.load(service, buffer as ArrayBuffer)
        const abortController = new AbortController()
        const progress = new DefaultObservableValue(0.0)
        const dialog = RuntimeNotifier.progress({
            headline: "Rendering mixdown...",
            progress,
            cancel: () => abortController.abort()
        })
        await service.audioContext.suspend()
        const result = await Promises.tryCatch(OfflineEngineRenderer
            .start(project, Option.None, progress, abortController.signal, sampleRate))
        dialog.terminate()
        project.terminate()
        AudioContexts.resume(service.audioContext).then()
        if (result.status === "rejected") {return Promise.reject(result.error)}
        return result.value
    },
    saveFile: async (buffer: ArrayBuffer, fileName: string, mimeType: string): Promise<void> =>
        Files.saveWithApproval({
            buffer, headline: "Save File", suggestedName: fileName, types: acceptTypes(fileName, mimeType)
        })
})

export namespace StudioScriptHost {
    // The code editor's host: opens or edits the studio project, then shows it.
    export const create = (service: StudioService): ScriptHostProtocol => {
        const pendingSamples = UUID.newSet<UUID.Bytes>(uuid => uuid)
        return {
            ...resources(service, pendingSamples),
            openProject: async (buffer: ArrayBufferLike, name?: string): Promise<void> => {
                if (!await service.projectProfileService.approveLosingChanges()) {return}
                const boxGraph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
                boxGraph.fromArrayBuffer(buffer, false)
                const mandatoryBoxes = ProjectSkeleton.findMandatoryBoxes(boxGraph)
                const project = Project.fromSkeleton(service, {boxGraph, mandatoryBoxes})
                pendingSamples.forEach(uuid => project.trackUserCreatedSample(uuid))
                pendingSamples.clear()
                service.projectProfileService.setProject(project, name ?? "Scripted Project")
            },
            applyUpdates: (updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>, checksum: Int8Array): void =>
                service.optProject.match({
                    none: () => RuntimeNotifier.notify({message: "No project to apply the script to.", icon: "Warning"}),
                    some: project => {
                        if (!ScriptEdits.apply(project, updates, checksum)) {
                            RuntimeNotifier.notify({message: "The project changed while the script ran. Run it again.", icon: "Warning"})
                            return
                        }
                        RouteLocation.get().navigateTo("/create")
                    }
                }),
            showInfo: (headline: string, message: string): Promise<void> => RuntimeNotifier.info({headline, message})
        }
    }

    // For scripts run on behalf of the agent: edits come back to the caller, nothing navigates or pops up.
    export const createHeadless = (service: StudioService): ScriptHostProtocol => {
        const pendingSamples = UUID.newSet<UUID.Bytes>(uuid => uuid)
        return {
            ...resources(service, pendingSamples),
            openProject: (): void => panic("Headless scripts cannot open projects"),
            applyUpdates: (): void => panic("Headless scripts return their edits to the caller"),
            showInfo: async (): Promise<void> => {},
            renderMixdown: async (buffer: ArrayBufferLike, {sampleRate}: MixdownOptions): Promise<AudioData> => {
                const project = Project.load(service, buffer as ArrayBuffer)
                const result = await Promises.tryCatch(OfflineEngineRenderer
                    .start(project, Option.None, new DefaultObservableValue(0.0), undefined, sampleRate))
                project.terminate()
                return result.status === "rejected" ? Promise.reject(result.error) : result.value
            },
            saveFile: async (): Promise<void> => panic("Headless scripts cannot save files; return data from the script instead")
        }
    }
}
