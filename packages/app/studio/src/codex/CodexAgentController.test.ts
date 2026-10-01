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
import {Option} from "@opendaw/lib-std"
import {CodexAgentController} from "@/codex/CodexAgentController"
import type {CodexAgentSession} from "@/codex/CodexAgentController"
import type {CodexConversationSnapshot, CodexConversationStore} from "@/codex/CodexConversationSnapshot"
import {CodexModelPreferences} from "@/codex/CodexModelPreferences"

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
        isDefault: true,
        inputModalities: ["text", "image"]
    },
    {
        id: "model-beta-id",
        model: "model-beta",
        displayName: "Beta",
        description: "Beta model",
        hidden: false,
        supportedReasoningEfforts: [{reasoningEffort: "thorough", description: "Thorough"}],
        defaultReasoningEffort: "thorough",
        isDefault: false,
        inputModalities: ["text"]
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
    isDefault: false,
    inputModalities: ["text", "image"]
}

const tick = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
}

class FakeSession implements CodexAgentSession {
    readonly events = new Set<(event: CodexSessionEvent) => void>()
    readonly startedTurns: Array<{text: string, options: CodexStartTurnOptions | undefined}> = []
    readonly startedThreads: Array<CodexStartThreadOptions | undefined> = []
    readonly resumedThreads: Array<string> = []
    resumeFails = false
    connectFails = false
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
        if (this.connectFails) {throw new Error("connection refused")}
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
        this.threadId = `thread-${this.startedThreads.length}`
        const thread = {threadId: this.threadId, sessionId: "session-1"}
        this.emit({type: "threadStarted", thread})
        return thread
    }

    async resumeThread(threadId: string): Promise<CodexThreadInfo> {
        this.resumedThreads.push(threadId)
        if (this.resumeFails) {throw new Error("thread not found")}
        this.threadId = threadId
        const thread = {threadId, sessionId: "session-1"}
        this.emit({type: "threadResumed", thread})
        return thread
    }

    closedThreads = 0

    async closeThread(): Promise<void> {
        this.closedThreads++
        this.threadId = undefined
        this.activeTurnId = undefined
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
    const controller = new CodexAgentController({createSession: () => session, preferences: CodexModelPreferences.memory()})
    controller.bindProject(project())
    return {controller, session}
}

class MemoryStore implements CodexConversationStore {
    snapshot: Option<CodexConversationSnapshot> = Option.None
    saves = 0
    async load(): Promise<Option<CodexConversationSnapshot>> {return this.snapshot}
    async save(snapshot: CodexConversationSnapshot): Promise<void> {
        this.saves++
        this.snapshot = Option.wrap(snapshot)
    }
}

const newController = (session: FakeSession, preferences = CodexModelPreferences.memory()): CodexAgentController =>
    new CodexAgentController({createSession: () => session, preferences})

