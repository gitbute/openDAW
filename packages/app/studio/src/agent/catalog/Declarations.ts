import {isDefined, Option} from "@opendaw/lib-std"

export type DeclarationKind = "interface" | "type" | "enum" | "const" | "namespace" | "class" | "function"

export type DeclarationMember = {
    readonly name: string
    readonly type: string
    readonly doc: string
    readonly readonly: boolean
    readonly method: boolean
    readonly text: string
}

export type ResolvedMember = {
    readonly owner: string
    readonly member: DeclarationMember
    // the queried type, or the union alternatives / subtypes that carry the member
    readonly via: ReadonlyArray<string>
}

export type Declaration = {
    readonly name: string
    readonly kind: DeclarationKind
    readonly doc: string
    readonly text: string
    readonly parents: ReadonlyArray<string>
    readonly members: ReadonlyArray<DeclarationMember>
}

const HeadPattern = /^(?:export\s+)?(?:declare\s+)?(interface|type|enum|const|namespace|class|function)\s+([A-Za-z_$][\w$]*)/
const MemberPattern = /^(readonly\s+)?("[^"]+"|[A-Za-z_$#][\w$]*)\??\s*(<[^(]*?>)?\s*([(:])/

const depthOf = (text: string): number => {
    let depth = 0
    for (const char of text) {
        if (char === "{" || char === "(" || char === "[") {depth++}
        else if (char === "}" || char === ")" || char === "]") {depth--}
    }
    return depth
}

const withoutGenerics = (text: string): string => {
    let depth = 0
    let result = ""
    for (const char of text) {
        if (char === "<") {depth++}
        else if (char === ">" && depth > 0) {depth--}
        else if (depth === 0) {result += char}
    }
    return result
}

