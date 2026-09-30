import type {languages} from "monaco-editor"
import {int} from "@opendaw/lib-std"
import {TopLevelReturn} from "@/ui/pages/code-editor/TopLevelReturn"

type Diagnostic = languages.typescript.Diagnostic
type MessageText = Diagnostic["messageText"]

export type ScriptDiagnostic = { line: int, column: int, message: string }

export namespace ScriptDiagnostics {
    export const flatten = (text: MessageText, depth: int = 0): string => typeof text === "string" ? text
        : [`${"  ".repeat(depth)}${text.messageText}`, ...(text.next ?? []).map(next => flatten(next, depth + 1))].join("\n")

    // 1-based line and column of a character offset
    export const locate = (source: string, offset: int): { line: int, column: int } => {
        const before = source.slice(0, Math.max(0, offset)).split(/\r\n|\r|\n/)
        return {line: before.length, column: (before.at(-1)?.length ?? 0) + 1}
    }

    export const convert = (diagnostics: ReadonlyArray<Diagnostic>, source: string): ReadonlyArray<ScriptDiagnostic> =>
        diagnostics
            .filter(diagnostic => diagnostic.code !== TopLevelReturn)
            .map(diagnostic => ({...locate(source, diagnostic.start ?? 0), message: flatten(diagnostic.messageText)}))
            .sort((first, second) => first.line - second.line || first.column - second.column)

    export const format = ({line, column, message}: ScriptDiagnostic): string => `${line}:${column} ${message}`
}
