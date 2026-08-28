import {DeviceManualUrls} from "@opendaw/studio-adapters"
import type {DeviceHelpCatalog, DeviceHelpContent} from "@opendaw/studio-core"
import starterPrompt from "@/ui/devices/instruments/apparat-starter-prompt.txt?raw"
import {ApparatExamples} from "@/ui/devices/instruments/apparat-examples"

const manualAssetUrl = (canonicalManualUrl: string): string => {
    const base = import.meta.env.BASE_URL.endsWith("/")
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`
    return `${base}${canonicalManualUrl.replace(/^\/+/, "")}.md`
}

export class OpenDawDeviceHelpCatalog implements DeviceHelpCatalog {
    async read(canonicalManualUrl: string): Promise<DeviceHelpContent> {
        const response = await fetch(manualAssetUrl(canonicalManualUrl))
        if (!response.ok) {
            throw new Error(`Could not load device manual '${canonicalManualUrl}' (${response.status} ${response.statusText})`)
        }
        const content: DeviceHelpContent = {manualMarkdown: await response.text()}
        if (canonicalManualUrl !== DeviceManualUrls.Apparat) {return content}
        return {
            ...content,
            programmingGuide: starterPrompt,
            examples: ApparatExamples.map(({name, code}) => ({name, code}))
        }
    }
}
