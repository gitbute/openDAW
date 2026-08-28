import {describe, expect, it} from "vitest"
import type {
    CodexAccountState,
    CodexInitializeResponse,
    CodexLogin,
    CodexModel,
    CodexSessionEvent,
    CodexStartThreadOptions,
    CodexStartTurnOptions,
    CodexThreadInfo,
    Unsubscribe
} from "@opendaw/studio-codex"
import type {Project} from "@opendaw/studio-core"
import {CodexAgentController} from "@/codex/CodexAgentController"
import type {CodexAgentSession} from "@/codex/CodexAgentController"

const accountState: CodexAccountState = {
    account: {type: "chatgpt", email: "producer@example.com", planType: "plus"},
    exists: true,
    accountType: "chatgpt",
    authMode: "chatgpt",
    email: "producer@example.com",
    planType: "plus",
    requiresOpenaiAuth: false
}

const availableModels: ReadonlyArray<CodexModel> = [
    {
        id: "model-alpha-id",
        model: "model-alpha",
        displayName: "Alpha",
        description: "Alpha model",
        hidden: false,
        supportedReasoningEfforts: [
            {reasoningEffort: "balanced", description: "Balanced"},
            {reasoningEffort: "focused", description: "Focused"}
        ],
        defaultReasoningEffort: "balanced",
        isDefault: true
    },
    {
        id: "model-beta-id",
        model: "model-beta",
        displayName: "Beta",
        description: "Beta model",
        hidden: false,
        supportedReasoningEfforts: [{reasoningEffort: "thorough", description: "Thorough"}],
        defaultReasoningEffort: "thorough",
        isDefault: false
    }
]

const tick = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
}

class FakeSession implements CodexAgentSession {
    readonly events = new Set<(event: CodexSessionEvent) => void>()
    readonly startedTurns: Array<{text: string, options: CodexStartTurnOptions | undefined}> = []
    readonly startedThreads: Array<CodexStartThreadOptions | undefined> = []
    connectCount = 0
    disconnectCount = 0
    listModelsCount = 0
    account = accountState
    models = availableModels
    threadId: string | undefined
    activeTurnId: string | undefined

    async connect(): Promise<CodexInitializeResponse> {
        this.connectCount++
        this.emit({type: "connectionChanged", state: "connecting"})
        this.emit({type: "connectionChanged", state: "connected"})
        return {}
    }

    async disconnect(): Promise<void> {
        this.disconnectCount++
        this.threadId = undefined
        this.activeTurnId = undefined
    }

    subscribe(listener: (event: CodexSessionEvent) => void): Unsubscribe {
        this.events.add(listener)
        return () => this.events.delete(listener)
    }

    async readAccount(): Promise<CodexAccountState> {return this.account}

    async listModels(): Promise<ReadonlyArray<CodexModel>> {
        this.listModelsCount++
        return this.models
    }

    async startChatGPTLogin(): Promise<CodexLogin> {
        return {loginId: "login-1", authUrl: "https://example.test/login"}
    }

    async logout(): Promise<void> {this.account = {...this.account, account: null, exists: false}}

    async startThread(options?: CodexStartThreadOptions): Promise<CodexThreadInfo> {
        this.startedThreads.push(options)
        this.threadId = "thread-1"
        const thread = {threadId: this.threadId, sessionId: "session-1"}
        this.emit({type: "threadStarted", thread})
        return thread
    }

    async startTurn(text: string, options?: CodexStartTurnOptions): Promise<string> {
        this.startedTurns.push({text, options})
        this.activeTurnId = "turn-1"
        this.emit({type: "turnStarted", threadId: this.threadId ?? "thread-1", turnId: this.activeTurnId})
        return this.activeTurnId
    }

    async interruptTurn(turnId?: string): Promise<void> {
        this.activeTurnId = undefined
        this.emit({
            type: "turnCompleted",
            threadId: this.threadId ?? "thread-1",
            turnId: turnId ?? "turn-1",
            status: "interrupted",
            error: null
        })
    }

