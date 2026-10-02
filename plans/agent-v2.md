# Agent v2: handoff notes

Codex-driven "producer agent" for openDAW, rebuilt on upstream main (fork `gitbute/openDAW`, branch `agent/v2`).
Work directly on `agent/v2` (normal commits, push to `origin`). History of runs and fixes: git log.

## Architecture

- `packages/studio/codex`: Codex App Server client (WebSocket JSON-RPC), `CodexSession`, `AgentTool`/`AgentToolbox` seam.
  Tool calls are serialised except tools flagged `concurrent` (read-only). Content gating by model `inputModalities`.
- `packages/app/studio/src/agent/`: the `daw` toolbox (`AgentToolboxes.ts`), prompt (`AgentInstructions.ts`, palette appended at
  session start from `DeviceCatalog.palette()`).
  - `script/`: `run_script`, type-checked TS against the upstream scripting API, one undo step per applied run.
  - `listen/` + `analysis/`: one `listen` tool with two sources: the project (exact offline render, mix + stems) or
    `sound` (instrument + effects + variations in throwaway sandbox projects, `audition/SoundSource.ts`; sound calls run
    concurrently via the per-call `concurrent` predicate). `focus` zooms views and descriptors into seconds or one note.
    Registries: sound descriptors (`analysis/SoundDescriptors.ts`, families in `analysis/descriptors/`) and views
    (`listen/ListenViews.ts`). AudioMetrics, masking, per-script-device CPU load.
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
- Subagents: fan out by default, research AND implementation (one per research angle, one per defining sound/part),
  for depth and speed; coordination via briefs and unit ownership.
- Prompt stays general: no detail prompting for one sound, synth or genre; better research is how the agent finds
  out what a sound needs (e.g. bass tutorials) and whether a device can make it.
- Commits only on work branches; push only to `origin` (the fork), never upstream.

## Where we stand (2026-10-01)

- Tooling, routing, buses/sidechain and mixing are fine (user likes the mix architecture).
- The gap is genre vocabulary at note and sound level. Unguided runs write generic parts. The research swarm finds
  the right facts ("octave-jumping bass", "chord-changing bass") but doses them down ("keep jumps selective").
- With an exact spec in the user prompt (rolling bass following the chords, a jump note in every beat forming a
  counter-melody), the agent executes it perfectly. User verdict: still only "ok", so sound and production quality is
  the next gap after the notes.
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
- CLAP feasibility (2026-10-01, parked): transformers.js on CPU, 1-7 s per 10 s clip. 20 clips: 7 stock bass loops
  (Skyence, Polarity, ModeAudio), 7 contrast clips (sub, acid pluck, house bass, drone, pad, drums, toy piano), 6 agent
  renders (DSP growl x3, reese, supersaw, run-1 FM growl, same riff, rendered in Node).
  `Xenova/clap-htsat-unfused`: categories separate well (pad -> "ambient pad", drums -> "drum loop", sub -> "sine sub");
  audio-to-reference similarity clusters the stock loops (0.64-0.78) above the agent renders (0.32-0.49). But
  "aggressive dubstep growl bass" scores the agent's raw synths (0.48-0.55) above the stock loops (0.28-0.31), and the
  stock library has no real growls to serve as positives. `Xenova/larger_clap_music_and_speech` is worse (pad 0.36 on
  "growl"). Verdict: coarse category check and reference similarity, not a quality judge; a text score in audition
  would likely be chased without better sound. Revisit only together with real reference clips.

## Analysis package (2026-10-02, built, smoke-tested live)

`listen` and `audition` merged into one `listen` (project or `sound`, `soundBars`), `focus` (seconds or one note),
sound descriptors per stem/variation (notes, envelope, pitch, timbre, movement, space, dynamics; project: only when
stems are listed or focus is set, within 240 stem-seconds), new views scope/spectrum/movement/stereo, new tool `probe`
(test signals through an effect chain: frequency, harmonics per level, transfer, IMD, compressor timing, impulse/RT60).
Shared DSP in `analysis/descriptors/dsp/` (MeasureMath, FftCache, PitchYin, HarmonicSpectrum, StereoBands,
SpectralFrames, ModulationRate, DecayTime); views and probe use it. Sizes: ~1.3 KB descriptors per stem unfocused,
~3.7 KB focused; probe ~2 KB per chain.
- Live smoke test (Sol low, real engine): all calls work, images arrive. Found and fixed: octave error read as -1217 cent
  glide. Observed: Vaporisateur's default resonance (q 0.1) overdamps the filter, so filterOrder 4 sounds very dark
  even at 4 kHz cutoff; the descriptors showed it (harmonics falling fast, centroid 74 Hz).
