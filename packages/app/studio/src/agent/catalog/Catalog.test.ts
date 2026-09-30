import {describe, expect, it} from "vitest"
import {Option, UUID} from "@opendaw/lib-std"
import {validateCodexToolboxes} from "@opendaw/studio-codex"
import type {PresetEntry} from "@opendaw/studio-core"
import type {Sample, Soundfont} from "@opendaw/studio-adapters"
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
import simpleSine from "@/ui/devices/instruments/examples/simple-sine.js?raw"
import type {TubularCartridge} from "@/ui/devices/instruments/TubularDeviceEditor/TubularCartridges"
import {DeclarationIndex, Declarations} from "./Declarations"
import {ApiReference, GuideChapter} from "./ApiReference"
import {AssetCatalog, AssetSources} from "./AssetCatalog"
import {DeviceCatalog} from "./DeviceCatalog"
import {CatalogTools} from "./CatalogTools"

const Snippet = `type int = number;

/**
 * A region on a note track
 * @group Timeline
 */
interface NoteRegion extends LoopableRegion, NoteEventOwner {
    /** Position in PPQN */
    position: ppqn;
    /** The track holding this region */
    readonly track: NoteTrack;
    /**
     * Add a layer
     * @example
     * \`\`\`ts
     * stack.addLayer("Nano")
     * \`\`\`
     */
    addLayer<K extends keyof LayerInstruments>(key: K, props?: DeepPartial<LayerInstruments[K]>): InstrumentCompositeLayer & {
        /** The instrument */
        readonly instrument: LayerInstruments[K];
    };
    "quoted": boolean;
}

interface LoopableRegion {
    /** Loop length in PPQN */
    loopDuration: ppqn;
}

declare enum VoicingMode {
    Monophonic = 0,
    Polyphonic = 1
}

declare const openDAW: Api`

const chapters = [
    ["01-getting-started.md", guide01], ["02-time-and-units.md", guide02], ["03-project-tree.md", guide03],
    ["04-parameters.md", guide04], ["05-automation-and-modulation.md", guide05], ["06-samples-and-audio.md", guide06],
    ["07-validation.md", guide07], ["08-globals.md", guide08], ["09-cookbook.md", guide09]
].map(([name, markdown]) => GuideChapter.parse(name, markdown))

const reference = new ApiReference(declarations, chapters)

const devices = new DeviceCatalog(reference.declarations,
    {Apparat: {guide: apparatGuide, examples: [{name: "Simple Sine Synth", code: simpleSine}]}},
    async key => key === "Compressor" ? Option.wrap("# Compressor\n\n![shot](c.webp)\n\nSquashes peaks.") : Option.None)

const cardOf = (device: string): string => devices.card(devices.find(device).unwrap(device))

const preset = (name: string, category: PresetEntry["category"], device: string, source: "stock" | "user"): PresetEntry => {
    const common = {uuid: UUID.toString(UUID.generate()), name, description: `${name} sound`, created: 0, modified: 0, source}
    switch (category) {
        case "instrument": return {...common, category, device: device as "Vaporisateur"}
        case "audio-effect": return {...common, category, device: device as "Compressor"}
        default: return {...common, category: "audio-effect-chain"}
    }
}

const sources: AssetSources = {
    presets: async () => [
        preset("Warm Pad", "instrument", "Vaporisateur", "stock"),
        preset("Acid Lead", "instrument", "Vaporisateur", "user"),
        preset("Glue", "audio-effect", "Compressor", "stock"),
        preset("Bus Chain", "audio-effect-chain", "", "stock")
    ],
    samples: async (): Promise<ReadonlyArray<Sample>> => [
        {uuid: UUID.toString(UUID.generate()), name: "Kick 909", bpm: 0, duration: 0.4567, sample_rate: 44100, origin: "openDAW"},
        {uuid: UUID.toString(UUID.generate()), name: "Break 120", bpm: 120, duration: 8, sample_rate: 44100, origin: "openDAW"}
    ],
    soundfonts: async (): Promise<ReadonlyArray<Soundfont>> => [
        {uuid: UUID.toString(UUID.generate()), name: "Piano", size: 2048, url: "", license: "CC0", origin: "openDAW"}
    ],
    cartridges: async (): Promise<ReadonlyArray<TubularCartridge>> => [{
        name: "Tubular Classics", file: "Tubular_Classics.syx", author: "openDAW", license: "CC0", source: "",
        voices: ["Rhodes", "Soft Rhds", "Marimba"].map(name => ({name, data: new Uint8Array(155)}))
    }]
}

