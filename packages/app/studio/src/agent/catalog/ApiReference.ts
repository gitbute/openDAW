import {isDefined, Option, Optional} from "@opendaw/lib-std"
import {Declaration, DeclarationIndex, Declarations, ResolvedMember} from "./Declarations"

export type GuideChapter = {
    readonly order: number
    readonly slug: string
    readonly title: string
    readonly body: string
}

export namespace GuideChapter {
    export const parse = (fileName: string, markdown: string): GuideChapter => {
        const slug = fileName.replace(/^.*[\\/]/, "").replace(/\.md$/, "")
        const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown)
        const field = (key: string): Option<string> => Option.wrap(isDefined(front)
            ? new RegExp(`^${key}:\\s*(.+)$`, "m").exec(front[1])?.[1]?.trim() : undefined)
        const order = field("order").mapOr(value => Number(value), Number.parseInt(slug, 10))
        const title = field("title").unwrapOrElse(() => slug)
        const body = Declarations.plainLinks(isDefined(front) ? markdown.slice(front[0].length) : markdown).trim()
        return {order, slug, title, body}
    }
}

const FullEntryPoints: ReadonlyArray<string> = ["Api", "Project"]

const MaxMemberMatches = 6

const editDistance = (first: string, second: string): number => {
    let previous = Array.from({length: second.length + 1}, (_, index) => index)
    for (let row = 1; row <= first.length; row++) {
        const current = [row]
        for (let column = 1; column <= second.length; column++) {
            const cost = first[row - 1] === second[column - 1] ? 0 : 1
            current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost)
        }
        previous = current
    }
    return previous[second.length]
}

const matchScore = (key: string, word: string): number => key === word ? 4 : key.startsWith(word) ? 3
    : key.includes(word) ? 2 : word.length > 3 && Math.abs(key.length - word.length) <= 2 && editDistance(key, word) <= 2 ? 1 : 0

const EntryPoints: ReadonlyArray<string> = [
    ...FullEntryPoints, "AudioUnit", "InstrumentAudioUnit", "ScriptDevice", "NoteTrack", "NoteEventOwner",
    "AudioTrack", "ValueTrack", "TempoTrack", "Modulators", "Modulator"
]

export class ApiReference {
    static readonly MaxOutput = 12_000

    readonly #index: DeclarationIndex
    readonly #chapters: ReadonlyArray<GuideChapter>

    constructor(declarations: string, chapters: ReadonlyArray<GuideChapter>) {
        this.#index = new DeclarationIndex(declarations)
        this.#chapters = chapters.toSorted((left, right) => left.order - right.order)
    }

    get declarations(): DeclarationIndex {return this.#index}
    get chapters(): ReadonlyArray<GuideChapter> {return this.#chapters}

    overview(): string {
        const chapters = this.#chapters.map(chapter => `${chapter.order} ${chapter.title}`).join(" | ")
        const entries = EntryPoints.flatMap(name => this.#index.find(name).match({
            none: () => [],
            some: declaration => [`- ${declaration.name}: ${this.#headline(declaration)}`]
        }))
        return [
            "openDAW scripting API (TypeScript, runs in a worker; global `openDAW`, no imports).",
            "api_reference({topic}) with a guide chapter (number or title) or a symbol (`NoteRegion`, `Project.addInstrumentUnit`).",
            "Devices (Instruments, AudioEffects, MIDIEffects): device_reference({device}). Asset ids: browse({kind}).",
            `Guide: ${chapters}`,
            "Entry points:",
            ...entries
        ].join("\n")
    }

