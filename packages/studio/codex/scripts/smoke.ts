/*
 * Development-only real App Server smoke test.
 *
 * Start the server in another terminal first:
 *   codex app-server --listen ws://127.0.0.1:4500
 *
 * Then run from the repository root:
 *   npm run smoke --workspace @opendaw/studio-codex -- --smoke-only
 *
 * Without --smoke-only this continues with two producer turns after the
 * thread-start compatibility check. The script never calls DAW operations
 * directly; its only project inspection is the final resource query.
 */

type SmokeEvent = {
    readonly type: string
    readonly [key: string]: unknown
}

type SessionEvents = {
    subscribe(listener: (event: SmokeEvent) => void): () => void
}

const waitForLogin = (session: SessionEvents): Promise<SmokeEvent> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
        unsubscribe()
        reject(new Error("Timed out waiting for ChatGPT login completion"))
    }, 10 * 60 * 1000)
    const unsubscribe = session.subscribe(event => {
        if (event.type === "loginCompleted") {
            clearTimeout(timeout)
            unsubscribe()
            resolve(event)
        } else if (event.type === "error") {
            clearTimeout(timeout)
            unsubscribe()
            reject(new Error(String(event.error)))
        }
    })
})

const waitForTurn = (session: SessionEvents): Promise<SmokeEvent> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
        unsubscribe()
        reject(new Error("Timed out waiting for turn completion"))
    }, 30 * 60 * 1000)
    const unsubscribe = session.subscribe(event => {
        if (event.type === "turnCompleted") {
            clearTimeout(timeout)
            unsubscribe()
            resolve(event)
        } else if (event.type === "error") {
            clearTimeout(timeout)
            unsubscribe()
            reject(new Error(String(event.error)))
        }
    })
})

const createEnvironment = (): object => {
    const emptyTerminable = {terminate: () => {}}
    const sampleManager = {
        getOrCreate: (uuid: unknown) => ({
            data: undefined,
            peaks: undefined,
            uuid,
            state: {type: "idle"},
            invalidate: () => {},
            subscribe: () => emptyTerminable
        }),
        record: () => {},
        invalidate: () => {},
        remove: () => {},
        register: () => emptyTerminable
    }
    return {
        audioContext: undefined,
        audioWorklets: undefined,
        sampleManager,
        soundfontManager: undefined,
        sampleService: undefined,
        soundfontService: undefined
    }
}

const inspectProject = async (executor: {execute(invocation: object): Promise<unknown>}): Promise<void> => {
    const result = await executor.execute({
        namespace: "daw_resources",
        name: "query_resources",
        arguments: {kind: "box", limit: 1000}
    }) as {readonly ok: boolean, readonly value?: unknown, readonly error?: string}
    if (!result.ok) {throw new Error(result.error ?? "Resource inspection failed")}
    const value = result.value as {readonly resources?: ReadonlyArray<unknown>}
    console.log(`Harness inspection: ${value.resources?.length ?? 0} boxes visible`)
}

const runTurn = async (session: SessionEvents & {startTurn(text: string): Promise<string>}, text: string): Promise<void> => {
    const completed = waitForTurn(session)
    const turnId = await session.startTurn(text)
    const event = await completed
    if (event.turnId !== turnId) {
        throw new Error(`Completed turn ${String(event.turnId)} while waiting for ${turnId}`)
    }
    console.log(`Turn completed: ${turnId} (${String(event.status)})`)
}

const main = async (): Promise<void> => {
    console.log("Connect to: codex app-server --listen ws://127.0.0.1:4500")

    // The core package is browser-oriented and defines AudioWorkletNode-based
    // classes at module evaluation time. The smoke harness does not start audio.
    if (!Reflect.has(globalThis, "AudioWorkletNode")) {
        Reflect.set(globalThis, "AudioWorkletNode", class {})
    }
    if (!Reflect.has(globalThis, "navigator")) {
        Reflect.set(globalThis, "navigator", {maxTouchPoints: 0})
    }

    const core = await import("@opendaw/studio-core")
    const codex = await import("../src/index.ts")
    const project = core.Project.new(createEnvironment() as never, {noDefaultUser: true})
    const controlApi = new core.ControlApi(project)
    const catalog = new core.ToolCatalog()
    const executor = new core.ToolExecutor(controlApi, catalog)
    const transport = new codex.WebSocketCodexTransport()
    const rpc = new codex.CodexRpcClient(transport)
    const session = new codex.CodexSession({rpc, catalog, executor})

    try {
        await session.connect()
        const account = await session.readAccount()
        console.log(`Account: ${account.email ?? "not signed in"} (${account.planType ?? "unknown plan"})`)
        if (account.requiresOpenaiAuth) {
            const loginCompleted = waitForLogin(session)
            const login = await session.startChatGPTLogin()
            console.log(`Complete ChatGPT login at: ${login.authUrl}`)
            const event = await loginCompleted
            if (event.loginId !== login.loginId || event.success !== true) {
                throw new Error(`ChatGPT login did not complete successfully for ${login.loginId}`)
            }
        }

        const thread = await session.startThread()
        console.log(`Thread started: ${thread.threadId}; ${session.dynamicTools.length} namespaces projected`)
        if (process.argv.includes("--smoke-only")) {return}

        await runTurn(session, "Create a short hip-hop pattern around 90 BPM, add note material, add an available delay effect, and adjust one of its parameters.")
        await inspectProject(executor)
        await runTurn(session, "Make the hats less aggressive and increase the delay.")
        await inspectProject(executor)
    } finally {
        await session.disconnect()
        project.terminate()
    }
}

await main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