describe("Declarations", () => {
    it("parses interfaces, members, docs and parents", () => {
        const index = new DeclarationIndex(Snippet)
        const region = index.find("NoteRegion").unwrap()
        expect(region.kind).toBe("interface")
        expect(region.doc).toContain("A region on a note track")
        expect(region.parents).toEqual(["LoopableRegion", "NoteEventOwner"])
        expect(region.members.map(member => member.name)).toEqual(["position", "track", "addLayer", "quoted"])
        const addLayer = region.members[2]
        expect(addLayer.method).toBe(true)
        expect(Declarations.summaryOf(addLayer.doc)).toBe("Add a layer")
        expect(addLayer.text).toContain("readonly instrument")
        expect(region.members[1].readonly).toBe(true)
        expect(index.member("NoteRegion", "loopDuration").unwrap().doc).toBe("Loop length in PPQN")
        expect(index.find("VoicingMode").unwrap().kind).toBe("enum")
        expect(index.find("openDAW").unwrap().kind).toBe("const")
        expect(index.find("noteregion").nonEmpty()).toBe(true)
    })

    it("slices a symbol with its JSDoc", () => {
        const text = new ApiReference(Snippet, []).lookup("NoteRegion").unwrap()
        expect(text.startsWith("/**")).toBe(true)
        expect(text).toContain("interface NoteRegion")
        expect(text).not.toContain("interface LoopableRegion")
        expect(text).toContain("extends LoopableRegion, NoteEventOwner")
        const member = new ApiReference(Snippet, []).lookup("NoteRegion.position").unwrap()
        expect(member).toContain("Position in PPQN")
        expect(member).toContain("position: ppqn")
    })

    it("parses the generated declaration file", () => {
        const index = reference.declarations
        expect(index.find("Api").unwrap().members.map(member => member.name)).toContain("applyPreset")
        expect(index.membersOf("Instruments").map(member => member.name)).toContain("Vaporisateur")
        expect(index.member("InstrumentAudioUnit", "addAudioEffect").nonEmpty()).toBe(true)
    })
})

describe("ApiReference", () => {
    it("keeps the index compact", () => {
        const overview = reference.overview()
        expect(overview.length).toBeLessThanOrEqual(2500)
        expect(overview).toContain("Getting Started")
        expect(overview).toContain("Project:")
        expect(overview).toContain("NoteTrack:")
    })

    it("finds chapters by number, slug and title", () => {
        expect(reference.lookup("4").unwrap()).toContain("Guide chapter 4: Parameters")
        expect(reference.lookup("samples-and-audio").unwrap()).toContain("applyPreset")
        expect(reference.lookup("cookbook").unwrap()).not.toContain("---\ntitle")
        expect(reference.lookup("Project.addInstrumentUnit").unwrap()).toContain("addInstrumentUnit<K extends keyof Instruments>")
        expect(reference.lookup("NoSuchThing").isEmpty()).toBe(true)
        expect(reference.suggestions("region")).toContain("NoteRegion")
    })

    it("resolves members declared on subtypes and union alternatives", () => {
        const addSend = reference.lookup("AudioUnit.addSend").unwrap()
        expect(addSend).toContain("// Sendable.addSend (not on AudioUnit itself; available on InstrumentAudioUnit")
        expect(addSend).toContain("addSend(target: AuxAudioUnit | GroupAudioUnit")
        expect(addSend).toContain("Add a send to an auxiliary or group unit")
        expect(addSend.match(/\/\/ Sendable\.addSend/g)).toHaveLength(1)
        expect(reference.lookup("AnyAudioUnit.addSend").unwrap()).toContain("available on InstrumentAudioUnit, AuxAudioUnit, GroupAudioUnit")
        expect(reference.lookup("InstrumentAudioUnit.addSend").unwrap()).toContain("// InstrumentAudioUnit.addSend (inherited from Sendable)")
        expect(reference.lookup("AnyInstrument.label").nonEmpty()).toBe(true)
        expect(reference.declarations.unionOf("AnyAudioUnit")).toEqual(["InstrumentAudioUnit", "AuxAudioUnit", "GroupAudioUnit", "OutputAudioUnit"])
    })

    it("finds bare member names and suggests fuzzy matches over types and members", () => {
        expect(reference.lookup("addSend").unwrap()).toContain("// Sendable.addSend\n")
        expect(reference.lookup("Loop").unwrap()).toContain(".loop")
        const loop = reference.suggestions("Loop")
        expect(loop).toContain("LoopArea")
        expect(loop.some(name => /\.loop[A-Z]/.test(name))).toBe(true)
        expect(reference.suggestions("AudioUnit.addSnd")).toContain("Sendable.addSend")
        expect(reference.suggestions("region")).toContain("NoteRegion")
    })

    it("caps long output", () => {
        const capped = ApiReference.cap("x".repeat(20_000))
        expect(capped.length).toBeLessThan(12_100)
        expect(capped).toContain("narrow your topic")
    })
})

