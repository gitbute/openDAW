import {int, isDefined, Option, Optional, tryCatch} from "@opendaw/lib-std"

const Base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

type Segment = { column: int, sourceLine: int, sourceColumn: int }

export type SourcePosition = { line: int, column: int }

const decodeVlq = (text: string): ReadonlyArray<int> => {
    const values: Array<int> = []
    let value = 0
    let shift = 0
    for (const char of text) {
        const digit = Base64.indexOf(char)
        value += (digit & 31) << shift
        if ((digit & 32) === 0) {
            values.push((value & 1) === 1 ? -(value >>> 1) : value >>> 1)
            value = 0
            shift = 0
        } else {
            shift += 5
        }
    }
    return values
}

const isMappings = (value: unknown): value is { mappings: string } =>
    typeof value === "object" && isDefined(value) && typeof Reflect.get(value, "mappings") === "string"

export class ScriptSourceMap {
    static parse(json: string): Option<ScriptSourceMap> {
        const parsed = tryCatch(() => JSON.parse(json))
        return parsed.status === "success" && isMappings(parsed.value)
            ? Option.wrap(new ScriptSourceMap(parsed.value.mappings)) : Option.None
    }

    readonly #lines: ReadonlyArray<ReadonlyArray<Segment>>

    constructor(mappings: string) {
        let sourceLine = 0
        let sourceColumn = 0
        this.#lines = mappings.split(";").map(line => {
            let column = 0
            return line.split(",").filter(segment => segment.length > 0).map(segment => {
                const [columnDelta, , lineDelta, columnOffset] = decodeVlq(segment)
                column += columnDelta
                sourceLine += lineDelta ?? 0
                sourceColumn += columnOffset ?? 0
                return {column, sourceLine, sourceColumn}
            })
        })
    }

    // 1-based generated position to 1-based source position
    originalPosition(line: int, column: int = 1): Optional<SourcePosition> {
        const segments = this.#lines.at(line - 1) ?? []
        const segment = segments.findLast(entry => entry.column <= column - 1) ?? segments.at(0)
        return isDefined(segment) ? {line: segment.sourceLine + 1, column: segment.sourceColumn + 1} : undefined
    }

    originalLine(line: int, column: int = 1): Optional<int> {return this.originalPosition(line, column)?.line}
}
