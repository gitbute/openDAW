import {
    CodexRpcClient,
    CodexSession,
    WebSocketCodexTransport,
} from "@opendaw/studio-codex"
import type {
    CodexAccountState,
    CodexInitializeResponse,
    CodexLogin,
    CodexModel,
    CodexSessionEvent,
    CodexStartThreadOptions,
    CodexStartTurnOptions,
    CodexThreadInfo,
    CodexTraceEvent,
    CodexTraceSink,
    CodexTransportState,
    Unsubscribe
} from "@opendaw/studio-codex"
import {ControlApi, ToolCatalog, ToolExecutor} from "@opendaw/studio-core"
import type {Project} from "@opendaw/studio-core"
import {DefaultObservableValue, Terminable} from "@opendaw/lib-std"

export type CodexConversationEntry =
    | {
        readonly type: "user"
        readonly id: string
        readonly text: string
    }
    | {
        readonly type: "assistant"
        readonly itemId: string
        readonly turnId: string
        readonly text: string
        readonly complete: boolean
    }
    | {
        readonly type: "tool"
        readonly itemId: string
        readonly turnId: string
        readonly namespace: string | null
        readonly tool: string
        readonly status: "running" | "success" | "failed"
        readonly error?: string
    }

export type CodexAgentErrorKind = "connection" | "auth" | "model-list" | "thread" | "turn" | "protocol"

export type CodexAgentError = {
    readonly kind: CodexAgentErrorKind
    readonly message: string
}

export type CodexAgentSession = {
    readonly threadId: string | undefined
    readonly activeTurnId: string | undefined
    connect(): Promise<CodexInitializeResponse>
    disconnect(): Promise<void>
    subscribe(listener: (event: CodexSessionEvent) => void): Unsubscribe
    readAccount(): Promise<CodexAccountState>
    listModels(): Promise<ReadonlyArray<CodexModel>>
    startChatGPTLogin(): Promise<CodexLogin>
    logout(): Promise<void>
    startThread(options?: CodexStartThreadOptions): Promise<CodexThreadInfo>
    startTurn(text: string, options?: CodexStartTurnOptions): Promise<string>
    interruptTurn(turnId?: string): Promise<void>
}

export type CodexAgentSessionFactory = (project: Project, traceSink: CodexTraceSink) => CodexAgentSession

export type CodexAgentControllerOptions = {
    readonly createSession?: CodexAgentSessionFactory
    readonly appServerUrl?: () => string
}

const emptyAccountState = {
    account: null,
    exists: false,
    accountType: null,
    authMode: null,
    email: null,
    planType: null,
    requiresOpenaiAuth: true
} as const

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const isAuthenticated = (account: CodexAccountState): boolean =>
    account.account !== null

