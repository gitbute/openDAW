import type {editor, languages} from "monaco-editor"
import {Option} from "@opendaw/lib-std"
import type {Monaco} from "@/ui/pages/code-editor/monaco-setup"
import {ScriptDiagnostic, ScriptDiagnostics} from "./ScriptDiagnostics"
import {ScriptSourceMap} from "./ScriptSourceMap"

type OutputFile = languages.typescript.EmitOutput["outputFiles"][number]

export type CompiledScript ={ js: string, sourceMap: Option<ScriptSourceMap> }

export type ScriptCompilation = { diagnostics: ReadonlyArray<ScriptDiagnostic>, output: Option<CompiledScript> }

export namespace ScriptCompiler {
    export const compile = async (monaco: Monaco, model: editor.ITextModel): Promise<ScriptCompilation> => {
        const worker = await monaco.languages.typescript.getTypeScriptWorker()
        const client = await worker(model.uri)
        const fileName = model.uri.toString()
        const [semantic, syntactic] = await Promise.all([
            client.getSemanticDiagnostics(fileName), client.getSyntacticDiagnostics(fileName)])
        const diagnostics = ScriptDiagnostics.convert([...semantic, ...syntactic], model.getValue())
        if (diagnostics.length > 0) {return {diagnostics, output: Option.None}}
        const {outputFiles} = await client.getEmitOutput(fileName)
        return {diagnostics, output: toOutput(outputFiles)}
    }

    export const toOutput = (files: ReadonlyArray<Pick<OutputFile, "name" | "text">>): Option<CompiledScript> => {
        const map = Option.wrap(files.find(file => file.name.endsWith(".js.map")))
        return Option.wrap(files.find(file => file.name.endsWith(".js"))).map(({text}) => ({
            js: text.replace(/^["']use strict["'];?/, "").replace(/^\/\/# sourceMappingURL=.*$/m, ""),
            sourceMap: map.flatMap(({text}) => ScriptSourceMap.parse(text))
        }))
    }
}
