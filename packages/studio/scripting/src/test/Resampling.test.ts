import {describe, expect, it} from "vitest"
import {AudioData, PPQN} from "@opendaw/lib-dsp"
import {UUID} from "@opendaw/lib-std"
import {AudioFileBox, AudioPitchStretchBox, AudioRegionBox, AudioSignalsmithBox, WarpMarkerBox} from "@opendaw/studio-boxes"
import {ScriptRunner} from "../ScriptRunner"
import {AgentScriptExecutor} from "../agent/AgentScriptExecutor"
import {createFixture, FakeHost, impl, sample} from "./Fixture"

const context = {sampleRate: 48000, baseFrequency: 440}

const withContent = () => {
    const fixture = createFixture()
    const bass = fixture.project.addInstrumentUnit("Vaporisateur", {label: "Bass"})
    bass.noteTracks[0].addRegion({position: 0, duration: PPQN.Bar})
    return {...fixture, bass}
}

const warpPositions = (box: AudioPitchStretchBox | AudioSignalsmithBox): ReadonlyArray<number> =>
    box.warpMarkers.pointerHub.incoming()
        .map(({box: marker}) => (marker as WarpMarkerBox).position.getValue())
        .sort((first, second) => first - second)

describe("Project.mixdown for resampling", () => {
    it("sends unit uuids, an exact range and the tail", async () => {
        const {project, host, bass} = withContent()
        const pad = project.addInstrumentUnit("Vaporisateur", {label: "Pad"})
        await project.mixdown({units: [bass, pad, bass], from: PPQN.Bar, to: PPQN.Bar * 2, tail: 0.5})
        expect(host.rendered[0].options).toEqual({
            sampleRate: 48000, units: [bass.uuid, pad.uuid], range: {from: PPQN.Bar, to: PPQN.Bar * 2, tail: 0.5}
        })
    })

    it("renders the master for a range and units for the whole project", async () => {
        const {project, host, bass} = withContent()
        await project.mixdown({from: 0, to: PPQN.Bar})
        expect(host.rendered[0].options).toEqual({sampleRate: 48000, range: {from: 0, to: PPQN.Bar, tail: 0}})
        await project.mixdown({units: [bass]})
        expect(host.rendered[1].options).toEqual({sampleRate: 48000, units: [bass.uuid]})
    })

    it("clamps the tail and refuses inconsistent options before reaching the host", async () => {
        const {project, host, bass, api} = withContent()
        await project.mixdown({from: 0, to: PPQN.Bar, tail: 99})
        expect(host.rendered[0].options.range?.tail).toBe(30)
        const foreign = api.newProject("Other").addInstrumentUnit("Vaporisateur")
        await expect(project.mixdown({units: []})).rejects.toThrow(RangeError)
        await expect(project.mixdown({units: [foreign]})).rejects.toThrow(TypeError)
        await expect(project.mixdown({units: ["Bass" as unknown as typeof bass]})).rejects.toThrow(TypeError)
        await expect(project.mixdown({from: 0})).rejects.toThrow(RangeError)
        await expect(project.mixdown({to: PPQN.Bar})).rejects.toThrow(RangeError)
        await expect(project.mixdown({tail: 1})).rejects.toThrow(RangeError)
        await expect(project.mixdown({from: PPQN.Bar, to: PPQN.Bar})).rejects.toThrow(RangeError)
        await expect(project.mixdown({from: -1, to: PPQN.Bar})).rejects.toThrow(RangeError)
        await expect(project.mixdown({from: NaN, to: PPQN.Bar})).rejects.toThrow(TypeError)
        bass.remove()
        await expect(project.mixdown({units: [bass], from: 0, to: PPQN.Bar})).rejects.toThrow()
        expect(host.rendered).toHaveLength(1)
    })
})

describe("openDAW.addSample tempo", () => {
    it("forwards an explicit tempo and refuses implausible ones", async () => {
        const {api, host} = createFixture()
        const audio = AudioData.create(48000, 4800, 2)
        expect((await api.addSample(audio, "Detect")).bpm).toBe(0)
        expect((await api.addSample(audio, "Fixed", 140)).bpm).toBe(140)
        expect((await api.addSample(audio, "None", 0)).bpm).toBe(0)
        await expect(api.addSample(audio, "Slow", 10)).rejects.toThrow(RangeError)
        await expect(api.addSample(audio, "Bad", NaN)).rejects.toThrow(TypeError)
        expect(host.samples).toHaveLength(3)
    })
})

