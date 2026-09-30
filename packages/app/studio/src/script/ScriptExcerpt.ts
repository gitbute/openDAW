import {clamp, int, isDefined, Optional} from "@opendaw/lib-std"

const MaxLineLength = 200
const WindowLength = 160
const NeighbourLength = 100

const clip = (text: string, start: int, length: int): string =>
    `${start > 0 ? "…" : ""}${text.slice(start, start + length)}${start + length < text.length ? "…" : ""}`

export namespace ScriptExcerpt {
    export const MaxTotal = 2400

    // The offending line (a window around the column when it is long) with a caret and its neighbours.
    export const of = (source: string, line: int, column: Optional<int>): string => {
        const lines = source.split(/\r\n|\r|\n/)
        const index = line - 1
        if (index < 0 || index >= lines.length) {return ""}
        const width = String(Math.min(lines.length, line + 1)).length
        const gutter = (label: string): string => `${label.padStart(width)} | `
        const text = lines[index].trimEnd()
        const at = clamp((column ?? 1) - 1, 0, text.length)
        const start = text.length > MaxLineLength ? clamp(at - WindowLength / 2, 0, text.length - WindowLength) : 0
        const shown = text.length > MaxLineLength ? clip(text, start, WindowLength) : text
        const neighbour = (number: int): ReadonlyArray<string> => {
            const neighbourText = lines[number - 1]?.trimEnd()
            return isDefined(neighbourText) && neighbourText.trim().length > 0
                ? [`${gutter(String(number))}${clip(neighbourText, 0, NeighbourLength)}`] : []
        }
        const caret = isDefined(column) ? [`${gutter("")}${" ".repeat(at - start + (start > 0 ? 1 : 0))}^`] : []
        return [...neighbour(line - 1), `${gutter(String(line))}${shown}`, ...caret, ...neighbour(line + 1)].join("\n")
    }
}
