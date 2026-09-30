import {int, Terminable} from "@opendaw/lib-std"
import {ScriptValues} from "./ScriptValues"

const Levels = ["log", "info", "warn", "error"] as const

type Level = typeof Levels[number]

export class ScriptLogs {
    readonly #lines: Array<string>
    readonly #maxLines: int
    readonly #maxLineLength: int
    #dropped: int

    constructor(maxLines: int = 200, maxLineLength: int = 1000) {
        this.#lines = []
        this.#maxLines = maxLines
        this.#maxLineLength = maxLineLength
        this.#dropped = 0
    }

    push(line: string): void {
        if (this.#lines.length >= this.#maxLines) {
            this.#dropped++
            return
        }
        this.#lines.push(line.length > this.#maxLineLength ? `${line.slice(0, this.#maxLineLength)}...` : line)
    }

    capture(target: Console): Terminable {
        const originals = Levels.map(level => [level, target[level]] as const)
        Levels.forEach((level: Level) => target[level] = (...args: Array<unknown>) =>
            this.push(`${level === "log" ? "" : `[${level}] `}${args.map(ScriptValues.format).join(" ")}`))
        return Terminable.create(() => originals.forEach(([level, original]) => target[level] = original))
    }

    lines(): ReadonlyArray<string> {
        return this.#dropped === 0 ? this.#lines.slice() : [...this.#lines, `[${this.#dropped} more log lines dropped]`]
    }
}
