---
title: Automation and Modulation
group: Guide
order: 5
---

# Automation and Modulation

## Automation tracks

`unit.addValueTrack(target, path)` creates a lane for a parameter of the unit itself, its instrument, any of its
effects, sends or Playfield slots. A parameter has at most one lane per unit, `unit.valueTrack(target, path)`
finds it.

A point takes its value either as `nativeValue`, in the parameter's own unit (Hz, dB, seconds, ...), or as
`value`, normalized 0.0 to 1.0 over the parameter's range. Prefer `nativeValue`: the conversion uses the
parameter's real curve (see {@link ParameterInfo}). Reading `event.nativeValue` converts back. Two points at the
same position form a step.

Filter sweep in Hz:

```ts
const eq = bus.addAudioEffect("Revamp", {highPass: {enabled: true}})
const sweep = bus.addValueTrack(eq, "highPass.frequency").addRegion({duration: PPQN.Bar * 8})
sweep.addEvents([
    {position: 0, nativeValue: 20},
    {position: PPQN.Bar * 7, nativeValue: 1200, interpolation: Interpolation.Curve(0.7)},
    {position: PPQN.Bar * 8, nativeValue: 20}
])
```

Normalized values still work, `lane.parameterInfo` converts between both:

```ts
const lane = synth.addValueTrack(synth.instrument, "cutoff")
const region = lane.addRegion({duration: PPQN.Bar * 4})
region.addEvents([
    {position: 0, value: 0.1},
    {position: PPQN.Bar * 4, value: lane.parameterInfo.toNormalized(8000)}
])
```

Automation can also live in clips (`lane.addClip()`).

## Mixer automation: volume, pan, mute, sends

Every unit's fader is automatable, including aux (return), group (bus) and output units, and so are send levels.
No gain effect is needed to ride a bus or a return:

```ts
const reverb = project.findAuxUnit("Reverb") ?? project.addAuxUnit({label: "Reverb"})
reverb.addValueTrack(reverb, "volume").addRegion({duration: PPQN.Bar * 8}).addEvents([
    {position: 0, nativeValue: -24},          // dB
    {position: PPQN.Bar * 8, nativeValue: -6}
])
const send = synth.addSend(reverb, {amount: -18})
synth.addValueTrack(send, "amount").addRegion({duration: PPQN.Bar * 4}).addEvents([
    {position: 0, nativeValue: -30},
    {position: PPQN.Bar * 4, nativeValue: -9}
])
synth.addValueTrack(synth, "panning")
synth.addValueTrack(synth, "mute").addRegion().addEvent({position: 0, nativeValue: 1})  // 1 = muted
```

The lane lives on any unit (typically the one it controls): `unit.addValueTrack(target, path)`.

## Modulators

`project.addModulator(kind, props)` creates an LFO, Steps, Macro or Random modulator. `modulator.assign(target,
path, depth)` connects it to a parameter and returns a {@link Modulation} whose `depth`
and `enabled` can be changed later.

```ts
const lfo = project.addModulator("LFO", {label: "Wobble", rateSync: 8, shape: 0})
lfo.assign(synth.instrument, "cutoff", 0.4)
lfo.assign(synth.instrument.lfo, "rate", -0.2)

const steps = project.addModulator("Steps", {count: 8})
steps.setSteps([1, 0, 0.5, 0, 1, 0, 0.5, 0.25])
steps.assign(drums.instrument.slots[0], "pitch", 0.5)
```

Modulator parameters and assignment depths can be automated as well: `modulator.addValueTrack(modulator,
"rateAbsolute")` or `modulator.addValueTrack(modulation, "depth")`.

## Tempo

```ts
project.tempoTrack.enabled = true
project.tempoTrack.addEvent({position: 0, bpm: 120})
project.tempoTrack.addEvent({position: PPQN.Bar * 16, bpm: 128, interpolation: Interpolation.Linear})
```
