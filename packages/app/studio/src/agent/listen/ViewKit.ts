import {int, isDefined, panic} from "@opendaw/lib-std"

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

    export const Font = "12px sans-serif"
    export const SmallFont = "10px sans-serif"

    export const seriesColor = (index: int): string => Series[index % Series.length]

    export const clampSize = (width: int, height: int): [int, int] =>
        [Math.max(64, Math.min(MaxWidth, Math.round(width))), Math.max(64, Math.min(MaxHeight, Math.round(height)))]

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
