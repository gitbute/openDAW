import {int} from "@opendaw/lib-std"
import {bpm, gainToDb, seconds} from "@opendaw/lib-dsp"
import {BarRange} from "./RenderTimeline"
import type {DeviceLoadEntry} from "./DeviceLoad"

export type StemRequest = "none" | "all" | ReadonlyArray<string>

export type AgentRenderRequest = {
    readonly bars?: BarRange
    readonly stems?: StemRequest
    readonly tailSeconds?: seconds
}

export type AgentRenderStem = {
    readonly label: string
    readonly unitUuid: string
    readonly channels: ReadonlyArray<Float32Array>
    readonly silent: boolean
    // labels of the units this unit's signal reaches through outputs and sends, transitively
    readonly feeds: ReadonlyArray<string>
}

export type AgentRender = {
    readonly sampleRate: number
    readonly mix: ReadonlyArray<Float32Array>
    readonly stems: ReadonlyArray<AgentRenderStem>
    readonly bars: BarRange
    readonly startSeconds: seconds
    readonly durationSeconds: seconds
    readonly tailSeconds: seconds
    readonly barStartFrames: ReadonlyArray<int>
    readonly stepSeconds: seconds
    readonly bpm: bpm
    readonly signature: [int, int]
    readonly warnings: ReadonlyArray<string>
    readonly deviceLoad?: ReadonlyArray<DeviceLoadEntry>
}

export namespace AgentRender {
    export const SilenceThresholdDb = -90.0

    export const peak = (channels: ReadonlyArray<Float32Array>): number => {
        let max = 0.0
        for (const channel of channels) {
            for (let index = 0; index < channel.length; index++) {
                const value = Math.abs(channel[index])
                if (value > max) {max = value}
            }
        }
        return max
    }

    export const peakDb = (channels: ReadonlyArray<Float32Array>): number => gainToDb(peak(channels))

    export const isSilent = (channels: ReadonlyArray<Float32Array>): boolean =>
        peakDb(channels) < SilenceThresholdDb

    export const related = (first: AgentRenderStem, second: AgentRenderStem): boolean =>
        first.feeds.includes(second.label) || second.feeds.includes(first.label)

    export type StemSelection = { readonly indices: ReadonlyArray<int>, readonly unknown: ReadonlyArray<string> }

    export const selectStems = (labels: ReadonlyArray<string>, request: StemRequest): StemSelection => {
        if (request === "none") {return {indices: [], unknown: []}}
        if (request === "all") {return {indices: labels.map((_label, index) => index), unknown: []}}
        const indices: Array<int> = []
        const unknown: Array<string> = []
        request.forEach(wanted => {
            const exact = labels.indexOf(wanted)
            const index = exact >= 0 ? exact
                : labels.findIndex(label => label.toLowerCase() === wanted.trim().toLowerCase())
            if (index < 0) {
                unknown.push(wanted)
            } else if (!indices.includes(index)) {
                indices.push(index)
            }
        })
        return {indices: indices.sort((left, right) => left - right), unknown}
    }
}
