import {isAbsent, isDefined, Nullable, Optional} from "@opendaw/lib-std"
import {CodexJson} from "./CodexJson"
import {CodexRpcClient} from "./CodexRpcClient"
import type {
    CodexAccountEvent,
    CodexAccountRecord,
    CodexAccountState,
    CodexLogin,
    JsonValue,
    RpcNotification,
    Unsubscribe
} from "./types"

const accountRecord = (value: unknown): CodexAccountRecord => {
    const record = CodexJson.asObjectRecord(value, "account")
    const type = record.type
    if (typeof type !== "string") {throw new Error("account.type must be a string")}
    return {
        type,
        email: CodexJson.strictNullableString(record.email, "account.email"),
        planType: CodexJson.strictNullableString(record.planType, "account.planType")
    }
}

const authModeForAccount = (account: Nullable<CodexAccountRecord>): Nullable<string> => {
    switch (account?.type) {
        case "chatgpt": return "chatgpt"
        case "apiKey": return "apikey"
        case "amazonBedrock": return "bedrockApiKey"
        default: return null
    }
}

const emptyState: CodexAccountState = {
    account: null,
    exists: false,
    accountType: null,
    authMode: null,
    email: null,
    planType: null,
    requiresOpenaiAuth: true
}

export class CodexAccount {
    readonly #rpc: CodexRpcClient
    readonly #listeners = new Set<(event: CodexAccountEvent) => void>()
    #state: CodexAccountState = emptyState

    constructor(rpc: CodexRpcClient) {
        this.#rpc = rpc
        rpc.subscribeNotifications(notification => this.#onNotification(notification))
    }

    get state(): CodexAccountState {return this.#state}

    subscribe(listener: (event: CodexAccountEvent) => void): Unsubscribe {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }

    async readAccount(): Promise<CodexAccountState> {
        const response = CodexJson.asObjectRecord(await this.#rpc.request("account/read", {refreshToken: false}),
            "account/read response")
        const accountValue = response.account
        const account = isAbsent(accountValue) ? null : accountRecord(accountValue)
        const requiresOpenaiAuth = response.requiresOpenaiAuth
        if (typeof requiresOpenaiAuth !== "boolean") {
            throw new Error("account/read response requires requiresOpenaiAuth")
        }
        this.#setState({
            account,
            exists: isDefined(account),
            accountType: account?.type ?? null,
            authMode: authModeForAccount(account),
            email: account?.email ?? null,
            planType: account?.planType ?? null,
            requiresOpenaiAuth
        })
        return this.#state
    }

    async startChatGPTLogin(): Promise<CodexLogin> {
        const response = CodexJson.asObjectRecord(await this.#rpc.request("account/login/start", {
            type: "chatgpt",
            useHostedLoginSuccessPage: true,
            appBrand: "chatgpt"
        }), "account/login/start response")
        if (response.type !== "chatgpt"
            || typeof response.loginId !== "string"
            || typeof response.authUrl !== "string") {
            throw new Error("account/login/start did not return a ChatGPT login")
        }
        return {loginId: response.loginId, authUrl: response.authUrl}
    }

    async cancelLogin(loginId: string): Promise<{readonly status: string}> {
        const response = CodexJson.asObjectRecord(await this.#rpc.request("account/login/cancel", {loginId}),
            "account/login/cancel response")
        if (typeof response.status !== "string") {throw new Error("account/login/cancel response has no status")}
        return {status: response.status}
    }

    async logout(): Promise<void> {
        await this.#rpc.request("account/logout")
        this.#setState(emptyState)
    }

    #onNotification(notification: RpcNotification): void {
        if (notification.method === "account/updated") {
            this.#onAccountUpdated(notification.params)
        } else if (notification.method === "account/login/completed") {
            this.#onLoginCompleted(notification.params)
        }
    }

    #onAccountUpdated(params: Optional<JsonValue>): void {
        if (!isDefined(params)) {return}
        const value = CodexJson.asObjectRecord(params, "account/updated notification")
        const authMode = CodexJson.strictNullableString(value.authMode, "account/updated.authMode")
        const planType = CodexJson.strictNullableString(value.planType, "account/updated.planType")
        const account = !isDefined(this.#state.account) || !isDefined(authMode)
            ? null
            : {...this.#state.account, planType: planType ?? this.#state.account.planType}
        this.#setState({
            account,
            exists: this.#state.exists || isDefined(authMode),
            accountType: this.#state.accountType ?? (authMode === "chatgpt" ? "chatgpt" : null),
            authMode,
            email: isDefined(authMode) ? this.#state.email : null,
            planType: isDefined(authMode) ? planType ?? this.#state.planType : null,
            requiresOpenaiAuth: !isDefined(authMode)
        })
    }

    #onLoginCompleted(params: Optional<JsonValue>): void {
        if (!isDefined(params)) {return}
        const value = CodexJson.asObjectRecord(params, "account/login/completed notification")
        const loginId = CodexJson.strictNullableString(value.loginId, "account/login/completed.loginId")
        const success = value.success
        const error = CodexJson.strictNullableString(value.error, "account/login/completed.error")
        if (typeof success !== "boolean") {throw new Error("account/login/completed.success must be boolean")}
        this.#emit({type: "loginCompleted", loginId, success, error})
    }

    #setState(state: CodexAccountState): void {
        this.#state = state
        this.#emit({type: "changed", state})
    }

    #emit(event: CodexAccountEvent): void {
        this.#listeners.forEach(listener => listener(event))
    }
}