- Open: probe's steady-state tests (harmonics, dynamics, transfer) are skewed by reverb/delay tails; EDT reads 0 with a
  dominant dry path; uneven silence floors (-113/-120) in spectrumRegionsDb; Timbre runs its own pitch probe.
- Skrillex run 3 (Sol low, new toolset, ~4 min): researched, loaded the DSP Growl example again, auditioned 2 growl
  variations with `listen` + `sound` (descriptors), built drums/growls/metal replies/sub/laser hook with buses and returns,
  listened with stems listed, replaced a Vaporisateur sub that peaked at -37 dB with its own Apparat sub, final mix
  -10 LUFS / -1.4 dBTP. Did not use focus, the new views or probe. Found: pitch locked on the 5th harmonic of the growl
  (sub removed, weak fundamental) -> fixed (harmonic lock corrected when the played pitch is known); one listen printed
  the default spectrogram data URL via text() (56k tokens) — agent error, but the project default view makes it costly.
  User verdict by ear: pending.

## Ears: local audio LLMs tested and dropped (2026-10-02)

Goal was a judge that hears 10-20 s clips and says exactly how they sound. No cloud audio API is available (no Gemini
or OpenAI API key; Codex models accept text and images only), so only local models were options.

- Tested on the 20 CLAP clips (describe the sound; "is this a brostep growl"; rate 1-10; A/B pairs in both orders):
  MOSS-Music-8B-Instruct via HOT-Step CPP `ace-caption` (GGUF Q4_K_M and q8_0, ~2-3 s per clip on the 3090) and
  MOSS-Audio-4B-Instruct via CrispASR (Q4_K). Note: the plain transformers path drops MOSS's time markers and is worse.
- MOSS-Music: "heavily distorted synthesizer bass" template for nearly everything (supersaw lead included).
  MOSS-Audio: better coarse classes (lead vs bass vs drum vs bell, distorted vs clean consistent), but template text,
  wrong pitch claims (110 Hz for a 44 Hz riff), acid pluck = sub word for word.
- Both: every clip rated the same (8 resp. 5), every clip "not a growl", A/B answered by position (always B resp.
  mostly A). No judging, no comparing.
- Verdict: dropped. Coarse class/distortion info duplicates listen metrics and comes with confident errors the agent
  would chase. Better lever without ML: producer-style descriptors per clip in audition (distortion/harmonic density,
  modulation rate and depth, formant/vowel movement, brightness over time, attack/decay).

