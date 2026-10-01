import {describe, expect, it} from "vitest"
import {existsSync, readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import ts from "typescript"
import {BoxEditing} from "@opendaw/lib-box"
import {Option, panic, UUID} from "@opendaw/lib-std"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {ProjectMetaBox, SelectionBox} from "@opendaw/studio-boxes"
import {AgentScriptExecutor, ScriptHostProtocol} from "@opendaw/studio-scripting"
import {ScriptCompilation, ScriptCompiler} from "@/script/ScriptCompiler"
import {ScriptDiagnostics} from "@/script/ScriptDiagnostics"
import {ScriptEdits} from "@/script/ScriptEdits"
import {ScriptExcerpt} from "@/script/ScriptExcerpt"
import {ScriptSourceMap} from "@/script/ScriptSourceMap"
import {AgentScriptEnvironment, AgentScriptRunner} from "./AgentScriptRunner"
import {createRunScriptTool} from "./RunScriptTool"

// Monaco's TS worker cannot run under vitest. The runner takes its compiler as a seam, so these tests compile with
// the typescript package: transpile-only for runtime cases, a real program (library.d.ts, plus the generated API
// declarations when present) for type errors. Execution runs the real worker-side executor in-process.

const scriptingSource = fileURLToPath(new URL("../../../../../studio/scripting/src/", import.meta.url))
const library = readFileSync(`${scriptingSource}library.d.ts`, "utf-8")
const declarationsPath = `${scriptingSource}api.declaration.d.ts`
const declarations = existsSync(declarationsPath) ? readFileSync(declarationsPath, "utf-8") : null

const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10,
    noLib: true, strict: true, sourceMap: true, moduleDetection: ts.ModuleDetectionKind.Force
}

const transpile = async (code: string): Promise<ScriptCompilation> => {
    const {outputText, sourceMapText} = ts.transpileModule(code, {compilerOptions, fileName: "main.ts"})
    return {diagnostics: [], output: ScriptCompiler.toOutput([{name: "main.js", text: outputText}, {name: "main.js.map", text: sourceMapText ?? ""}])}
}

const typecheck = async (code: string): Promise<ScriptCompilation> => {
    const files = new Map<string, string>([["/main.ts", code], ["/library.d.ts", library]])
    if (declarations !== null) {files.set("/opendaw.d.ts", declarations)}
    const outputs: Array<{ name: string, text: string }> = []
    const host: ts.CompilerHost = {
        getSourceFile: (fileName, version) => {
            const text = files.get(fileName)
            return text === undefined ? undefined : ts.createSourceFile(fileName, text, version)
        },
        writeFile: (name, text) => outputs.push({name, text}),
        getDefaultLibFileName: () => "/library.d.ts",
        getCurrentDirectory: () => "/",
        getCanonicalFileName: fileName => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
        fileExists: fileName => files.has(fileName),
        readFile: fileName => files.get(fileName)
    }
    const program = ts.createProgram(Array.from(files.keys()), compilerOptions, host)
    const source = program.getSourceFile("/main.ts")
    const raw = [...program.getSemanticDiagnostics(source), ...program.getSyntacticDiagnostics(source)]
    const diagnostics = ScriptDiagnostics.convert(raw.map(({category, code, start, length, messageText}) =>
        ({category, code, start, length, file: undefined, messageText})), code)
    if (diagnostics.length > 0) {return {diagnostics, output: Option.None}}
    program.emit(source)
    return {diagnostics, output: ScriptCompiler.toOutput(outputs)}
}

const createLive = () => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false})
    const {boxGraph, mandatoryBoxes: {timelineBox}} = skeleton
    const editing = new BoxEditing(boxGraph)
    const host: ScriptHostProtocol = {
        openProject: () => panic("unexpected openProject"),
        applyUpdates: () => panic("unexpected applyUpdates"),
        hasProject: async () => true,
        fetchProject: async () => ({buffer: ProjectSkeleton.encode(boxGraph) as ArrayBuffer, name: "Live"}),
        showInfo: async () => {},
        addSample: () => panic("unexpected addSample"),
        listSamples: async () => [],
        renderMixdown: () => panic("unexpected renderMixdown"),
        saveFile: () => panic("unexpected saveFile")
    }
    const executor = new AgentScriptExecutor(host)
    const calls = {executed: 0}
    const environment = (overrides: Partial<AgentScriptEnvironment> = {}): AgentScriptEnvironment => ({
        compile: transpile,
        execute: (js, context) => {
            calls.executed++
            return executor.executeAgentScript(js, context)
        },
        target: () => Option.wrap({boxGraph, editing, loadScriptDevices: () => {}}),
        context: () => ({sampleRate: 48000, baseFrequency: 440}),
        discardUnusedSamples: async () => {},
        terminate: () => {},
        ...overrides
    })
    return {boxGraph, editing, executor, calls, environment, bpm: () => timelineBox.bpm.getValue(), timelineBox, skeleton}
}

