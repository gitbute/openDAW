import {int, isDefined, panic} from "@opendaw/lib-std"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import type {AgentRender} from "./AgentRender"
import type {BarRange} from "./RenderTimeline"
import type {ViewRequest} from "./ListenViews"

export type ViewRect = { readonly x: number, readonly y: number, readonly width: number, readonly height: number }

export type BarTick = { readonly x: number, readonly bar: int, readonly labeled: boolean }

export type LegendEntry = { readonly label: string, readonly color: string }

export type ViewContext = OffscreenCanvasRenderingContext2D

export namespace ViewKit {
    export const MaxWidth = 1024
    export const MaxHeight = 512

    export const Colors = {
        background: "#15171c",
        plot: "#08090b",
        grid: "rgba(255,255,255,0.10)",
        gridStrong: "rgba(255,255,255,0.32)",
        text: "#e4e7ee",
        textDim: "#9aa3b2",
        tail: "rgba(255,255,255,0.06)",
        mix: "#ffffff"
    } as const

    export const Series: ReadonlyArray<string> = [
        "#4e9bff", "#ff7a45", "#3ddc84", "#f5c542", "#c678ff", "#ff5c8a", "#39d0d8", "#a3e635",
        "#ff9ecd", "#8c9eff", "#ffd8a8", "#63e6be"
    ]

    export const NoteColor = "rgba(245,197,66,0.75)"
    export const LeftColor = Series[0]
    export const RightColor = Series[1]

    export const Font = "12px sans-serif"
    export const SmallFont = "10px sans-serif"

    export const CompactSize = {width: 512, height: 200} as const

    export const seriesColor = (index: int): string => Series[index % Series.length]

    export const clampSize = (width: int, height: int): [int, int] =>
        [Math.max(64, Math.min(MaxWidth, Math.round(width))), Math.max(64, Math.min(MaxHeight, Math.round(height)))]

    export const viewSize = (compact: boolean, fullHeight: int): [int, int] =>
        compact ? clampSize(CompactSize.width, CompactSize.height) : clampSize(MaxWidth, fullHeight)

    export const barRange = ({from, to}: BarRange): string => from === to ? `bar ${from}` : `bars ${from}-${to}`

    export const niceStep = (raw: number): number => {
        const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
        const normalized = raw / magnitude
        return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
    }

    export const timeTicks = (durationSeconds: number, plotWidth: number, minSpacing: number): ReadonlyArray<number> => {
        if (durationSeconds <= 0 || plotWidth <= 0) {return []}
        const step = niceStep(durationSeconds * minSpacing / plotWidth)
        const ticks: Array<number> = []
        for (let index = 0; index * step <= durationSeconds + step * 1e-6; index++) {ticks.push(index * step)}
        return ticks
    }

    export const formatSeconds = (seconds: number, step: number): string => {
        if (step < 0.01) {return `${Number((seconds * 1000).toFixed(step < 0.001 ? 1 : 0))}ms`}
        const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
        return `${seconds.toFixed(digits)}s`
    }

    /** Tick label with the unit on the topmost tick only. */
    export const axisLabel = (value: string, unit: string, top: boolean): string => top ? `${value} ${unit}` : value

    export const labelStride = (count: int, spacing: number, minSpacing: number): int => {
        let stride = 1
        while (stride < count && spacing * stride < minSpacing) {stride *= 2}
        return stride
    }

    export const frameToX = (frame: number, totalFrames: number, rect: ViewRect): number =>
        rect.x + (totalFrames <= 0 ? 0 : frame / totalFrames) * rect.width

    export const barTicks = (barStartFrames: ReadonlyArray<int>, firstBar: int, totalFrames: int,
                             rect: ViewRect, minLabelSpacing: number = 24): ReadonlyArray<BarTick> => {
        const count = barStartFrames.length
        const spacing = count > 1
            ? (frameToX(barStartFrames[count - 1], totalFrames, rect) - frameToX(barStartFrames[0], totalFrames, rect)) / (count - 1)
            : rect.width
        const stride = labelStride(count, spacing, minLabelSpacing)
        return barStartFrames.map((frame, index) => ({
            x: frameToX(frame, totalFrames, rect), bar: firstBar + index, labeled: index % stride === 0
        }))
    }

    export const logUnit = (frequency: number, minFrequency: number, maxFrequency: number): number =>
        Math.log(frequency / minFrequency) / Math.log(maxFrequency / minFrequency)

    export const formatHz = (frequency: number): string =>
        frequency >= 1000 ? `${Number((frequency / 1000).toFixed(1))}k` : `${Math.round(frequency)}`