describe("Audio region chops", () => {
    it("spans the whole sample over loopDuration so a short region plays a slice", () => {
        const {project} = createFixture()
        project.bpm = 120
        const track = project.addInstrumentUnit("Tape").audioTracks[0]
        const bar = sample("Resample", 2.0, 120)
        const chop = track.addRegion(bar, {position: 0, duration: PPQN.SemiQuaver * 2, loopDuration: PPQN.Bar, loopOffset: PPQN.SemiQuaver * 6})
        expect(chop.playback).toBe("pitch")
        expect(chop.duration).toBe(PPQN.SemiQuaver * 2)
        expect(chop.loopDuration).toBe(PPQN.Bar)
        expect(chop.loopOffset).toBe(PPQN.SemiQuaver * 6)
        const pitched = chop.box.playMode.targetVertex.unwrap().box as AudioPitchStretchBox
        expect(warpPositions(pitched)).toEqual([0, PPQN.Bar])
        const shifted = track.addRegion(bar, {position: PPQN.SemiQuaver * 2, duration: PPQN.SemiQuaver * 2, loopDuration: PPQN.Bar, playback: "signalsmith", transpose: -12})
        expect(shifted.transpose).toBe(-12)
        expect(warpPositions(shifted.box.playMode.targetVertex.unwrap().box as AudioSignalsmithBox)).toEqual([0, PPQN.Bar])
        const fitted = track.addRegion(bar, {position: PPQN.Bar, duration: PPQN.Bar * 2})
        expect(warpPositions(fitted.box.playMode.targetVertex.unwrap().box as AudioPitchStretchBox)).toEqual([0, PPQN.Bar * 2])
        const seconds = track.addRegion(sample("Hit", 1.0), {position: PPQN.Bar * 3, duration: 0.25, waveformOffset: 0.5})
        expect(seconds.playback).toBe("no-sync")
        expect(seconds.duration).toBe(0.25)
        expect(seconds.waveformOffset).toBe(0.5)
        expect(() => track.addRegion(bar, {position: PPQN.Bar * 4, loopDuration: 0})).toThrow(RangeError)
    })
})

describe("Resampling script", () => {
    it("renders a unit, reverses a copy and plays chops from a Tape track, a Playfield and an Apparat", async () => {
        const host = new FakeHost()
        const project = await new ScriptRunner(host).run(`
            const project = openDAW.newProject("Resample")
            project.bpm = 140
            const bass = project.addInstrumentUnit("Vaporisateur", {label: "Bass"})
            bass.noteTracks[0].addRegion({position: 0, duration: PPQN.Bar})
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
            const apparat = project.addInstrumentUnit("Apparat", {label: "Granular"}).instrument
            apparat.code = "// @sample source\\nclass Processor {}"
            apparat.sample("source").sample = growlReversed
            bass.mute = true
            return project`, context) as ReturnType<typeof impl>
        expect(host.rendered[0].options).toEqual({
            sampleRate: 48000, units: [project.findAudioUnit("Bass")?.uuid], range: {from: 0, to: PPQN.Bar, tail: 0}
        })
        expect(host.samples.map(({name, bpm}) => [name, bpm])).toEqual([["Bass Resample", 140], ["Bass Resample Reversed", 140]])
        const [growl, growlReversed] = host.samples
        const {boxGraph} = impl(project).context
        const files = boxGraph.boxes().filter(box => box instanceof AudioFileBox).map(box => UUID.toString(box.address.uuid))
        expect(files.toSorted()).toEqual([growl.uuid, growlReversed.uuid].toSorted())
        expect(boxGraph.boxes().filter(box => box instanceof AudioRegionBox)).toHaveLength(2)
        const chops = project.findAudioUnit("Bass Chops")
        if (chops?.kind !== "instrument") {throw new Error("chops missing")}
        expect(chops.audioTracks[0].regions.map(region => [region.sample.name, region.duration, region.loopOffset]))
            .toEqual([["Bass Resample", PPQN.SemiQuaver * 2, PPQN.SemiQuaver * 6], ["Bass Resample Reversed", PPQN.SemiQuaver * 2, 0]])
        const pads = project.findAudioUnit("Bass Pads")
        if (pads?.kind !== "instrument" || pads.instrument.key !== "Playfield") {throw new Error("pads missing")}
        expect(pads.instrument.slot(36)?.sample.uuid).toBe(growl.uuid)
        expect(pads.instrument.slot(36)?.sampleStart).toBeCloseTo(0.5)
        const granular = project.findAudioUnit("Granular")
        if (granular?.kind !== "instrument" || granular.instrument.key !== "Apparat") {throw new Error("apparat missing")}
        expect(granular.instrument.sample("source").sample?.uuid).toBe(growlReversed.uuid)
        expect(() => project.validate()).not.toThrow()
    })

    it("forwards the request from an agent run", async () => {
        const host = new FakeHost()
        const live = new ScriptRunner(host)
        await live.run(`
            const project = openDAW.newProject("Live")
            const bass = project.addInstrumentUnit("Vaporisateur", {label: "Bass"})
            bass.noteTracks[0].addRegion({position: 0, duration: PPQN.Bar})
            project.openInStudio()`, context)
        const outcome = await new AgentScriptExecutor(host).executeAgentScript(`
            const project = await openDAW.getProject()
            const bass = project.findAudioUnit("Bass")
            const audio = await project.mixdown({units: [bass], from: 0, to: PPQN.Bar, tail: 1})
            const sample = await openDAW.addSample(audio, "Bass Resample", 0)
            return {frames: audio.numberOfFrames, bpm: sample.bpm}`, context)
        expect(outcome.error).toBeNull()
        expect(JSON.parse(outcome.returned)).toEqual({frames: 48000, bpm: 0})
        expect(host.rendered[0].options.range).toEqual({from: 0, to: PPQN.Bar, tail: 1})
        expect(host.rendered[0].options.units).toHaveLength(1)
    })
})
