import {CodexJson, CodexRpcClient, CodexSession, WebSocketCodexTransport} from "@opendaw/studio-codex"
import type {
    CodexAccountState,
    CodexInitializeResponse,
    CodexLogin,
    CodexModel,
    CodexSessionEvent,
    CodexStartThreadOptions,
    CodexStartTurnOptions,
    CodexThreadInfo,
    CodexTurnItem,
    CodexTraceEvent,
    CodexTraceSink,
    CodexTransportState,
    AgentToolbox,
    JsonObject,
    Unsubscribe
} from "@opendaw/studio-codex"
import type {Project} from "@opendaw/studio-core"
import {
    DefaultObservableValue,
    isDefined,
    MutableObservableOption,
    Nullable,
    Optional,
    Provider,
    Terminable
} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {CodexActivity, CodexActivityStatus} from "./CodexActivity"
import {CodexConversationSnapshot, CodexConversationStore} from "./CodexConversationSnapshot"
import {CodexModelPreferences} from "./CodexModelPreferences"

export type CodexConversationEntry =
    | {
        readonly type: "user"
        readonly id: string
        readonly text: string
        readonly images?: ReadonlyArray<string>
    }
    | {
        readonly type: "assistant"
        readonly itemId: string
        readonly turnId: string
        readonly text: string
        readonly complete: boolean
    }
    | {
        readonly type: "reasoning"
        readonly itemId: string
        readonly turnId: string
        readonly summaryIndex: Nullable<number>
        readonly text: string
        readonly complete: boolean
    }
    | {
        readonly type: "notice"
        readonly id: string
        readonly text: string
    }
    | {
        readonly type: "activity"
        readonly itemId: string
        readonly turnId: string
        readonly kind: string
        readonly label: string
        readonly status: "running" | "success" | "failed"
        readonly item: JsonObject
        readonly error?: string
    }

export type CodexAgentErrorKind = "connection" | "auth" | "model-list" | "thread" | "turn" | "protocol"

export type CodexAgentError = {
    readonly kind: CodexAgentErrorKind
    readonly message: string
}

export type CodexAgentSession = {
    readonly threadId: Optional<string>
    readonly activeTurnId: Optional<string>
    connect(): Promise<CodexInitializeResponse>
    disconnect(): Promise<void>
    subscribe(listener: (event: CodexSessionEvent) => void): Unsubscribe
    readAccount(): Promise<CodexAccountState>
    listModels(): Promise<ReadonlyArray<CodexModel>>
    startChatGPTLogin(): Promise<CodexLogin>
    logout(): Promise<void>
    startThread(options?: CodexStartThreadOptions): Promise<CodexThreadInfo>
    resumeThread(threadId: string): Promise<CodexThreadInfo>
    closeThread(): Promise<void>
    startTurn(text: string, options?: CodexStartTurnOptions): Promise<string>
    interruptTurn(turnId?: string): Promise<void>
}

export type CodexAgentSessionFactory = (project: Project, traceSink: CodexTraceSink) => CodexAgentSession

export type CodexAgentControllerOptions = {
    readonly createSession?: CodexAgentSessionFactory
    readonly appServerUrl?: () => string
    readonly createToolboxes?: (project: Project) => ReadonlyArray<AgentToolbox>
    readonly developerInstructions?: Provider<string>
    readonly preferences?: CodexModelPreferences
}

type EventOrigin = "main" | "subagent" | "retired"

const emptyAccountState = {
    account: null,
    exists: false,
    accountType: null,
    authMode: null,
    email: null,
    planType: null,
    requiresOpenaiAuth: true
} as const

const effortsByStrength: ReadonlyArray<string> = ["none", "minimal", "low", "medium", "high", "xhigh"]

const {errorMessage, isObjectRecord: isRecord} = CodexJson

