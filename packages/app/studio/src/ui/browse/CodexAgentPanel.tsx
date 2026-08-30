import css from "./CodexAgentPanel.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Clipboard, Events, Html} from "@opendaw/lib-dom"
import {DefaultObservableValue, Lifecycle} from "@opendaw/lib-std"
import {IconSymbol} from "@opendaw/studio-enums"
import {StudioService} from "@/service/StudioService"
import type {CodexAgentController, CodexConversationEntry} from "@/codex/CodexAgentController"
import {
    CodexTranscriptFollowState,
    serializeCodexConversation
} from "@/codex/CodexTranscript"
import {Button} from "@/ui/components/Button"
import {Checkbox} from "@/ui/components/Checkbox"
import {Icon, IconCartridge} from "@/ui/components/Icon"
import {installScrollbars} from "@/ui/components/Scrollbars"
import {DropDown} from "@/ui/composite/DropDown"
import {renderMarkdown} from "@/ui/Markdown"

const className = Html.adoptStyleSheet(css, "CodexAgentPanel")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

const modelLabel = (controller: CodexAgentController, value: string | null): string => {
    if (value === null) {return controller.models.getValue().length === 0 ? "Loading models…" : "Select model"}
    return controller.models.getValue().find(model => model.model === value)?.displayName ?? value
}

const effortLabel = (value: string | null): string => {
    if (value === null) {return "Select effort"}
    return value
}

const toolName = (entry: Extract<CodexConversationEntry, {type: "tool"}>): string =>
    entry.namespace === null ? entry.tool : `${entry.namespace}.${entry.tool}`

type EntryView = {
    readonly element: HTMLElement
    update(entry: CodexConversationEntry): void
}

const entryKey = (entry: CodexConversationEntry): string => {
    switch (entry.type) {
        case "user": return `user:${entry.id}`
        case "assistant": return `assistant:${entry.itemId}`
        case "reasoning": return `reasoning:${entry.itemId}:${entry.summaryIndex ?? "none"}`
        case "tool": return `tool:${entry.itemId}`
    }
}

const createEntryView = (entry: CodexConversationEntry): EntryView => {
    switch (entry.type) {
        case "user": {
            const text: HTMLElement = <div className="text"/>
            const element: HTMLElement = <div className="entry user">
                <div className="label">You</div>
                {text}
            </div>
            return {
                element,
                update: next => {
                    if (next.type === "user") {text.textContent = next.text}
                }
            }
        }
        case "assistant": {
            const text: HTMLElement = <div className="text"/>
            const element: HTMLElement = <div className="entry assistant">
                <div className="label">Codex</div>
                {text}
            </div>
            return {
                element,
                update: next => {
                    if (next.type !== "assistant") {return}
                    element.classList.toggle("complete", next.complete)
                    renderMarkdown(text, next.text)
                }
            }
        }
        case "reasoning": {
            const text: HTMLElement = <div className="reasoning-text"/>
            const summary: HTMLElement = <summary className="reasoning-header">⌁ Thinking</summary>
            const element: HTMLDetailsElement = <details className="entry reasoning" open={!entry.complete}>
                {summary}
                {text}
            </details>
            let complete = entry.complete
            let manuallyToggled = false
            summary.onclick = () => {manuallyToggled = true}
            return {
                element,
                update: next => {
                    if (next.type !== "reasoning") {return}
                    element.classList.toggle("complete", next.complete)
                    if (next.complete && !complete && !manuallyToggled) {element.open = false}
                    complete = next.complete
                    renderMarkdown(text, next.text)
                }
            }
        }
        case "tool": {
            const status: HTMLElement = <span className="tool-status"/>
            const name: HTMLElement = <span className="tool-name"/>
            const error: HTMLElement = <div className="tool-error hidden"/>
            const element: HTMLElement = <div className="entry tool">
                <div className="tool-line">{status}{name}</div>
                {error}
            </div>
            return {
                element,
                update: next => {
                    if (next.type !== "tool") {return}
                    element.classList.toggle("running", next.status === "running")
                    element.classList.toggle("success", next.status === "success")
                    element.classList.toggle("failed", next.status === "failed")
                    status.textContent = next.status === "running" ? "…" : next.status === "success" ? "✓" : "×"
                    name.textContent = toolName(next)
                    error.textContent = next.error ?? ""
                    error.classList.toggle("hidden", next.error === undefined)
                }
            }
        }
    }
}