// Selects the master unit in the live project, the way clicking in the studio does while a script runs
const selectMaster = (live: ReturnType<typeof createLive>): SelectionBox => {
    const {mandatoryBoxes: {userInterfaceBoxes: [user], primaryAudioUnitBox}} = live.skeleton
    return live.editing.modify(() => SelectionBox.create(live.boxGraph, UUID.generate(), box => {
        box.selection.refer(user.selection)
        box.selectable.refer(primaryAudioUnitBox)
    })).unwrap()
}

describe("AgentScriptRunner", () => {
    it("reports type errors with their line and runs nothing", async () => {
        const live = createLive()
        const runner = new AgentScriptRunner(live.environment({compile: typecheck}))
        const result = await runner.run({code: "const bpm: number = 120\nconst label: string = bpm\nreturn label", apply: true})
        expect(result.ok).toBe(false)
        expect(result.stage).toBe("typecheck")
        expect(result.diagnostics).toHaveLength(1)
        expect(result.diagnostics[0]).toMatchObject({line: 2, column: 7})
        expect(result.diagnostics[0].message).toContain("not assignable")
        expect(result.error?.line).toBe(2)
        expect(live.calls.executed).toBe(0)
        expect(result.applied).toBe(false)
        expect(live.editing.canUndo()).toBe(false)
    })

    it("accepts a top-level return (TS1108 is filtered)", async () => {
        const live = createLive()
        const result = await new AgentScriptRunner(live.environment({compile: typecheck}))
            .run({code: "const value: number = 1\nreturn value * 2", apply: false})
        expect(result.diagnostics).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.returned).toBe(2)
    })

    it.skipIf(declarations === null)("type-checks against the scripting API declarations", async () => {
        const live = createLive()
        const result = await new AgentScriptRunner(live.environment({compile: typecheck})).run({
            code: "const project = await openDAW.getProject()\nproject.bpm = 99\nproject.bpm = \"fast\"", apply: true
        })
        expect(result.stage).toBe("typecheck")
        expect(result.diagnostics.map(({line}) => line)).toEqual([3])
        expect(live.calls.executed).toBe(0)
    })

    it("maps a runtime throw to the TypeScript line and applies nothing", async () => {
        const live = createLive()
        const before = live.bpm()
        const result = await new AgentScriptRunner(live.environment()).run({
            code: [
                "type Tempo = { bpm: number }",
                "interface Unused { value: string }",
                "",
                "const project = await openDAW.getProject()",
                "const tempo: Tempo = {bpm: 99}",
                "project.bpm = tempo.bpm",
                "console.log('before throw')",
                "",
                "throw new Error('boom')"
            ].join("\n"), apply: true
        })
        expect(result.ok).toBe(false)
        expect(result.stage).toBe("runtime")
        expect(result.error).toMatchObject({message: "Error: boom", line: 9})
        expect(result.error?.excerpt).toContain("9 | throw new Error('boom')")
        expect(result.error?.excerpt).toContain("   ^")
        expect(result.logs).toEqual(["before throw"])
        expect(result.applied).toBe(false)
        expect(live.bpm()).toBe(before)
        expect(live.editing.canUndo()).toBe(false)
    })

    it("applies a completed script as exactly one undo step", async () => {
        const live = createLive()
        const before = live.bpm()
        const result = await new AgentScriptRunner(live.environment()).run({
            code: "const project = await openDAW.getProject()\nproject.bpm = 99\nproject.addMarker({label: 'Intro'})\nconsole.log('done')\nreturn project.bpm",
            apply: true
        })
        expect(result).toMatchObject({ok: true, stage: "done", applied: true, returned: 99, logs: ["done"], error: null})
        expect(result.changeSummary).toEqual(["created 1 box: 1x MarkerBox", "modified 1 field on 1 box: 1x TimelineBox"])
        expect(live.bpm()).toBe(99)
        expect(live.editing.undo()).toBe(true)
        expect(live.bpm()).toBe(before)
        expect(live.boxGraph.boxes().some(box => box.name === "MarkerBox")).toBe(false)
        expect(live.editing.canUndo()).toBe(false)
    })

    it("keeps openInStudio() inside the script to the same single undo step", async () => {
        const live = createLive()
        const before = live.bpm()
        const result = await new AgentScriptRunner(live.environment()).run({
            code: "const project = await openDAW.getProject()\nproject.bpm = 99\nproject.openInStudio()\nproject.bpm = 101",
            apply: true
        })
        expect(result.applied).toBe(true)
        expect(live.bpm()).toBe(101)
        expect(live.editing.undo()).toBe(true)
        expect(live.bpm()).toBe(before)
        expect(live.editing.canUndo()).toBe(false)
    })

    it("dry-runs without touching the live project", async () => {
        const live = createLive()
        const before = live.bpm()
        const result = await new AgentScriptRunner(live.environment()).run({
            code: "const project = await openDAW.getProject()\nproject.bpm = 99\nreturn {bpm: project.bpm}", apply: false
        })
        expect(result).toMatchObject({ok: true, stage: "done", applied: false, returned: {bpm: 99}})
        expect(result.changeSummary).toEqual(["modified 1 field on 1 box: 1x TimelineBox"])
        expect(live.bpm()).toBe(before)
        expect(live.editing.canUndo()).toBe(false)
    })

    it("refuses to apply when the project changed while the script ran", async () => {
        const live = createLive()
        const result = await new AgentScriptRunner(live.environment({
            execute: async (js, context) => {
                const outcome = await live.executor.executeAgentScript(js, context)
                live.editing.modify(() => live.timelineBox.bpm.setValue(77))
                return outcome
            }
        })).run({code: "const project = await openDAW.getProject()\nproject.bpm = 99", apply: true})
        expect(result).toMatchObject({ok: false, stage: "apply", applied: false})
        expect(result.error?.message).toContain("changed while the script ran")
        expect(live.bpm()).toBe(77)
        expect(live.editing.undo()).toBe(true)
        expect(live.editing.canUndo()).toBe(false)
    })

    it("attaches a caret excerpt to type errors in a one-line script", async () => {
        const live = createLive()
        const code = "const bpm: number = 120; const label: string = bpm; return label"
        const result = await new AgentScriptRunner(live.environment({compile: typecheck})).run({code, apply: false})
        const [diagnostic] = result.diagnostics
        expect(diagnostic).toMatchObject({line: 1, column: 32})
        const [source, caret] = (diagnostic.excerpt ?? "").split("\n")
        expect(source).toBe(`1 | ${code}`)
        expect(caret.indexOf("^") - "1 | ".length).toBe(31)
    })

    it("shows a window around the column of a long line", async () => {
        const live = createLive()
        const padding = Array.from({length: 30}, (_, index) => `const value${index}: number = ${index};`).join(" ")
        const code = `${padding} const label: string = value3; ${padding.replace(/value/g, "other")}`
        const result = await new AgentScriptRunner(live.environment({compile: typecheck})).run({code, apply: false})
        const [diagnostic] = result.diagnostics
        const [source, caret] = (diagnostic.excerpt ?? "").split("\n")
        expect(code.length).toBeGreaterThan(1000)
        expect(source.length).toBeLessThan(180)
        expect(source.startsWith("1 | …")).toBe(true)
        expect(source.endsWith("…")).toBe(true)
        expect(source.slice(caret.indexOf("^"))).toMatch(/^label: string = value3/)
    })

    it("maps a runtime throw in a one-line script to its column", async () => {
        const live = createLive()
        const code = "const project = await openDAW.getProject(); project.bpm = 99; throw new Error('boom')"
        const result = await new AgentScriptRunner(live.environment()).run({code, apply: true})
        expect(result.error).toMatchObject({message: "Error: boom", line: 1})
        const [source, caret] = (result.error?.excerpt ?? "").split("\n")
        expect(source).toBe(`1 | ${code}`)
        expect(source.slice(caret.indexOf("^"))).toMatch(/^(throw )?new Error/)
    })

    it("caps the excerpts of many diagnostics", async () => {
        const live = createLive()
        const code = Array.from({length: 60}, (_, index) => `const value${index}: string = ${index}`).join("\n")
        const result = await new AgentScriptRunner(live.environment({compile: typecheck})).run({code, apply: false})
        expect(result.diagnostics).toHaveLength(60)
        const total = result.diagnostics.reduce((sum, {excerpt}) => sum + (excerpt?.length ?? 0), 0)
        expect(total).toBeLessThan(2600)
        expect(result.diagnostics.at(-1)?.excerpt).toBeUndefined()
    })

    it("applies although the user selected something or saved while the script ran", async () => {
        const live = createLive()
        const {mandatoryBoxes: {rootBox}} = live.skeleton
        const meta = live.editing.modify(() => {
            const box = ProjectMetaBox.create(live.boxGraph, UUID.generate())
            rootBox.projectMeta.refer(box)
            return box
        }).unwrap()
        const result = await new AgentScriptRunner(live.environment({
            execute: async (js, context) => {
                const outcome = await live.executor.executeAgentScript(js, context)
                selectMaster(live)
                live.editing.modify(() => meta.modified.setValue(new Date().toISOString()), false)
                return outcome
            }
        })).run({code: "const project = await openDAW.getProject()\nproject.bpm = 99", apply: true})
        expect(result).toMatchObject({ok: true, applied: true})
        expect(live.bpm()).toBe(99)
        expect(live.boxGraph.boxes().some(box => box.name === "SelectionBox")).toBe(true)
    })

    it("still refuses when a volatile change happened but the script read a state that never existed", async () => {
        const live = createLive()
        const result = await new AgentScriptRunner(live.environment({
            execute: async (js, context) => {
                const outcome = await live.executor.executeAgentScript(js, context)
                selectMaster(live)
                return {...outcome, edits: outcome.edits === null ? null : {...outcome.edits, checksum: new Int8Array(32)}}
            }
        })).run({code: "const project = await openDAW.getProject()\nproject.bpm = 99", apply: true})
        expect(result).toMatchObject({ok: false, stage: "apply", applied: false})
    })

    it("names what changed when refusing", async () => {
        const live = createLive()
        const result = await new AgentScriptRunner(live.environment({
            execute: async (js, context) => {
                const outcome = await live.executor.executeAgentScript(js, context)
                selectMaster(live)
                live.editing.modify(() => live.timelineBox.bpm.setValue(77))
                return outcome
            }
        })).run({code: "const project = await openDAW.getProject()\nproject.bpm = 99", apply: true})
        expect(result.error?.message).toContain("changed meanwhile: 1x SelectionBox, 1x TimelineBox")
        expect(live.bpm()).toBe(77)
    })

    it("reports a failing worker as a runtime error", async () => {
        const live = createLive()
        const result = await new AgentScriptRunner(live.environment({
            execute: () => Promise.reject(new Error("Script did not finish within 1s and was stopped"))
        })).run({code: "while (true) {}", apply: true})
        expect(result).toMatchObject({ok: false, stage: "runtime", error: {message: "Script did not finish within 1s and was stopped"}})
    })

    it("discards unused samples after every run, once the edits are applied", async () => {
        const live = createLive()
        const bpmAtDiscard: Array<number> = []
        const runner = new AgentScriptRunner(live.environment({
            compile: typecheck,
            discardUnusedSamples: async () => {bpmAtDiscard.push(live.bpm())}
        }))
        await runner.run({code: "const bpm: number = 'fast'", apply: true})
        await runner.run({code: "throw new Error('boom')", apply: true})
        await runner.run({code: "const project = await openDAW.getProject()\nproject.bpm = 99", apply: false})
        await runner.run({code: "const project = await openDAW.getProject()\nproject.bpm = 101", apply: true})
        expect(bpmAtDiscard).toEqual([120, 120, 120, 101])
    })

    it("keeps the run result when discarding fails", async () => {
        const live = createLive()
        const result = await new AgentScriptRunner(live.environment({
            discardUnusedSamples: () => Promise.reject(new Error("storage"))
        })).run({code: "return 1", apply: false})
        expect(result).toMatchObject({ok: true, returned: 1})
    })

    it("serialises concurrent runs", async () => {
        const live = createLive()
        const events: Array<string> = []
        const runner = new AgentScriptRunner(live.environment({
            execute: async (js, context) => {
                events.push("start")
                const outcome = await live.executor.executeAgentScript(js, context)
                events.push("end")
                return outcome
            }
        }))
        const code = "const project = await openDAW.getProject()\nproject.bpm = project.bpm + 1"
        const before = live.bpm()
        const results = await Promise.all([runner.run({code, apply: true}), runner.run({code, apply: true})])
        expect(results.map(({applied}) => applied)).toEqual([true, true])
        expect(events).toEqual(["start", "end", "start", "end"])
        expect(live.bpm()).toBe(before + 2)
    })
})

