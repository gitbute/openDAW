import css from "./CodexAgentPanel.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Clipboard, Events, Html} from "@opendaw/lib-dom"
import {DefaultObservableValue, isDefined, Lifecycle, Nullable, Optional, tryCatch} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {Colors, IconSymbol} from "@opendaw/studio-enums"
import {MenuItem} from "@opendaw/studio-core"
import {renderMarkdown} from "@opendaw/studio-markdown"
import {StudioService} from "@/service/StudioService"
import type {CodexAgentController} from "@/codex/CodexAgentController"
import {
    CodexActivity,
    CodexActivityEntry,
    CodexConversationBlock,
    CodexMessageEntry,
    CodexReasoningEntry,
    CodexStepEntry
} from "@/codex/CodexActivity"
import {
    CodexTranscriptFollowState,
    serializeCodexConversation,
    serializeCodexConversationCompact
} from "@/codex/CodexTranscript"
import {Button} from "@/ui/components/Button"
import {Icon, IconCartridge} from "@/ui/components/Icon"
import {MenuButton} from "@/ui/components/MenuButton"
import {installScrollbars} from "@/ui/components/Scrollbars"
import {Dialogs} from "@/ui/components/dialogs"
import {CodexImageInput} from "@/codex/CodexImageInput"

const className = Html.adoptStyleSheet(css, "CodexAgentPanel")

const AppServerCommand = "codex app-server --listen ws://127.0.0.1:4500"

const Suggestions: ReadonlyArray<string> = [
    "Make an 8-bar lo-fi beat at 84 bpm",
    "Add a bassline that follows the chords",
    "Listen to the mix and fix what sounds off"
]

const FixtureMode: Nullable<string> = import.meta.env.DEV ? (() => {
    const fromUrl = new URLSearchParams(location.search).get("codex-fixture")
    const stored = tryCatch(() => {
        if (isDefined(fromUrl)) {sessionStorage.setItem("codex-fixture", fromUrl)}
        return sessionStorage.getItem("codex-fixture")
    })
    return fromUrl ?? (stored.status === "success" ? stored.value : null)
})() : null

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

type PanelState = "offline" | "connecting" | "signed-out" | "login" | "ready"

type View<T> = {
    readonly element: HTMLElement
    update(value: T): void
}

type StepsInput = {readonly entries: ReadonlyArray<CodexStepEntry>, readonly live: boolean}

type BlockInput = {readonly block: CodexConversationBlock, readonly live: boolean}

const StepRowLimit = 40

const capitalize = (text: string): string => text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1)

const openImage = (url: string, title: string, origin: Element): void => {
    void Promises.tryCatch(Dialogs.show({
        headline: title, origin, growWidth: true, okText: "Close",
        content: <img src={url} alt={title}
                      style={{display: "block", maxWidth: "min(80vw, 960px)", maxHeight: "70vh", imageRendering: "auto"}}/>
    }))
}

type Thumbnail = {readonly url: string, readonly title: string}

const thumbnailsOf = (entry: CodexActivityEntry): ReadonlyArray<Thumbnail> =>
    CodexActivity.images(entry.item).map(url => ({url, title: entry.label}))

const renderThumbnails = (container: HTMLElement, thumbnails: ReadonlyArray<Thumbnail>): void => {
    container.replaceChildren(...thumbnails.map(({url, title}) => {
        const image: HTMLImageElement = <img src={url} alt={title} title="Click to enlarge" draggable={false}/>
        image.onclick = (event: MouseEvent) => {
            event.stopPropagation()
            openImage(url, title, image)
        }
        return image
    }))
    container.classList.toggle("hidden", thumbnails.length === 0)
}

const setOptionalText = (element: HTMLElement, text: Optional<string>): void => {
    element.textContent = text ?? ""
    element.classList.toggle("hidden", !isDefined(text))
}

