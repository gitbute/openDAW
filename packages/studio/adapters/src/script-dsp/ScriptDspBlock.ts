export type ScriptDspBlock = {
    readonly name: string
    readonly requires: ReadonlyArray<string>
    readonly exports: ReadonlyArray<string>
    readonly doc: string
    readonly source: string
}

export type ScriptDspExample = {
    readonly name: string
    readonly device: "Apparat" | "Werkstatt"
    readonly summary: string
    readonly code: string
}