describe("AssetCatalog", () => {
    it("filters presets by device and query with user presets first", async () => {
        const result = await AssetCatalog.browse(sources, {kind: "presets", device: "vaporisateur"})
        const items = result.items as ReadonlyArray<Record<string, string>>
        expect(items.map(item => item.name)).toEqual(["Acid Lead", "Warm Pad"])
        expect(Object.keys(items[0]).sort()).toEqual(["category", "description", "device", "id", "name", "source"])
        expect(items[0].id).toMatch(/^[0-9a-f-]{36}$/)
        expect(result.usage).toContain("openDAW.applyPreset")
        const chains = await AssetCatalog.browse(sources, {kind: "presets", query: "chain"})
        expect(chains.total).toBe(1)
    })

    it("limits results and reports the total", async () => {
        const result = await AssetCatalog.browse(sources, {kind: "presets", limit: 2})
        expect(result.total).toBe(4)
        expect(result.shown).toBe(2)
        expect((result.items as ReadonlyArray<unknown>).length).toBe(2)
        expect(result.hint).toBeDefined()
    })

    it("lists samples, soundfonts and cartridge voices", async () => {
        const samples = await AssetCatalog.browse(sources, {kind: "samples", query: "kick"})
        expect(samples.items).toEqual([expect.objectContaining({name: "Kick 909", bpm: 0, duration: 0.46})])
        const soundfonts = await AssetCatalog.browse(sources, {kind: "soundfonts"})
        expect(soundfonts.usage).toContain("soundfont.file")
        const voices = await AssetCatalog.browse(sources, {kind: "cartridges", query: "rh"})
        expect(voices.items).toEqual([{cartridge: "Tubular Classics", author: "openDAW", voices: "0:Rhodes, 1:Soft Rhds"}])
        expect(voices.usage).toContain("loadTubularVoice")
    })
})

describe("DeviceCatalog", () => {
    it("summarises the whole palette compactly for the instructions", () => {
        const palette = devices.palette()
        expect(palette).toMatch(/audio-effect:[\s\S]*Fold:/)
        expect(palette).toMatch(/Waveshaper/)
        expect(palette).toMatch(/midi-effect:[\s\S]*Arpeggio/)
        expect(palette.length).toBeLessThan(6000)
    })
    it("lists devices by category", () => {
        const listing = devices.listing()
        expect(listing).toMatch(/instrument: .*Vaporisateur.*Tubular/)
        expect(listing).toMatch(/audio-effect: .*Compressor/)
        expect(listing).toMatch(/midi-effect: .*Arpeggio/)
    })

    it("renders a Vaporisateur card from the facade and the box fields", () => {
        const card = cardOf("Vaporisateur")
        expect(card).toContain("project.addInstrumentUnit(\"Vaporisateur\"")
        expect(card).toMatch(/- cutoff: float 20\.\.20000 exp Hz, default 8000: Filter cutoff in Hz/)
        expect(card).toMatch(/- oscillators\.N\.volume \[N=0\.\.1]: .*default -6\|-inf/)
        expect(card).toContain("lfo.rate")
        expect(card).toContain("voicingMode: VoicingMode{0=Monophonic,1=Polyphonic}")
        expect(card.length).toBeLessThan(6000)
    })

    it("renders a Tubular card with grouped operators", () => {
        const card = cardOf("tubular")
        expect(card).toMatch(/- operators\.N\.rate1 \[N=0\.\.5]: int/)
        expect(card).toContain("algorithm")
        expect(card.length).toBeLessThan(8000)
    })

    it("renders a Compressor card with side-chain and manual", async () => {
        const entry = devices.find("Compressor").unwrap()
        const card = devices.card(entry)
        expect(card).toContain("unit.addAudioEffect(\"Compressor\"")
        expect(card).toMatch(/- threshold: float -60\.\.0 dB, default -10/)
        expect(card).toContain("sideChain: Nullable<SideChainSource>")
        const manual = (await devices.manual(entry)).unwrap()
        expect(manual).toContain("Squashes peaks.")
        expect(manual).not.toContain("webp")
    })

    it("renders the Apparat card with the programming guide and examples", () => {
        const entry = devices.find("Apparat").unwrap()
        const card = devices.card(entry)
        expect(card).toContain("## Programming guide")
        expect(card).toContain(apparatGuide.trim().slice(0, 60))
        expect(card).toContain("Simple Sine Synth")
        expect(card).toContain("code: string")
        expect(devices.example(entry, "simple sine").unwrap()).toContain(simpleSine.slice(0, 40))
        expect(devices.example(entry, "nope").isEmpty()).toBe(true)
    })

    it("renders parts of container devices", () => {
        expect(cardOf("Playfield")).toMatch(/slot parameters \(PlayfieldSlot.*\n(.*\n)*- pitch: float/)
    })
})

describe("CatalogTools", () => {
    const tools = [CatalogTools.browse(sources), CatalogTools.deviceReference(devices), CatalogTools.apiReference(reference)]

    it("declares Codex compatible schemas", () => {
        expect(() => validateCodexToolboxes([{namespace: "catalog", description: "test", tools}])).not.toThrow()
    })

    it("executes", async () => {
        const [browse, device, api] = tools
        expect((await browse.execute({kind: "nope"})).ok).toBe(false)
        const listed = await browse.execute({kind: "cartridges"})
        expect(listed.ok).toBe(true)
        const unknown = await device.execute({device: "Nope"})
        expect(JSON.stringify(unknown.content)).toContain("Unknown device")
        const manual = await device.execute({device: "Compressor", includeManual: true})
        expect(JSON.stringify(manual.content)).toContain("## Manual")
        const index = await api.execute({})
        expect(JSON.stringify(index.content)).toContain("Entry points")
        const missing = await api.execute({topic: "Regionz"})
        expect(missing.ok).toBe(false)
    })
})
