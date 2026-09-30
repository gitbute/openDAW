# Agent v2: handoff notes

Codex-driven "producer agent" for openDAW, rebuilt on upstream main (fork `gitbute/openDAW`, branch `agent/v2`).
Local work branches: `wip/v2-integration` (full history), `wip/v2-base`; `agent/v2` is a single squashed commit.

## Architecture

- `packages/studio/codex`: Codex App Server client (WebSocket JSON-RPC), `CodexSession`, `AgentTool`/`AgentToolbox` seam.
  Tool calls are serialised except tools flagged `concurrent` (read-only). Content gating by model `inputModalities`.
- `packages/app/studio/src/agent/`: the `daw` toolbox (`AgentToolboxes.ts`), prompt (`AgentInstructions.ts`, palette appended at
  session start from `DeviceCatalog.palette()`).
  - `script/`: `run_script`, type-checked TS against the upstream scripting API, one undo step per applied run.
  - `listen/` + `analysis/`: exact offline render (mix + stems), AudioMetrics, masking, per-script-device CPU load, PNG views.
  - `audition/`: sandbox renders of a sound (+effects, variations) in throwaway projects.
  - `inspect/`: `inspect_project`, `inspect_notes`. `catalog/`: `browse`, `device_reference`, `api_reference`.
- `packages/app/studio/src/codex/` + `ui/browse/CodexAgentPanel.tsx`: controller + panel, per-project transcript
  (`projects/v1/<uuid>/codex.json` in OPFS), thread resume, subagent labels, queued messages.
- `packages/studio/scripting`: agent script worker (`AgentScriptWorker`, `src/agent/*`), typed lookups, native-unit automation,
  script-device params via `parameters.N.value` or `unit.addValueTrack(device.parameter("name"), "value")`, presets / Tubular voices.
- `packages/lib/dsp`: `AudioMetrics`, BS.1770 `LoudnessMeter`, `TruePeak`.
- `packages/studio/core-wasm`: script load meter (`script-load-meter.ts`), Windows build scripts (`build-wasm.mjs`).

## Running

1. `codex app-server --listen ws://127.0.0.1:4500` (user's ChatGPT login).
2. Build libs: `TURBO_CACHE_DIR=<shared dir> npx turbo build --filter='!@opendaw/app-studio' --filter='!@opendaw/lab' --filter='!@opendaw/manual'`
   (revert churn in `crates/studio-boxes/src/registry.rs`, `packages/studio/sdk/src/version.ts`; delete generated `AGENTS.md`).
   After scripting API changes: `npm run generate-api` in `packages/studio/scripting`.
3. `npm run dev` in `packages/app/studio` → https://localhost:8080, Browser panel → Agent tab (dev builds only).
4. Editing files the app loads live (`src/**`, `scripting/src/library.d.ts`) hot-reloads the tab and kills a running turn.

## Testing with a live agent

- Drive via Playwright MCP (shared browser; bring the tab to front before clicking; radio tabs need `label:has-text(...)`).
- Codex rollouts: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Main thread has `"source":"vscode"`, subagents
  `{"subagent":{"thread_spawn":...}}`. Turn end = `"type":"task_complete"`. Tool calls = `item_completed` with `item.tool`.
- The agent calls tools from code cells: tool results arrive as ONE string (JSON, then one `data:image` URL per line).
- Standard test (user wants identical prompts for comparison):
  - Starter: `make sick dubstep / brostep, trivecta style, 8 bars. use subagents to work in parallel where it helps (e.g. research, designing the different bass/growl sounds at the same time), but keep one of you in charge of the project edits.`
  - Feedback: `nice work! before we continue: we are building and improving this openDAW toolset for you. please give us honest, concrete feedback as the agent who actually used it: which tools worked well, which were clumsy or confusing, what errors or friction you hit (api naming, types, docs, listen results, device_reference, browse, subagents), what information you were missing to make better decisions, and what tools or capabilities you wish you had to make music that is louder, dirtier and more creative. rank your top 5 wishes. don't change the project for this answer.`
  - Model GPT-6.1-Sol, effort low (baseline) or medium.

## User preferences

- No genre/style recipes in the prompt; the model knows music, researches named artists itself.
- Apparat is the primary tool for signature sounds; stock devices stay available (full palette).
- Subagents: no hard rules, only coordination (agree on ownership).
- Commits only on work branches; push only to `origin` (the fork), never upstream.

## Open issues (next)

1. Masking still pairs a unit with its group bus in live projects (`lead.output = MELODY` → pair "Crystal hook"/"MELODY"),
   although `AgentRenderer.feedsOf` + test cover output routing. Reproduce with a real scripted project and explicit stem list
   `["Crystal hook","BASS","MELODY",...]`; check label/uuid mapping of feeds vs selected stems.
2. Sound artifacts: audition → save as user preset (openDAW preset system), apply by id in run_script, list via browse.
3. Loop API: `p.loop = {...}` fails (read-only); add a hint or setter.
4. Gain-reduction traces for compressors/limiter; automation curve readback.
5. Maximizer has no true-peak limiting (engine, Rust).

## Parked roadmap

Resampling API, reference-track A/B in listen, eval harness (fixed prompt suite, scored), audio input once models accept it
(`inputAudio` plumbing exists), DSP library for Apparat (CPU-safe oscillators/filters/distortion), agent in live rooms,
upstreaming generic fixes (PPQN docs, marker clamp, output getter, asInstanceOf messages, Maximizer docs).