const createActivityRow = (): View<CodexActivityEntry> => {
    const glyph: HTMLElement = <span className="glyph"/>
    const label: HTMLElement = <span className="step-label"/>
    const line: HTMLElement = <div className="step-line">{glyph}{label}<Icon symbol={IconSymbol.Dropdown} className="chevron"/></div>
    const thumbs: HTMLElement = <div className="thumbs hidden"/>
    const args: HTMLElement = <pre className="args hidden"/>
    const codeSummary: HTMLElement = <summary/>
    const code: HTMLElement = <pre className="code"/>
    const codeBlock: HTMLDetailsElement = <details className="code-block hidden">{codeSummary}{code}</details>
    const result: HTMLElement = <pre className="result hidden"/>
    const details: HTMLElement = <div className="step-details hidden">{args}{codeBlock}{result}</div>
    const element: HTMLElement = <div className="step activity">{line}{thumbs}{details}</div>
    let current: Optional<CodexActivityEntry> = undefined
    let imagesKey = ""
    line.onclick = () => {
        if (!element.classList.contains("expandable")) {return}
        element.classList.toggle("open", details.classList.toggle("hidden") === false)
    }
    return {
        element,
        update: entry => {
            if (entry === current) {return}
            current = entry
            const {item, status} = entry
            glyph.className = `glyph ${status}`
            label.textContent = entry.label
            label.title = entry.label
            element.classList.toggle("failed", status === "failed")
            const argsText = CodexActivity.argumentsText(item)
            const script = CodexActivity.scriptCode(item)
            const resultText = status === "running" ? undefined : CodexActivity.resultText(item) ?? entry.error
            setOptionalText(args, argsText)
            code.textContent = script ?? ""
            codeSummary.textContent = isDefined(script) ? `Script · ${script.split("\n").length} lines` : ""
            codeBlock.classList.toggle("hidden", !isDefined(script))
            setOptionalText(result, resultText)
            element.classList.toggle("expandable", isDefined(argsText) || isDefined(script) || isDefined(resultText))
            const images = thumbnailsOf(entry)
            const nextKey = images.map(({url}) => url).join("|")
            if (nextKey !== imagesKey) {
                imagesKey = nextKey
                renderThumbnails(thumbs, images)
            }
        }
    }
}

const createReasoningRow = (): View<CodexReasoningEntry> => {
    const label: HTMLElement = <span className="step-label"/>
    const line: HTMLElement = <div className="step-line"><span className="glyph thought"/>{label}
        <Icon symbol={IconSymbol.Dropdown} className="chevron"/></div>
    const body: HTMLElement = <div className="step-details reasoning-body markdown hidden"/>
    const element: HTMLElement = <div className="step reasoning">{line}{body}</div>
    let text = ""
    line.onclick = () => {
        if (!element.classList.contains("expandable")) {return}
        element.classList.toggle("open", body.classList.toggle("hidden") === false)
    }
    return {
        element,
        update: entry => {
            if (entry.text === text) {return}
            text = entry.text
            const headline = CodexActivity.reasoningHeadline(text)
            const content = CodexActivity.reasoningBody(text)
            label.textContent = headline.length > 0 ? headline : "Thinking"
            element.classList.toggle("expandable", content.length > 0)
            renderMarkdown(body, content)
        }
    }
}

