# Agent v2: handoff notes

Codex-driven "producer agent" for openDAW, rebuilt on upstream main (fork `gitbute/openDAW`, branch `agent/v2`).
Work directly on `agent/v2` (normal commits, push to `origin`). History of runs and fixes: git log.

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
  `{"subagent":{"thread_spawn":...}}`. Turn end = `"type":"task_complete"`. Tool calls = `item.type == "DynamicToolCall"`,
  web searches = `item.type == "Extension"` with kind `web.search`.
- The agent calls tools from code cells: tool results arrive as ONE string (JSON, then one `data:image` URL per line).
- Standard test (identical prompts for comparison), fresh project, GPT-6.1-Sol low (medium as second opinion):
  - Starter: `make a sick psytrance loop, 8 bars, main loop, vibe tribe style`
  - Feedback: `nice work! before we continue: we are building and improving this openDAW toolset for you. please give us honest, concrete feedback as the agent who actually used it: which tools worked well, which were clumsy or confusing, what errors or friction you hit (api naming, types, docs, listen results, device_reference, browse, subagents), what information you were missing to make better decisions, and what tools or capabilities you wish you had to make music that is louder, dirtier and more creative. rank your top 5 wishes. don't change the project for this answer.`

## User preferences

- No genre/style recipes in the prompt; the model knows music, researches named artists itself.
- Apparat is the primary tool for signature sounds; stock devices stay available (full palette).
- Subagents: no hard rules, only coordination (agree on ownership).
- Commits only on work branches; push only to `origin` (the fork), never upstream.

## Where we stand (2026-10-01)

- Tooling, routing, buses/sidechain and mixing are fine (user likes the mix architecture).
- The gap is genre vocabulary at note and sound level. Unguided runs write generic parts. The research swarm finds
  the right facts ("octave-jumping bass", "chord-changing bass") but doses them down ("keep jumps selective").
- With an exact spec in the user prompt (rolling bass following the chords, a jump note in every beat forming a
  counter-melody), the agent executes it perfectly. User verdict: still only "ok", so sound and production quality is
  the next gap after the notes.
- Subagents are only spawned when the user prompt asks for them.
- Goal: genre-correct results WITHOUT long per-genre user prompts.

## New, not yet tested live (2026-10-01)

- Resampling: `project.mixdown({units, from, to, tail})` renders units (post-FX, pre-fader) over an exact range;
  `openDAW.addSample(audio, name, bpm)`; audio regions with `loopDuration` chop in musical time. Agent samples that
  end up unused are deleted after each run (ledger), no "Keep Sample?" dialog. Guide chapter 06 "Resampling".
- DSP library for script devices: `device.code = Dsp.link(code)` inlines the referenced blocks (BLEP oscillators,
  unison, mip-mapped wavetables incl. Serum-format `@sample` tables and generated tables, SVF, ladder, comb, formant,
  oversampled shapers, crusher, ADSR, LFO with tempo lock, voices). Reference in `device_reference` Apparat/Werkstatt
  (~2.8k tokens), examples: DSP Growl Bass, DSP Supersaw Lead, DSP Reese Bass. Source: `studio/adapters/src/script-dsp/`.
- Benchmark for both: the dubstep/Skrillex prompt (sound-design bound).

Skrillex runs (Sol low, `make a sick brostep drop, 8 bars, skrillex style`, fresh project, no prompt hint):
- Run 1: found the library and the examples on its own, but the collapsed example (library shown as one comment line)
  broke `Dsp.link` and, assigned directly, left `Dsp` undefined; the example's `// @label` renamed its units. It concluded
  the examples were broken and fell back to a hand-written FM synth. Fixed: assigning device code links the library
  automatically (collapsed placeholder included, comments ignored), examples in device_reference drop `@label`,
  wavetables build every mip level at creation.
- Run 2: used the DSP Growl Bass example twice with different knob settings, wrote its own Sub from Dsp blocks,
  auditioned first. No resampling. Mix dark (highMid -24, high -36 dB). User: "chaotic and funny, better than before".
