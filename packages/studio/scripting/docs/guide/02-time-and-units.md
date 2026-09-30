---
title: Time and Units
group: Guide
order: 2
---

# Time and Units

## PPQN

All timeline positions and durations are in pulses per quarter note. A quarter note is 960 pulses, never 480.
Prefer the constants and helpers over literal numbers.

| Constant          | Pulses | Meaning                       |
|-------------------|--------|-------------------------------|
| `PPQN.Bar`        | 3840   | one bar in 4/4                |
| `PPQN.Quarter`    | 960    | one beat                      |
| `PPQN.SemiQuaver` | 240    | one sixteenth                 |

Derive other lengths by arithmetic, `PPQN.Quarter / 2` is an eighth (480), `PPQN.Quarter / 3` a triplet eighth,
`PPQN.Bar * 8` eight bars. `PPQN.fromSignature(numerator, denominator)` gives the length of `numerator` notes of
1/`denominator`, so `PPQN.fromSignature(3, 4)` is a 3/4 bar.

| Helper                   | Result    | Meaning                                  |
|--------------------------|-----------|------------------------------------------|
| `PPQN.fromBars(8)`       | 30720     | length of eight 4/4 bars                 |
| `PPQN.fromBars(2, 3, 4)` | 5760      | length of two 3/4 bars                   |
| `PPQN.at(1)`             | 0         | start of bar 1                           |
| `PPQN.at(3, 2, 3)`       | 8640      | bar 3, beat 2, sixteenth 3 (all 1-based) |
| `PPQN.toString(8640)`    | "3.2.3:0" | the inverse of `PPQN.at`                 |

`PPQN.at` and `PPQN.fromBars` assume 4/4 unless a signature is passed as the last two arguments. They ignore
signature changes on the timeline, use `project.signatureTrack` to locate bars after a change.

```ts
// drums is an instrument unit: a one-bar sixteenth hi-hat pattern from bar 5, looped for eight bars
const region = drums.noteTracks[0].addRegion({position: PPQN.at(5), duration: PPQN.fromBars(8), loopDuration: PPQN.Bar})
for (let step = 0; step < 16; step++) {region.addEvent({position: step * PPQN.SemiQuaver, duration: PPQN.SemiQuaver / 2, pitch: 42})}
```

Conversions: `PPQN.secondsToPulses(seconds, bpm)` and `PPQN.pulsesToSeconds(pulses, bpm)`.

Script devices use the same unit. Apparat and Werkstatt receive `block.p0`/`block.p1`, Spielwerk `block.from`/
`block.to` and schedules note `position`/`duration`, all as absolute timeline pulses at 960 per quarter note. There is
no `PPQN` global inside device code, so write the numbers out: 240 per sixteenth, 3840 per 4/4 bar.

Positions inside a region or clip are relative to its start. A region plays its content from `loopOffset`, so a
region starting at `PPQN.Quarter * 2` with `loopOffset: PPQN.Quarter` begins with the second beat of its notes.

## Audio regions

An audio region that does not follow the tempo (`playback: "no-sync"`) has its `duration`, `loopDuration` and
`loopOffset` in seconds instead of pulses. Every other playback mode uses pulses.

## Levels

Everything called `volume`, `gain`, `wet`, `dry`, `amount` (on sends) is in decibels. `-Infinity` is silence, `0`
is unity. `dbToGain()` and `gainToDb()` convert to and from linear factors.

## Normalized values

Parameters typed `unitValue` run from 0.0 to 1.0, `bipolar` from -1.0 to 1.0. Automation points
(`ValueEvent.value`) are always normalized 0.0 to 1.0 regardless of the parameter's own range.

## Pitch

Notes are MIDI pitches, 60 is middle C. `midiToHz(note)` gives the frequency in Hz using the project's
`baseFrequency` (440 Hz by default). `Chord` helps building intervals.

## Ranges and clamping

Every documented range is enforced. A numeric value outside its range is clamped, a wrong type or an unknown
enumeration value throws. See [Validation](./07-validation.md).