Also pending: the examples experiment (hide complete DSP instruments from device_reference, library as optional parts),
and a timeout for read-only tools (see open issue 12).

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
| Measured sound design (2026-10-02): listen bullet names what each view answers; SOUND SOURCES ends with "make it measurably match" (listen 'sound', descriptors, focus + scope/spectrum/movement, probe for chains); WORKING LOOP shapes each defining sound in isolation and lists defining stems | psy run uses 'sound', focus, the new views, probe | before (Sol low): only listen with stems + spectrogram/loudness, no 'sound'/focus/new views/probe. After (Sol low, "psy-vibe-tribe-prompt-v2"): 3x listen 'sound' (bass, arp lead, acid; one without variations), probe impulse on the Delay, stems listed, 7 listens in total; but views: [] everywhere (it printed results with text(), so it avoided images) and no focus. Fix: restored "request the views ... and look at them", code-cell snippet in prompt and every image hint. Run v3 ("psy-vibe-tribe-prompt-v3"): 8 images seen, scope+spectrum with 2 variations, but Vaporisateur bass again, research = 2 searches on "Vibe Tribe" only, no subagents; 2 failed listen calls (null for -Infinity in params, now accepted). User: v3 "not bad", bass lacking |
| Research and parallel work (2026-10-02): RESEARCH asks the era/albums question when ambiguous, then fans out research per angle (genre and era, comparable artists, how parts and sounds are made, producer sources); SUBAGENTS: research in parallel, then sound design and parts in parallel, one subagent per defining sound or part | run 4: era question, subagents for research and implementation, deeper sources, faster | Sol overloaded ("model at capacity"), Luna xhigh: asked era but slept in-turn waiting (deadlock with queued panel message), 21 min, 0 subagents, 10 of 16 listen calls failed on interface friction (focus with both fields, stems "none" with sound, MIDI velocity, PPQN positions; all fixed), sounded bad. Fixes: questions end the turn, viewOf (any view on any mixer channel), lenient parsing. Run 5 (Sol low, "psy-vibe-tribe-run5-viewof"): clean era question, 3 searches, 2 Apparat sounds shaped with sound + focus + scope/spectrum, probe, 14 images, 0 failed calls, 0 subagents. User: "the best we ever had". Codex has 4 concurrency slots (3 subagents + root); spawn_agent only as a direct tool call, not from code cells. The agent did not spawn even with spawn_agent named in RESEARCH, so fan-out moved to the user prompt (worked on 2026-10-01); RESEARCH stays a general chain incl. synth tutorials. Run 6 (user prompt asks for fan-out, "psy-vibe-tribe-run6-fanout"): 3 research agents spawned, but after ~90 s the root turned them into builders via followup_task (no wait_agent, no synthesis); a fresh build agent failed with "agent thread limit reached" (Codex counts finished agents until close_agent, openai/codex#22779). User: worse than run 5. Codex docs: automatic delegation only at Ultra, otherwise explicit request or AGENTS.md/skills; intended pattern spawn -> wait -> synthesize -> close. Fixes: SUBAGENTS = coordinator workflow (research agents, wait_agent all, synthesize, gap research, close_agent, fresh build agents with summary + brief + owned units, root owns arrangement and mix); focus.note works in the project (first viewOf channel / listed stem / mix); sound notes in PPQN are detected and converted. Codex multi-agent v2 has no close_agent (v1 had it): agents persist and keep their slot, so ~/.codex/config.toml now has [agents] max_concurrent_threads_per_session = 8 (9 slots incl. root, picked up without restart). Run 8 ("psy-vibe-tribe-run8-slots"): correct coordinator flow (3 research agents, wait_agent, then 5 fresh builders: drums, bass, hook, response, fx; follow-ups from root), heavy token use. Bass: user "3 octaves too high"; the bass builder saw hz 107 / G#1 / vsRequestedCents -55 on every check and ignored it (detuned half a semitone, register 55-110 Hz) -> measurements exist, the agent does not act on them. Steer button on the queued message (turn/steer); first version misread the response ({turnId}, not {turn}) and re-queued, fixed and tested against the real response shape. Note names for the agent switched to scientific pitch (C4 = MIDI 60, name/MIDI everywhere: pitch descriptor, inspect_notes, views), since "G#1" in openDAW naming (107 Hz) reads as ~52 Hz in tutorial naming. Solo run (Sol low, no subagents, prompt names the research sources: isratrance, "mother of all basslines", production threads, synth tutorials; "modern full-on psytrance, lots of bass note movement"; "fullon-solo-research"): user: "the best run ever". Takeaway so far: explicit research sources in the request beat subagent fan-out for quality and cost |

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
12. Agent hung on `browse({kind:"samples"})` (2026-10-01): the app's OPFS worker (`lib/fusion/src/opfs/OpfsWorker.ts`,
    per-path lock map) held a lock on one cached stock sample's `meta.json` (EO_DubTcno_126_Kick_Loop_01) that was never
    released, so `SampleStorage.list` never resolved. Files were intact; a tab reload (new worker) fixed it. Root cause
    unknown (enable the worker's DEBUG logging to catch the hanging operation; upstream candidate). Our fix to build:
    timeout for read-only tools (clear error after ~30 s) and browse samples falling back to stock when local listing hangs.

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
