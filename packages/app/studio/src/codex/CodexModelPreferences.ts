import {isDefined, Nullable, Option, tryCatch} from "@opendaw/lib-std"
import {CodexJson} from "@opendaw/studio-codex"
import type {JsonValue} from "@opendaw/studio-codex"

export type CodexModelChoice = {readonly model: string, readonly effort: Nullable<string>}

export type CodexModelPreferences = {
    load(): Option<CodexModelChoice>
    save(choice: CodexModelChoice): void
}

export namespace CodexModelPreferences {
    export const Key = "codex-agent-model"

    export const decode = (text: Nullable<string>): Option<CodexModelChoice> => {
        if (!isDefined(text)) {return Option.None}
        const parsed = tryCatch((): JsonValue => JSON.parse(text))
        if (parsed.status === "failure" || !CodexJson.isJsonObject(parsed.value)) {return Option.None}
        const {model, effort} = parsed.value
        if (typeof model !== "string" || model.length === 0) {return Option.None}
        return Option.wrap({model, effort: typeof effort === "string" ? effort : null})
    }

    export const local: CodexModelPreferences = {
        load: () => {
            const stored = tryCatch(() => localStorage.getItem(Key))
            return stored.status === "success" ? decode(stored.value) : Option.None
        },
        save: choice => {tryCatch(() => localStorage.setItem(Key, JSON.stringify(choice)))}
    }

    export const memory = (initial: Option<CodexModelChoice> = Option.None): CodexModelPreferences => {
        let current = initial
        return {load: () => current, save: choice => {current = Option.wrap(choice)}}
    }
}