const stripComments =(text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

export namespace Declarations {
    export const docText = (comment: string): string => comment
        .replace(/^\s*\/\*\*/, "").replace(/\*\/\s*$/, "")
        .split("\n").map(line => line.replace(/^\s*\* ?/, "").trimEnd())
        .join("\n").trim()

    export const summaryOf = (doc: string): string => {
        const tag = doc.search(/^@/m)
        return (tag < 0 ? doc : doc.slice(0, tag)).replace(/\s+/g, " ").trim()
    }

    export const plainLinks = (text: string): string =>
        text.replace(/\{@link\s+([^}|]+?)\s*\|\s*([^}]+?)\s*}/g, "$2").replace(/\{@link\s+([^}]+?)\s*}/g, "$1")

    const splitChunks = (source: string): ReadonlyArray<string> => {
        const chunks: Array<string> = []
        let current: Array<string> = []
        let depth = 0
        let inComment = false
        source.split(/\r?\n/).forEach(line => {
            if (line.trim().length === 0 && depth === 0 && !inComment) {
                if (current.length > 0) {chunks.push(current.join("\n"))}
                current = []
                return
            }
            current.push(line)
            if (inComment) {
                if (line.includes("*/")) {inComment = false}
                return
            }
            if (line.trimStart().startsWith("/**") && !line.includes("*/")) {
                inComment = true
                return
            }
            depth += depthOf(stripComments(line).replace(/"[^"]*"|'[^']*'|`[^`]*`/g, ""))
        })
        if (current.length > 0) {chunks.push(current.join("\n"))}
        return chunks
    }

    const leadingDoc = (chunk: string): { doc: string, rest: string } => {
        const match = /^\s*(\/\*\*[\s\S]*?\*\/)\s*\n?/.exec(chunk)
        return isDefined(match)
            ? {doc: docText(match[1]), rest: chunk.slice(match[0].length)}
            : {doc: "", rest: chunk}
    }

    const parseMembers = (body: string): ReadonlyArray<DeclarationMember> => {
        const members: Array<DeclarationMember> = []
        let doc = ""
        let pending: Array<string> = []
        let depth = 0
        let inComment = false
        let comment: Array<string> = []
        body.split("\n").forEach(line => {
            const trimmed = line.trim()
            if (pending.length === 0 && (inComment || trimmed.startsWith("/**"))) {
                comment.push(trimmed)
                inComment = !trimmed.includes("*/")
                if (!inComment) {
                    doc = docText(comment.join("\n"))
                    comment = []
                }
                return
            }
            if (trimmed.length === 0) {return}
            pending.push(trimmed)
            depth += depthOf(stripComments(trimmed).replace(/"[^"]*"|'[^']*'|`[^`]*`/g, ""))
            if (depth > 0) {return}
            const text = pending.join(" ")
            pending = []
            depth = 0
            const match = MemberPattern.exec(text)
            if (!isDefined(match)) {
                doc = ""
                return
            }
            const [head, readonlyFlag, rawName, , opener] = match
            const name = rawName.replace(/"/g, "")
            const method = opener === "("
            const type = method ? text.slice(head.length - 1).replace(/;$/, "") : text.slice(head.length).trim().replace(/;$/, "")
            members.push({name, type, doc, readonly: isDefined(readonlyFlag), method, text})
            doc = ""
        })
        return members
    }

    const parseChunk = (raw: string): Option<Declaration> => {
        const chunk = raw.replace(/^(?:[ \t]*\/\/.*\r?\n)+/, "")
        const {doc, rest} = leadingDoc(chunk)
        const head = HeadPattern.exec(rest)
        if (!isDefined(head)) {return Option.None}
        const kind = head[1] as DeclarationKind
        const name = head[2]
        const firstLine = withoutGenerics(rest.slice(0, rest.indexOf("{") < 0 ? rest.length : rest.indexOf("{")))
        const parentsMatch = kind === "interface" ? /\bextends\s+([^{]+)/.exec(firstLine) : null
        const parents = isDefined(parentsMatch)
            ? parentsMatch[1].split(",").map(parent => parent.trim()).filter(parent => parent.length > 0)
            : []
        const open = rest.indexOf("{")
        const close = rest.lastIndexOf("}")
        const members = kind === "interface" && open >= 0 && close > open ? parseMembers(rest.slice(open + 1, close)) : []
        return Option.wrap({name, kind, doc, text: chunk, parents, members})
    }

    export const parse = (source: string): ReadonlyArray<Declaration> =>
        splitChunks(source).flatMap(chunk => parseChunk(chunk).match({none: () => [], some: declaration => [declaration]}))
}

export class DeclarationIndex {
    readonly #declarations: ReadonlyArray<Declaration>
    readonly #byName: Map<string, Declaration>
    readonly #children: Map<string, ReadonlyArray<string>>

    constructor(source: string) {
        this.#declarations = Declarations.parse(source)
        this.#byName = new Map()
        this.#children = new Map()
        this.#declarations.forEach(declaration => {
            if (!this.#byName.has(declaration.name)) {this.#byName.set(declaration.name, declaration)}
            declaration.parents.forEach(parent => this.#children.set(parent, [...this.#children.get(parent) ?? [], declaration.name]))
        })
    }

    get declarations(): ReadonlyArray<Declaration> {return this.#declarations}

    find(name: string): Option<Declaration> {
        const exact = this.#byName.get(name)
        if (isDefined(exact)) {return Option.wrap(exact)}
        const lower = name.toLowerCase()
        return Option.wrap(this.#declarations.find(declaration => declaration.name.toLowerCase() === lower))
    }

    member(owner: string, name: string): Option<DeclarationMember> {
        return this.#declaring(owner, name, new Set()).map(({member}) => member)
    }

    // falls back to union alternatives and subtypes, e.g. AudioUnit.addSend is declared on Sendable
    resolveMember(owner: string, name: string): ReadonlyArray<ResolvedMember> {
        const direct = this.#declaring(owner, name, new Set())
        if (direct.nonEmpty()) {return [{...direct.unwrap(), via: [this.find(owner).mapOr(({name}) => name, owner)]}]}
        const found = new Map<string, { owner: string, member: DeclarationMember, via: Array<string> }>()
        const visited = new Set<string>([owner])
        const queue = [...this.#relatives(owner)]
        for (let candidate = queue.shift(); isDefined(candidate); candidate = queue.shift()) {
            if (visited.has(candidate)) {continue}
            visited.add(candidate)
            const resolved = this.#declaring(candidate, name, new Set())
            if (resolved.isEmpty()) {
                queue.push(...this.#relatives(candidate))
                continue
            }
            const {owner: declaring, member} = resolved.unwrap()
            const entry = found.get(declaring) ?? {owner: declaring, member, via: []}
            entry.via.push(candidate)
            found.set(declaring, entry)
        }
        return Array.from(found.values())
    }

    membersNamed(name: string): ReadonlyArray<ResolvedMember> {
        const lower = name.toLowerCase()
        return this.#declarations.flatMap(declaration => declaration.members
            .filter(member => member.name.toLowerCase() === lower)
            .map(member => ({owner: declaration.name, member, via: [declaration.name]})))
    }

    unionOf(name: string): ReadonlyArray<string> {
        return this.find(name).mapOr(declaration => {
            if (declaration.kind !== "type") {return []}
            const body = stripComments(declaration.text).replace(/^[^=]*=/, "").replace(/;\s*$/, "").trim()
            const indexed = /^(\w+)\[keyof\s+(\w+)]$/.exec(body)
            if (isDefined(indexed) && indexed[1] === indexed[2]) {
                return this.membersOf(indexed[1]).map(member => withoutGenerics(member.type).trim())
            }
            const alternatives = withoutGenerics(body).split("|").map(part => part.trim()).filter(part => part.length > 0)
            return alternatives.length > 1 && alternatives.every(part => /^\w+$/.test(part)) ? alternatives : []
        }, [])
    }

    search(query: string): ReadonlyArray<Declaration> {
        const lower = query.toLowerCase()
        return this.#declarations.filter(declaration => declaration.name.toLowerCase().includes(lower))
    }

    membersOf(name: string): ReadonlyArray<DeclarationMember> {
        return this.find(name).mapOr(declaration => declaration.members, [])
    }

    #relatives(name: string): ReadonlyArray<string> {
        const canonical = this.find(name).mapOr(declaration => declaration.name, name)
        return [...this.unionOf(canonical), ...(this.#children.get(canonical) ?? [])]
    }

    #declaring(owner: string, name: string, visited: Set<string>): Option<{ owner: string, member: DeclarationMember }> {
        return this.find(owner).flatMap(declaration => {
            if (visited.has(declaration.name)) {return Option.None}
            visited.add(declaration.name)
            const own = declaration.members.find(member => member.name === name)
                ?? declaration.members.find(member => member.name.toLowerCase() === name.toLowerCase())
            if (isDefined(own)) {return Option.wrap({owner: declaration.name, member: own})}
            for (const parent of declaration.parents) {
                const inherited = this.#declaring(parent, name, visited)
                if (inherited.nonEmpty()) {return inherited}
            }
            return Option.None
        })
    }
}
