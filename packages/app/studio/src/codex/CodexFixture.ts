import {isDefined} from "@opendaw/lib-std"
import type {CodexModel, CodexTurnItem, JsonObject, JsonValue} from "@opendaw/studio-codex"
import type {CodexAgentController, CodexConversationEntry} from "./CodexAgentController"
import {CodexActivity} from "./CodexActivity"

// Dev-only sample conversation, loaded with ?codex-fixture[=signedout|login|offline]
export namespace CodexFixture {
    const svgUrl = (hue: number, seed: number): string => {
        const columns = Array.from({length: 64}, (_value, index) => {
            const height = 30 + Math.abs(Math.sin(index * 0.37 + seed) * 120 + Math.sin(index * 1.9) * 40)
            return `<rect x='${index * 10}' y='${240 - height}' width='9' height='${height}' fill='hsl(${hue + index},80%,${35 + (height / 6)}%)'/>`
        }).join("")
        return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='640' height='240'><rect width='640' height='240' fill='#0c0d16'/>${columns}</svg>`)}`
    }

    type FixtureItem = JsonObject & {readonly type: string}

    const activity = (id: string, item: FixtureItem, status: "running" | "success" | "failed" = "success",
                      error?: string): CodexConversationEntry => {
        const full: CodexTurnItem = {...item, id}
        return {
            type: "activity", itemId: id, turnId: "turn-1", kind: full.type, status, item: full,
            label: CodexActivity.label(full, status), ...(isDefined(error) ? {error} : {})
        }
    }

    const fromSubagent = (agent: string, entry: CodexConversationEntry): CodexConversationEntry =>
        entry.type === "activity" ? {...entry, label: `[${agent}] ${entry.label}`} : entry

    const tool = (tool: string, args: JsonValue, text: string, images: ReadonlyArray<string> = [],
                  success = true): FixtureItem => ({
        type: "dynamicToolCall", namespace: "daw", tool, arguments: args, status: success ? "completed" : "failed",
        success, contentItems: [{type: "inputText", text}, ...images.map(imageUrl => ({type: "inputImage", imageUrl}))]
    })

    const typeError = JSON.stringify({
        ok: false, stage: "typecheck", applied: false, logs: [], returned: null, changeSummary: [],
        diagnostics: [{line: 12, column: 9, message: "Property 'addNote' does not exist on type 'NoteRegion'. Did you mean 'addNotes'?"}],
        error: {message: "1 type error, nothing was executed", line: 12}
    })

    const applied = JSON.stringify({
        ok: true, stage: "done", applied: true, diagnostics: [], error: null, logs: ["created 3 units"], returned: {bars: 8},
        changeSummary: ["+ AudioUnit 'Drums' (Playfield)", "+ AudioUnit 'Keys' (Vaporisateur)", "+ AudioUnit 'Bass' (Tubular)", "+ 6 note regions"]
    })

    const script = [
        "const project = await openDAW.getProject()",
        "project.bpm = 84",
        "const drums = project.addInstrumentUnit(\"Playfield\")",
        "const keys = project.addInstrumentUnit(\"Vaporisateur\")",
        "await openDAW.applyPreset(keys, \"stock:Vaporisateur/Warm Rhodes\")",
        "const region = keys.tracks[0].addNoteRegion({position: 0, duration: 8 * 3840})",
        "region.addNotes([{position: 0, duration: 1920, pitch: 60, velocity: 0.7}])",
        "return {bars: 8}"
    ].join("\n")

    const answer = [
        "Here's an **8-bar lo-fi beat** at 84 BPM:",
        "",
        "- **Drums** — Playfield kit with swung hats (58% swing) and a lazy snare",
        "- **Keys** — Vaporisateur *Warm Rhodes*, Cmaj9 → Am7 → Fmaj7 → G6",
        "- **Bass** — Tubular sub following the roots",
        "",
        "The low end sits around -14 LUFS short-term. To tweak the chord voicing yourself:",
        "",
        "```ts",
        "const keys = project.audioUnits.find(unit => unit.label === \"Keys\")",
        "keys.tracks[0].regions[0].notes.forEach(note => note.velocity *= 0.85) // softer, more dusty feel for the whole progression",
        "```",
        "",
        "Want me to add vinyl crackle or a tape-stop at bar 8?"
    ].join("\n")

