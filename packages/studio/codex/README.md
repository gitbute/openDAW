# openDAW Codex integration

The browser-side debug toggle enables structured `[Codex]` transport, RPC, session,
and tool tracing. For deeper App Server diagnostics, run the server with `RUST_LOG`
set to the desired filter and `LOG_FORMAT=json` for machine-readable stderr logs.
These are separate server-side settings; the browser does not modify the App Server
process environment.