    export const frequencyTicks = (minFrequency: number, maxFrequency: number, dense: boolean): ReadonlyArray<number> =>
        (dense ? [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : [100, 1000, 10000])
            .filter(frequency => frequency >= minFrequency && frequency <= maxFrequency)

    const HeatStops: ReadonlyArray<readonly [number, number, number, number]> = [
        [0.00, 0, 0, 4], [0.20, 40, 11, 84], [0.40, 101, 21, 110], [0.60, 188, 55, 84],
        [0.80, 249, 142, 9], [1.00, 252, 255, 164]
    ]

    export const HeatLevels = 32

    export const heatColor = (unit: number): [int, int, int] => {
        const quantized = Math.round(Math.max(0, Math.min(1, unit)) * (HeatLevels - 1)) / (HeatLevels - 1)
        for (let index = 1; index < HeatStops.length; index++) {
            const [position, red, green, blue] = HeatStops[index]
            if (quantized <= position) {
                const [previous, redA, greenA, blueA] = HeatStops[index - 1]
                const ratio = (quantized - previous) / (position - previous)
                return [Math.round(redA + (red - redA) * ratio), Math.round(greenA + (green - greenA) * ratio),
                    Math.round(blueA + (blue - blueA) * ratio)]
            }
        }
        const [, red, green, blue] = HeatStops[HeatStops.length - 1]
        return [red, green, blue]
    }

    export const createContext = (width: int, height: int): [OffscreenCanvas, ViewContext] => {
        if (typeof OffscreenCanvas === "undefined") {return panic("OffscreenCanvas is not available")}
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext("2d")
        if (!isDefined(context)) {return panic("Could not acquire 2d context")}
        return [canvas, context]
    }

    export const base64 = (bytes: Uint8Array): string => {
        const chunks: Array<string> = []
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
        }
        return btoa(chunks.join(""))
    }

    export const toPngDataUrl = async (canvas: OffscreenCanvas): Promise<string> => {
        const blob = await canvas.convertToBlob({type: "image/png"})
        return `data:image/png;base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`
    }

    export const fillBackground = (context: ViewContext, width: number, height: number): void => {
        context.fillStyle = Colors.background
        context.fillRect(0, 0, width, height)
    }

    export const text = (context: ViewContext, value: string, x: number, y: number,
                         align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "alphabetic",
                         color: string = Colors.text, font: string = Font): void => {
        context.font = font
        context.fillStyle = color
        context.textAlign = align
        context.textBaseline = baseline
        context.fillText(value, x, y)
    }

    export const labelBox = (context: ViewContext, value: string, x: number, y: number, color: string): void => {
        context.font = SmallFont
        const width = context.measureText(value).width + 8
        context.fillStyle = "rgba(0,0,0,0.65)"
        context.fillRect(x, y, width, 14)
        text(context, value, x + 4, y + 7, "left", "middle", color, SmallFont)
    }

    export const verticalLine = (context: ViewContext, x: number, top: number, bottom: number, color: string): void => {
        context.strokeStyle = color
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(Math.round(x) + 0.5, top)
        context.lineTo(Math.round(x) + 0.5, bottom)
        context.stroke()
    }

    export const horizontalLine = (context: ViewContext, y: number, left: number, right: number, color: string): void => {
        context.strokeStyle = color
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(left, Math.round(y) + 0.5)
        context.lineTo(right, Math.round(y) + 0.5)
        context.stroke()
    }

    export const drawBarGrid = (context: ViewContext, ticks: ReadonlyArray<BarTick>, rects: ReadonlyArray<ViewRect>,
                                labelY: number, endX: number): void => {
        ticks.forEach(({x, bar, labeled}) => {
            rects.forEach(rect => verticalLine(context, x, rect.y, rect.y + rect.height,
                labeled ? Colors.gridStrong : Colors.grid))
            if (labeled) {text(context, String(bar), x + 2, labelY, "left", "bottom", Colors.text, SmallFont)}
        })
        rects.forEach(rect => verticalLine(context, endX, rect.y, rect.y + rect.height, Colors.gridStrong))
    }

    export const drawTail = (context: ViewContext, startX: number, rects: ReadonlyArray<ViewRect>): void => {
        rects.forEach(rect => {
            if (startX >= rect.x + rect.width - 1) {return}
            context.fillStyle = Colors.tail
            context.fillRect(startX, rect.y, rect.x + rect.width - startX, rect.height)
        })
    }

    /** Bar lines (numbered from bars.from), the musical end and the shaded tail across the rects. */
    export const drawBars = (context: ViewContext, {mix, barStartFrames, bars, sampleRate, tailSeconds}: AgentRender,
                             rects: ReadonlyArray<ViewRect>, labelY: number): void => {
        const totalFrames = mix.length === 0 ? 0 : mix[0].length
        const musicalEnd = frameToX(totalFrames - Math.round(tailSeconds * sampleRate), totalFrames, rects[0])
        drawBarGrid(context, barTicks(barStartFrames, bars.from, totalFrames, rects[0]), rects, labelY, musicalEnd)
        drawTail(context, musicalEnd, rects)
    }

    export const plot = (context: ViewContext, rect: ViewRect): void => {
        context.fillStyle = Colors.plot
        context.fillRect(rect.x, rect.y, rect.width, rect.height)
    }

    export const dashed = (context: ViewContext, fromX: number, fromY: number, toX: number, toY: number,
                           color: string, dash: ReadonlyArray<number> = [3, 3]): void => {
        context.strokeStyle = color
        context.lineWidth = 1
        context.setLineDash([...dash])
        context.beginPath()
        context.moveTo(fromX, fromY)
        context.lineTo(toX, toY)
        context.stroke()
        context.setLineDash([])
    }

