export const CODEX_MODEL_CACHE_DIAGNOSTIC =
    "The connected Codex client has an incompatible model cache/schema. Update Codex and remove only CODEX_HOME/models_cache.json, then reconnect."

export const isCodexModelCacheCompatibilityError = (message: string): boolean =>
    message.includes("failed to renew cache TTL")
    && message.includes("missing field `supports_parallel_tool_calls`")

export const normalizeCodexErrorMessage = (message: string): string =>
    isCodexModelCacheCompatibilityError(message) ? CODEX_MODEL_CACHE_DIAGNOSTIC : message
