import {int, TimeSpan} from "@opendaw/lib-std"
import {Promises, Wait} from "@opendaw/lib-runtime"
import agentScriptWorkerUrl from "@opendaw/studio-scripting/AgentScriptWorker.js?worker&url"
import type {StudioService} from "@/service/StudioService"
import {dynamicImportWithRetry} from "@/ui/components/dynamicImportWithRetry"
import {ScriptCompiler} from "@/script/ScriptCompiler"
import {StudioScriptHost} from "@/script/StudioScriptHost"
import {AgentScriptRunner} from "./AgentScriptRunner"
import {AgentScriptWorkerClient} from "./AgentScriptWorkerClient"

const loadMonacoSetup = dynamicImportWithRetry(() => import("@/ui/pages/code-editor/monaco-setup"))

const ModelUri = "file:///agent/run_script.ts"

type Monaco = Awaited<ReturnType<typeof loadMonacoSetup>>["monaco"]

// Monaco registers its TypeScript worker lazily after the first typescript model exists.
const awaitTypeScript = async (monaco: Monaco): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt++) {
        const worker = await Promises.tryCatch(monaco.languages.typescript.getTypeScriptWorker())
        if (worker.status === "resolved") {return}
        await Wait.timeSpan(TimeSpan.millis(100))
    }
}

export namespace AgentScriptStudio {
    // Type-checks on a hidden Monaco model and runs in a dedicated worker against the open project.
    export const createRunner = (service: StudioService, timeoutMillis: int = 120_000): AgentScriptRunner => {
        const host = StudioScriptHost.createHeadless(service)
        const client = new AgentScriptWorkerClient(host, agentScriptWorkerUrl, timeoutMillis)
        return new AgentScriptRunner({
            compile: async (code: string) => {
                const {monaco} = await loadMonacoSetup()
                const uri = monaco.Uri.parse(ModelUri)
                const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(code, "typescript", uri)
                model.setValue(code)
                await awaitTypeScript(monaco)
                return ScriptCompiler.compile(monaco, model)
            },
            execute: (js, context) => client.execute(js, context),
            target: () => service.optProject,
            context: () => ({
                sampleRate: service.audioContext.sampleRate,
                baseFrequency: service.optProject.map(project => project.rootBox.baseFrequency.getValue()).unwrapOrElse(440.0)
            }),
            discardUnusedSamples: () => host.discardUnusedSamples(),
            terminate: () => client.terminate()
        })
    }
}