const createStepsView = (): View<StepsInput> => {
    const glyph: HTMLElement = <span className="glyph"/>
    const label: HTMLElement = <span className="steps-label"/>
    const count: HTMLElement = <span className="steps-count"/>
    const failures: HTMLElement = <span className="steps-failed hidden"/>
    const header: HTMLButtonElement = (
        <button className="steps-header" type="button">
            <Icon symbol={IconSymbol.Dropdown} className="chevron"/>{glyph}{label}{failures}{count}
        </button>
    )
    const strip: HTMLElement = <div className="thumbs strip hidden"/>
    const more: HTMLButtonElement = <button className="steps-more hidden" type="button"/>
    const rows: HTMLElement = <div className="steps-rows"/>
    const element: HTMLElement = <div className="steps">{header}{strip}{more}{rows}</div>
    const rowViews = new Map<string, View<CodexStepEntry>>()
    let userCollapsed: Optional<boolean> = undefined
    let running = false
    let stripKey = ""
    let showAll = false
    let latest: ReadonlyArray<CodexStepEntry> = []
    const applyCollapsed = () => element.classList.toggle("collapsed", userCollapsed ?? !running)
    const renderRows = () => {
        if (element.classList.contains("collapsed")) {return}
        const skipped = showAll ? 0 : Math.max(0, latest.length - StepRowLimit)
        more.textContent = `Show ${skipped} earlier step${skipped === 1 ? "" : "s"}`
        more.classList.toggle("hidden", skipped === 0)
        reconcile(rows, rowViews, latest.slice(skipped), CodexActivity.entryKey, createRow, (view, entry) => view.update(entry))
    }
    header.onclick = () => {
        userCollapsed = !element.classList.contains("collapsed")
        applyCollapsed()
        renderRows()
    }
    more.onclick = () => {
        showAll = true
        renderRows()
    }
    const createRow = (entry: CodexStepEntry): View<CodexStepEntry> => {
        if (entry.type === "activity") {
            const view = createActivityRow()
            return {element: view.element, update: next => {if (next.type === "activity") {view.update(next)}}}
        }
        const view = createReasoningRow()
        return {element: view.element, update: next => {if (next.type === "reasoning") {view.update(next)}}}
    }
    return {
        element,
        update: ({entries, live}) => {
            const summary = CodexActivity.summarize(entries, live)
            running = summary.running
            glyph.className = `glyph ${summary.running ? "running" : summary.failed > 0 ? "warning" : "success"}`
            label.textContent = summary.label
            label.title = summary.label
            count.textContent = summary.tools === 0 ? "" : `${summary.tools} step${summary.tools === 1 ? "" : "s"}`
            failures.textContent = `${summary.failed} failed`
            failures.classList.toggle("hidden", summary.failed === 0)
            element.classList.toggle("running", summary.running)
            applyCollapsed()
            const images = entries.flatMap(entry => entry.type === "activity" ? thumbnailsOf(entry) : [])
            const nextKey = images.map(({url}) => url).join("|")
            if (nextKey !== stripKey) {
                stripKey = nextKey
                renderThumbnails(strip, images)
            }
            latest = entries
            renderRows()
        }
    }
}

const createMessageView = (entry: CodexMessageEntry): View<CodexMessageEntry> => {
    switch (entry.type) {
        case "user": {
            const thumbs: HTMLElement = <div className="thumbs hidden"/>
            const text: HTMLElement = <div className="text"/>
            let imageCount = -1
            return {
                element: <div className="message user"><div className="bubble">{thumbs}{text}</div></div>,
                update: next => {
                    if (next.type !== "user") {return}
                    text.textContent = next.text
                    text.classList.toggle("hidden", next.text.length === 0)
                    const images = next.images ?? []
                    if (images.length === imageCount) {return}
                    imageCount = images.length
                    renderThumbnails(thumbs, images.map(url => ({url, title: "Pasted image"})))
                }
            }
        }
        case "notice": {
            const text: HTMLElement = <span/>
            return {
                element: <div className="notice">{text}</div>,
                update: next => {if (next.type === "notice") {text.textContent = next.text}}
            }
        }
        case "assistant": {
            const element: HTMLElement = <div className="message assistant markdown"/>
            let text: Nullable<string> = null
            return {
                element,
                update: next => {
                    if (next.type !== "assistant") {return}
                    element.classList.toggle("streaming", !next.complete)
                    if (next.text === text) {return}
                    text = next.text
                    renderMarkdown(element, next.text)
                }
            }
        }
    }
}

const reconcile = <E, V extends {readonly element: HTMLElement}>(
    container: HTMLElement, views: Map<string, V>, items: ReadonlyArray<E>, keyOf: (item: E) => string,
    create: (item: E) => V, update: (view: V, item: E) => void): void => {
    const seen = new Set<string>()
    let cursor: Nullable<ChildNode> = container.firstChild
    items.forEach(item => {
        const key = keyOf(item)
        const existing = views.get(key)
        const view = existing ?? create(item)
        if (!isDefined(existing)) {views.set(key, view)}
        update(view, item)
        seen.add(key)
        if (view.element !== cursor) {container.insertBefore(view.element, cursor)}
        cursor = view.element.nextSibling
    })
    for (const [key, view] of views) {
        if (!seen.has(key)) {
            view.element.remove()
            views.delete(key)
        }
    }
}

