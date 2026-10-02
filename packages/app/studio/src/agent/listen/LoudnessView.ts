import {int} from "@opendaw/lib-std"
import {AgentRender} from "./AgentRender"
import {LegendEntry, ViewContext, ViewKit, ViewRect} from "./ViewKit"

export type LoudnessOptions = {
    readonly title?: string
    readonly width?: int
    readonly height?: int
    readonly minDb?: number
}

export type LoudnessSeries = {
    readonly label: string
    readonly color: string
    readonly curve: Float32Array
    readonly rmsDb: number
}

export namespace Loudness {
    export const WindowSeconds = 0.4
    export const Margin = {left: 40, right: 16, bottom: 10} as const

    // RMS in dBFS of the channel mean power, one value per hop, over the hops within the window centered on it
    export const rmsCurve = (channels: ReadonlyArray<Float32Array>, hopFrames: int, windowFrames: int): Float32Array => {
        const length = channels.length === 0 ? 0 : channels[0].length
        const count = hopFrames <= 0 ? 0 : Math.ceil(length / hopFrames)
        const sums = new Float64Array(count)
        const frames = new Float64Array(count)
        for (let hop = 0; hop < count; hop++) {
            const end = Math.min(length, (hop + 1) * hopFrames)
            let power = 0.0
            for (const channel of channels) {
                for (let index = hop * hopFrames; index < end; index++) {power += channel[index] * channel[index]}
            }
            sums[hop] = power / channels.length
            frames[hop] = end - hop * hopFrames
        }
        const reach = Math.max(0, Math.round((windowFrames / hopFrames - 1) / 2))
        const curve = new Float32Array(count)
        for (let hop = 0; hop < count; hop++) {
            let power = 0.0
            let total = 0.0
            for (let index = Math.max(0, hop - reach); index <= Math.min(count - 1, hop + reach); index++) {
                power += sums[index]
                total += frames[index]
            }
            curve[hop] = 10 * Math.log10(power / Math.max(1, total) + 1e-20)
        }
        return curve
    }

    export const integratedRmsDb = (channels: ReadonlyArray<Float32Array>, frames: int): number => {
        let sum = 0.0
        let count = 0
        for (const channel of channels) {
            const end = Math.min(frames, channel.length)
            for (let index = 0; index < end; index++) {sum += channel[index] * channel[index]}
            count += end
        }
        return count === 0 ? -Infinity : 10 * Math.log10(sum / count + 1e-20)
    }

    export const hopFrames = (render: AgentRender, totalFrames: int, plotWidth: number): int =>
        Math.max(1, Math.round(render.stepSeconds * render.sampleRate), Math.ceil(totalFrames / Math.max(1, plotWidth)))

    export const formatDb = (value: number): string => Number.isFinite(value) && value > -200 ? `${value.toFixed(1)} dB` : "silent"

    export const series = (render: AgentRender, hop: int): ReadonlyArray<LoudnessSeries> => {
        const window = Math.round(WindowSeconds * render.sampleRate)
        const musicalFrames = Math.round((render.durationSeconds - render.tailSeconds) * render.sampleRate)
        return [
            {label: "Mix", color: ViewKit.Colors.mix, channels: render.mix},
            ...render.stems.map(({label, channels}, index) => ({label, color: ViewKit.seriesColor(index), channels}))
        ].map(({label, color, channels}) => ({
            label, color, curve: rmsCurve(channels, hop, window), rmsDb: integratedRmsDb(channels, musicalFrames)
        }))
    }

    export const valueToY = (value: number, rect: ViewRect, minDb: number): number =>
        rect.y + rect.height * Math.max(0, Math.min(1, value / minDb))

    export const draw = (context: ViewContext, render: AgentRender, width: int, height: int, options?: LoudnessOptions): void => {
        const minDb = options?.minDb ?? -60.0
        const {mix, bars, bpm} = render
        const totalFrames = mix.length === 0 ? 0 : mix[0].length
        const plotWidth = width - Margin.left - Margin.right
        const hop = hopFrames(render, totalFrames, plotWidth)
        const lines = series(render, hop)
        ViewKit.fillBackground(context, width, height)
        ViewKit.text(context, `${options?.title ?? "RMS loudness"} (${WindowSeconds * 1000} ms window, dBFS) - ${ViewKit.barRange(bars)} -${Math.round(bpm * 100) / 100} BPM`,
            Margin.left, 14, "left", "middle")
        const legend: ReadonlyArray<LegendEntry> = lines.map(({label, color, rmsDb}) => ({label: `${label} ${formatDb(rmsDb)}`, color}))
        const legendBottom = ViewKit.drawLegend(context, legend, Margin.left, 32, plotWidth)
        const top = legendBottom + 12
        const rect: ViewRect = {x: Margin.left, y: top, width: plotWidth, height: Math.max(32, height - top - Margin.bottom)}
        ViewKit.plot(context, rect)
        const step = minDb < -48 ? 12 : 6
        for (let db = 0; db >= minDb; db -= step) {
            const y = valueToY(db, rect, minDb)
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, ViewKit.Colors.grid)
            ViewKit.text(context, `${db}`, rect.x - 4, y, "right", "middle", ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
        ViewKit.drawBars(context, render, [rect], rect.y - 2)
        const drawLine = ({color, curve}: LoudnessSeries, lineWidth: number): void => ViewKit.strokeCurve(context, curve,
            index => ViewKit.frameToX((index + 0.5) * hop, totalFrames, rect), value => valueToY(value, rect, minDb), color, lineWidth)
        lines.slice(1).forEach(line => drawLine(line, 1.5))
        if (lines.length > 0) {drawLine(lines[0], 2.5)}
    }
}

export const renderLoudnessPng = async (render: AgentRender, options?: LoudnessOptions): Promise<string> => {
    const [width, height] = ViewKit.clampSize(options?.width ?? ViewKit.MaxWidth, options?.height ?? 384)
    const [canvas, context] = ViewKit.createContext(width, height)
    Loudness.draw(context, render, width, height, options)
    return ViewKit.toPngDataUrl(canvas)
}