const preferredModel = (models: ReadonlyArray<CodexModel>): Nullable<string> => {
    const visible = models.filter(model => !model.hidden)
    return (visible.find(model => model.isDefault) ?? visible.at(0) ?? models.at(0))?.model ?? null
}

const strongestEffort = (model: CodexModel): string => model.supportedReasoningEfforts
    .map(option => option.reasoningEffort)
    .filter(effort => effortsByStrength.includes(effort))
    .sort((left, right) => effortsByStrength.indexOf(right) - effortsByStrength.indexOf(left))
    .at(0) ?? model.defaultReasoningEffort

const activityError = (item: CodexTurnItem): Optional<string> => {
    if (typeof item.error === "string" && item.error.length > 0) {return item.error}
    if (isRecord(item.error) && typeof item.error.message === "string" && item.error.message.length > 0) {
        return item.error.message
    }
    if (item.type === "dynamicToolCall" && item.success === false && Array.isArray(item.contentItems)) {
        const content = item.contentItems.find(value =>
            isRecord(value) && value.type === "inputText" && typeof value.text === "string")
        if (isRecord(content) && typeof content.text === "string" && content.text.length > 0) {
            return content.text
        }
    }
    return undefined
}

const activityStatus = (item: CodexTurnItem): "success" | "failed" => {
    const status = typeof item.status === "string" ? item.status.toLowerCase() : undefined
    return item.success === false
        || status === "failed" || status === "error" || status === "declined"
        || status === "cancelled" || status === "canceled"
        || isDefined(activityError(item)) ? "failed" : "success"
}

const isActivityItem = (item: CodexTurnItem): boolean =>
    item.type !== "userMessage" && item.type !== "agentMessage" && item.type !== "reasoning"

const isAuthenticated = (account: CodexAccountState): boolean => isDefined(account.account)

