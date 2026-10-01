import {Func, isDefined, Option} from "@opendaw/lib-std"
import {ScriptDsp} from "@opendaw/studio-adapters"
import type {CodeEditorExample} from "@/ui/code-editor/CodeEditorState"
import {Declaration, DeclarationIndex, DeclarationMember, Declarations} from "./Declarations"
import {DeviceCategory, DeviceProbe, ProbedField} from "./DeviceProbe"

export type ScriptDeviceDocs = {
    readonly guide: string
    readonly examples: ReadonlyArray<CodeEditorExample>
}

export type DeviceEntry = {
    readonly key: string
    readonly category: DeviceCategory
    readonly interfaceName: string
    readonly summary: string
}

export type ManualLoader = Func<string, Option<string>>

const LabelLine = /^\/\/ @label[^\n]*\n/m

export namespace ManualSummary {
    const firstSentence = (text: string, limit: number): string => {
        const sentence = text.replace(/\*\*|\[|\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim().split(/(?<=\.)\s/)[0]
        return sentence.length > limit ? `${sentence.slice(0, limit - 3)}...` : sentence
    }

    export const of = (markdown: string): Option<string> => {
        const lines = markdown.split(/\r?\n/).map(line => line.trim())
        const start = lines.findIndex(line => line.length > 0 && !/^(#|---|!\[)/.test(line))
        if (start < 0) {return Option.None}
        const end = lines.findIndex((line, index) => index > start && line.length === 0)
        const intro = firstSentence(lines.slice(start, end < 0 ? undefined : end).join(" "), 160)
        const usesAt = lines.findIndex(line => /^example uses:?$/i.test(line))
        const listStart = lines.findIndex((line, index) => index > usesAt && line.length > 0)
        const listEnd = lines.findIndex((line, index) => index > listStart && !line.startsWith("- "))
        const uses = usesAt < 0 || listStart < 0 ? [] : lines.slice(listStart, listEnd < 0 ? undefined : listEnd)
            .filter(line => line.startsWith("- ")).map(line => line.slice(2).split(":")[0].trim())
        return Option.wrap(uses.length > 0 ? `${intro} Uses: ${uses.join("; ")}.` : intro)
    }
}

const Registries: ReadonlyArray<[DeviceCategory, string]> = [
    ["instrument", "Instruments"], ["audio-effect", "AudioEffects"], ["midi-effect", "MIDIEffects"]
]

const BaseInterfaces: ReadonlyArray<string> = ["Device", "Effect", "MIDIEffect", "AudioEffect", "Instrument", "MIDIEffectHost", "AudioEffectHost"]
const BaseMembers: ReadonlyArray<string> = ["key", "uuid", "label", "enabled", "minimized", "index", "audioUnit", "icon", "remove", "move"]

const RedundantRange = /\s*\((?:-?[\d.]+|-inf)\s+to\s+(?:-?[\d.]+|inf)(?:,\s*default [^)]*)?\)/
const RedundantDefault = /\s*\(default [^)(]*\)$/

type PathGroup = {
    readonly pattern: string
    readonly indices: Array<ReadonlyArray<number>>
    readonly fields: Array<ProbedField>
}

export class DeviceCatalog {
    static readonly MaxManual = 14_000

    readonly #index: DeclarationIndex
    readonly #scripts: Readonly<Record<string, ScriptDeviceDocs>>
    readonly #manual: ManualLoader
    readonly #probe: DeviceProbe
    readonly #entries: ReadonlyArray<DeviceEntry>
    readonly #cards: Map<string, string>

    constructor(index: DeclarationIndex, scripts: Readonly<Record<string, ScriptDeviceDocs>>, manual: ManualLoader) {
        this.#index = index
        this.#scripts = scripts
        this.#manual = manual
        this.#probe = new DeviceProbe()
        this.#entries = Registries.flatMap(([category, registry]) => index.membersOf(registry).map(member => ({
            key: member.name, category, interfaceName: member.type,
            summary: index.find(member.type).mapOr(declaration => Declarations.plainLinks(Declarations.summaryOf(declaration.doc)), "")
        })))
        this.#cards = new Map()
    }

    get entries(): ReadonlyArray<DeviceEntry> {return this.#entries}

    find(name: string): Option<DeviceEntry> {
        const lower = name.trim().toLowerCase()
        return Option.wrap(this.#entries.find(entry => entry.key.toLowerCase() === lower)
            ?? this.#entries.find(entry => entry.interfaceName.toLowerCase() === lower))
    }

    listing(): string {
        const lines = Registries.map(([category]) => `${category}: ${this.#entries
            .filter(entry => entry.category === category).map(entry => entry.key).join(", ")}`)
        return ["Devices by category (device_reference({device}) for a card):", ...lines].join("\n")
    }

    palette(): string {
        const shorten = (text: string): string => {
            const sentence = text.split(/(?<=\.)\s/)[0].replace(/\s+/g, " ").trim()
            return sentence.length > 90 ? `${sentence.slice(0, 87)}...` : sentence
        }
        const describe = ({key, summary}: DeviceEntry): string =>
            this.#manual(key).flatMap(ManualSummary.of).unwrapOrElse(() => shorten(summary))
        return Registries.map(([category]) => [`${category}:`, ...this.#entries
            .filter(entry => entry.category === category)
            .map(entry => {
                const description = describe(entry)
                return description.length > 0 ? `  ${entry.key}: ${description}` : `  ${entry.key}`
            })].join("\n"))
            .join("\n")
    }

    card(entry: DeviceEntry): string {
        const cached = this.#cards.get(entry.key)
        if (isDefined(cached)) {return cached}
        const card = this.#render(entry)
        this.#cards.set(entry.key, card)
        return card
    }

    example(entry: DeviceEntry, name: string): Option<string> {
        const docs = this.#scripts[entry.key]
        if (!isDefined(docs)) {return Option.None}
        const lower = name.trim().toLowerCase()
        const found = docs.examples.find(example => example.name.toLowerCase() === lower)
            ?? docs.examples.find(example => example.name.toLowerCase().includes(lower))
        return Option.wrap(found).map(example =>
            `// ${entry.key} example: ${example.name}\n${ScriptDsp.collapse(example.code).replace(LabelLine, "")}`)
    }

    manual(entry: DeviceEntry): Option<string> {
        return this.#manual(entry.key).map(markdown => {
            const text = markdown.replace(/^!\[.*\]\(.*\)\s*$/gm, "").replace(/^---\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim()
            return text.length > DeviceCatalog.MaxManual ? `${text.slice(0, DeviceCatalog.MaxManual)}\n… [manual truncated]` : text
        })
    }

    #render(entry: DeviceEntry): string {
        const {key, category, interfaceName, summary} = entry
        const lines: Array<string> = [`# ${key} (${category}, interface ${interfaceName})`, summary]
        const device = this.#probe.create(category, key)
        const fields = device.mapOr(created => this.#probe.fields(created), [])
        const numeric = fields.filter(field => field.kind === "float" || field.kind === "int")
        lines.push(`create: ${this.#creation(entry, numeric)}`)
        if (numeric.length > 0) {
            const path = numeric[0].path
            lines.push(`automate: unit.addValueTrack(device, "${path}") | modulate: modulator.assign(device, "${path}", 0.5)`)
        }
        if (fields.length > 0) {
            lines.push("parameters (path: type range unit, default: meaning):")
            lines.push(...this.#parameterLines(interfaceName, fields))
        }
        const others = this.#otherMembers(interfaceName, fields)
        if (others.length > 0) {lines.push("other members:", ...others)}
        const probedPart = device.flatMap(created => this.#probe.parts(created))
        probedPart.ifSome(part => {
            lines.push(`${part.name} parameters (${part.interfaceName}, via ${part.access}):`)
            lines.push(...this.#parameterLines(part.interfaceName, part.fields))
        })
        const partTypes = this.#partTypes(interfaceName, probedPart.mapOr(part => [part.interfaceName], []))
        if (partTypes.length > 0) {lines.push("part types:", ...partTypes.map(declaration => declaration.text))}
        const docs = this.#scripts[key]
        if (isDefined(docs)) {
            lines.push(`examples (device_reference({device: "${key}", example: name}) for code): ${docs.examples.map(example => example.name).join(", ")}`)
            lines.push("## Programming guide", docs.guide.trim())
        }
        return lines.filter(line => line.length > 0).join("\n")
    }

    #creation({key, category}: DeviceEntry, fields: ReadonlyArray<ProbedField>): string {
        const sample = fields.filter(field => !field.path.includes(".")).slice(0, 2)
            .map(field => `${field.path}: ${field.value.replace(/^(-?)inf$/, "$1Infinity")}`).join(", ")
        const props = sample.length > 0 ? `{${sample}}` : "{}"
        switch (category) {
            case "instrument":
                return `const unit = project.addInstrumentUnit("${key}", {label: "${key}"}, ${props}); const device = unit.instrument`
            case "audio-effect":
                return `const device = unit.addAudioEffect("${key}", ${props})`
            case "midi-effect":
                return `const device = unit.addMIDIEffect("${key}", ${props})`
        }
    }

    #parameterLines(interfaceName: string, fields: ReadonlyArray<ProbedField>): ReadonlyArray<string> {
        return this.#group(fields).map(({pattern, indices, fields: members}) => {
            const [first] = members
            const values = Array.from(new Set(members.map(field => field.value)))
            const value = values.length === 1 ? values[0] : values.length <= 4 ? values.join("|") : "varies"
            const counts = indices.length > 1 ? this.#indexNote(indices) : ""
            const member = this.#memberAt(interfaceName, pattern.split("."))
            const type = member.mapOr(found => this.#typeLabel(found), first.kind)
            const enumerated = /[{|]/.test(type)
            const meaning = member.mapOr(found => this.#meaning(found, first), "")
            const detail = [type, enumerated ? "" : first.range, first.unit].filter(part => part.length > 0).join(" ")
            return `- ${pattern}${counts}: ${detail}, default ${value}${meaning.length > 0 ? `: ${meaning}` : ""}`
        })
    }

    #group(fields: ReadonlyArray<ProbedField>): ReadonlyArray<PathGroup> {
        const groups = new Map<string, PathGroup>()
        fields.forEach(field => {
            const segments = field.path.split(".")
            const pattern = segments.map(segment => /^\d+$/.test(segment) ? "N" : segment).join(".")
            const indices = segments.filter(segment => /^\d+$/.test(segment)).map(Number)
            const group = groups.get(pattern) ?? {pattern, indices: [], fields: []}
            group.indices.push(indices)
            group.fields.push(field)
            groups.set(pattern, group)
        })
        return Array.from(groups.values())
    }

    #indexNote(indices: ReadonlyArray<ReadonlyArray<number>>): string {
        const depth = indices[0].length
        const ranges = Array.from({length: depth}, (_, level) => {
            const values = indices.map(entry => entry[level])
            return `0..${Math.max(...values)}`
        })
        return ` [N=${ranges.join(", ")}]`
    }

    #memberAt(interfaceName: string, segments: ReadonlyArray<string>): Option<DeclarationMember> {
        let owner = interfaceName
        let found: Option<DeclarationMember> = Option.None
        for (const segment of segments) {
            if (segment === "N") {continue}
            found = this.#index.member(owner, segment)
            if (found.isEmpty()) {return Option.None}
            owner = found.unwrap().type.replace(/^ReadonlyArray<(.+)>$/, "$1").replace(/^Nullable<(.+)>$/, "$1")
        }
        return found
    }

    #typeLabel(member: DeclarationMember): string {
        return this.#index.find(member.type).match({
            none: () => /^[-\d\s|"]+$/.test(member.type) ? member.type.replace(/\s+/g, "") : member.type,
            some: declaration => {
                if (declaration.kind !== "enum") {return member.type}
                const values = Array.from(declaration.text.matchAll(/^\s+(\w+)\s*=\s*(-?\d+)/gm)).map(([, name, value]) => `${value}=${name}`)
                return `${member.type}{${values.join(",")}}`
            }
        })
    }

    #meaning(member: DeclarationMember, field: ProbedField): string {
        const summary = Declarations.plainLinks(Declarations.summaryOf(member.doc))
        const stripped = field.range.length > 0 ? summary.replace(RedundantRange, "") : summary
        return stripped.replace(RedundantDefault, "").trim()
    }

    // Part types are named after their device: CubedPattern, CubedStep, PlayfieldSlot.
    #partTypes(interfaceName: string, skip: ReadonlyArray<string>): ReadonlyArray<Declaration> {
        const prefix = interfaceName.replace(/Effect$/, "")
        const found: Array<Declaration> = []
        const visit = (name: string, depth: number): void => this.#index.find(name).ifSome(declaration =>
            declaration.members.forEach(member => {
                for (const [type] of member.type.matchAll(/[A-Z][A-Za-z0-9]+/g)) {
                    if (type === interfaceName || !type.startsWith(prefix) || skip.includes(type)
                        || found.some(part => part.name === type)) {continue}
                    this.#index.find(type).ifSome(part => {
                        found.push(part)
                        if (depth < 2) {visit(type, depth + 1)}
                    })
                }
            }))
        visit(interfaceName, 0)
        return found
    }

    #otherMembers(interfaceName: string, fields: ReadonlyArray<ProbedField>): ReadonlyArray<string> {
        const covered = new Set(fields.map(field => field.path.split(".")[0]))
        const collect = (name: string): ReadonlyArray<DeclarationMember> => {
            if (BaseInterfaces.includes(name)) {return []}
            return this.#index.find(name).mapOr(declaration =>
                [...declaration.members, ...declaration.parents.flatMap(parent => collect(parent))], [])
        }
        const seen = new Set<string>()
        return collect(interfaceName)
            .filter(member => !BaseMembers.includes(member.name) && !covered.has(member.name))
            .filter(member => {
                if (seen.has(member.name)) {return false}
                seen.add(member.name)
                return true
            })
            .map(member => {
                const summary = Declarations.plainLinks(Declarations.summaryOf(member.doc))
                const signature = member.method ? `${member.name}${member.type}` : `${member.name}: ${member.type}`
                const compact = signature.length > 160 ? `${signature.slice(0, 157)}...` : signature
                return `- ${member.readonly && !member.method ? "readonly " : ""}${compact}${summary.length > 0 ? ` — ${summary}` : ""}`
            })
    }
}