    /** A polyline through the finite values, broken at NaN. */
    export const strokeCurve = (context: ViewContext, values: ArrayLike<number>, toX: (index: int) => number,
                                toY: (value: number) => number, color: string, lineWidth: number): void => {
        context.strokeStyle = color
        context.lineWidth = lineWidth
        context.beginPath()
        let drawing = false
        for (let index = 0; index < values.length; index++) {
            const value = values[index]
            if (!Number.isFinite(value)) {
                drawing = false
                continue
            }
            if (drawing) {context.lineTo(toX(index), toY(value))} else {context.moveTo(toX(index), toY(value))}
            drawing = true
        }
        context.stroke()
    }

    /** Label boxes placed right to left, ending at rightX. */
    export const labelBoxes = (context: ViewContext, entries: ReadonlyArray<LegendEntry>, rightX: number, y: number): void => {
        context.font = SmallFont
        let cursor = rightX
        entries.forEach(({label, color}) => {
            cursor -= context.measureText(label).width + 8
            labelBox(context, label, cursor, y, color)
            cursor -= 4
        })
    }

    export const header = (context: ViewContext, name: string, {render, compact, title}: ViewRequest, x: number): void => {
        const {bars, bpm, durationSeconds} = render
        const span = `${durationSeconds.toFixed(durationSeconds < 1 ? 3 : 2)} s`
        const value = compact
            ? `${title ?? "Sound"} - ${name}`
            : `${name} - ${barRange(bars)} - ${span} - ${Math.round(bpm * 100) / 100} BPM`
        text(context, value, x, compact ? 11 : 14, "left", "middle")
    }

    /** Seconds below the plot (offset by the crop), bar numbers above it when the render has bars. */
    export const drawTimeAxis = (context: ViewContext, render: AgentRender, rect: ViewRect, compact: boolean,
                                 rects: ReadonlyArray<ViewRect> = [rect]): void => {
        const {durationSeconds, barStartFrames} = render
        const offset = render.offsetSeconds ?? 0
        const spaced = timeTicks(durationSeconds, rect.width, compact ? 56 : 72)
        const step = spaced.length > 1 ? spaced[1] : durationSeconds
        const first = step > 0 ? Math.ceil(offset / step - 1e-9) * step : offset
        const ticks = spaced.map((_tick, index) => first + index * step).filter(value => value - offset <= durationSeconds + 1e-9)
        ticks.forEach(seconds => {
            const x = rect.x + (seconds - offset) / durationSeconds * rect.width
            rects.forEach(target => verticalLine(context, x, target.y, target.y + target.height, Colors.grid))
            const align: CanvasTextAlign = x - rect.x < 12 ? "left" : rect.x + rect.width - x < 12 ? "right" : "center"
            text(context, formatSeconds(seconds, step), x, rect.y + rect.height + 3, align, "top", Colors.textDim, SmallFont)
        })
        if (compact || barStartFrames.length === 0) {return}
        drawBars(context, render, rects, rects[0].y - 2)
    }

    export const drawNoteMarkers = (context: ViewContext, notes: ReadonlyArray<SoundNote>, totalFrames: int,
                                    rect: ViewRect, withOff: boolean, labels: boolean = true): void => {
        if (notes.length === 0 || totalFrames <= 0) {return}
        const dense = notes.length * 5 > rect.width
        let lastLabel = -Infinity
        notes.forEach(({index, startFrame, offFrame}) => {
            const x = frameToX(startFrame, totalFrames, rect)
            if (dense) {
                verticalLine(context, x, rect.y + rect.height - 5, rect.y + rect.height, NoteColor)
                return
            }
            if (startFrame > 0) {verticalLine(context, x, rect.y, rect.y + rect.height, NoteColor)}
            if (withOff && isDefined(offFrame) && offFrame > startFrame && offFrame < totalFrames) {
                const offX = Math.round(frameToX(offFrame, totalFrames, rect)) + 0.5
                dashed(context, offX, rect.y + 12, offX, rect.y + rect.height, "rgba(245,197,66,0.45)", [2, 3])
            }
            if (labels && x - lastLabel >= 22 && rect.x + rect.width - x > 14) {
                text(context, `n${index}`, x + 2, rect.y + 2, "left", "top", NoteColor, SmallFont)
                lastLabel = x
            }
        })
    }

    export const drawLegend = (context: ViewContext, entries: ReadonlyArray<LegendEntry>,
                               x: number, y: number, maxWidth: number): number => {
        context.font = SmallFont
        let cursorX = x
        let cursorY = y
        entries.forEach(({label, color}) => {
            const width = context.measureText(label).width + 22
            if (cursorX + width > x + maxWidth && cursorX > x) {
                cursorX = x
                cursorY += 14
            }
            context.fillStyle = color
            context.fillRect(cursorX, cursorY - 4, 10, 8)
            text(context, label, cursorX + 14, cursorY, "left", "middle", Colors.text, SmallFont)
            cursorX += width
        })
        return cursorY + 14
    }
}
