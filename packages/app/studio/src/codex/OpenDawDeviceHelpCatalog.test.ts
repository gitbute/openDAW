import {afterEach, describe, expect, it, vi} from "vitest"
import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"
import {DeviceManualUrls} from "@opendaw/studio-adapters"
import starterPrompt from "@/ui/devices/instruments/apparat-starter-prompt.txt?raw"
import {ApparatExamples} from "@/ui/devices/instruments/apparat-examples"
import werkstattStarterPrompt from "@/ui/devices/audio-effects/werkstatt-starter-prompt.txt?raw"
import {WerkstattExamples} from "@/ui/devices/audio-effects/werkstatt-examples"
import spielwerkStarterPrompt from "@/ui/devices/midi-effects/spielwerk-starter-prompt.txt?raw"
import {SpielwerkExamples} from "@/ui/devices/midi-effects/spielwerk-examples"
import {OpenDawDeviceHelpCatalog} from "./OpenDawDeviceHelpCatalog"

afterEach(() => vi.unstubAllGlobals())

const readManual = (name: string): Promise<string> => readFile(fileURLToPath(
    new URL(`../../public/manuals/devices/instruments/${name}.md`, import.meta.url)), "utf8")

describe("OpenDawDeviceHelpCatalog", () => {
    it("fetches the real Apparat manual and reuses the existing guide and examples", async () => {
        const manual = await readManual("apparat")
        const fetchMock = vi.fn(async () => new Response(manual, {status: 200}))
        vi.stubGlobal("fetch", fetchMock)

        const content = await new OpenDawDeviceHelpCatalog().read(DeviceManualUrls.Apparat)

        expect(content.manualMarkdown).toBe(manual)
        expect(content.programmingGuide).toBe(starterPrompt)
        expect(content.examples).toEqual(ApparatExamples.map(({name, code}) => ({name, code})))
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(
            "manuals/devices/instruments/apparat.md"))
    })

    it("returns only generic Markdown for ordinary devices", async () => {
        const manual = "# Compressor\n"
        const fetchMock = vi.fn(async () => new Response(manual, {status: 200}))
        vi.stubGlobal("fetch", fetchMock)

        const content = await new OpenDawDeviceHelpCatalog().read(DeviceManualUrls.Compressor)

        expect(content).toEqual({manualMarkdown: manual})
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(
            "manuals/devices/audio/compressor.md"))
    })

    it("reuses the existing Werkstatt and Spielwerk programming guides and examples", async () => {
        const fetchMock = vi.fn(async () => new Response("# Script device", {status: 200}))
        vi.stubGlobal("fetch", fetchMock)
        const catalog = new OpenDawDeviceHelpCatalog()

        const werkstatt = await catalog.read(DeviceManualUrls.Werkstatt)
        expect(werkstatt.programmingGuide).toBe(werkstattStarterPrompt)
        expect(werkstatt.examples).toEqual(WerkstattExamples.map(({name, code}) => ({name, code})))

        const spielwerk = await catalog.read(DeviceManualUrls.Spielwerk)
        expect(spielwerk.programmingGuide).toBe(spielwerkStarterPrompt)
        expect(spielwerk.examples).toEqual(SpielwerkExamples.map(({name, code}) => ({name, code})))
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("reports missing manual assets clearly", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("", {
            status: 404, statusText: "Not Found"
        })))

        await expect(new OpenDawDeviceHelpCatalog().read(DeviceManualUrls.Apparat))
            .rejects.toThrow("Could not load device manual")
    })
})