export const CodexAgentPanel = ({lifecycle, service}: Construct) => {
    const controller = service.codexAgent
    const transcript: HTMLElement = (
        <div className="transcript" onConnect={host => lifecycle.own(installScrollbars(host))}/>
    )
    const followState = new CodexTranscriptFollowState()
    const latestButton: HTMLButtonElement = <button className="latest-button hidden" type="button">↓ Latest</button>
    const updateLatestButton = () => latestButton.classList.toggle("hidden", !followState.hasNewActivity)
    const scrollMetrics = () => ({
        scrollTop: transcript.scrollTop,
        scrollHeight: transcript.scrollHeight,
        clientHeight: transcript.clientHeight
    })
    const scrollToLatest = () => {
        followState.followToLatest()
        transcript.scrollTop = transcript.scrollHeight
        updateLatestButton()
    }
    latestButton.onclick = scrollToLatest
    const transcriptContainer: HTMLElement = <div className="transcript-container">
        {transcript}
        {latestButton}
    </div>
    const entryViews = new Map<string, EntryView>()
    const connectionLabel: HTMLElement = <span className="connection-label"/>
    const accountLabel: HTMLElement = <span className="account-label"/>
    const retryButton: HTMLElement = <Button lifecycle={lifecycle}
                                              appearance={{framed: true}}
                                              onClick={() => void controller.retryConnection()}>
        Retry
    </Button>
    const loginButton: HTMLElement = <Button lifecycle={lifecycle}
                                              appearance={{framed: true}}
                                              onClick={() => void login()}>
        Sign in with ChatGPT
    </Button>
    const logoutButton: HTMLElement = <Button lifecycle={lifecycle}
                                               appearance={{framed: true}}
                                               onClick={() => void controller.logout()}>
        Log out
    </Button>
    const errorText: HTMLElement = <span className="error-text"/>
    const clearErrorButton: HTMLElement = <Button lifecycle={lifecycle}
                                                   appearance={{landscape: true}}
                                                   onClick={() => controller.clearError()}>
        <Icon symbol={IconSymbol.Close}/>
    </Button>
    const errorRow: HTMLElement = <div className="error-row hidden">{errorText}{clearErrorButton}</div>
    const sendIcon = lifecycle.own(new DefaultObservableValue(IconSymbol.Play))
    const textArea: HTMLTextAreaElement = <textarea rows={2} placeholder="Ask Codex to produce…"/>
    const sendButton: HTMLElement = <Button lifecycle={lifecycle}
                                              appearance={{framed: true, landscape: true}}
                                              onClick={() => void submit()}>
        <IconCartridge lifecycle={lifecycle} symbol={sendIcon}/>
    </Button>
    const copyTranscript = async () => {
        await Clipboard.writeText(serializeCodexConversation(controller.conversation.getValue(), {
            model: controller.selectedModel.getValue(),
            effort: controller.selectedEffort.getValue(),
            threadId: controller.threadId,
            activeTurnId: controller.activeTurnId.getValue()
        }))
    }
    const copyButton: HTMLElement = <Button lifecycle={lifecycle}
                                              className="copy-button"
                                              appearance={{framed: true}}
                                              onClick={() => void copyTranscript()}>
        <Icon symbol={IconSymbol.Copy}/>
        Copy
    </Button>

    const updateConnection = () => {
        const state = controller.connectionState.getValue()
        connectionLabel.textContent = state === "connected"
            ? "● Codex connected"
            : state === "connecting" ? "● Codex connecting…" : "● Codex offline"
        retryButton.classList.toggle("hidden", state === "connected" || state === "connecting")
        const authenticated = controller.account.getValue().account !== null
        loginButton.classList.toggle("hidden", state !== "connected" || authenticated)
        logoutButton.classList.toggle("hidden", state !== "connected" || !authenticated)
    }

    const updateAccount = () => {
        const account = controller.account.getValue()
        accountLabel.textContent = account.account === null
            ? ""
            : [account.planType, account.email].filter(value => value !== null && value.length > 0).join(" · ")
        updateConnection()
    }

    const updateError = () => {
        const current = controller.error.getValue()
        errorText.textContent = current?.message ?? ""
        errorRow.classList.toggle("hidden", current === null)
    }

    const updateTurn = () => {
        const running = controller.turnRunning.getValue()
        sendIcon.setValue(running ? IconSymbol.Stop : IconSymbol.Play)
        sendButton.classList.toggle("interrupt", running)
    }

    const updateTranscript = () => {
        const shouldFollow = followState.onContentChanged(scrollMetrics())
        const seen = new Set<string>()
        let cursor: ChildNode | null = transcript.firstChild
        for (const entry of controller.conversation.getValue()) {
            const key = entryKey(entry)
            const view = entryViews.get(key) ?? (() => {
                const created = createEntryView(entry)
                entryViews.set(key, created)
                return created
            })()
            view.update(entry)
            seen.add(key)
            if (view.element !== cursor) {transcript.insertBefore(view.element, cursor)}
            cursor = view.element.nextSibling
        }
        for (const [key, view] of entryViews) {
            if (!seen.has(key)) {
                view.element.remove()
                entryViews.delete(key)
            }
        }
        if (shouldFollow) {transcript.scrollTop = transcript.scrollHeight}
        updateLatestButton()
    }

    const submit = async () => {
        if (controller.turnRunning.getValue()) {
            await controller.interrupt()
            return
        }
        const accepted = await controller.send(textArea.value)
        if (accepted) {textArea.value = ""}
    }

    const login = async () => {
        const url = await controller.login()
        if (url !== undefined) {window.open(url, "_blank", "noopener,noreferrer")}
    }

    lifecycle.own(controller.connectionState.catchupAndSubscribe(updateConnection))
    lifecycle.own(controller.account.catchupAndSubscribe(updateAccount))
    lifecycle.own(controller.error.catchupAndSubscribe(updateError))
    lifecycle.own(controller.turnRunning.catchupAndSubscribe(updateTurn))
    lifecycle.own(controller.conversation.catchupAndSubscribe(updateTranscript))
    lifecycle.own(Events.subscribe(transcript, "scroll", () => {
        followState.onScroll(scrollMetrics())
        updateLatestButton()
    }, {passive: true}))

    lifecycle.own(Events.subscribe(textArea, "keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            void submit()
        }
    }))
    void controller.ensureConnected()

    return <div className={className}>
        <div className="connection-row">
            <div className="connection-status">
                {connectionLabel}
                {accountLabel}
            </div>
            {retryButton}
            {loginButton}
            {logoutButton}
        </div>
        <div className="model-row">
            <DropDown lifecycle={lifecycle}
                      owner={controller.selectedModel}
                      provider={() => controller.models.getValue().map(model => model.model)}
                      mapping={value => modelLabel(controller, value)}/>
            <DropDown lifecycle={lifecycle}
                      owner={controller.selectedEffort}
                      provider={() => controller.models.getValue()
                          .find(model => model.model === controller.selectedModel.getValue())
                          ?.supportedReasoningEfforts.map(option => option.reasoningEffort) ?? []}
                      mapping={value => effortLabel(value)}/>
            <Checkbox lifecycle={lifecycle} model={controller.debugEnabled}>
                <span>Debug</span>
            </Checkbox>
            {copyButton}
        </div>
        {transcriptContainer}
        {errorRow}
        <div className="composer">
            {textArea}
            {sendButton}
        </div>
    </div>
}
