import {int, isDefined, Optional} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {AgentTool, AgentToolResult, JsonObject, JsonValue} from "@opendaw/studio-codex"
import {AssetCatalog, AssetKind, AssetKinds, AssetSources} from "./AssetCatalog"
import {DeviceCatalog} from "./DeviceCatalog"
import {ApiReference} from "./ApiReference"

const optString = (args: JsonObject, key: string): Optional<string> => {
    const value: Optional<JsonValue> = args[key]
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

const optInt = (args: JsonObject, key: string): Optional<int> => {
    const value: Optional<JsonValue> = args[key]
    return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined
}

const isAssetKind = (value: Optional<string>): value is AssetKind =>
    isDefined(value) && AssetKinds.some(kind => kind === value)

export namespace CatalogTools {
    export const browse = (sources: AssetSources): AgentTool => ({
        name: "browse",
        description: "List assets the studio knows with ids exactly as a script needs them: presets (stock+user, " +
            "apply with openDAW.applyPreset), samples, soundfonts, cartridges (Tubular DX7 voices). " +
            "Every result carries a one-line `usage` example.",
        inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["kind"],
            properties: {
                kind: {type: "string", enum: [...AssetKinds], description: "What to list"},
                query: {type: "string", description: "Words that must all appear in name/description/device"},
                device: {type: "string", description: "Presets only: device key, e.g. Vaporisateur, Compressor"},
                limit: {type: "integer", minimum: 1, maximum: AssetCatalog.MaxLimit, description: "Max items (default 30)"}
            }
        },
        execute: async (args: JsonObject): Promise<AgentToolResult> => {
            const kind = optString(args, "kind")
            if (!isAssetKind(kind)) {return AgentToolResult.failure(`kind must be one of ${AssetKinds.join(", ")}`)}
            const listed = await Promises.tryCatch(AssetCatalog.browse(sources, {
                kind, query: optString(args, "query"), device: optString(args, "device"), limit: optInt(args, "limit")
            }))
            return listed.status === "resolved"
                ? AgentToolResult.json(listed.value)
                : AgentToolResult.failure(`Cannot list ${kind}: ${String(listed.error)}`)
        }
    })

    export const deviceReference = (catalog: DeviceCatalog): AgentTool => ({
        name: "device_reference",
        description: "Compact card for a device type (instrument, audio or MIDI effect): how to create it in a script, " +
            "every automatable parameter path with type, range, unit, default and meaning. Apparat/Werkstatt/Spielwerk " +
            "cards include the full programming guide and example names (pass `example` for code). The user manual " +
            "(what the device is for, how it is used, typical sounds) is always appended. No device: list all.",
        inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
                device: {type: "string", description: "Device key, e.g. Vaporisateur, Tubular, Compressor, Apparat"},
                example: {type: "string", description: "Script devices only: example name to return its code"}
            }
        },
        execute: async (args: JsonObject): Promise<AgentToolResult> => {
            const device = optString(args, "device")
            if (!isDefined(device)) {return AgentToolResult.text(catalog.listing())}
            return catalog.find(device).match({
                none: () => Promise.resolve(AgentToolResult.text(`Unknown device '${device}'.\n${catalog.listing()}`)),
                some: async entry => {
                    const example = optString(args, "example")
                    if (isDefined(example)) {
                        return catalog.example(entry, example).match({
                            none: () => AgentToolResult.failure(`No example '${example}' for ${entry.key}. ` +
                                `Call device_reference({device: "${entry.key}"}) for the list.`),
                            some: code => AgentToolResult.text(code)
                        })
                    }
                    const card = catalog.card(entry)
                    return AgentToolResult.text(catalog.manual(entry)
                        .mapOr(markdown => `${card}\n## Manual\n${markdown}`, `${card}\n(no manual available)`))
                }
            })
        }
    })

    export const apiReference = (reference: ApiReference): AgentTool => ({
        name: "api_reference",
        description: "openDAW scripting API reference. No topic: compact index of guide chapters and entry points. " +
            "Topic: a guide chapter (number or title) or a symbol/member (NoteRegion, AudioUnit, Project.addInstrumentUnit) " +
            "returning the chapter or the declaration with JSDoc.",
        inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
                topic: {type: "string", description: "Guide chapter or API symbol"}
            }
        },
        execute: async (args: JsonObject): Promise<AgentToolResult> => {
            const topic = optString(args, "topic")
            if (!isDefined(topic)) {return AgentToolResult.text(reference.overview())}
            return reference.lookup(topic).match({
                none: () => {
                    const suggestions = reference.suggestions(topic)
                    return AgentToolResult.failure(`No chapter or symbol '${topic}'.` +
                        (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : " Call api_reference() for the index."))
                },
                some: text => AgentToolResult.text(text)
            })
        }
    })
}