    emit(event: CodexSessionEvent): void {this.events.forEach(listener => listener(event))}
}

const project = (): Project => ({}) as Project

const controllerWithSession = (): {controller: CodexAgentController, session: FakeSession} => {
    const session = new FakeSession()
    const controller = new CodexAgentController({createSession: () => session})
    controller.bindProject(project())
    return {controller, session}
}

describe("CodexAgentController", () => {
    it("chooses the default model and derives dynamic effort choices", async () => {
        const {controller} = controllerWithSession()
        await controller.ensureConnected()

        expect(controller.selectedModel.getValue()).toBe("model-alpha")
        expect(controller.selectedEffort.getValue()).toBe("balanced")
        controller.selectedModel.setValue("model-beta")
        expect(controller.selectedEffort.getValue()).toBe("thorough")
        controller.selectedModel.setValue("model-alpha")
        controller.selectedEffort.setValue("focused")
        controller.selectedModel.setValue("model-beta")
        expect(controller.selectedEffort.getValue()).toBe("thorough")
        controller.selectedModel.setValue("model-alpha")
        expect(controller.selectedEffort.getValue()).toBe("balanced")
        controller.dispose()
    })

    it("refreshes account and models after login completion", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.login()).toBe("https://example.test/login")
        const before = session.listModelsCount
        session.emit({type: "loginCompleted", loginId: "login-1", success: true, error: null})
        await tick()
        expect(session.listModelsCount).toBeGreaterThan(before)
        expect(controller.models.getValue()).toEqual(availableModels)
        controller.dispose()
    })

    it("keeps one user entry, aggregates assistant deltas, and updates tool activity", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.send("Make a beat")).toBe(true)
        expect(await controller.send("Do not start a second turn")).toBe(false)
        expect(session.startedThreads).toEqual([{model: "model-alpha"}])
        expect(session.startedTurns).toEqual([{
            text: "Make a beat",
            options: {model: "model-alpha", effort: "balanced"}
        }])

        session.emit({
            type: "agentTextDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", text: "Done "
        })
        session.emit({
            type: "agentTextDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", text: "groove."
        })
        session.emit({
            type: "dynamicToolStarted",
            threadId: "thread-1", turnId: "turn-1", itemId: "tool-1", namespace: "daw_project",
            tool: "create_note_track", arguments: {}
        })
        session.emit({
            type: "dynamicToolCompleted",
            threadId: "thread-1", turnId: "turn-1", itemId: "tool-1", namespace: "daw_project",
            tool: "create_note_track", success: false, contentItems: [{type: "inputText", text: "failed"}]
        })
        session.emit({
            type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null
        })

        expect(controller.turnRunning.getValue()).toBe(false)
        expect(controller.conversation.getValue()).toEqual([
            {type: "user", id: "user-1", text: "Make a beat"},
            {type: "assistant", itemId: "message-1", turnId: "turn-1", text: "Done groove.", complete: true},
            {
                type: "tool", itemId: "tool-1", turnId: "turn-1", namespace: "daw_project",
                tool: "create_note_track", status: "failed", error: "failed"
            }
        ])
        controller.dispose()
    })

    it("rebinds the runtime without recreating it on panel-style remounts", async () => {
        const sessions: FakeSession[] = []
        const controller = new CodexAgentController({
            createSession: () => {
                const session = new FakeSession()
                sessions.push(session)
                return session
            }
        })
        const firstProject = project()
        const secondProject = project()
        controller.bindProject(firstProject)
        await controller.ensureConnected()
        controller.bindProject(secondProject)
        controller.bindProject(secondProject)
        expect(sessions).toHaveLength(2)
        expect(sessions[0].disconnectCount).toBe(1)
        expect(controller.project).toBe(secondProject)
        expect(controller.conversation.getValue()).toEqual([])
        sessions[0].emit({type: "error", error: "old project"})
        expect(controller.error.getValue()).toBeNull()
        controller.dispose()
    })
})