export const CodexAgentPanel = ({lifecycle, service}: Construct) => {
    const controller: CodexAgentController = service.codexAgent
    const followState = new CodexTranscriptFollowState()
    const blockViews = new Map<string, View<BlockInput>>()
    const turnRunning = () => controller.turnRunning.getValue()
    const panelState = (): PanelState => {
        const connection = controller.connectionState.getValue()
        if (connection === "connecting") {return "connecting"}
        if (connection !== "connected") {return "offline"}
        if (!isDefined(controller.account.getValue().account)) {
            return controller.loginPending.getValue() ? "login" : "signed-out"
        }
        return "ready"
    }
    const login = async () => {
        const url = await controller.login()
        if (isDefined(url)) {window.open(url, "_blank", "noopener,noreferrer")}
    }
    const transcriptContext = () => ({
        model: controller.selectedModel.unwrapOrNull(),
        effort: controller.selectedEffort.unwrapOrNull(),
        threadId: controller.threadId,
        activeTurnId: controller.activeTurnId.unwrapOrUndefined()
    })
    const newConversation = async () => {
        if (turnRunning()) {
            const {status, value: approved} = await Promises.tryCatch(Dialogs.approve({
                headline: "New conversation?", message: "Codex is still working. Stop it and start over?",
                approveText: "Stop & start new"
            }))
            if (status === "rejected" || !approved) {return}
        }
        await controller.newConversation()
        textArea.focus()
    }
    const copyTranscript = (serialize: typeof serializeCodexConversation) =>
        void Promises.tryCatch(Clipboard.writeText(serialize(controller.conversation.getValue(), transcriptContext())))
    const statusText: HTMLElement = <span className="status-text"/>
    const status: HTMLElement = <div className="status"><span className="dot"/>{statusText}</div>
    const modelLabel: HTMLElement = <span className="model-label"/>
    const modelMenu = MenuItem.root().setRuntimeChildrenProcedure(parent => {
        const models = controller.models.getValue()
            .filter(model => !model.hidden || controller.selectedModel.contains(model.model))
        parent.addMenuItem(MenuItem.header({label: "Model", icon: IconSymbol.Robot}))
        models.forEach(model => parent.addMenuItem(MenuItem.default({
            label: model.displayName, checked: controller.selectedModel.contains(model.model)
        }).setTriggerProcedure(() => controller.selectModel(model.model))))
        const selected = models.find(model => controller.selectedModel.contains(model.model))
        const efforts = selected?.supportedReasoningEfforts ?? []
        if (efforts.length === 0) {return}
        parent.addMenuItem(MenuItem.header({label: "Reasoning", icon: IconSymbol.Dial, separatorBefore: true}))
        efforts.forEach(({reasoningEffort}) => parent.addMenuItem(MenuItem.default({
            label: capitalize(reasoningEffort), checked: controller.selectedEffort.contains(reasoningEffort)
        }).setTriggerProcedure(() => controller.selectEffort(reasoningEffort))))
    })
    const modelButton: HTMLElement = (
        <MenuButton root={modelMenu}
                    appearance={{color: Colors.dark, activeColor: Colors.bright, tooltip: "Model and reasoning effort"}}>
            <span className="model-chip">{modelLabel}<Icon symbol={IconSymbol.Dropdown}/></span>
        </MenuButton>
    )
    modelButton.classList.add("model-button")
    const mainMenu = MenuItem.root().setRuntimeChildrenProcedure(parent => {
        const {account, email, planType} = controller.account.getValue()
        const signedIn = isDefined(account)
        const state = panelState()
        if (signedIn) {
            parent.addMenuItem(MenuItem.header({label: account.email ?? email ?? "Signed in", icon: IconSymbol.Robot}))
            const plan = account.planType ?? planType
            if (isDefined(plan)) {parent.addMenuItem(MenuItem.default({label: `Plan · ${capitalize(plan)}`, selectable: false}))}
        }
        const hasConversation = controller.conversation.getValue().length > 0 || isDefined(controller.threadId)
        parent.addMenuItem(
            MenuItem.default({label: "New conversation", separatorBefore: signedIn, selectable: hasConversation})
                .setTriggerProcedure(() => void newConversation()),
            MenuItem.default({label: "Copy transcript", separatorBefore: true})
                .setTriggerProcedure(() => copyTranscript(serializeCodexConversationCompact)),
            MenuItem.default({label: "Copy debug transcript"})
                .setTriggerProcedure(() => copyTranscript(serializeCodexConversation)),
            MenuItem.default({label: "Log protocol trace to console", checked: controller.debugEnabled.getValue()})
                .setTriggerProcedure(() => controller.debugEnabled.setValue(!controller.debugEnabled.getValue())),
            MenuItem.default({label: "Reconnect", separatorBefore: true})
                .setTriggerProcedure(() => void controller.retryConnection())
        )
        if (signedIn) {
            parent.addMenuItem(MenuItem.default({label: "Log out"}).setTriggerProcedure(() => void controller.logout()))
        } else if (state === "signed-out" || state === "login") {
            parent.addMenuItem(MenuItem.default({label: "Sign in with ChatGPT"}).setTriggerProcedure(() => void login()))
        }
    })
    const menuButton: HTMLElement = (
        <MenuButton root={mainMenu} appearance={{color: Colors.dark, activeColor: Colors.bright, tooltip: "Account and settings"}}>
            <Icon symbol={IconSymbol.Menu}/>
        </MenuButton>
    )
    menuButton.classList.add("menu-button")
    const transcript: HTMLElement = <div className="transcript" onConnect={host => lifecycle.own(installScrollbars(host))}/>
    const latestButton: HTMLButtonElement = <button className="latest-button hidden" type="button">↓ Latest</button>
    const errorText: HTMLElement = <span className="error-text"/>
    const errorClose: HTMLButtonElement = <button className="icon-button" type="button" title="Dismiss">
        <Icon symbol={IconSymbol.Close}/></button>
    const errorBanner: HTMLElement = <div className="error-banner hidden"><Icon symbol={IconSymbol.Warning}/>{errorText}{errorClose}</div>
    const gateSymbol = lifecycle.own(new DefaultObservableValue(IconSymbol.Disconnected))
    const gateTitle: HTMLElement = <div className="gate-title"/>
    const gateText: HTMLElement = <div className="gate-text"/>
    const commandCopy: HTMLButtonElement = <button className="icon-button" type="button" title="Copy command">
        <Icon symbol={IconSymbol.Copy}/></button>
    const gateCommand: HTMLElement = <div className="gate-command hidden"><code>{AppServerCommand}</code>{commandCopy}</div>
    const gateActionLabel: HTMLElement = <span/>
    const gateAction: HTMLElement = (
        <Button lifecycle={lifecycle} appearance={{framed: true, color: Colors.blue}} onClick={() => {
            const state = panelState()
            if (state === "offline") {void controller.retryConnection()}
            if (state === "signed-out" || state === "login") {void login()}
        }}>{gateActionLabel}</Button>
    )
    const gateSecondary: HTMLButtonElement = <button className="link-button hidden" type="button">Cancel</button>
    const gate: HTMLElement = (
        <div className="gate hidden">
            <IconCartridge lifecycle={lifecycle} symbol={gateSymbol} className="gate-icon"/>
            {gateTitle}{gateText}{gateCommand}
            <div className="gate-actions">{gateAction}{gateSecondary}</div>
        </div>
    )
    const suggestions: HTMLElement = <div className="suggestions"/>
    const emptyState: HTMLElement = (
        <div className="empty-state hidden">
            <Icon symbol={IconSymbol.Robot} className="empty-icon"/>
            <div className="gate-title">What should we make?</div>
            <div className="gate-text">Codex can inspect, script, listen to and browse your project.</div>
            {suggestions}
        </div>
    )
    const sendSymbol = lifecycle.own(new DefaultObservableValue(IconSymbol.ArrowUp))
    const textArea: HTMLTextAreaElement = <textarea rows={1} spellcheck={true}/>
    const sendButton: HTMLButtonElement = (
        <button className="send-button" type="button"><IconCartridge lifecycle={lifecycle} symbol={sendSymbol}/></button>
    )
    const hint: HTMLElement = <div className="composer-hint"/>
    const queuedText: HTMLElement = <span className="queued-text"/>
    const queuedSteer: HTMLButtonElement = <button className="queued-steer" type="button" title="Send it into the running turn now">Steer</button>
    const queuedCancel: HTMLButtonElement = <button className="queued-cancel" type="button" title="Cancel queued message">×</button>
    const queued: HTMLElement = (
        <div className="queued hidden"><span className="queued-label">Queued</span>{queuedText}{queuedSteer}{queuedCancel}</div>
    )
    const attachments: HTMLElement = <div className="attachments hidden"/>
    const element: HTMLElement = (
        <div className={className}>
            <header className="bar">{status}{modelButton}{menuButton}</header>
            <div className="transcript-container">
                {transcript}
                {emptyState}
                {gate}
                {errorBanner}
                {latestButton}
            </div>
            <div className="composer">
                {queued}
                {attachments}
                <div className="input-box">{textArea}{sendButton}</div>
                {hint}
            </div>
        </div>
    )
    const scrollMetrics = () => ({
        scrollTop: transcript.scrollTop, scrollHeight: transcript.scrollHeight, clientHeight: transcript.clientHeight
    })
    const updateLatestButton = () => latestButton.classList.toggle("hidden", !followState.hasNewActivity)
    const scrollToLatest = () => {
        followState.followToLatest()
        transcript.scrollTop = transcript.scrollHeight
        updateLatestButton()
    }
    const autoGrow = () => {
        textArea.style.height = "auto"
        textArea.style.height = `${Math.min(textArea.scrollHeight, 160)}px`
    }
    const canSend = () => panelState() === "ready" && isDefined(controller.selectedModel.unwrapOrNull())
    let pendingImages: ReadonlyArray<string> = []
    const hasInput = () => textArea.value.trim().length > 0 || pendingImages.length > 0
    const updateComposer = () => {
        const state = panelState()
        const running = turnRunning()
        sendSymbol.setValue(running ? IconSymbol.Stop : IconSymbol.ArrowUp)
        sendButton.classList.toggle("stop", running)
        sendButton.title = running ? "Stop" : "Send (Enter)"
        sendButton.disabled = !running && (!canSend() || !hasInput())
        textArea.disabled = state !== "ready"
        textArea.placeholder = state === "ready" ? "Ask Codex to produce…"
            : state === "offline" ? "Codex is not connected" : state === "connecting" ? "Connecting…" : "Sign in to start"
        hint.textContent = running ? "Codex is working… Enter queues your message · Stop interrupts"
            : state === "ready" ? "Enter to send · Shift+Enter for a new line · Ctrl+V pastes images" : ""
        hint.classList.toggle("working", running)
    }
    const updateGate = () => {
        const state = panelState()
        const empty = controller.conversation.getValue().length === 0
        element.classList.toggle("empty-conversation", empty)
        gate.classList.toggle("hidden", state === "ready")
        gate.classList.toggle("compact", !empty)
        emptyState.classList.toggle("hidden", state !== "ready" || !empty)
        gateCommand.classList.toggle("hidden", state !== "offline")
        gateSecondary.classList.toggle("hidden", state !== "login")
        gateAction.classList.toggle("hidden", state === "connecting")
        switch (state) {
            case "offline":
                gateSymbol.setValue(IconSymbol.Disconnected)
                gateTitle.textContent = "Codex is not connected"
                gateText.textContent = "Start the Codex app server in a terminal, then retry:"
                gateActionLabel.textContent = "Retry"
                break
            case "connecting":
                gateSymbol.setValue(IconSymbol.Connected)
                gateTitle.textContent = "Connecting to Codex…"
                gateText.textContent = "Reaching the local app server."
                break
            case "signed-out":
                gateSymbol.setValue(IconSymbol.Robot)
                gateTitle.textContent = "Sign in to Codex"
                gateText.textContent = "Codex uses your ChatGPT account. Sign-in opens in a new tab."
                gateActionLabel.textContent = "Sign in with ChatGPT"
                break
            case "login":
                gateSymbol.setValue(IconSymbol.Robot)
                gateTitle.textContent = "Waiting for sign-in…"
                gateText.textContent = "Finish signing in in the browser tab. This panel updates automatically."
                gateActionLabel.textContent = "Open sign-in again"
                break
            case "ready":
                break
        }
    }
    const updateHeader = () => {
        const state = panelState()
        const connection = controller.connectionState.getValue()
        status.className = `status ${state}`
        const text = state === "ready" ? "Codex"
            : state === "connecting" ? "Connecting…"
                : state === "offline" ? (connection === "closing" ? "Closing…" : "Offline")
                    : state === "login" ? "Signing in…" : "Signed out"
        const {account} = controller.account.getValue()
        statusText.textContent = text
        status.title = isDefined(account) ? `Connected as ${account.email ?? "ChatGPT user"}` : text
        const model = controller.models.getValue().find(entry => controller.selectedModel.contains(entry.model))
        const effort = controller.selectedEffort.unwrapOrNull()
        const label = isDefined(model) ? `${model.displayName}${isDefined(effort) ? ` · ${effort}` : ""}` : ""
        modelLabel.textContent = label
        modelButton.classList.toggle("hidden", state !== "ready" || !isDefined(model))
        modelButton.title = label
    }
    const updateAll = () => {
        updateHeader()
        updateGate()
        updateComposer()
    }
    const updateError = () => {
        const message = controller.error.mapOr(error => error.message, "")
        errorText.textContent = message
        errorText.title = message
        errorBanner.classList.toggle("hidden", controller.error.isEmpty())
    }
    const createBlockView = ({block}: BlockInput): View<BlockInput> => {
        if (block.type === "message") {
            const view = createMessageView(block.entry)
            return {element: view.element, update: ({block: next}) => {if (next.type === "message") {view.update(next.entry)}}}
        }
        const view = createStepsView()
        return {
            element: view.element,
            update: ({block: next, live}) => {if (next.type === "steps") {view.update({entries: next.entries, live})}}
        }
    }
    const updateTranscript = () => {
        const shouldFollow = followState.onContentChanged(scrollMetrics())
        const blocks = CodexActivity.group(controller.conversation.getValue())
        const running = turnRunning()
        const inputs = blocks.map((block, index): BlockInput => ({block, live: running && index === blocks.length - 1}))
        reconcile(transcript, blockViews, inputs, ({block}) => block.key, createBlockView, (view, input) => view.update(input))
        updateGate()
        if (shouldFollow) {transcript.scrollTop = transcript.scrollHeight}
        updateLatestButton()
    }
    const updateQueued = () => {
        const text = controller.queuedMessage.unwrapOrNull()
        const count = controller.queuedImages.getValue().length
        const images = count === 0 ? "" : `[${count} image${count === 1 ? "" : "s"}] `
        queuedText.textContent = `${images}${text ?? ""}`
        queued.title = text ?? ""
        queued.classList.toggle("hidden", !isDefined(text))
    }
    const renderAttachments = () => {
        attachments.replaceChildren(...pendingImages.map((url, index) => {
            const image: HTMLImageElement = <img src={url} alt="Pasted image" title="Click to enlarge" draggable={false}/>
            image.onclick = () => openImage(url, "Pasted image", image)
            const remove: HTMLButtonElement = <button className="remove" type="button" title="Remove image">×</button>
            remove.onclick = () => setPendingImages(pendingImages.toSpliced(index, 1))
            return <div className="attachment">{image}{remove}</div>
        }))
        attachments.classList.toggle("hidden", pendingImages.length === 0)
    }
    const setPendingImages = (images: ReadonlyArray<string>) => {
        pendingImages = images.slice(0, CodexImageInput.MaxImages)
        renderAttachments()
        updateComposer()
    }
    const attachImages = async (files: ReadonlyArray<File>) => {
        const room = Math.max(0, CodexImageInput.MaxImages - pendingImages.length)
        const results = await Promise.all(files.slice(0, room).map(file => Promises.tryCatch(CodexImageInput.encode(file))))
        results.forEach(result => {if (result.status === "rejected") {console.warn("Could not attach image", result.error)}})
        const urls = results.flatMap(result => result.status === "resolved" ? [result.value] : [])
        if (urls.length > 0) {setPendingImages([...pendingImages, ...urls])}
    }
    const submit = async (fromKeyboard: boolean) => {
        if (turnRunning() && !fromKeyboard) {
            await controller.interrupt()
            return
        }
        if (!canSend() || !hasInput()) {return}
        const text = textArea.value.trim().length === 0 ? "" : textArea.value
        const accepted = await controller.send(text, pendingImages)
        if (accepted) {
            textArea.value = ""
            setPendingImages([])
            autoGrow()
            scrollToLatest()
        }
        updateComposer()
    }
    suggestions.replaceChildren(...Suggestions.map(suggestion => {
        const button: HTMLButtonElement = <button className="suggestion" type="button">{suggestion}</button>
        button.onclick = () => {
            textArea.value = suggestion
            autoGrow()
            updateComposer()
            textArea.focus()
        }
        return button
    }))
    latestButton.onclick = scrollToLatest
    errorClose.onclick = () => controller.clearError()
    commandCopy.onclick = () => void Promises.tryCatch(Clipboard.writeText(AppServerCommand))
    gateSecondary.onclick = () => controller.cancelLogin()
    sendButton.onclick = () => void submit(false)
    queuedSteer.onclick = () => void controller.steerQueued()
    queuedCancel.onclick = () => {
        const images = controller.queuedImages.getValue()
        const text = controller.cancelQueued()
        if (!isDefined(text) || hasInput()) {return}
        setPendingImages(images)
        textArea.value = text
        autoGrow()
        updateComposer()
        textArea.focus()
    }
    lifecycle.ownAll(
        controller.connectionState.subscribe(updateAll),
        controller.account.subscribe(updateAll),
        controller.loginPending.subscribe(updateAll),
        controller.models.subscribe(updateHeader),
        controller.selectedModel.subscribe(updateAll),
        controller.selectedEffort.subscribe(updateHeader),
        controller.turnRunning.subscribe(() => {
            updateComposer()
            updateTranscript()
        }),
        controller.error.catchupAndSubscribe(updateError),
        controller.queuedMessage.catchupAndSubscribe(updateQueued),
        controller.queuedImages.subscribe(updateQueued),
        controller.conversation.catchupAndSubscribe(updateTranscript),
        Events.subscribe(transcript, "scroll", () => {
            followState.onScroll(scrollMetrics())
            updateLatestButton()
        }, {passive: true}),
        Events.subscribe(textArea, "input", () => {
            autoGrow()
            updateComposer()
        }),
        Events.subscribe(textArea, "paste", (event: ClipboardEvent) => {
            const files = CodexImageInput.filesOf(event.clipboardData)
            if (files.length === 0 || (event.clipboardData?.getData("text/plain") ?? "").length > 0) {return}
            event.preventDefault()
            void attachImages(files)
        }),
        Events.subscribe(textArea, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault()
                void submit(true)
            }
        })
    )
    updateAll()
    if (isDefined(FixtureMode)) {
        void import("@/codex/CodexFixture").then(({CodexFixture}) => CodexFixture.apply(controller, FixtureMode))
    } else {
        void controller.ensureConnected()
    }
    return element
}