const defaultAppServerUrl = (): string => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.host}/codex-app-server`
}

const createSession = (url: string, project: Project, traceSink: CodexTraceSink): CodexAgentSession => {
    const controlApi = new ControlApi(project)
    const catalog = new ToolCatalog()
    const executor = new ToolExecutor(controlApi, catalog)
    const transport = new WebSocketCodexTransport(url, undefined, traceSink)
    const rpc = new CodexRpcClient(transport, traceSink)
    return new CodexSession({rpc, catalog, executor, traceSink})
}

export class CodexAgentController {
    readonly connectionState = new DefaultObservableValue<CodexTransportState>("disconnected")
    readonly appServerUsable = new DefaultObservableValue(false)
    readonly account = new DefaultObservableValue<CodexAccountState>(emptyAccountState)
    readonly models = new DefaultObservableValue<ReadonlyArray<CodexModel>>([])
    readonly selectedModel = new DefaultObservableValue<string | null>(null)
    readonly selectedEffort = new DefaultObservableValue<string | null>(null)
    readonly turnRunning = new DefaultObservableValue(false)
    readonly activeTurnId = new DefaultObservableValue<string | null>(null)
    readonly conversation = new DefaultObservableValue<ReadonlyArray<CodexConversationEntry>>([])
    readonly error = new DefaultObservableValue<CodexAgentError | null>(null)
    readonly debugEnabled = new DefaultObservableValue(false)

    readonly #createSession: CodexAgentSessionFactory
    readonly #appServerUrl: () => string
    readonly #traceSink: CodexTraceSink
    readonly #modelSelectionSubscription: Terminable
    readonly #effortSelectionSubscription: Terminable

    #project: Project | null = null
    #session: CodexAgentSession | undefined
    #sessionSubscription: Unsubscribe = () => {}
    #generation = 0
    #connectPromise: Promise<void> | undefined
    #refreshPromise: Promise<void> | undefined
    #accountLoaded = false
    #modelsLoaded = false
    #messageNumber = 0

    constructor(options: CodexAgentControllerOptions = {}) {
        this.#appServerUrl = options.appServerUrl ?? defaultAppServerUrl
        this.#traceSink = (event: CodexTraceEvent) => {
            if (!this.debugEnabled.getValue()) {return}
            console.debug(`[Codex][${event.layer}] ${event.phase}`, event)
        }
        this.#createSession = options.createSession ?? ((project, traceSink) =>
            createSession(this.#appServerUrl(), project, traceSink))
        this.#modelSelectionSubscription = this.selectedModel.subscribe(() => this.#updateEffortSelection())
        this.#effortSelectionSubscription = this.models.subscribe(() => this.#reconcileModelSelection())
    }

    get project(): Project | null {return this.#project}

    bindProject(project: Project | null): void {
        if (this.#project === project) {return}
        const generation = ++this.#generation
        const previous = this.#session
        this.#sessionSubscription()
        this.#sessionSubscription = () => {}
        this.#session = undefined
        this.#project = project
        this.#connectPromise = undefined
        this.#refreshPromise = undefined
        this.#accountLoaded = false
        this.#modelsLoaded = false
        this.#resetProjectState()
        if (previous !== undefined) {
            void previous.disconnect().catch(error => {
                if (generation === this.#generation) {this.#setError("connection", error)}
            })
        }
        if (project === null) {return}
        const session = this.#createSession(project, this.#traceSink)
        this.#session = session
        this.#sessionSubscription = session.subscribe(event => this.#onSessionEvent(generation, session, event))
    }

    async ensureConnected(): Promise<void> {
        const session = this.#session
        const generation = this.#generation
        if (session === undefined) {return}
        if (this.connectionState.getValue() !== "connected") {
            if (this.#connectPromise === undefined) {
                const promise = session.connect().then(() => {
                    if (!this.#isCurrent(generation, session)) {return}
                    this.connectionState.setValue("connected")
                    this.appServerUsable.setValue(true)
                })
                this.#connectPromise = promise
                promise.finally(() => {
                    if (this.#connectPromise === promise) {this.#connectPromise = undefined}
                }).catch(() => {})
            }
            try {
                await this.#connectPromise
            } catch (error) {
                if (this.#isCurrent(generation, session)) {this.#setError("connection", error)}
                return
            }
        }
        if (!this.#isCurrent(generation, session) || !this.appServerUsable.getValue()) {return}
        await this.#refreshAccountAndModels(generation, session)
    }

    async retryConnection(): Promise<void> {
        const session = this.#session
        if (session === undefined) {return}
        try {
            await session.disconnect()
        } catch (error) {
            this.#setError("connection", error)
        }
        if (!this.#isCurrent(this.#generation, session)) {return}
        this.connectionState.setValue("disconnected")
        this.appServerUsable.setValue(false)
        this.#accountLoaded = false
        this.#modelsLoaded = false
        await this.ensureConnected()
    }

    async login(): Promise<string | undefined> {
        await this.ensureConnected()
        const session = this.#session
        if (session === undefined || !this.appServerUsable.getValue()) {return undefined}
        try {
            return (await session.startChatGPTLogin()).authUrl
        } catch (error) {
            this.#setError("auth", error)
            return undefined
        }
    }

    async logout(): Promise<void> {
        const session = this.#session
        if (session === undefined) {return}
        await this.ensureConnected()
        if (!this.appServerUsable.getValue()) {return}
        try {
            await session.logout()
            this.models.setValue([])
            this.selectedModel.setValue(null)
            this.selectedEffort.setValue(null)
        } catch (error) {
            this.#setError("auth", error)
        }
    }

    async send(text: string): Promise<boolean> {
        if (text.trim().length === 0) {return false}
        const session = this.#session
        const model = this.selectedModel.getValue()
        if (session === undefined
            || this.connectionState.getValue() !== "connected"
            || !this.appServerUsable.getValue()
            || !isAuthenticated(this.account.getValue())
            || model === null
            || this.turnRunning.getValue()) {
            return false
        }
        const generation = this.#generation
        const effort = this.selectedEffort.getValue()
        this.#appendConversation({
            type: "user",
            id: `user-${++this.#messageNumber}`,
            text
        })
        this.turnRunning.setValue(true)
        try {
            if (session.threadId === undefined) {
                await session.startThread({model})
            }
            if (!this.#isCurrent(generation, session)) {return true}
            const options: CodexStartTurnOptions = {
                model,
                ...(effort === null ? {} : {effort})
            }
            const turnId = await session.startTurn(text, options)
            if (this.#isCurrent(generation, session)) {
                this.activeTurnId.setValue(turnId)
            }
        } catch (error) {
            if (this.#isCurrent(generation, session)) {
                this.turnRunning.setValue(false)
                this.activeTurnId.setValue(null)
                this.#setError(session.threadId === undefined ? "thread" : "turn", error)
            }
        }
        return true
    }

    async interrupt(): Promise<void> {
        const session = this.#session
        const turnId = this.activeTurnId.getValue() ?? session?.activeTurnId
        if (session === undefined || turnId === undefined) {return}
        const generation = this.#generation
        try {
            await session.interruptTurn(turnId)
            if (this.#isCurrent(generation, session)) {
                this.turnRunning.setValue(false)
                this.activeTurnId.setValue(null)
            }
        } catch (error) {
            if (this.#isCurrent(generation, session)) {this.#setError("turn", error)}
        }
    }

    clearError(): void {this.error.setValue(null)}

    dispose(): void {
        this.bindProject(null)
        this.#modelSelectionSubscription.terminate()
        this.#effortSelectionSubscription.terminate()
    }

    #refreshAccountAndModels(generation: number, session: CodexAgentSession, force = false): Promise<void> {
        if (!force && this.#accountLoaded && (!isAuthenticated(this.account.getValue()) || this.#modelsLoaded)) {
            return Promise.resolve()
        }
        if (this.#refreshPromise !== undefined) {return this.#refreshPromise}
        const refresh = (async () => {
            try {
                const account = await session.readAccount()
                if (!this.#isCurrent(generation, session)) {return}
                this.account.setValue(account)
                this.#accountLoaded = true
                if (!isAuthenticated(account)) {
                    this.models.setValue([])
                    this.selectedModel.setValue(null)
                    this.selectedEffort.setValue(null)
                    this.#modelsLoaded = true
                    return
                }
                const models = await session.listModels()
                if (this.#isCurrent(generation, session)) {
                    this.models.setValue(models)
                    this.#modelsLoaded = true
                }
            } catch (error) {
                if (!this.#isCurrent(generation, session)) {return}
                if (this.account.getValue().account === null) {
                    this.#setError("auth", error)
                } else {
                    this.#setError("model-list", error)
                }
            }
        })()
        this.#refreshPromise = refresh
        refresh.finally(() => {
            if (this.#refreshPromise === refresh) {this.#refreshPromise = undefined}
        }).catch(() => {})
        return refresh
    }

    #onSessionEvent(generation: number, session: CodexAgentSession, event: CodexSessionEvent): void {
        if (!this.#isCurrent(generation, session)) {return}
        switch (event.type) {
            case "connectionChanged":
                this.connectionState.setValue(event.state)
                this.appServerUsable.setValue(event.state === "connected")
                if (event.state === "disconnected") {
                    this.turnRunning.setValue(false)
                    this.activeTurnId.setValue(null)
                }
                break
            case "accountChanged":
                this.account.setValue(event.state)
                if (!isAuthenticated(event.state)) {
                    this.models.setValue([])
                    this.selectedModel.setValue(null)
                    this.selectedEffort.setValue(null)
                    this.#modelsLoaded = true
                }
                this.#accountLoaded = true
                break
            case "loginCompleted":
                if (event.success) {
                    void this.#refreshAccountAndModels(generation, session, true)
                } else {
                    this.#setError("auth", event.error ?? "ChatGPT login failed")
                }
                break
            case "turnStarted":
                this.turnRunning.setValue(true)
                this.activeTurnId.setValue(event.turnId)
                break
            case "agentTextDelta":
                this.#appendAssistantDelta(event)
                break
            case "dynamicToolStarted":
                this.#startToolActivity(event)
                break
            case "dynamicToolCompleted":
                this.#completeToolActivity(event)
                break
            case "turnCompleted":
                this.#completeAssistantMessages(event.turnId)
                if (this.activeTurnId.getValue() === event.turnId || this.turnRunning.getValue()) {
                    this.turnRunning.setValue(false)
                    this.activeTurnId.setValue(null)
                }
                if (event.error !== null) {
                    this.#setError("turn", event.error)
                } else if (event.status === "failed" || event.status === "error") {
                    this.#setError("turn", `Codex turn ${event.status}`)
                }
                break
            case "disconnected":
                this.connectionState.setValue("disconnected")
                this.appServerUsable.setValue(false)
                this.turnRunning.setValue(false)
                this.activeTurnId.setValue(null)
                this.#accountLoaded = false
                this.#modelsLoaded = false
                this.#setError("connection", event.error ?? "Codex App Server disconnected")
                break
            case "error":
                this.#setError("protocol", event.error)
                break
            case "threadStarted":
            case "threadResumed":
                break
        }
    }

    #appendAssistantDelta(event: Extract<CodexSessionEvent, {type: "agentTextDelta"}>): void {
        const entries = this.conversation.getValue()
        const index = entries.findIndex(entry => entry.type === "assistant" && entry.itemId === event.itemId)
        if (index < 0) {
            this.conversation.setValue([...entries, {
                type: "assistant",
                itemId: event.itemId,
                turnId: event.turnId,
                text: event.text,
                complete: false
            }])
            return
        }
        const existing = entries[index]
        if (existing.type !== "assistant") {return}
        const next = entries.slice()
        next[index] = {...existing, text: existing.text + event.text}
        this.conversation.setValue(next)
    }

    #startToolActivity(event: Extract<CodexSessionEvent, {type: "dynamicToolStarted"}>): void {
        const entries = this.conversation.getValue()
        if (entries.some(entry => entry.type === "tool" && entry.itemId === event.itemId)) {return}
        this.conversation.setValue([...entries, {
            type: "tool",
            itemId: event.itemId,
            turnId: event.turnId,
            namespace: event.namespace,
            tool: event.tool,
            status: "running"
        }])
    }

    #completeToolActivity(event: Extract<CodexSessionEvent, {type: "dynamicToolCompleted"}>): void {
        const entries = this.conversation.getValue()
        const index = entries.findIndex(entry => entry.type === "tool" && entry.itemId === event.itemId)
        const status = event.success === true ? "success" : "failed"
        const error = event.success === true ? undefined : event.contentItems?.at(0)?.text
        if (index < 0) {
            this.conversation.setValue([...entries, {
                type: "tool",
                itemId: event.itemId,
                turnId: event.turnId,
                namespace: event.namespace,
                tool: event.tool,
                status,
                ...(error === undefined ? {} : {error})
            }])
            return
        }
        const existing = entries[index]
        if (existing.type !== "tool") {return}
        const next = entries.slice()
        next[index] = {
            ...existing,
            namespace: event.namespace,
            tool: event.tool,
            status,
            ...(error === undefined ? {} : {error})
        }
        this.conversation.setValue(next)
    }

    #completeAssistantMessages(turnId: string): void {
        const entries = this.conversation.getValue()
        let changed = false
        const next = entries.map(entry => {
            if (entry.type !== "assistant" || entry.turnId !== turnId || entry.complete) {return entry}
            changed = true
            return {...entry, complete: true}
        })
        if (changed) {this.conversation.setValue(next)}
    }

    #appendConversation(entry: CodexConversationEntry): void {
        this.conversation.setValue([...this.conversation.getValue(), entry])
    }

    #reconcileModelSelection(): void {
        const models = this.models.getValue()
        const current = this.selectedModel.getValue()
        const selected = models.some(model => model.model === current)
            ? current
            : models.find(model => model.isDefault)?.model ?? models.at(0)?.model ?? null
        if (selected !== current) {this.selectedModel.setValue(selected)}
        this.#updateEffortSelection()
    }

    #updateEffortSelection(): void {
        const selected = this.models.getValue().find(model => model.model === this.selectedModel.getValue())
        const current = this.selectedEffort.getValue()
        const next = selected === undefined
            ? null
            : selected.supportedReasoningEfforts.some(option => option.reasoningEffort === current)
                ? current
                : selected.defaultReasoningEffort
        if (next !== current) {this.selectedEffort.setValue(next)}
    }

    #resetProjectState(): void {
        this.connectionState.setValue("disconnected")
        this.appServerUsable.setValue(false)
        this.account.setValue(emptyAccountState)
        this.models.setValue([])
        this.selectedModel.setValue(null)
        this.selectedEffort.setValue(null)
        this.turnRunning.setValue(false)
        this.activeTurnId.setValue(null)
        this.conversation.setValue([])
        this.error.setValue(null)
        this.#accountLoaded = false
        this.#modelsLoaded = false
    }

    #setError(kind: CodexAgentErrorKind, error: unknown): void {
        this.error.setValue({kind, message: errorMessage(error)})
    }

    #isCurrent(generation: number, session: CodexAgentSession): boolean {
        return generation === this.#generation && session === this.#session
    }
}