describe("run_script tool", () => {
    it("declares a strict schema", () => {
        const tool = createRunScriptTool(new AgentScriptRunner(createLive().environment()))
        expect(tool.name).toBe("run_script")
        expect(tool.description.length).toBeLessThan(900)
        expect(tool.inputSchema).toMatchObject({type: "object", required: ["code", "apply"], additionalProperties: false})
    })

    it("rejects malformed arguments", async () => {
        const tool = createRunScriptTool(new AgentScriptRunner(createLive().environment()))
        expect((await tool.execute({code: 1, apply: true})).ok).toBe(false)
    })

    it("returns the run result as JSON", async () => {
        const tool = createRunScriptTool(new AgentScriptRunner(createLive().environment()))
        const result = await tool.execute({code: "throw new Error('nope')", apply: false})
        expect(result.ok).toBe(false)
        const [content] = result.content
        const payload = content.type === "inputText" ? JSON.parse(content.text) : null
        expect(payload).toMatchObject({ok: false, stage: "runtime", error: {message: "Error: nope", line: 1}, applied: false})
    })
})

describe("script helpers", () => {
    it("decodes TypeScript source maps", () => {
        const {outputText, sourceMapText} = ts.transpileModule("type A = number\n\nconst a: A = 1\n\n\nthrow a",
            {compilerOptions, fileName: "main.ts"})
        const map = ScriptSourceMap.parse(sourceMapText ?? "").unwrap()
        const throwLine = outputText.split("\n").findIndex(line => line.startsWith("throw")) + 1
        expect(map.originalLine(throwLine, 1)).toBe(6)
        expect(ScriptSourceMap.parse("not json").isEmpty()).toBe(true)
    })

    it("nets out boxes created and deleted by the same script", () => {
        const {boxGraph} = ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false})
        const uuid = UUID.generate()
        expect(ScriptEdits.summarize([
            {type: "new", name: "MarkerBox", uuid, buffer: new ArrayBuffer(0)},
            {type: "delete", uuid}
        ], boxGraph)).toEqual([])
    })

    it("rejects volatile changes that collide with the script's edits", () => {
        const live = createLive()
        const {mandatoryBoxes: {primaryAudioUnitBox}} = live.skeleton
        const origin = live.boxGraph.checksum()
        const watch = new ScriptEdits.Watch(live.boxGraph)
        const selection = selectMaster(live)
        watch.terminate()
        expect(watch.changedSince(origin)?.map(({name}) => name)).toEqual(["SelectionBox"])
        expect(watch.accepts(origin, [])).toBe(true)
        expect(watch.accepts(origin, [{type: "delete", uuid: primaryAudioUnitBox.address.uuid}])).toBe(false)
        expect(watch.accepts(origin, [{type: "delete", uuid: selection.address.uuid}])).toBe(false)
        expect(watch.accepts(new Int8Array(32), [])).toBe(false)
    })

    it("formats excerpts with neighbouring lines", () => {
        expect(ScriptExcerpt.of("const a = 1\nconst b: string = a\n\nreturn b", 2, 19))
            .toBe("1 | const a = 1\n2 | const b: string = a\n  |                   ^")
        expect(ScriptExcerpt.of(Array.from({length: 12}, (_, index) => `line${index + 1}`).join("\n"), 9, 1))
            .toBe(" 8 | line8\n 9 | line9\n   | ^\n10 | line10")
        expect(ScriptExcerpt.of("x", 5, 1)).toBe("")
        expect(ScriptExcerpt.of("a\nb", 1, undefined)).toBe("1 | a\n2 | b")
    })

    it("maps generated positions to source columns", () => {
        const {outputText, sourceMapText} = ts.transpileModule("type A = number; const a: A = 1; throw a",
            {compilerOptions, fileName: "main.ts"})
        const map = ScriptSourceMap.parse(sourceMapText ?? "").unwrap()
        const line = outputText.split("\n").findIndex(text => text.includes("throw")) + 1
        const column = outputText.split("\n")[line - 1].indexOf("throw") + 1
        expect(map.originalPosition(line, column)).toEqual({line: 1, column: 34})
    })

    it("locates diagnostics by character offset", () => {
        expect(ScriptDiagnostics.locate("ab\ncd\r\nef", 8)).toEqual({line: 3, column: 2})
        expect(ScriptDiagnostics.flatten({messageText: "outer", category: 1, code: 1, next: [{messageText: "inner", category: 1, code: 2}]}))
            .toBe("outer\n  inner")
    })
})