const defaultAppServerUrl = (): string => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.host}/codex-app-server`
}

const createSession = (url: string, toolboxes: ReadonlyArray<AgentToolbox>, traceSink: CodexTraceSink,
                       developerInstructions?: string): CodexAgentSession => {
    const transport = new WebSocketCodexTransport(url, undefined, traceSink)
    const rpc = new CodexRpcClient(transport, traceSink)
    return new CodexSession({rpc, toolboxes, traceSink, developerInstructions})
}

export class CodexAgentController {
    readonly connectionState = new DefaultObservableValue<CodexTransportState>("disconnected")
    readonly appServerUsable = new DefaultObservableValue(false)
    readonly account = new DefaultObservableValue<CodexAccountState>(emptyAccountState)
    readonly models = new DefaultObservableValue<ReadonlyArray<CodexModel>>([])
    readonly selectedModel = new MutableObservableOption<string>()
    readonly selectedEffort = new MutableObservableOption<string>()
    readonly turnRunning = new DefaultObservableValue(false)
    readonly activeTurnId = new MutableObservableOption<string>()
    readonly conversation = new DefaultObservableValue<ReadonlyArray<CodexConversationEntry>>([])
    readonly error = new MutableObservableOption<CodexAgentError>()
    readonly debugEnabled = new DefaultObservableValue(false)
    readonly loginPending = new DefaultObservableValue(false)
    readonly queuedMessage = new MutableObservableOption<string>()
    readonly queuedImages = new DefaultObservableValue<ReadonlyArray<string>>([])

    readonly #createSession: CodexAgentSessionFactory
    readonly #appServerUrl: () => string
    readonly #traceSink: CodexTraceSink
    readonly #modelSelectionSubscription: Terminable
    readonly #effortSelectionSubscription: Terminable
    readonly #queueSubscription: Terminable
    readonly #conversationSubscription: Terminable
    readonly #preferences: CodexModelPreferences
    readonly #subagents: Map<string, string>
    readonly #retiredThreads: Set<string>

    #project: Nullable<Project> = null
    #store: Optional<CodexConversationStore>
    #restoring = false
    #touched = false
    #session: Optional<CodexAgentSession>
    #sessionSubscription: Unsubscribe = () => {}
    #generation = 0
    #connectPromise: Optional<Promise<void>>
    #refreshPromise: Optional<Promise<void>>
    #accountLoaded = false
    #modelsLoaded = false
    #messageNumber = 0
    #turnSerial = 0
    #lastThreadId: Optional<string>

    constructor(options: CodexAgentControllerOptions = {}) {
        this.#appServerUrl = options.appServerUrl ?? defaultAppServerUrl
        this.#traceSink = (event: CodexTraceEvent) => {
            if (!this.debugEnabled.getValue()) {return}
            console.debug(`[Codex][${event.layer}] ${event.phase}`, event)
        }
        const createToolboxes = options.createToolboxes ?? (() => [])
        this.#createSession = options.createSession ?? ((project, traceSink) =>
            createSession(this.#appServerUrl(), createToolboxes(project), traceSink, options.developerInstructions?.()))
        this.#modelSelectionSubscription = this.selectedModel.subscribe(() => this.#updateEffortSelection())
        this.#effortSelectionSubscription = this.models.subscribe(() => this.#reconcileModelSelection())
        this.#queueSubscription = this.turnRunning.subscribe(() => this.#flushQueue())
        this.#conversationSubscription = this.conversation.subscribe(() => {this.#touched = true})
        this.#preferences = options.preferences ?? CodexModelPreferences.local
        this.#subagents = new Map()
        this.#retiredThreads = new Set()
    }

    get project(): Nullable<Project> {return this.#project}

    get threadId(): Optional<string> {return this.#session?.threadId}

    bindProject(project: Nullable<Project>, store?: CodexConversationStore): void {
        if (this.#project === project) {return}
        void this.persist()
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
        this.#store = store
        this.#resetProjectState()
        if (isDefined(previous)) {
            void previous.disconnect().catch(error => {
                if (generation === this.#generation) {this.#setError("connection", error)}
            })
        }
        if (isDefined(previous)) {this.#ensureSession()}
        this.#restore(generation, store)
    }

    persist(): Promise<void> {
        const store = this.#store
        if (!isDefined(store) || this.#restoring || !this.#touched) {return Promise.resolve()}
        const snapshot = CodexConversationSnapshot.create(this.#lastThreadId ?? null, this.conversation.getValue())
        return Promises.tryCatch(store.save(snapshot)).then(saved => {
            if (saved.status === "rejected") {console.warn("Could not save the agent conversation", saved.error)}
        })
    }

    async newConversation(): Promise<void> {
        this.queuedMessage.clear()
        this.queuedImages.setValue([])
        if (this.turnRunning.getValue()) {await this.interrupt()}
        const session = this.#session
        const threadId = session?.threadId ?? this.#lastThreadId
        if (isDefined(threadId)) {this.#retiredThreads.add(threadId)}
        this.#lastThreadId = undefined
        this.#subagents.clear()
        this.turnRunning.setValue(false)
        this.activeTurnId.clear()
        this.error.clear()
        this.conversation.setValue([])
        this.#touched = true
        if (isDefined(session)) {await Promises.tryCatch(session.closeThread())}
        await this.persist()
    }

    selectModel(model: string): void {
        this.selectedModel.wrap(model)
        this.#savePreference()
    }

    selectEffort(effort: string): void {
        this.selectedEffort.wrap(effort)
        this.#savePreference()
    }

    subagentName(threadId: string): Optional<string> {return this.#subagents.get(threadId)}

    async ensureConnected(): Promise<void> {
        const session = this.#ensureSession()
        const generation = this.#generation
        if (!isDefined(session)) {return}
        if (this.connectionState.getValue() !== "connected") {
            const connected = await Promises.tryCatch(this.#connectPromise ?? this.#connect(generation, session))
            if (connected.status === "rejected") {
                if (this.#isCurrent(generation, session)) {this.#setError("connection", connected.error)}
                return
            }
        }
        if (!this.#isCurrent(generation, session) || !this.appServerUsable.getValue()) {return}
        await this.#refreshAccountAndModels(generation, session)
    }

    async retryConnection(): Promise<void> {
        const session = this.#ensureSession()
        if (!isDefined(session)) {return}
        const disconnected = await Promises.tryCatch(session.disconnect())
        if (disconnected.status === "rejected") {this.#setError("connection", disconnected.error)}
        if (!this.#isCurrent(this.#generation, session)) {return}
        this.connectionState.setValue("disconnected")
        this.appServerUsable.setValue(false)
        this.#accountLoaded = false
        this.#modelsLoaded = false
        await this.ensureConnected()
    }

    async login(): Promise<Optional<string>> {
        await this.ensureConnected()
        const session = this.#session
        if (!isDefined(session) || !this.appServerUsable.getValue()) {return undefined}
        const login = await Promises.tryCatch(session.startChatGPTLogin())
        if (login.status === "resolved") {
            this.loginPending.setValue(true)
            return login.value.authUrl
        }
        this.#setError("auth", login.error)
        return undefined
    }

    async logout(): Promise<void> {
        const session = this.#ensureSession()
        if (!isDefined(session)) {return}
        await this.ensureConnected()
        if (!this.appServerUsable.getValue()) {return}
        const loggedOut = await Promises.tryCatch(session.logout())
        if (loggedOut.status === "rejected") {
            this.#setError("auth", loggedOut.error)
            return
        }
        this.models.setValue([])
        this.selectedModel.clear()
        this.selectedEffort.clear()
    }

    // While a turn runs the message is queued and sent once the turn ends.
    async send(text: string, images: ReadonlyArray<string> = []): Promise<boolean> {
        if (text.trim().length === 0 && images.length === 0) {return false}
        if (this.turnRunning.getValue()) {
            this.queuedMessage.wrap(this.queuedMessage.mapOr(queued =>
                queued.length === 0 ? text : text.length === 0 ? queued : `${queued}\n\n${text}`, text))
            if (images.length > 0) {this.queuedImages.setValue([...this.queuedImages.getValue(), ...images])}
            return true
        }
        const session = this.#session
        const model = this.selectedModel.unwrapOrNull()
        if (!isDefined(session)
            || this.connectionState.getValue() !== "connected"
            || !this.appServerUsable.getValue()
            || !isAuthenticated(this.account.getValue())
            || !isDefined(model)
            || this.turnRunning.getValue()) {
            return false
        }
        const generation = this.#generation
        const effort = this.selectedEffort.unwrapOrNull()
        const userId = `user-${++this.#messageNumber}`
        this.#appendConversation({type: "user", id: userId, text, ...(images.length > 0 ? {images} : {})})
        const serial = ++this.#turnSerial
        this.turnRunning.setValue(true)
        const started = await Promises.tryCatch(
            this.#startTurn(generation, session, userId, text, images, model, effort))
        if (started.status === "rejected" && this.#isCurrent(generation, session) && serial === this.#turnSerial) {
            this.turnRunning.setValue(false)
            this.activeTurnId.clear()
            this.#setError(isDefined(session.threadId) ? "turn" : "thread", started.error)
        }
        return true
    }

    async interrupt(): Promise<void> {
        const session = this.#session
        const turnId = this.activeTurnId.unwrapOrUndefined() ?? session?.activeTurnId
        if (!isDefined(session) || !isDefined(turnId)) {return}
        const generation = this.#generation
        const serial = this.#turnSerial
        const interrupted = await Promises.tryCatch(session.interruptTurn(turnId))
        if (!this.#isCurrent(generation, session)) {return}
        if (interrupted.status === "rejected") {
            this.#setError("turn", interrupted.error)
            return
        }
        if (serial !== this.#turnSerial) {return}
        this.turnRunning.setValue(false)
        this.activeTurnId.clear()
    }

    cancelQueued(): Optional<string> {
        const text = this.queuedMessage.unwrapOrUndefined()
        this.queuedMessage.clear()
        this.queuedImages.setValue([])
        return text
    }

    cancelLogin(): void {this.loginPending.setValue(false)}

    clearError(): void {this.error.clear()}

    dispose(): void {
        this.bindProject(null)
        this.#modelSelectionSubscription.terminate()
        this.#effortSelectionSubscription.terminate()
        this.#queueSubscription.terminate()
        this.#conversationSubscription.terminate()
    }

    #restore(generation: number, store: Optional<CodexConversationStore>): void {
        if (!isDefined(store)) {return}
        this.#restoring = true
        void Promises.tryCatch(store.load()).then(loaded => {
            if (generation !== this.#generation) {return}
            this.#restoring = false
            if (loaded.status === "rejected") {
                console.warn("Could not load the agent conversation", loaded.error)
                return
            }
            loaded.value.ifSome(snapshot => this.#applySnapshot(snapshot))
        })
    }

    #applySnapshot({threadId, entries}: CodexConversationSnapshot): void {
        if (this.conversation.getValue().length > 0 || this.turnRunning.getValue() || isDefined(this.#lastThreadId)) {return}
        this.#lastThreadId = threadId ?? undefined
        this.#messageNumber = entries.reduce((max, entry) => {
            const match = entry.type === "user" || entry.type === "notice" ? /-(\d+)$/.exec(entry.id) : null
            return isDefined(match) ? Math.max(max, Number(match[1])) : max
        }, this.#messageNumber)
        this.conversation.setValue(entries)
        this.#touched = false
    }

    #savePreference(): void {
        const model = this.selectedModel.unwrapOrNull()
        if (isDefined(model)) {this.#preferences.save({model, effort: this.selectedEffort.unwrapOrNull()})}
    }

    #originOf(threadId: string): EventOrigin {
        if (this.#retiredThreads.has(threadId)) {return "retired"}
        const main = this.#session?.threadId ?? this.#lastThreadId
        return !isDefined(main) || main === threadId ? "main" : "subagent"
    }

    #flushQueue(): void {
        if (this.turnRunning.getValue()) {return}
        const text = this.queuedMessage.unwrapOrNull()
        if (!isDefined(text)) {return}
        const images = this.queuedImages.getValue()
        this.queuedMessage.clear()
        this.queuedImages.setValue([])
        void this.send(text, images).then(accepted => {
            if (accepted || !this.queuedMessage.isEmpty()) {return}
            this.queuedMessage.wrap(text)
            this.queuedImages.setValue(images)
        })
    }

    #connect(generation: number, session: CodexAgentSession): Promise<void> {
        const promise = session.connect().then(() => {
            if (!this.#isCurrent(generation, session)) {return}
            this.connectionState.setValue("connected")
            this.appServerUsable.setValue(true)
            this.error.clear()
        })
        this.#connectPromise = promise
        promise.finally(() => {
            if (this.#connectPromise === promise) {this.#connectPromise = undefined}
        }).catch(() => {})
        return promise
    }

    async #startTurn(generation: number, session: CodexAgentSession, userId: string, text: string,
                     images: ReadonlyArray<string>, model: string, effort: Nullable<string>): Promise<void> {
        if (!isDefined(session.threadId)) {await this.#openThread(generation, session, userId, model)}
        if (!this.#isCurrent(generation, session)) {return}
        const options: CodexStartTurnOptions = {
            model, summary: "auto", ...(isDefined(effort) ? {effort} : {}), ...(images.length > 0 ? {images} : {})
        }
        const turnId = await session.startTurn(text, options)
        if (this.#isCurrent(generation, session)) {this.activeTurnId.wrap(turnId)}
    }

    async #openThread(generation: number, session: CodexAgentSession, userId: string, model: string): Promise<void> {
        const previous = this.#lastThreadId
        if (isDefined(previous)) {
            const resumed = await Promises.tryCatch(session.resumeThread(previous))
            if (resumed.status === "resolved" || !this.#isCurrent(generation, session)) {return}
            this.#insertNoticeBefore(userId, "Previous context was lost. This is a new conversation.")
        }
        await session.startThread({model})
    }

    #insertNoticeBefore(entryId: string, text: string): void {
        const entries = this.conversation.getValue()
        const index = entries.findIndex(entry => entry.type === "user" && entry.id === entryId)
        const notice: CodexConversationEntry = {type: "notice", id: `notice-${++this.#messageNumber}`, text}
        const position = index < 0 ? entries.length : index
        this.conversation.setValue([...entries.slice(0, position), notice, ...entries.slice(position)])
    }

    async #loadAccountAndModels(generation: number, session: CodexAgentSession): Promise<void> {
        const account = await session.readAccount()
        if (!this.#isCurrent(generation, session)) {return}
        this.account.setValue(account)
        this.#accountLoaded = true
        if (!isAuthenticated(account)) {
            this.models.setValue([])
            this.selectedModel.clear()
            this.selectedEffort.clear()
            this.#modelsLoaded = true
            return
        }
        const models = await session.listModels()
        if (this.#isCurrent(generation, session)) {
            this.models.setValue(models)
            this.#modelsLoaded = true
        }
    }

    #refreshAccountAndModels(generation: number, session: CodexAgentSession, force = false): Promise<void> {
        if (!force && this.#accountLoaded && (!isAuthenticated(this.account.getValue()) || this.#modelsLoaded)) {
            return Promise.resolve()
        }
        if (isDefined(this.#refreshPromise)) {return this.#refreshPromise}
        const refresh = Promises.tryCatch(this.#loadAccountAndModels(generation, session)).then(loaded => {
            if (loaded.status === "resolved" || !this.#isCurrent(generation, session)) {return}
            this.#setError(isAuthenticated(this.account.getValue()) ? "model-list" : "auth", loaded.error)
        })
        this.#refreshPromise = refresh
        refresh.finally(() => {
            if (this.#refreshPromise === refresh) {this.#refreshPromise = undefined}
        }).catch(() => {})
        return refresh
    }

    #onSessionEvent(generation: number, session: CodexAgentSession, event: CodexSessionEvent): void {
        if (!this.#isCurrent(generation, session)) {return}
        switch (event.type) {
            case "turnStarted":
            case "agentTextDelta":
            case "reasoningSummaryDelta":
            case "reasoningSummaryPartAdded":
            case "turnCompleted":
                if (this.#originOf(event.threadId) !== "main") {return}
                break
            case "itemStarted":
            case "itemCompleted":
                if (this.#originOf(event.threadId) === "retired") {return}
                break
        }
        switch (event.type) {
            case "connectionChanged":
                this.connectionState.setValue(event.state)
                this.appServerUsable.setValue(event.state === "connected")
                if (event.state === "connected") {this.error.clear()}
                if (event.state === "disconnected") {
                    this.turnRunning.setValue(false)
                    this.activeTurnId.clear()
                }
                break
            case "accountChanged":
                this.account.setValue(event.state)
                if (isAuthenticated(event.state)) {this.loginPending.setValue(false)}
                if (!isAuthenticated(event.state)) {
                    this.models.setValue([])
                    this.selectedModel.clear()
                    this.selectedEffort.clear()
                    this.#modelsLoaded = true
                }
                this.#accountLoaded = true
                break
            case "loginCompleted":
                this.loginPending.setValue(false)
                if (event.success) {
                    void this.#refreshAccountAndModels(generation, session, true)
                } else {
                    this.#setError("auth", event.error ?? "ChatGPT login failed")
                }
                break
            case "turnStarted":
                this.turnRunning.setValue(true)
                this.activeTurnId.wrap(event.turnId)
                break
            case "agentTextDelta":
                this.#appendAssistantDelta(event)
                break
            case "reasoningSummaryDelta":
            case "reasoningSummaryPartAdded":
                this.#appendReasoningSummary(event)
                break
            case "itemStarted":
                this.#startActivity(event)
                break
            case "itemCompleted":
                this.#completeActivity(event)
                break
            case "turnCompleted":
                this.#completeAssistantMessages(event.turnId)
                this.#completeReasoningSummaries(event.turnId)
                if (this.activeTurnId.contains(event.turnId) || this.turnRunning.getValue()) {
                    this.turnRunning.setValue(false)
                    this.activeTurnId.clear()
                }
                if (isDefined(event.error)) {
                    this.#setError("turn", event.error)
                } else if (event.status === "failed" || event.status === "error") {
                    this.#setError("turn", `Codex turn ${event.status}`)
                }
                void this.persist()
                break
            case "disconnected":
                this.connectionState.setValue("disconnected")
                this.appServerUsable.setValue(false)
                this.turnRunning.setValue(false)
                this.activeTurnId.clear()
                this.loginPending.setValue(false)
                this.#accountLoaded = false
                this.#modelsLoaded = false
                this.#setError("connection", event.error ?? "Codex App Server disconnected")
                break
            case "error":
                this.#setError("protocol", event.error)
                break
            case "threadStarted":
            case "threadResumed":
                this.#lastThreadId = event.thread.threadId
                break
            case "subagentStarted":
                this.#subagents.set(event.agent.threadId, CodexActivity.agentName(event.agent) ?? "subagent")
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

    #appendReasoningSummary(event: Extract<CodexSessionEvent, {
        type: "reasoningSummaryDelta" | "reasoningSummaryPartAdded"
    }>): void {
        const entries = this.conversation.getValue()
        const index = entries.findIndex(entry => entry.type === "reasoning"
            && entry.itemId === event.itemId
            && entry.summaryIndex === event.summaryIndex)
        if (index < 0) {
            if (event.text.length === 0) {return}
            this.#appendConversation({
                type: "reasoning",
                itemId: event.itemId,
                turnId: event.turnId,
                summaryIndex: event.summaryIndex,
                text: event.text,
                complete: false
            })
            return
        }
        const existing = entries[index]
        if (existing.type !== "reasoning") {return}
        const next = entries.slice()
        next[index] = {...existing, text: existing.text + event.text}
        this.conversation.setValue(next)
    }

    #learnSubagent(item: CodexTurnItem): void {
        if (item.type !== "subAgentActivity" || typeof item.agentThreadId !== "string") {return}
        const name = CodexActivity.agentName({path: typeof item.agentPath === "string" ? item.agentPath : null, nickname: null, role: null})
        if (isDefined(name) && !this.#subagents.has(item.agentThreadId)) {this.#subagents.set(item.agentThreadId, name)}
    }

    #activityLabel(item: CodexTurnItem, status: CodexActivityStatus, threadId: string): string {
        const label = CodexActivity.label(item, status, agentThreadId => this.subagentName(agentThreadId))
        if (this.#originOf(threadId) !== "subagent") {return label}
        return `[${this.subagentName(threadId) ?? "subagent"}] ${label}`
    }

    #startActivity(event: Extract<CodexSessionEvent, {type: "itemStarted"}>): void {
        if (!isActivityItem(event.item)) {return}
        this.#learnSubagent(event.item)
        const entries = this.conversation.getValue()
        if (entries.some(entry => entry.type === "activity" && entry.itemId === event.item.id)) {return}
        this.#appendConversation({
            type: "activity",
            itemId: event.item.id,
            turnId: event.turnId,
            kind: event.item.type,
            label: this.#activityLabel(event.item, "running", event.threadId),
            status: "running",
            item: event.item
        })
    }

    #completeActivity(event: Extract<CodexSessionEvent, {type: "itemCompleted"}>): void {
        if (!isActivityItem(event.item)) {return}
        this.#learnSubagent(event.item)
        const entries = this.conversation.getValue()
        const index = entries.findIndex(entry => entry.type === "activity" && entry.itemId === event.item.id)
        const status = activityStatus(event.item)
        const error = activityError(event.item)
        const label = this.#activityLabel(event.item, status, event.threadId)
        if (index < 0) {
            this.#appendConversation({
                type: "activity",
                itemId: event.item.id,
                turnId: event.turnId,
                kind: event.item.type,
                label,
                status,
                item: event.item,
                ...(isDefined(error) ? {error} : {})
            })
            return
        }
        const existing = entries[index]
        if (existing.type !== "activity") {return}
        const next = entries.slice()
        next[index] = {
            ...existing,
            kind: event.item.type,
            label,
            status,
            item: event.item,
            error
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

    #completeReasoningSummaries(turnId: string): void {
        const entries = this.conversation.getValue()
        let changed = false
        const next = entries.map(entry => {
            if (entry.type !== "reasoning" || entry.turnId !== turnId || entry.complete) {return entry}
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
        const current = this.selectedModel.unwrapOrNull()
        const saved = this.#preferences.load().unwrapOrNull()?.model
        const available = (candidate: Optional<Nullable<string>>): candidate is string =>
            isDefined(candidate) && models.some(model => model.model === candidate)
        const selected = available(current) ? current : available(saved) ? saved : preferredModel(models)
        if (selected !== current) {this.selectedModel.wrap(selected)}
        this.#updateEffortSelection()
    }

    #updateEffortSelection(): void {
        const selected = this.models.getValue().find(model => model.model === this.selectedModel.unwrapOrNull())
        const current = this.selectedEffort.unwrapOrNull()
        const supported = (effort: Nullable<string>): effort is string => isDefined(selected) && isDefined(effort)
            && selected.supportedReasoningEfforts.some(option => option.reasoningEffort === effort)
        const saved = this.#preferences.load().unwrapOrNull()
        const savedEffort = isDefined(saved) && saved.model === selected?.model ? saved.effort : null
        const next = !isDefined(selected) ? null
            : supported(current) ? current : supported(savedEffort) ? savedEffort : strongestEffort(selected)
        if (next !== current) {this.selectedEffort.wrap(next)}
    }

    #resetProjectState(): void {
        this.queuedMessage.clear()
        this.queuedImages.setValue([])
        this.connectionState.setValue("disconnected")
        this.appServerUsable.setValue(false)
        this.account.setValue(emptyAccountState)
        this.models.setValue([])
        this.selectedModel.clear()
        this.selectedEffort.clear()
        this.turnRunning.setValue(false)
        this.activeTurnId.clear()
        this.conversation.setValue([])
        this.error.clear()
        this.loginPending.setValue(false)
        this.#lastThreadId = undefined
        this.#subagents.clear()
        this.#retiredThreads.clear()
        this.#restoring = false
        this.#touched = false
        this.#accountLoaded = false
        this.#modelsLoaded = false
    }

    #ensureSession(): Optional<CodexAgentSession> {
        if (isDefined(this.#session)) {return this.#session}
        const project = this.#project
        if (!isDefined(project)) {return undefined}
        const generation = this.#generation
        const session = this.#createSession(project, this.#traceSink)
        this.#session = session
        this.#sessionSubscription = session.subscribe(event => this.#onSessionEvent(generation, session, event))
        return session
    }

    #setError(kind: CodexAgentErrorKind, error: unknown): void {
        this.error.wrap({kind, message: errorMessage(error)})
    }

    #isCurrent(generation: number, session: CodexAgentSession): boolean {
        return generation === this.#generation && session === this.#session
    }
}
