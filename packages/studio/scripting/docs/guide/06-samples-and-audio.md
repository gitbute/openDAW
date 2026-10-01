---
title: Samples and Audio
group: Guide
order: 6
---

# Samples and Audio

## Finding samples

`await openDAW.listSamples()` returns every stock and user sample known to the studio as
{@link Sample} handles with `uuid`, `name`, `duration`, `bpm` and `sample_rate`.

```ts
const samples = await openDAW.listSamples()
const kick = samples.find(sample => sample.name.toLowerCase().includes("kick"))
```

## Creating samples

`openDAW.addSample(audioData, name)` imports raw audio into the studio and returns a handle. Build the audio with
`AudioData.create(sampleRate, numberOfFrames, numberOfChannels)` and write into `frames[channel]`.

```ts
const audio = AudioData.create(sampleRate, sampleRate * 2, 1)
const frames = audio.frames[0]
for (let index = 0; index < frames.length; index++) {
    frames[index] = Math.sin(index / sampleRate * 220 * Math.PI * 2) * Math.exp(-index / sampleRate * 3)
}
const pluck = await openDAW.addSample(audio, "Pluck")
```

`sampleRate` is the global holding the studio's sample rate.

## Playing samples

* {@link Playfield}: `addSample(sample, {note})` assigns a slot per note, each with
  envelope, pitch, start and end, its own effect chains.
* {@link Nano}: one sample, played chromatically.
* {@link Tape}: audio tracks with regions and clips.

```ts
const tape = project.addInstrumentUnit("Tape", {label: "Loops"})
const track = tape.audioTracks[0]
track.addRegion(loop, {position: 0, playback: "timestretch", playbackRate: 1})
track.addRegion(vocal, {position: PPQN.Bar * 4, playback: "signalsmith", transpose: -2})
track.addRegion(oneShot, {position: PPQN.Bar * 8, playback: "no-sync", duration: 1.5})
```

`playback` is fixed at creation. The default is `"pitch"` when the sample has a tempo and `"no-sync"` otherwise.
Regions and clips loop via `loopDuration` and `loopOffset` like notes do. `gain`, `fading.in`, `fading.out` and
the slopes shape the region.

## Soundfonts and impulse responses

{@link Soundfont} takes a `SoundfontFile` and a `presetIndex`, the file itself is chosen
in the studio. {@link ConvolverEffect} takes any sample as its `impulse`.

## Presets and DX7 cartridges

`openDAW.applyPreset(target, presetUuid)` loads a stock or user preset. An instrument preset replaces the
instrument of a unit (its effects and timeline stay), an effect preset replaces the given effect in place or is
appended when the target is a unit. It resolves with the device now holding the preset. Like every other edit it
becomes part of the script's undo step.

`openDAW.loadTubularVoice(tubular, cartridge, voice)` loads a voice of a bundled DX7 cartridge into a
{@link Tubular} by index or name.

```ts
const project = await openDAW.getProject()
const keys = project.addInstrumentUnit("Tubular", {label: "Keys"})
await openDAW.loadTubularVoice(keys.instrument, "Tubular Classics", "Rhodes")
project.openInStudio()
```

## Mixdown and saving files

`project.mixdown()` renders the project the script holds, including edits that were not yet applied with
`openInStudio()`, and resolves with {@link AudioData}. The studio shows a progress dialog while rendering.
`options.sampleRate` defaults to 48000.

`openDAW.saveFile(data, fileName, mimeType?)` offers any `ArrayBuffer` or typed array for download. The
studio asks for confirmation first, then opens the save dialog. `WavFile.encodeFloats(audioData)` turns
audio into a wav buffer.

```ts
const project = await openDAW.getProject()
const audio = await project.mixdown()
await openDAW.saveFile(WavFile.encodeFloats(audio), `${project.name}.wav`, "audio/wav")
```

Because the render is plain `AudioData`, a script can inspect or process it before saving, or hand it back
to the studio with `openDAW.addSample(audio, "Bounce")`.

## Resampling

`project.mixdown({units, from, to, tail})` renders only the given units (after their effects, before their
faders, so mute and volume do not apply) for an exact range in PPQN, plus `tail` seconds. Process the frames
(reverse, slice, normalize, re-pitch), add the result with `openDAW.addSample(audio, name, project.bpm)` and
play it back: as chops on a Tape track, in Playfield slots, or in an Apparat or Werkstatt `// @sample` slot.
Then render that and repeat.

```ts
const project = await openDAW.getProject()
const bass = project.findAudioUnit("Bass")
if (bass === null) {throw new Error("no unit 'Bass'")}
const audio = await project.mixdown({units: [bass], from: 0, to: PPQN.Bar})
const reversed = AudioData.create(audio.sampleRate, audio.numberOfFrames, audio.numberOfChannels)
audio.frames.forEach((channel, index) => reversed.frames[index].set(channel.slice().reverse()))
const growl = await openDAW.addSample(audio, "Bass Resample", project.bpm)
const growlReversed = await openDAW.addSample(reversed, "Bass Resample Reversed", project.bpm)
const track = project.addInstrumentUnit("Tape", {label: "Bass Chops"}).audioTracks[0]
const step = PPQN.SemiQuaver
track.addRegion(growl, {position: PPQN.Bar * 4, duration: step * 2, loopDuration: PPQN.Bar, loopOffset: step * 6})
track.addRegion(growlReversed, {position: PPQN.Bar * 4 + step * 2, duration: step * 2, loopDuration: PPQN.Bar,
    playback: "signalsmith", transpose: -12})
const pads = project.addInstrumentUnit("Playfield", {label: "Bass Pads"})
pads.instrument.addSample(growl, {note: 36, sampleStart: 0.5, sampleEnd: 0.625})
bass.mute = true
```

A chop with a tempo-following playback spans the whole sample over `loopDuration` and plays `duration` of it
from `loopOffset`. With `"no-sync"` use seconds instead: `{playback: "no-sync", duration: 0.25, waveformOffset: 0.5}`.
