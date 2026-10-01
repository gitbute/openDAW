import {Option} from "@opendaw/lib-std"
import {DeviceManualUrls} from "@opendaw/studio-adapters"
import type {AgentToolbox} from "@opendaw/studio-codex"
import declarations from "@opendaw/studio-scripting/api.declaration?raw"
import guide01 from "@opendaw/studio-scripting/guide/01-getting-started.md?raw"
import guide02 from "@opendaw/studio-scripting/guide/02-time-and-units.md?raw"
import guide03 from "@opendaw/studio-scripting/guide/03-project-tree.md?raw"
import guide04 from "@opendaw/studio-scripting/guide/04-parameters.md?raw"
import guide05 from "@opendaw/studio-scripting/guide/05-automation-and-modulation.md?raw"
import guide06 from "@opendaw/studio-scripting/guide/06-samples-and-audio.md?raw"
import guide07 from "@opendaw/studio-scripting/guide/07-validation.md?raw"
import guide08 from "@opendaw/studio-scripting/guide/08-globals.md?raw"
import guide09 from "@opendaw/studio-scripting/guide/09-cookbook.md?raw"
import apparatGuide from "@/ui/devices/instruments/apparat-starter-prompt.txt?raw"
import werkstattGuide from "@/ui/devices/audio-effects/werkstatt-starter-prompt.txt?raw"
import spielwerkGuide from "@/ui/devices/midi-effects/spielwerk-starter-prompt.txt?raw"
import {ApparatExamples} from "@/ui/devices/instruments/apparat-examples"
import {WerkstattExamples} from "@/ui/devices/audio-effects/werkstatt-examples"
import {SpielwerkExamples} from "@/ui/devices/midi-effects/spielwerk-examples"
import {TubularCartridges} from "@/ui/devices/instruments/TubularDeviceEditor/TubularCartridges"
import type {StudioService} from "@/service/StudioService"
import {ApiReference, GuideChapter} from "./ApiReference"
import {DeviceCatalog, ManualLoader, ScriptDeviceDocs} from "./DeviceCatalog"
import {AssetSources} from "./AssetCatalog"
import {CatalogTools} from "./CatalogTools"
import {ScriptAssetHost} from "./ScriptAssetHost"

const GuideFiles: ReadonlyArray<[string, string]> = [
    ["01-getting-started", guide01], ["02-time-and-units", guide02], ["03-project-tree", guide03],
    ["04-parameters", guide04], ["05-automation-and-modulation", guide05], ["06-samples-and-audio", guide06],
    ["07-validation", guide07], ["08-globals", guide08], ["09-cookbook", guide09]
]

const ScriptDocs: Readonly<Record<string, ScriptDeviceDocs>> = {
    Apparat: {guide: apparatGuide, examples: ApparatExamples},
    Werkstatt: {guide: werkstattGuide, examples: WerkstattExamples},
    Spielwerk: {guide: spielwerkGuide, examples: SpielwerkExamples}
}

const ManualUrls: Readonly<Record<string, string>> = {
    ...DeviceManualUrls, Composite: DeviceManualUrls.AudioEffectComposite, StereoSplit: DeviceManualUrls.StereoComposite,
    Cubed: "manuals/devices/instruments/cubed"
}

const ManualFiles: Readonly<Record<string, string>> = import.meta.glob<string>(
    "../../../../manual/public/devices/**/*.md", {query: "?raw", import: "default", eager: true})

const loadManual: ManualLoader = (key: string): Option<string> => {
    const url = ManualUrls[key]
    if (typeof url !== "string") {return Option.None}
    return Option.wrap(ManualFiles[`../../../../manual/public/${url.replace(/^manuals\//, "")}.md`])
}

export namespace CatalogToolbox {
    export const namespace = "catalog"

    export const sources = (service: StudioService): AssetSources => ({
        presets: () => ScriptAssetHost.presetEntries(service),
        samples: () => service.sampleService.list(),
        soundfonts: () => service.soundfontService.list(),
        cartridges: () => TubularCartridges.get().load()
    })

    class Knowledge {
        readonly reference: ApiReference
        readonly devices: DeviceCatalog

        constructor() {
            this.reference = new ApiReference(declarations, GuideFiles.map(([name, markdown]) => GuideChapter.parse(name, markdown)))
            this.devices = new DeviceCatalog(this.reference.declarations, ScriptDocs, loadManual)
        }
    }

    let knowledge: Option<Knowledge> = Option.None

    const shared = (): Knowledge => knowledge.match({
        none: () => {
            const created = new Knowledge()
            knowledge = Option.wrap(created)
            return created
        },
        some: existing => existing
    })

    export const reference = (): ApiReference => shared().reference
    export const devices = (): DeviceCatalog => shared().devices

    export const create = (service: StudioService): AgentToolbox => ({
        namespace,
        description: "Read-only knowledge: scripting API reference, device parameter cards, and asset ids " +
            "(presets, samples, soundfonts, DX7 cartridges) for scripts.",
        tools: [
            CatalogTools.browse(sources(service)),
            CatalogTools.deviceReference(devices()),
            CatalogTools.apiReference(reference())
        ]
    })
}
