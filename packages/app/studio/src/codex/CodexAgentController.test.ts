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

const lunaModel: CodexModel = {
    id: "luna-model-id",
    model: "gpt-5.6-luna",
    displayName: "Luna",
    description: "Luna model",
    hidden: false,
    supportedReasoningEfforts: [
        {reasoningEffort: "xhigh", description: "Extra high"},
        {reasoningEffort: "balanced", description: "Balanced"}
    ],
    defaultReasoningEffort: "balanced",
    isDefault: false
}

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
    readonly models: ReadonlyArray<CodexModel>
    threadId: string | undefined
    activeTurnId: string | undefined

    constructor(models: ReadonlyArray<CodexModel> = availableModels) {
        this.models = models
    }

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

const controllerWithSession = (models: ReadonlyArray<CodexModel> = availableModels): {
    controller: CodexAgentController, session: FakeSession
} => {
    const session = new FakeSession(models)
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

    it("prefers Luna when it is available", async () => {
        const {controller} = controllerWithSession([availableModels[0], lunaModel])
        await controller.ensureConnected()

        expect(controller.selectedModel.getValue()).toBe("gpt-5.6-luna")
        expect(controller.selectedEffort.getValue()).toBe("xhigh")
        controller.dispose()
    })

    it("uses the selected model default when xhigh is unsupported", async () => {
        const model = {...lunaModel, supportedReasoningEfforts: [{reasoningEffort: "balanced", description: "Balanced"}]}
        const {controller} = controllerWithSession([model])
        await controller.ensureConnected()

        expect(controller.selectedModel.getValue()).toBe("gpt-5.6-luna")
        expect(controller.selectedEffort.getValue()).toBe("balanced")
        controller.dispose()
    })

    it("keeps valid manual selections across model refreshes", async () => {
        const {controller} = controllerWithSession()
        await controller.ensureConnected()
        controller.selectedModel.setValue("model-beta")
        controller.selectedEffort.setValue("thorough")

        controller.models.setValue([...availableModels])

        expect(controller.selectedModel.getValue()).toBe("model-beta")
        expect(controller.selectedEffort.getValue()).toBe("thorough")
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

    it("keeps reasoning summaries separate, ordered, and compactly aggregated", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.send("Make a beat")).toBe(true)
        expect(await controller.send("Do not start a second turn")).toBe(false)
        expect(session.startedThreads).toEqual([{model: "model-alpha"}])
        expect(session.startedTurns).toEqual([{
            text: "Make a beat",
            options: {model: "model-alpha", effort: "balanced", summary: "auto"}
        }])

        session.emit({
            type: "reasoningSummaryPartAdded", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1",
            summaryIndex: 0, text: ""
        })
        session.emit({
            type: "reasoningSummaryDelta", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1",
            summaryIndex: 0, text: "Inspecting the project…"
        })
        session.emit({
            type: "reasoningSummaryDelta", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1",
            summaryIndex: 0, text: " Choosing suitable samples…"
        })
        session.emit({
            type: "reasoningSummaryPartAdded", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1",
            summaryIndex: 1, text: ""
        })
        session.emit({
            type: "reasoningSummaryDelta", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1",
            summaryIndex: 1, text: "Creating the pattern…"
        })
        session.emit({
            type: "agentTextDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", text: "Done "
        })
        session.emit({
            type: "agentTextDelta", threadId: "thread-1", turnId: "turn-1", itemId: "message-1", text: "groove."
        })
        session.emit({
            type: "itemStarted",
            threadId: "thread-1", turnId: "turn-1",
            item: {
                type: "dynamicToolCall", id: "tool-1", namespace: "daw_project",
                tool: "create_note_track", arguments: {name: "Drums"}
            }
        })
        session.emit({
            type: "itemCompleted",
            threadId: "thread-1", turnId: "turn-1",
            item: {
                type: "dynamicToolCall", id: "tool-1", namespace: "daw_project",
                tool: "create_note_track", arguments: {name: "Drums"}, success: false,
                contentItems: [{type: "inputText", text: "failed"}]
            }
        })
        session.emit({
            type: "itemStarted",
            threadId: "thread-1", turnId: "turn-1",
            item: {
                type: "dynamicToolCall", id: "tool-2", namespace: "daw_project",
                tool: "inspect_project", arguments: {scope: "arrangement"}
            }
        })
        session.emit({
            type: "itemCompleted",
            threadId: "thread-1", turnId: "turn-1",
            item: {
                type: "dynamicToolCall", id: "tool-2", namespace: "daw_project",
                tool: "inspect_project", arguments: {scope: "arrangement"}, success: true,
                contentItems: [{type: "inputText", text: "success"}]
            }
        })
        session.emit({
            type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null
        })

        expect(controller.turnRunning.getValue()).toBe(false)
        expect(controller.conversation.getValue()).toEqual([
            {type: "user", id: "user-1", text: "Make a beat"},
            {
                type: "reasoning", itemId: "reasoning-1", turnId: "turn-1", summaryIndex: 0,
                text: "Inspecting the project… Choosing suitable samples…", complete: true
            },
            {
                type: "reasoning", itemId: "reasoning-1", turnId: "turn-1", summaryIndex: 1,
                text: "Creating the pattern…", complete: true
            },
            {type: "assistant", itemId: "message-1", turnId: "turn-1", text: "Done groove.", complete: true},
            {
                type: "activity", itemId: "tool-1", turnId: "turn-1", kind: "dynamicToolCall",
                label: "daw_project.create_note_track", status: "failed",
                item: {
                    type: "dynamicToolCall", id: "tool-1", namespace: "daw_project",
                    tool: "create_note_track", arguments: {name: "Drums"}, success: false,
                    contentItems: [{type: "inputText", text: "failed"}]
                },
                error: "failed"
            },
            {
                type: "activity", itemId: "tool-2", turnId: "turn-1", kind: "dynamicToolCall",
                label: "daw_project.inspect_project", status: "success",
                item: {
                    type: "dynamicToolCall", id: "tool-2", namespace: "daw_project",
                    tool: "inspect_project", arguments: {scope: "arrangement"}, success: true,
                    contentItems: [{type: "inputText", text: "success"}]
                }
            }
        ])
        expect(controller.conversation.getValue()
            .filter(entry => entry.type === "assistant")
            .some(entry => entry.text.includes("Inspecting"))).toBe(false)
        expect(JSON.stringify(controller.conversation.getValue())).not.toContain("raw reasoning payload")
        controller.dispose()
    })

    it("renders native and dynamic items as one chronological activity stream", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.send("Make a beat")).toBe(true)

        const items = [
            {
                type: "dynamicToolCall", id: "dynamic-1", namespace: "daw_project", tool: "create_note_track",
                arguments: {name: "Drums"}, status: "inProgress"
            },
            {
                type: "webSearch", id: "web-1", query: "compressor sidechain",
                action: {type: "search", query: "compressor sidechain"}
            },
            {
                type: "mcpToolCall", id: "mcp-1", server: "spotify", tool: "search", status: "inProgress",
                arguments: {query: "Boards of Canada"}
            },
            {type: "commandExecution", id: "command-1", command: "git status", status: "inProgress"},
            {type: "futureSuperTool", id: "future-1", foo: "bar"}
        ]
        items.forEach(item => session.emit({
            type: "itemStarted", threadId: "thread-1", turnId: "turn-1", item
        }))

        const completedItems = [
            {...items[0], status: "completed", success: true},
            {...items[1], status: "completed"},
            {...items[2], status: "failed", error: {message: "permission denied"}},
            {...items[3], status: "completed"},
            {...items[4], status: "completed"}
        ]
        completedItems.forEach(item => session.emit({
            type: "itemCompleted", threadId: "thread-1", turnId: "turn-1", item
        }))
        session.emit({
            type: "itemCompleted", threadId: "thread-1", turnId: "turn-1",
            item: {
                type: "webSearch", id: "web-no-start", query: "completion without start", status: "completed"
            }
        })

        session.emit({
            type: "itemStarted", threadId: "thread-1", turnId: "turn-1",
            item: {type: "agentMessage", id: "message-1", text: "Done"}
        })
        session.emit({
            type: "itemCompleted", threadId: "thread-1", turnId: "turn-1",
            item: {type: "agentMessage", id: "message-1", text: "Done", status: "completed"}
        })
        session.emit({
            type: "itemStarted", threadId: "thread-1", turnId: "turn-1",
            item: {type: "reasoning", id: "reasoning-1", summary: []}
        })
        session.emit({
            type: "reasoningSummaryDelta", threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1",
            summaryIndex: 0, text: "Inspecting the project…"
        })
        session.emit({
            type: "itemCompleted", threadId: "thread-1", turnId: "turn-1",
            item: {type: "reasoning", id: "reasoning-1", summary: [{text: "Inspecting the project…"}]}
        })

        const entries = controller.conversation.getValue()
        const activities = entries.filter((entry): entry is Extract<typeof entry, {type: "activity"}> =>
            entry.type === "activity")
        expect(activities.map(({label, status}) => ({label, status}))).toEqual([
            {label: "daw_project.create_note_track", status: "success"},
            {label: "Web search · compressor sidechain", status: "success"},
            {label: "MCP · spotify.search", status: "failed"},
            {label: "Command · git status", status: "success"},
            {label: "Codex · futureSuperTool", status: "success"},
            {label: "Web search · completion without start", status: "success"}
        ])
        expect(activities[0].item).toMatchObject({success: true, status: "completed"})
        expect(activities[2].error).toBe("permission denied")
        expect(entries.filter(entry => entry.type === "assistant")).toHaveLength(0)
        expect(entries.filter(entry => entry.type === "reasoning")).toEqual([{
            type: "reasoning", itemId: "reasoning-1", turnId: "turn-1", summaryIndex: 0,
            text: "Inspecting the project…", complete: false
        }])
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
