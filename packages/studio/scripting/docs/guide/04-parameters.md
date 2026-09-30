---
title: Parameters and Paths
group: Guide
order: 4
---

# Parameters and Paths

Every device, unit, send, slot and modulator exposes its parameters as plain properties. Nested objects are
plain properties too:

```ts
synth.instrument.cutoff = 800
synth.instrument.lfo.rate = 4
synth.instrument.oscillators[1].volume = -12
```

## Construction props

Every `add...` method takes the same properties as an object, nested objects included. Unknown keys are ignored,
read-only properties and methods are not accepted.

```ts
project.addInstrumentUnit("Vaporisateur", {label: "Pad", volume: -9}, {
    attack: 0.4,
    lfo: {rate: 0.3, targetCutoff: 0.4},
    oscillators: [{waveform: ClassicWaveform.Saw}, {volume: -6, octave: -1}]
})
```

## Parameter paths

Automation and modulation address a parameter by its path, a string like `"cutoff"`, `"lfo.rate"` or
`"oscillators.1.volume"`. The path type is derived from the target, so the editor completes valid paths and
rejects invalid ones:

```ts
synth.addValueTrack(synth.instrument, "lfo.rate")
lfo.assign(synth.instrument, "oscillators.0.volume", 0.3)
synth.addValueTrack(synth, "volume")
synth.addValueTrack(synth.sends[0], "amount")
```

Only primitive properties (numbers and booleans) form paths. References like `sample` or `sideChain` do not.

## Units, ranges and normalized values

Properties hold native values (Hz, dB, seconds, ...). Automation points store normalized values (0.0 to 1.0)
mapped over the parameter's range with its own curve (exponential for frequencies, a decibel curve for gains).
`project.parameter(target, path)` returns a {@link ParameterInfo} with the unit, the range and the exact
conversion the studio uses, so there is no need to guess a mapping:

```ts
const eq = bus.addAudioEffect("Revamp")
const frequency = project.parameter(eq, "highPass.frequency")
frequency.unit                  // "Hz"
frequency.min, frequency.max    // 20, 20000
frequency.toNormalized(440)     // normalized value for 440 Hz
frequency.fromNormalized(0.5)   // 632.45 (Hz)
frequency.format(440)           // "440 Hz"

const volume = project.parameter(synth, "volume")
volume.toNormalized(-6)         // normalized value for -6 dB
```

Booleans (`mute`, `enabled`, ...) map to 0 and 1. Script device parameters (`// @param`) use their declared range:
`project.parameter(werkstatt.parameter("tone"), "value")`.

## Discriminated unions

Collections hold unions, narrow them by their discriminator:

```ts
project.audioUnits.forEach(unit => {
    if (unit.kind === "instrument" && unit.instrument.key === "Vaporisateur") {
        unit.instrument.cutoff = 1000
    }
})
unit.audioEffects.forEach(effect => {
    if (effect.key === "Delay") {effect.feedback = 0.3}
})
```
