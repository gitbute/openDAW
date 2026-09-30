import {int, isDefined, Optional} from "@opendaw/lib-std"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {PresetEntry} from "@opendaw/studio-core"
import type {Sample, Soundfont} from "@opendaw/studio-adapters"
import type {TubularCartridge} from "@/ui/devices/instruments/TubularDeviceEditor/TubularCartridges"

export type AssetKind = "presets" | "samples" | "soundfonts" | "cartridges"

export const AssetKinds: ReadonlyArray<AssetKind> = ["presets", "samples", "soundfonts", "cartridges"]

export interface AssetSources {
    presets(): Promise<ReadonlyArray<PresetEntry>>
    samples(): Promise<ReadonlyArray<Sample>>
    soundfonts(): Promise<ReadonlyArray<Soundfont>>
    cartridges(): Promise<ReadonlyArray<TubularCartridge>>
}

export type BrowseRequest = {
    readonly kind: AssetKind
    readonly query?: string
    readonly device?: string
    readonly limit?: int
}

export namespace AssetCatalog {
    export const DefaultLimit = 30
    export const MaxLimit = 200

    const Usage: Readonly<Record<AssetKind, string>> = {
        presets: "const device = await openDAW.applyPreset(unitOrDevice, \"<id>\") // instrument: unit or its instrument; effect: the effect to replace or a unit to append to",
        samples: "const sample = (await openDAW.listSamples()).find(entry => entry.uuid === \"<uuid>\"); nano.sample = sample // or playfield.addSample(sample, {note: 36}), audioTrack.addRegion(sample)",
        soundfonts: "soundfont.file = {uuid: \"<uuid>\", name: \"<name>\"}; soundfont.presetIndex = 0",
        cartridges: "await openDAW.loadTubularVoice(tubular, \"<cartridge>\", <voice index or \"voice name\">)"
    }

    const tokens = (query: Optional<string>): ReadonlyArray<string> =>
        isDefined(query) ? query.toLowerCase().split(/\s+/).filter(token => token.length > 0) : []

    const matches = (haystack: ReadonlyArray<string>, needles: ReadonlyArray<string>): boolean => {
        const text = haystack.join(" ").toLowerCase()
        return needles.every(needle => text.includes(needle))
    }

    const deviceOf = (entry: PresetEntry): string => {
        switch (entry.category) {
            case "instrument":
            case "audio-effect":
            case "midi-effect":
                return entry.device
            case "audio-unit":
                return entry.instrument
            default:
                return ""
        }
    }

    const clampLimit = (limit: Optional<int>): int =>
        Math.max(1, Math.min(MaxLimit, Math.round(isDefined(limit) ? limit : DefaultLimit)))

    const round = (value: number): number => Math.round(value * 100) / 100

    const result = (kind: AssetKind, total: int, items: ReadonlyArray<JsonValue>, limit: int): JsonObject => ({
        kind, total, shown: Math.min(total, limit), items: items.slice(0, limit), usage: Usage[kind],
        ...(total > limit ? {hint: "more results: narrow with query/device or raise limit"} : {})
    })

    export const browse = async (sources: AssetSources, request: BrowseRequest): Promise<JsonObject> => {
        const needles = tokens(request.query)
        const limit = clampLimit(request.limit)
        const device = isDefined(request.device) ? request.device.trim().toLowerCase() : ""
        switch (request.kind) {
            case "presets": {
                const entries = (await sources.presets())
                    .filter(entry => device.length === 0 || deviceOf(entry).toLowerCase() === device)
                    .filter(entry => matches([entry.name, entry.description ?? "", deviceOf(entry), entry.category], needles))
                    .toSorted((left, right) => left.source === right.source
                        ? left.name.localeCompare(right.name) : left.source === "user" ? -1 : 1)
                return result("presets", entries.length, entries.map(entry => ({
                    id: entry.uuid, name: entry.name, category: entry.category, device: deviceOf(entry), source: entry.source,
                    ...(isDefined(entry.description) && entry.description.length > 0 ? {description: entry.description.slice(0, 100)} : {})
                })), limit)
            }
            case "samples": {
                const samples = (await sources.samples())
                    .filter(sample => matches([sample.name, sample.origin], needles))
                    .toSorted((left, right) => left.name.localeCompare(right.name))
                return result("samples", samples.length, samples.map(sample => ({
                    uuid: sample.uuid, name: sample.name, bpm: round(sample.bpm), duration: round(sample.duration)
                })), limit)
            }
            case "soundfonts": {
                const soundfonts = (await sources.soundfonts())
                    .filter(soundfont => matches([soundfont.name, soundfont.origin], needles))
                    .toSorted((left, right) => left.name.localeCompare(right.name))
                return result("soundfonts", soundfonts.length, soundfonts.map(soundfont => ({
                    uuid: soundfont.uuid, name: soundfont.name, sizeKb: Math.round(soundfont.size / 1024), origin: soundfont.origin
                })), limit)
            }
            case "cartridges": {
                const cartridges = (await sources.cartridges()).flatMap(cartridge => {
                    const cartridgeHit = matches([cartridge.name, cartridge.author], needles)
                    const voices = cartridge.voices
                        .map((voice, index) => ({index, name: voice.name}))
                        .filter(voice => cartridgeHit || matches([voice.name], needles))
                    return voices.length === 0 ? [] : [{
                        cartridge: cartridge.name, author: cartridge.author,
                        voices: voices.map(voice => `${voice.index}:${voice.name}`).join(", ")
                    }]
                })
                return result("cartridges", cartridges.length, cartridges, limit)
            }
        }
    }
}
