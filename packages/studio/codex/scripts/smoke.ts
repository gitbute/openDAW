// Dev-only App Server smoke: start `codex app-server --listen ws://127.0.0.1:4500`, then `npm run smoke -w @opendaw/studio-codex [-- --smoke-only]`.
import {AgentToolResult, CodexRpcClient, CodexSession, WebSocketCodexTransport} from "../src/index"
import type {AgentToolbox, CodexSessionEvent} from "../src/index"

type LoginCompleted = Extract<CodexSessionEvent, {type: "loginCompleted"}>
type TurnCompleted = Extract<CodexSessionEvent, {type: "turnCompleted"}>

const waitFor = <E extends CodexSessionEvent>(session: CodexSession, accept: (event: CodexSessionEvent) => event is E,
                                              minutes: number): Promise<E> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
        unsubscribe()
        reject(new Error(`Timed out after ${minutes} minutes`))
    }, minutes * 60 * 1000)
    const unsubscribe = session.subscribe(event => {
        if (accept(event)) {
            clearTimeout(timeout)
            unsubscribe()
            resolve(event)
        } else if (event.type === "error") {
            clearTimeout(timeout)
            unsubscribe()
            reject(new Error(event.error))
        }
    })
})

const isLoginCompleted = (event: CodexSessionEvent): event is LoginCompleted => event.type === "loginCompleted"
const isTurnCompleted = (event: CodexSessionEvent): event is TurnCompleted => event.type === "turnCompleted"

const echoToolbox: AgentToolbox = {
    namespace: "smoke",
    description: "Smoke test tools.",
    tools: [{
        name: "echo",
        description: "Echo the given text back.",
        inputSchema: {
            type: "object",
            properties: {text: {type: "string", description: "Text to echo."}},
            required: ["text"],
            additionalProperties: false
        },
        execute: async args => {
            console.log(`echo called with ${JSON.stringify(args)}`)
            return AgentToolResult.json({echo: args.text ?? null})
        }
    }]
}

const runTurn = async (session: CodexSession, text: string): Promise<void> => {
    const completed = waitFor(session, isTurnCompleted, 30)
    const turnId = await session.startTurn(text)
    const event = await completed
    if (event.turnId !== turnId) {throw new Error(`Completed turn ${event.turnId} while waiting for ${turnId}`)}
    console.log(`Turn completed: ${turnId} (${event.status})`)
}

const main = async (): Promise<void> => {
    console.log("Connect to: codex app-server --listen ws://127.0.0.1:4500")
    const rpc = new CodexRpcClient(new WebSocketCodexTransport())
    const session = new CodexSession({rpc, toolboxes: [echoToolbox]})
    await session.connect()
    const account = await session.readAccount()
    console.log(`Account: ${account.email ?? "not signed in"} (${account.planType ?? "unknown plan"})`)
    if (account.requiresOpenaiAuth) {
        const loginCompleted = waitFor(session, isLoginCompleted, 10)
        const login = await session.startChatGPTLogin()
        console.log(`Complete ChatGPT login at: ${login.authUrl}`)
        const event = await loginCompleted
        if (event.loginId !== login.loginId || !event.success) {
            throw new Error(`ChatGPT login did not complete successfully for ${login.loginId}`)
        }
    }
    const models = await session.listModels()
    console.log(`Models: ${models.map(model => `${model.model}[${model.inputModalities.join(",")}]`).join(" ")}`)
    const thread = await session.startThread()
    console.log(`Thread started: ${thread.threadId}; ${session.dynamicTools.length} namespaces projected`)
    if (!process.argv.includes("--smoke-only")) {
        await runTurn(session, "Call smoke.echo with the text 'hello openDAW', then reply with the echoed text.")
    }
}

await main().then(() => process.exit(0), error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
