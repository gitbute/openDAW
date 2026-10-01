import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {AudioData} from "@opendaw/lib-dsp"
import {UpdateTask} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {int} from "@opendaw/lib-std"
import {MixdownRequest, ScriptHostProtocol, ScriptPreset} from "./ScriptHostProtocol"
import {Sample} from "./Api"

export namespace ScriptHostSender {
    export const create = (messenger: Messenger): ScriptHostProtocol => Communicator.sender<ScriptHostProtocol>(messenger,
        dispatcher => new class implements ScriptHostProtocol {
            openProject(buffer: ArrayBufferLike, name?: string): void {
                dispatcher.dispatchAndForget(this.openProject, buffer, name)
            }
            applyUpdates(updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>, checksum: Int8Array): void {
                dispatcher.dispatchAndForget(this.applyUpdates, updates, checksum)
            }
            hasProject(): Promise<boolean> {
                return dispatcher.dispatchAndReturn(this.hasProject)
            }
            fetchProject(): Promise<{ buffer: ArrayBuffer; name: string }> {
                return dispatcher.dispatchAndReturn(this.fetchProject)
            }
            showInfo(headline: string, message: string): Promise<void> {
                return dispatcher.dispatchAndReturn(this.showInfo, headline, message)
            }
            addSample(data: AudioData, name: string, bpm?: number): Promise<Sample> {
                return dispatcher.dispatchAndReturn(this.addSample, data, name, bpm)
            }
            listSamples(): Promise<ReadonlyArray<Sample>> {
                return dispatcher.dispatchAndReturn(this.listSamples)
            }
            renderMixdown(buffer: ArrayBufferLike, request: MixdownRequest): Promise<AudioData> {
                return dispatcher.dispatchAndReturn(this.renderMixdown, buffer, request)
            }
            saveFile(buffer: ArrayBuffer, fileName: string, mimeType: string): Promise<void> {
                return dispatcher.dispatchAndReturn(this.saveFile, buffer, fileName, mimeType)
            }
            fetchPreset(uuid: string): Promise<ScriptPreset> {
                return dispatcher.dispatchAndReturn(this.fetchPreset, uuid)
            }
            fetchTubularVoice(cartridge: string, voice: int | string): Promise<Uint8Array> {
                return dispatcher.dispatchAndReturn(this.fetchTubularVoice, cartridge, voice)
            }
        })
}
