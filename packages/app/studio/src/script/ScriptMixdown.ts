import {DefaultObservableValue, int, isDefined, Option, panic, UUID} from "@opendaw/lib-std"
import {AudioData} from "@opendaw/lib-dsp"
import {ExportConfiguration, ExportStemConfiguration} from "@opendaw/studio-adapters"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {OfflineEngineRenderer, Project} from "@opendaw/studio-core"
import {MixdownRequest} from "@opendaw/studio-scripting"

export namespace ScriptMixdown {
    export const MaxSeconds = 600

    const stem = (fileName: string): ExportStemConfiguration =>
        ({includeAudioEffects: true, includeSends: true, useInstrumentOutput: false, skipChannelStrip: true, fileName})

    const configuration = (project: Project, units: ReadonlyArray<string>): ExportConfiguration => ({
        stems: Object.fromEntries(units.map(uuid => {
            const box = project.boxGraph.findBox(UUID.parse(uuid)).unwrapOrNull()
            if (!(box instanceof AudioUnitBox)) {return panic(`Unknown audio unit ${uuid}`)}
            return [uuid, stem(uuid)]
        }))
    })

    const sum = (channels: ReadonlyArray<Float32Array>, sampleRate: int, numberOfFrames: int): AudioData => {
        const audio = AudioData.create(sampleRate, numberOfFrames, 2)
        channels.forEach((channel, index) => {
            const target = audio.frames[index % 2]
            for (let frame = 0; frame < numberOfFrames; frame++) {target[frame] += channel[frame]}
        })
        return audio
    }

    // Renders on a throwaway project the caller owns and terminates.
    export const render = async (project: Project, {sampleRate, units, range}: MixdownRequest,
                                 progress: DefaultObservableValue<number>, abortSignal?: AbortSignal): Promise<AudioData> => {
        if (!isDefined(units) && !isDefined(range)) {
            return OfflineEngineRenderer.start(project, Option.None, progress, abortSignal, sampleRate)
        }
        const exportConfiguration = isDefined(units) ? Option.wrap(configuration(project, units)) : Option.None
        const {boxGraph, timelineBox: {loopArea: {enabled}}, rootBoxAdapter} = project
        boxGraph.beginTransaction()
        if (isDefined(units)) {rootBoxAdapter.audioUnits.adapters().forEach(unit => unit.box.solo.setValue(false))}
        enabled.setValue(false)
        boxGraph.endTransaction()
        if (!isDefined(range)) {
            const audio = await OfflineEngineRenderer.start(project, exportConfiguration, progress, abortSignal, sampleRate)
            return sum(audio.frames, sampleRate, audio.numberOfFrames)
        }
        const {from, to, tail} = range
        const seconds = project.tempoMap.intervalToSeconds(from, to) + tail
        if (seconds > MaxSeconds) {return panic(new RangeError(`The render would last ${seconds.toFixed(1)}s, the limit is ${MaxSeconds}s`))}
        const numberOfFrames = Math.max(1, Math.round(seconds * sampleRate))
        const renderer = await OfflineEngineRenderer.create(project, exportConfiguration, sampleRate, abortSignal)
        const channels = await renderer.renderFrames(from, numberOfFrames, abortSignal)
        progress.setValue(1.0)
        return sum(channels, sampleRate, numberOfFrames)
    }
}