    export const entries = (): ReadonlyArray<CodexConversationEntry> => [
        {type: "user", id: "user-1", text: "Make an 8-bar lo-fi hip hop beat at 84 bpm with dusty drums, a mellow Rhodes and a sub bass."},
        {type: "reasoning", itemId: "r-1", turnId: "turn-1", summaryIndex: 0, complete: true,
            text: "**Inspecting the project**\n\nChecking tempo, signature and existing units before adding anything."},
        activity("t-1", tool("inspect_project", {}, JSON.stringify({bpm: 120, signature: "4/4", units: []}))),
        activity("w-1", {type: "webSearch", query: "lo-fi hip hop drum swing", action: {type: "search", query: "lo-fi hip hop drum swing"}}),
        activity("t-2", tool("device_reference", {device: "Vaporisateur"}, "# Vaporisateur\nSubtractive synth…")),
        activity("t-3", tool("browse", {kind: "presets", query: "rhodes"}, JSON.stringify({items: [{id: "stock:Vaporisateur/Warm Rhodes"}]}))),
        {type: "reasoning", itemId: "r-2", turnId: "turn-1", summaryIndex: 0, complete: true,
            text: "**Writing the arrangement script**\n\nCreating three units and filling 8 bars of notes in one undo step."},
        activity("t-4", tool("run_script", {code: script, apply: true}, typeError, [], false), "failed", typeError),
        activity("t-5", tool("run_script", {code: script, apply: true}, applied)),
        activity("t-6", tool("listen", {bars: {from: 1, to: 8}, views: ["spectrogram", "loudness"]},
            JSON.stringify({lufs: -14.2, peak: -1.1}), [svgUrl(260, 0), svgUrl(150, 2)])),
        activity("t-7", tool("inspect_notes", {unit: "Keys", bars: {from: 1, to: 4}, image: true}, "bar 1 | C4 x---…", [svgUrl(20, 5)])),
        {type: "assistant", itemId: "a-1", turnId: "turn-1", complete: true, text: answer},
        {type: "user", id: "user-2", text: "Make the bass punchier and add a tape stop at the end."},
        {type: "reasoning", itemId: "r-3", turnId: "turn-2", summaryIndex: 0, complete: false,
            text: "**Tightening the bass envelope**\n\nShortening the decay and adding drive."},
        activity("c-1", {type: "collabAgentToolCall", tool: "spawnAgent", status: "completed", senderThreadId: "thread-1",
            receiverThreadIds: [], prompt: "Research punchy sub bass envelopes", model: null, reasoningEffort: null,
            agentsStates: {}}),
        fromSubagent("bass_design", activity("t-10", tool("device_reference", {device: "Apparat"}, "# Apparat\nWavetable synth…"))),
        activity("c-2", {type: "collabAgentToolCall", tool: "wait", status: "completed", senderThreadId: "thread-1",
            receiverThreadIds: [], prompt: null, model: null, reasoningEffort: null,
            agentsStates: {"child-1": {status: "completed", message: "Use a 5 ms attack and 120 ms decay with light drive."}}}),
        activity("t-8", tool("api_reference", {topic: "Tubular"}, "interface Tubular …")),
        activity("t-9", {type: "dynamicToolCall", namespace: "daw", tool: "run_script", arguments: {code: script, apply: true},
            status: "inProgress", contentItems: null, success: null}, "running")
    ]

    const models: ReadonlyArray<CodexModel> = [
        {id: "gpt-5.1-codex", model: "gpt-5.1-codex", displayName: "GPT-5.1 Codex", description: "", hidden: false,
            supportedReasoningEfforts: ["low", "medium", "high"].map(reasoningEffort => ({reasoningEffort, description: ""})),
            defaultReasoningEffort: "medium", isDefault: true, inputModalities: ["text", "image"]},
        {id: "gpt-5.1-codex-mini", model: "gpt-5.1-codex-mini", displayName: "GPT-5.1 Codex Mini", description: "",
            hidden: false, supportedReasoningEfforts: ["low", "medium"].map(reasoningEffort => ({reasoningEffort, description: ""})),
            defaultReasoningEffort: "medium", isDefault: false, inputModalities: ["text"]}
    ]

    export const apply = (controller: CodexAgentController, mode: string): void => {
        if (mode === "offline") {return}
        controller.connectionState.setValue("connected")
        controller.appServerUsable.setValue(true)
        if (mode === "signedout" || mode === "login") {
            controller.loginPending.setValue(mode === "login")
            return
        }
        controller.account.setValue({
            account: {type: "chatgpt", email: "producer@example.com", planType: "plus"}, exists: true,
            accountType: "chatgpt", authMode: "chatgpt", email: "producer@example.com", planType: "plus",
            requiresOpenaiAuth: true
        })
        controller.models.setValue(models)
        if (mode === "empty") {return}
        controller.conversation.setValue(entries())
        controller.turnRunning.setValue(true)
        controller.error.wrap({kind: "turn", message: "Codex turn failed: rate limit reached, retrying in 20s"})
    }
}
