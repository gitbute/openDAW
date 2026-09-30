import {int, isDefined, Option, panic} from "@opendaw/lib-std"
import {PresetEntry, PresetStorage} from "@opendaw/studio-core"
import {ScriptHostProtocol, ScriptPreset} from "@opendaw/studio-scripting"
import type {StudioService} from "@/service/StudioService"
import {PresetApplication} from "@/ui/browse/PresetApplication"
import {TubularCartridge, TubularCartridges} from "@/ui/devices/instruments/TubularDeviceEditor/TubularCartridges"

export type ScriptAssetProtocol = Pick<ScriptHostProtocol, "fetchPreset" | "fetchTubularVoice">

export namespace ScriptAssetHost {
    export const presetEntries = async (service: StudioService): Promise<ReadonlyArray<PresetEntry>> => {
        await Promise.all([service.presets.cloudReady, PresetStorage.readIndex()])
        return service.presets.presets()
    }

    export const findCartridge = (cartridges: ReadonlyArray<TubularCartridge>, name: string): Option<TubularCartridge> => {
        const lower = name.trim().toLowerCase()
        return Option.wrap(cartridges.find(cartridge => cartridge.name.toLowerCase() === lower
            || cartridge.file.toLowerCase() === lower || cartridge.file.toLowerCase() === `${lower}.syx`))
    }

    export const findVoice = (cartridge: TubularCartridge, voice: int | string): Option<Uint8Array> => {
        if (typeof voice === "number") {return Option.wrap(cartridge.voices[voice]?.data)}
        const lower = voice.trim().toLowerCase()
        return Option.wrap(cartridge.voices.find(entry => entry.name.toLowerCase() === lower)?.data)
    }

    export const create = (service: StudioService): ScriptAssetProtocol => ({
        fetchPreset: async (uuid: string): Promise<ScriptPreset> => {
            const entry = (await presetEntries(service)).find(candidate => candidate.uuid === uuid)
            if (!isDefined(entry)) {return panic(`Unknown preset '${uuid}'`)}
            const buffer = await PresetApplication.loadBytes(entry.uuid, entry.source)
            return {uuid, name: entry.name, category: entry.category, buffer}
        },
        fetchTubularVoice: async (cartridge: string, voice: int | string): Promise<Uint8Array> => {
            const cartridges = await TubularCartridges.get().load()
            const found = findCartridge(cartridges, cartridge)
                .unwrapOrElse(() => panic(`Unknown cartridge '${cartridge}'. Known: ${cartridges.map(entry => entry.name).join(", ")}`))
            return findVoice(found, voice).unwrapOrElse(() => panic(`Cartridge '${found.name}' has no voice '${voice}'`))
        }
    })
}