    lookup(topic: string): Option<string> {
        const query = topic.trim()
        if (query.length === 0) {return Option.wrap(this.overview())}
        return this.#chapter(query).map(chapter => `Guide chapter ${chapter.order}: ${chapter.title}\n\n${chapter.body}`)
            .match({none: () => this.#symbol(query), some: text => Option.wrap(text)})
            .map(text => ApiReference.cap(text))
    }

    suggestions(topic: string): ReadonlyArray<string> {
        const words = topic.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2)
        const candidates = this.#index.declarations.flatMap(declaration => [
            {name: declaration.name, key: declaration.name.toLowerCase(), type: true},
            ...declaration.members.map(member =>
                ({name: `${declaration.name}.${member.name}`, key: member.name.toLowerCase(), type: false}))
        ])
        return candidates
            .map(candidate => ({...candidate, score: words.reduce((sum, word) => sum + matchScore(candidate.key, word), 0)}))
            .filter(({score}) => score > 0)
            .sort((first, second) => second.score - first.score
                || Number(second.type) - Number(first.type) || first.name.length - second.name.length)
            .map(({name}) => name)
            .filter((name, index, names) => names.indexOf(name) === index)
            .slice(0, 20)
    }

    static cap(text: string): string {
        if (text.length <= ApiReference.MaxOutput) {return text}
        return `${text.slice(0, ApiReference.MaxOutput)}\n… [truncated at ${ApiReference.MaxOutput} chars, narrow your topic]`
    }

    #headline(declaration: Declaration): string {
        const full = Declarations.plainLinks(Declarations.summaryOf(declaration.doc))
        const summary = full.length > 64 ? `${full.slice(0, 63)}…` : full
        const members = declaration.members.map(member => member.method ? `${member.name}()` : member.name)
        const max = FullEntryPoints.includes(declaration.name) ? members.length : 8
        const list = members.length > max ? `${members.slice(0, max).join(", ")}, …` : members.join(", ")
        return [summary, list.length > 0 ? `[${list}]` : ""].filter(part => part.length > 0).join(" ")
    }

    #chapter(query: string): Option<GuideChapter> {
        const lower = query.toLowerCase().replace(/^guide[:\s]*/, "").replace(/^chapter[:\s]*/, "")
        const number = /^\d+$/.test(lower) ? Number.parseInt(lower, 10) : NaN
        return Option.wrap(this.#chapters.find(chapter => chapter.order === number)
            ?? this.#chapters.find(chapter => chapter.slug.toLowerCase() === lower
                || chapter.slug.toLowerCase().replace(/^\d+-/, "") === lower || chapter.title.toLowerCase() === lower)
            ?? this.#chapters.find(chapter => chapter.title.toLowerCase().includes(lower) && lower.length > 3))
    }

    #symbol(query: string): Option<string> {
        const [owner, member] = query.split(".")
        if (isDefined(member)) {return this.#members(owner, this.#index.resolveMember(owner, member))}
        return this.#index.find(query).map(declaration => {
            const parents = declaration.parents.length > 0
                ? `\n// extends ${declaration.parents.join(", ")} (look these up for inherited members)` : ""
            return `${declaration.text}${parents}`
        }).match({
            none: () => this.#members(undefined, this.#index.membersNamed(query).slice(0, MaxMemberMatches)),
            some: text => Option.wrap(text)
        })
    }

    #members(owner: Optional<string>, resolved: ReadonlyArray<ResolvedMember>): Option<string> {
        if (resolved.length === 0) {return Option.None}
        return Option.wrap(resolved.map(({owner: declaring, member, via}) => {
            const same = (name: string): boolean => isDefined(owner) && name.toLowerCase() === owner.toLowerCase()
            const onOwner = !isDefined(owner) || via.some(same)
            const origin = !isDefined(owner) || same(declaring) ? ""
                : onOwner ? ` (inherited from ${declaring})` : ` (not on ${owner} itself; available on ${via.join(", ")})`
            const title = isDefined(owner) && onOwner ? `${via[0]}.${member.name}` : `${declaring}.${member.name}`
            const doc = member.doc.length > 0 ? `/** ${member.doc.replace(/\n/g, "\n * ")} */\n` : ""
            return `// ${title}${origin}\n${doc}${member.text}`
        }).join("\n\n"))
    }
}