- Finding: complete example instruments act as presets. At low effort the agent loads the 117-line, 13-knob growl and
  turns knobs instead of designing a sound; the reference also says "use it instead of hand-written DSP".
  Next experiment: hide the examples from device_reference (keep them in the editor and tests), word the library as
  optional parts, same prompt again. Then: sound brief from research (how the defining sounds are made), a sound-design
  subagent per signature sound, one generic prompt line on resampling.
- CLAP feasibility (perception proxy): rank real growls vs. the agent's renders vs. contrast clips against text and a
  reference clip with a CLAP model (transformers.js, CPU). Build into audition/listen only if it separates them.

## Next levers

1. Eval harness: fixed prompt suite, identical runs, results side by side. Every prompt change gets an A/B, and anything
   without an effect is removed. Include an A/B against a minimal prompt (ours may be hurting).
2. References: the user drops MIDI, screenshots (image paste works) or audio; the agent analyses rhythm, intervals,
   density, spectrum and loudness and compares its own render against them (reference-track A/B in listen).
3. Research that returns concrete note-level patterns per defining part instead of adjectives.

## Prompt sections under test (remove what shows no effect)

| Section | Verify by | Result so far |
|---|---|---|
| Finishing bar (identity, phrases) | agent judges identity before finishing | no visible effect → remove unless an A/B shows one |
| Research as a real step | several searches, sources opened, findings applied | thin without the swarm; findings dosed down |
| Part brief per defining part | brief visible; parts follow the research | unverified |
| Sample library for drums | browse called for drums | low: no; medium and swarm: yes |

## Open issues

1. Masking was seen pairing a unit with its own group bus (`lead.output = MELODY`). `AgentRenderer.feedsOf` + test cover
   output routing and the code looks right; possibly observed before that fix. Verify live on the next run.
2. Sound artifacts: audition → save as user preset (openDAW preset system), apply by id in run_script, list via browse.
3. Gain-reduction traces for compressors/limiter; automation curve readback.
4. Maximizer has no true-peak limiting (engine, Rust). The agent sometimes stacks two Maximizers on the output.
5. CPU load: a worst block >100% was reported without a warning, readings unstable; separate warm-up/JIT outliers,
   report percentiles / consecutive overruns.
6. browse samples: filter one-shot vs loop, transient/tonal descriptors.
7. Neural Amp's model selector is not exposed through the scripting API/tools.
8. `apparat-starter-prompt.txt` (part of the Apparat card) still recommends hand-written PolyBLEP; align it with the DSP library.
9. Scripts cannot read the audio of existing library samples (only their own renders), so stock samples cannot be resampled.
10. DSP library gaps: wavetable warp modes, mip-level crossfade, through-zero FM, chorus/delay/reverb blocks, Werkstatt
    editor example.
11. Script device worst-block spikes (Growl 504%, a plain Dsp sine Sub 126%) in a few blocks per render: warm-up/JIT
    or a wavetable built when a parameter switches tables. Separate warm-up in the load meter, check table switching.

Not bugs (keep in mind): a script @param value resets only when its default in the code changes (same as the editor);
"Keep Sample?" is upstream's guard before deleting an orphaned user sample.

## Agent's own top wishes

1. Perceptual, loudness-matched audition/A-B (descriptions of distortion texture, transient impact, bass articulation).
2. Oversampled distortion + mastering with meters (multiband saturation, clipper, true-peak limiter, GR traces).
3. Resampling as a first-class workflow ("if you implement only one creative capability next").
4. Efficient DSP library for Apparat/Werkstatt (band-limited oscillators, tables, formant filters, oversampled nonlinearities).
5. Unified inspection + targeted patching that preserves parameter state.

## Parked roadmap

Resampling API, audio input once models accept it (`inputAudio` plumbing exists), DSP library for Apparat (CPU-safe
oscillators/filters/distortion), agent in live rooms, upstreaming generic fixes (PPQN docs, marker clamp, output getter,
asInstanceOf messages, Maximizer docs, Waveshaper `equation` validation: upstream's Devices test uses "tanh(x)" as valid).