describe("CodexAgentController persistence", () => {
    it("saves the conversation on turn completion and resumes the saved thread when reopened", async () => {
        const store = new MemoryStore()
        const first = new FakeSession()
        const controller = newController(first)
        controller.bindProject(project(), store)
        await tick()
        await controller.ensureConnected()
        await controller.send("Make a beat")
        first.emit({type: "itemCompleted", threadId: "thread-1", turnId: "turn-1", item: {
            type: "dynamicToolCall", id: "tool-1", tool: "listen", arguments: {}, success: true,
            contentItems: [{type: "inputImage", imageUrl: `data:image/png;base64,${"A".repeat(400)}`}]
        }})
        first.emit({type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null})
        await tick()
        const saved = store.snapshot.unwrap()
        expect(saved.threadId).toBe("thread-1")
        expect(saved.entries.map(entry => entry.type)).toEqual(["user", "activity"])
        expect(JSON.stringify(saved)).not.toContain("base64")
        expect(JSON.stringify(saved)).toContain("[image]")
        const second = new FakeSession()
        const reopened = newController(second)
        reopened.bindProject(project(), store)
        await tick()
        expect(reopened.conversation.getValue().map(entry => entry.type)).toEqual(["user", "activity"])
        await reopened.ensureConnected()
        expect(await reopened.send("Add bass")).toBe(true)
        await tick()
        expect(second.resumedThreads).toEqual(["thread-1"])
        expect(second.startedThreads).toHaveLength(0)
        expect(reopened.conversation.getValue().flatMap(entry => entry.type === "user" ? [entry.id] : []))
            .toEqual(["user-1", "user-2"])
        controller.dispose()
        reopened.dispose()
    })

    it("starts fresh with a notice when the saved thread cannot be resumed", async () => {
        const store = new MemoryStore()
        store.snapshot = Option.wrap({threadId: "gone", entries: [{type: "user", id: "user-1", text: "Old"}]})
        const session = new FakeSession()
        session.resumeFails = true
        const controller = newController(session)
        controller.bindProject(project(), store)
        await tick()
        await controller.ensureConnected()
        await controller.send("New")
        await tick()
        expect(session.resumedThreads).toEqual(["gone"])
        expect(session.startedThreads).toHaveLength(1)
        expect(controller.conversation.getValue().map(entry => entry.type)).toEqual(["user", "notice", "user"])
        controller.dispose()
    })

    it("starts a new conversation, interrupting a running turn and clearing the saved thread", async () => {
        const store = new MemoryStore()
        const session = new FakeSession()
        const controller = newController(session)
        controller.bindProject(project(), store)
        await tick()
        await controller.ensureConnected()
        await controller.send("First")
        await tick()
        await controller.send("Queued")
        expect(controller.turnRunning.getValue()).toBe(true)
        await controller.newConversation()
        await tick()
        expect(controller.turnRunning.getValue()).toBe(false)
        expect(controller.conversation.getValue()).toEqual([])
        expect(session.closedThreads).toBe(1)
        expect(session.startedTurns.map(({text}) => text)).toEqual(["First"])
        expect(store.snapshot.unwrap()).toEqual({threadId: null, entries: []})
        session.emit({type: "itemStarted", threadId: "thread-1", turnId: "turn-1",
            item: {type: "dynamicToolCall", id: "late", tool: "listen", arguments: {}}})
        expect(controller.conversation.getValue()).toEqual([])
        await controller.send("Second")
        await tick()
        expect(session.resumedThreads).toEqual([])
        expect(session.startedThreads).toHaveLength(2)
        controller.dispose()
    })

    it("does not overwrite the saved conversation while it is still loading", async () => {
        const store = new MemoryStore()
        store.snapshot = Option.wrap({threadId: "thread-9", entries: [{type: "user", id: "user-1", text: "Keep"}]})
        const controller = newController(new FakeSession())
        controller.bindProject(project(), store)
        controller.bindProject(project())
        await tick()
        expect(store.saves).toBe(0)
        controller.dispose()
    })
})

describe("CodexAgentController model preferences", () => {
    it("restores the saved model and effort and falls back when the model disappeared", async () => {
        const preferences = CodexModelPreferences.memory()
        const controller = newController(new FakeSession([...availableModels, lunaModel]), preferences)
        controller.bindProject(project())
        await controller.ensureConnected()
        expect(controller.selectedEffort.unwrapOrNull()).toBe("balanced")
        controller.selectModel("gpt-5.6-luna")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("balanced")
        controller.selectEffort("xhigh")
        controller.selectEffort("balanced")
        controller.dispose()
        const reloaded = newController(new FakeSession([...availableModels, lunaModel]), preferences)
        reloaded.bindProject(project())
        await reloaded.ensureConnected()
        expect(reloaded.selectedModel.unwrapOrNull()).toBe("gpt-5.6-luna")
        expect(reloaded.selectedEffort.unwrapOrNull()).toBe("balanced")
        reloaded.dispose()
        const withoutLuna = newController(new FakeSession(), preferences)
        withoutLuna.bindProject(project())
        await withoutLuna.ensureConnected()
        expect(withoutLuna.selectedModel.unwrapOrNull()).toBe("model-alpha")
        withoutLuna.dispose()
    })

    it("decodes stored preferences defensively", () => {
        expect(CodexModelPreferences.decode("{broken").isEmpty()).toBe(true)
        expect(CodexModelPreferences.decode(JSON.stringify({model: 3})).isEmpty()).toBe(true)
        expect(CodexModelPreferences.decode(JSON.stringify({model: "m", effort: "high"})).unwrap())
            .toEqual({model: "m", effort: "high"})
    })
})

describe("CodexAgentController subagents", () => {
    it("labels subagent tool calls and keeps child turns from ending the main turn", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        await controller.send("Design a bass")
        await tick()
        session.emit({type: "subagentStarted", agent: {
            threadId: "child-1", parentThreadId: "thread-1", nickname: "Euclid", role: null, path: "root/bass_design"
        }})
        session.emit({type: "itemCompleted", threadId: "thread-1", turnId: "turn-1", item: {
            type: "collabAgentToolCall", id: "collab-1", tool: "spawnAgent", status: "completed",
            senderThreadId: "thread-1", receiverThreadIds: ["child-1"], prompt: "Research", agentsStates: {}
        }})
        session.emit({type: "turnStarted", threadId: "child-1", turnId: "child-turn"})
        session.emit({type: "agentTextDelta", threadId: "child-1", turnId: "child-turn", itemId: "child-msg", text: "hi"})
        session.emit({type: "itemCompleted", threadId: "child-1", turnId: "child-turn", item: {
            type: "dynamicToolCall", id: "child-tool", tool: "device_reference", arguments: {device: "Apparat"}, success: true
        }})
        session.emit({type: "turnCompleted", threadId: "child-1", turnId: "child-turn", status: "completed", error: null})
        expect(controller.turnRunning.getValue()).toBe(true)
        expect(controller.activeTurnId.unwrapOrNull()).toBe("turn-1")
        const labels = controller.conversation.getValue().flatMap(entry => entry.type === "activity" ? [entry.label] : [])
        expect(labels).toEqual(["Spawned subagent · bass_design", "[bass_design] Looked up Apparat"])
        expect(controller.conversation.getValue().some(entry => entry.type === "assistant")).toBe(false)
        controller.dispose()
    })
})

