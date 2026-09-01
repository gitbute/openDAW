import {DeviceManualUrls} from "@opendaw/studio-adapters"
import type {DeviceHelpCatalog, DeviceHelpContent} from "@opendaw/studio-core"
import starterPrompt from "@/ui/devices/instruments/apparat-starter-prompt.txt?raw"
import {ApparatExamples} from "@/ui/devices/instruments/apparat-examples"
import werkstattStarterPrompt from "@/ui/devices/audio-effects/werkstatt-starter-prompt.txt?raw"
import {WerkstattExamples} from "@/ui/devices/audio-effects/werkstatt-examples"
import spielwerkStarterPrompt from "@/ui/devices/midi-effects/spielwerk-starter-prompt.txt?raw"
import {SpielwerkExamples} from "@/ui/devices/midi-effects/spielwerk-examples"

const manualAssetUrl = (canonicalManualUrl: string): string => {
    const base = import.meta.env.BASE_URL.endsWith("/")
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`
    return `${base}${canonicalManualUrl.replace(/^\/+/, "")}.md`
}

const scriptHelp = new Map<string, Pick<DeviceHelpContent, "programmingGuide" | "examples">>([
    [DeviceManualUrls.Apparat, {
        programmingGuide: starterPrompt,
        examples: ApparatExamples.map(({name, code}) => ({name, code}))
    }],
    [DeviceManualUrls.Werkstatt, {
        programmingGuide: werkstattStarterPrompt,
        examples: WerkstattExamples.map(({name, code}) => ({name, code}))
    }],
    [DeviceManualUrls.Spielwerk, {
        programmingGuide: spielwerkStarterPrompt,
        examples: SpielwerkExamples.map(({name, code}) => ({name, code}))
    }]
])

export class OpenDawDeviceHelpCatalog implements DeviceHelpCatalog {
    async read(canonicalManualUrl: string): Promise<DeviceHelpContent> {
        const response = await fetch(manualAssetUrl(canonicalManualUrl))
        if (!response.ok) {
            throw new Error(`Could not load device manual '${canonicalManualUrl}' (${response.status} ${response.statusText})`)
        }
        const content: DeviceHelpContent = {manualMarkdown: await response.text()}
        const script = scriptHelp.get(canonicalManualUrl)
        return script === undefined ? content : {...content, ...script}
    }
}
