import {Sample, Soundfont} from "@opendaw/studio-adapters"
import {UUID} from "@opendaw/lib-std"
import {PresetMeta, PresetSource} from "./presets"

// Source of the "stock"/factory catalogs (samples, soundfonts, presets).
// The concrete implementation lives in the openDAW app and talks to the
// openDAW servers, so it is injected here instead of referenced directly.
// A standalone SDK consumer that never installs a provider stays local-only.
export namespace FactoryCatalog {
    export interface Provider {
        samples(): Promise<ReadonlyArray<Sample>>
        soundfonts(): Promise<ReadonlyArray<Soundfont>>
        presets(): Promise<ReadonlyArray<PresetMeta>>
        loadPreset?(uuid: UUID.Bytes, source: PresetSource): Promise<ArrayBuffer>
    }
    const Empty: Provider = {
        samples: async () => [],
        soundfonts: async () => [],
        presets: async () => []
    }
    let current: Provider = Empty
    export const install = (provider: Provider): void => {current = provider}
    export const get = (): Provider => current
    export const loadPreset = (uuid: UUID.Bytes, source: PresetSource): Promise<ArrayBuffer> => {
        const loader = current.loadPreset
        if (loader === undefined) {
            return Promise.reject(new Error("No preset byte provider is installed."))
        }
        return loader(uuid, source)
    }
}
