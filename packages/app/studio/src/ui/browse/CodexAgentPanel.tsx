import css from "./CodexAgentPanel.sass?inline"
import {createElement, replaceChildren} from "@opendaw/lib-jsx"
import {Events, Html} from "@opendaw/lib-dom"
import {DefaultObservableValue, Lifecycle} from "@opendaw/lib-std"
import {IconSymbol} from "@opendaw/studio-enums"
import {StudioService} from "@/service/StudioService"
import {CodexAgentController, CodexConversationEntry} from "@/codex/CodexAgentController"
import {Button} from "@/ui/components/Button"
import {Checkbox} from "@/ui/components/Checkbox"
import {Icon, IconCartridge} from "@/ui/components/Icon"
import {installScrollbars} from "@/ui/components/Scrollbars"
import {DropDown} from "@/ui/composite/DropDown"

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

const renderEntry = (entry: CodexConversationEntry): HTMLElement => {
    switch (entry.type) {
        case "user":
            return <div className="entry user">
                <div className="label">You</div>
                <div className="text">{entry.text}</div>
            </div>
        case "assistant":
            return <div className={`entry assistant${entry.complete ? " complete" : ""}`}>
                <div className="label">Codex</div>
                <div className="text">{entry.text}</div>
            </div>
        case "tool":
            return <div className={`entry tool ${entry.status}`}>
                <div className="tool-line">
                    <span className="tool-status">{entry.status === "running" ? "…" : entry.status === "success" ? "✓" : "×"}</span>
                    <span className="tool-name">{toolName(entry)}</span>
                </div>
                {entry.error === undefined ? null : <div className="tool-error">{entry.error}</div>}
            </div>
    }
}

export const CodexAgentPanel = ({lifecycle, service}: Construct) => {
    const controller = service.codexAgent
    const transcript: HTMLElement = (
        <div className="transcript" onConnect={host => lifecycle.own(installScrollbars(host))}/>
    )
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
        replaceChildren(transcript, controller.conversation.getValue().map(renderEntry))
        transcript.scrollTop = transcript.scrollHeight
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
        </div>
        {transcript}
        {errorRow}
        <div className="composer">
            {textArea}
            {sendButton}
        </div>
    </div>
}
