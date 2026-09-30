import {int, isDefined, isNull, Nullable, Option, Optional, Terminable, tryCatch} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import type {JsonValue} from "@opendaw/studio-codex"
import type {AgentScriptOutcome, ScriptExecutionContext} from "@opendaw/studio-scripting"
import type {ScriptCompilation} from "@/script/ScriptCompiler"
import type {ScriptDiagnostic} from "@/script/ScriptDiagnostics"
import {ScriptEdits} from "@/script/ScriptEdits"
import {ScriptExcerpt} from "@/script/ScriptExcerpt"

export type ScriptRunRequest = { code: string, apply: boolean }

export type ScriptRunStage = "typecheck" | "runtime" | "apply" | "done"

export type ScriptRunError = { message: string, line: Optional<int>, column?: int, excerpt?: string }

export type ScriptRunDiagnostic = ScriptDiagnostic & { excerpt: Optional<string> }

export type ScriptRunResult = {
    ok: boolean
    stage: ScriptRunStage
    diagnostics: ReadonlyArray<ScriptRunDiagnostic>
    error: Nullable<ScriptRunError>
    logs: ReadonlyArray<string>
    returned: JsonValue
    applied: boolean
    changeSummary: ReadonlyArray<string>
}

export interface AgentScriptEnvironment extends Terminable {
    compile(code: string): Promise<ScriptCompilation>
    execute(js: string, context: ScriptExecutionContext): Promise<AgentScriptOutcome>
    target(): Option<ScriptEdits.Target>
    context(): ScriptExecutionContext
}

const Initial: ScriptRunResult = {
    ok: false, stage: "typecheck", diagnostics: [], error: null, logs: [], returned: null, applied: false, changeSummary: []
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

const failure = (stage: ScriptRunStage, message: string, line?: int): ScriptRunResult =>
    ({...Initial, stage, error: {message, line}})

const parseReturned = (json: string): JsonValue => {
    const parsed = tryCatch((): JsonValue => JSON.parse(json))
    return parsed.status === "success" ? parsed.value : json
}

const withExcerpts = (diagnostics: ReadonlyArray<ScriptDiagnostic>, code: string): ReadonlyArray<ScriptRunDiagnostic> => {
    let budget = ScriptExcerpt.MaxTotal
    return diagnostics.map(diagnostic => {
        const excerpt = budget > 0 ? ScriptExcerpt.of(code, diagnostic.line, diagnostic.column) : ""
        budget -= excerpt.length
        return {...diagnostic, excerpt: excerpt.length > 0 ? excerpt : undefined}
    })
}

export class AgentScriptRunner implements Terminable {
    readonly #environment: AgentScriptEnvironment
    #queue: Promise<void>

    constructor(environment: AgentScriptEnvironment) {
        this.#environment = environment
        this.#queue = Promise.resolve()
    }

    run(request: ScriptRunRequest): Promise<ScriptRunResult> {
        const next = this.#queue.then(() => this.#run(request))
        this.#queue = next.then(() => undefined, () => undefined)
        return next
    }

    terminate(): void {this.#environment.terminate()}

    async #run({code, apply}: ScriptRunRequest): Promise<ScriptRunResult> {
        const compiled = await Promises.tryCatch(this.#environment.compile(code))
        if (compiled.status === "rejected") {return failure("typecheck", `Could not type-check: ${messageOf(compiled.error)}`)}
        const {diagnostics, output} = compiled.value
        if (diagnostics.length > 0) {
            const message = `${diagnostics.length} type error${diagnostics.length === 1 ? "" : "s"}, nothing was executed`
            return {...failure("typecheck", message, diagnostics[0].line), diagnostics: withExcerpts(diagnostics, code)}
        }
        if (output.isEmpty()) {return failure("typecheck", "TypeScript produced no output")}
        const {js, sourceMap} = output.unwrap()
        const watch = this.#environment.target().map(({boxGraph}) => new ScriptEdits.Watch(boxGraph)).unwrapOrUndefined()
        const executed = await Promises.tryCatch(this.#environment.execute(js, this.#environment.context()))
        watch?.terminate()
        if (executed.status === "rejected") {return failure("runtime", messageOf(executed.error))}
        const {logs, returned, error, invalid, edits} = executed.value
        if (isDefined(error)) {
            const {line, column} = error
            const position = isDefined(line) ? sourceMap.mapOr(map => map.originalPosition(line, column), undefined) : undefined
            if (!isDefined(position)) {return {...failure("runtime", error.message), logs}}
            const excerpt = ScriptExcerpt.of(code, position.line, position.column)
            return {...Initial, stage: "runtime", logs, error: {message: error.message, ...position, excerpt}}
        }
        const target = this.#environment.target()
        const changeSummary = isNull(edits) ? []
            : target.mapOr(({boxGraph}) => ScriptEdits.summarize(edits.updates, boxGraph), [])
        const done: ScriptRunResult = {...Initial, stage: "done", logs, returned: parseReturned(returned), changeSummary}
        const refuse = (message: string): ScriptRunResult => ({...done, stage: "apply", error: {message, line: undefined}})
        if (isDefined(invalid)) {return refuse(`The edited project is invalid, nothing was applied: ${invalid}`)}
        if (!apply || isNull(edits)) {return {...done, ok: true}}
        if (target.isEmpty()) {return refuse("No project is open, nothing was applied")}
        const applied = tryCatch(() => ScriptEdits.apply(target.unwrap(), edits.updates, edits.checksum, watch))
        if (applied.status === "failure") {return refuse(`Applying the edits failed: ${messageOf(applied.error)}`)}
        if (!applied.value) {
            const changed = watch?.changedSince(edits.checksum)
            const detail = isDefined(changed) && changed.length > 0 ? ` (changed meanwhile: ${ScriptEdits.describeChanges(changed)})` : ""
            return refuse(`The project changed while the script ran${detail}, nothing was applied. Run it again.`)
        }
        return {...done, ok: true, applied: true}
    }
}