describe("CodexAgentController", () => {
    it("chooses the default model and derives dynamic effort choices", async () => {
        const {controller} = controllerWithSession()
        await controller.ensureConnected()

        expect(controller.selectedModel.unwrapOrNull()).toBe("model-alpha")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("balanced")
        controller.selectedModel.wrap("model-beta")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("thorough")
        controller.selectedModel.wrap("model-alpha")
        controller.selectedEffort.wrap("focused")
        controller.selectedModel.wrap("model-beta")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("thorough")
        controller.selectedModel.wrap("model-alpha")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("balanced")
        controller.dispose()
    })

    it("prefers the App Server default model with its strongest effort", async () => {
        const {controller} = controllerWithSession([{...availableModels[0], isDefault: false}, {...lunaModel, isDefault: true}])
        await controller.ensureConnected()

        expect(controller.selectedModel.unwrapOrNull()).toBe("gpt-5.6-luna")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("xhigh")
        controller.dispose()
    })

    it("falls back to the first visible model when none is marked default", async () => {
        const hidden = {...lunaModel, model: "hidden-model", hidden: true}
        const {controller} = controllerWithSession([hidden, {...availableModels[1]}, lunaModel])
        await controller.ensureConnected()

        expect(controller.selectedModel.unwrapOrNull()).toBe("model-beta")
        controller.dispose()
    })

    it("ranks known reasoning efforts instead of relying on their order", async () => {
        const model = {
            ...lunaModel,
            supportedReasoningEfforts: [
                {reasoningEffort: "high", description: "High"},
                {reasoningEffort: "low", description: "Low"},
                {reasoningEffort: "medium", description: "Medium"}
            ],
            defaultReasoningEffort: "medium"
        }
        const {controller} = controllerWithSession([model])
        await controller.ensureConnected()

        expect(controller.selectedEffort.unwrapOrNull()).toBe("high")
        controller.dispose()
    })

    it("uses the selected model default when no known effort is supported", async () => {
        const model = {...lunaModel, supportedReasoningEfforts: [{reasoningEffort: "balanced", description: "Balanced"}]}
        const {controller} = controllerWithSession([model])
        await controller.ensureConnected()

        expect(controller.selectedModel.unwrapOrNull()).toBe("gpt-5.6-luna")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("balanced")
        controller.dispose()
    })

    it("keeps valid manual selections across model refreshes", async () => {
        const {controller} = controllerWithSession()
        await controller.ensureConnected()
        controller.selectedModel.wrap("model-beta")
        controller.selectedEffort.wrap("thorough")

        controller.models.setValue([...availableModels])

        expect(controller.selectedModel.unwrapOrNull()).toBe("model-beta")
        expect(controller.selectedEffort.unwrapOrNull()).toBe("thorough")
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
        expect(await controller.send("Do not start a second turn")).toBe(true)
        expect(controller.cancelQueued()).toBe("Do not start a second turn")
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
                label: "Create note track", status: "failed",
                item: {
                    type: "dynamicToolCall", id: "tool-1", namespace: "daw_project",
                    tool: "create_note_track", arguments: {name: "Drums"}, success: false,
                    contentItems: [{type: "inputText", text: "failed"}]
                },
                error: "failed"
            },
            {
                type: "activity", itemId: "tool-2", turnId: "turn-1", kind: "dynamicToolCall",
                label: "Inspected project", status: "success",
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
            {label: "Create note track", status: "success"},
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
        expect(controller.error.isEmpty()).toBe(true)
        controller.dispose()
    })
    it("clears a stale connection error once the app server connects", async () => {
        const {controller, session} = controllerWithSession()
        session.connectFails = true
        await controller.ensureConnected()
        expect(controller.error.unwrapOrNull()?.kind).toBe("connection")
        session.connectFails = false
        await controller.retryConnection()
        expect(controller.connectionState.getValue()).toBe("connected")
        expect(controller.error.isEmpty()).toBe(true)
        controller.dispose()
    })

    it("resumes the previous thread after a reconnect", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.send("First")).toBe(true)
        session.emit({type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null})
        await controller.retryConnection()
        expect(session.threadId).toBeUndefined()
        expect(await controller.send("Second")).toBe(true)
        await tick()
        expect(session.resumedThreads).toEqual(["thread-1"])
        expect(session.startedThreads).toHaveLength(1)
        expect(controller.conversation.getValue().some(entry => entry.type === "notice")).toBe(false)
        controller.dispose()
    })

    it("marks lost context with a notice when the previous thread cannot be resumed", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.send("First")).toBe(true)
        session.emit({type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null})
        await controller.retryConnection()
        session.resumeFails = true
        expect(await controller.send("Second")).toBe(true)
        await tick()
        expect(session.startedThreads).toHaveLength(2)
        expect(controller.conversation.getValue().map(entry => entry.type)).toEqual(["user", "notice", "user"])
        expect(controller.error.isEmpty()).toBe(true)
        controller.dispose()
    })

    it("queues a message sent while a turn runs and sends it when the turn completes", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.send("Make a beat")).toBe(true)
        await tick()
        expect(await controller.send("Then add a bassline")).toBe(true)
        expect(await controller.send("and drums")).toBe(true)
        expect(controller.queuedMessage.unwrapOrNull()).toBe("Then add a bassline\n\nand drums")
        expect(session.startedTurns.map(({text}) => text)).toEqual(["Make a beat"])
        expect(controller.conversation.getValue().filter(entry => entry.type === "user")).toHaveLength(1)
        session.emit({type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null})
        await tick()
        expect(controller.queuedMessage.isEmpty()).toBe(true)
        expect(session.startedTurns.map(({text}) => text)).toEqual(["Make a beat", "Then add a bassline\n\nand drums"])
        expect(controller.turnRunning.getValue()).toBe(true)
        controller.dispose()
    })

    it("sends pasted images with the message, also image-only and queued", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        expect(await controller.send("Recreate this patch", ["data:image/png;base64,AAAA"])).toBe(true)
        await tick()
        expect(session.startedTurns[0].options?.images).toEqual(["data:image/png;base64,AAAA"])
        expect(controller.conversation.getValue().at(0)).toMatchObject({type: "user", images: ["data:image/png;base64,AAAA"]})
        expect(await controller.send("", ["data:image/png;base64,BBBB"])).toBe(true)
        expect(controller.queuedMessage.unwrapOrNull()).toBe("")
        expect(controller.queuedImages.getValue()).toEqual(["data:image/png;base64,BBBB"])
        session.emit({type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null})
        await tick()
        expect(controller.queuedImages.getValue()).toEqual([])
        expect(session.startedTurns.at(1)).toMatchObject({text: "", options: {images: ["data:image/png;base64,BBBB"]}})
        expect(await controller.send("   ")).toBe(false)
        controller.dispose()
    })

    it("sends the queued message after Stop and drops it when cancelled", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        await controller.send("First")
        await tick()
        await controller.send("Second")
        await controller.interrupt()
        await tick()
        expect(session.startedTurns.map(({text}) => text)).toEqual(["First", "Second"])
        await controller.send("Third")
        expect(controller.cancelQueued()).toBe("Third")
        expect(controller.cancelQueued()).toBeUndefined()
        session.emit({type: "turnCompleted", threadId: "thread-1", turnId: "turn-1", status: "completed", error: null})
        await tick()
        expect(session.startedTurns.map(({text}) => text)).toEqual(["First", "Second"])
        controller.dispose()
    })

    it("keeps the queued message when it cannot be sent and forgets it on project change", async () => {
        const {controller, session} = controllerWithSession()
        await controller.ensureConnected()
        await controller.send("First")
        await tick()
        await controller.send("Second")
        session.emit({type: "disconnected", error: "gone"})
        await tick()
        expect(controller.queuedMessage.unwrapOrNull()).toBe("Second")
        controller.bindProject(project())
        expect(controller.queuedMessage.isEmpty()).toBe(true)
        controller.dispose()
    })

    it("creates the session lazily and only recreates an existing one on project change", async () => {
        let created = 0
        const controller = new CodexAgentController({
            createSession: () => {
                created++
                return new FakeSession()
            }
        })
        controller.bindProject(project())
        controller.bindProject(project())
        expect(created).toBe(0)
        await controller.ensureConnected()
        expect(created).toBe(1)
        controller.bindProject(project())
        expect(created).toBe(2)
        controller.bindProject(null)
        controller.bindProject(project())
        expect(created).toBe(2)
        controller.dispose()
    })
})
