import {int} from "@opendaw/lib-std"
import {StereoBands} from "@/agent/analysis/descriptors/dsp/StereoBands"
import type {ListenView, ViewRequest} from "./ListenViews"
import {AgentRender} from "./AgentRender"
import {ViewContext, ViewKit, ViewRect} from "./ViewKit"
import {StereoBandWidth, ViewMath} from "./ViewMath"

export type StereoLayout = { readonly gonio: ViewRect, readonly correlation: ViewRect, readonly bands: ViewRect }

export type StereoSummary = {
    readonly correlation: number
    readonly sideMinusMidDb: number
    readonly balanceDb: number
    readonly identical: boolean
}

export namespace Stereo {
    export const FullHeight = 512
    export const CorrelationSeconds = 0.05
    export const WidthTopDb = 6.0
    export const WidthBottomDb = -30.0
    export const BandFloorDb = 45.0

    export const layout = (width: int, height: int, compact: boolean): StereoLayout => {
        if (compact) {
            const size = Math.floor((height - 22 - 4) / 2) * 2
            const gonio: ViewRect = {x: 6, y: 22, width: size, height: size}
            const x = gonio.x + size + 34
            const plotWidth = width - x - 6
            return {gonio, correlation: {x, y: 34, width: plotWidth, height: 40}, bands: {x, y: 114, width: plotWidth, height: height - 114 - 30}}
        }
        const size = Math.floor(Math.min(height - 34 - 8, width * 0.45) / 2) * 2
        const gonio: ViewRect = {x: 16, y: 34, width: size, height: size}
        const x = gonio.x + size + 56
        const plotWidth = width - x - 16
        return {gonio, correlation: {x, y: 70, width: plotWidth, height: 120}, bands: {x, y: 262, width: plotWidth, height: height - 262 - 40}}
    }

    export const stereoPair = (channels: ReadonlyArray<Float32Array>): [Float32Array, Float32Array] => {
        const left = channels.length > 0 ? channels[0] : new Float32Array(0)
        return [left, channels.length > 1 ? channels[1] : left]
    }

    export const summarize = (left: Float32Array, right: Float32Array): StereoSummary => {
        const power: StereoBands.Power = {ll: 0.0, rr: 0.0, lr: 0.0}
        for (let index = 0; index < left.length; index++) {
            power.ll += left[index] * left[index]
            power.rr += right[index] * right[index]
            power.lr += left[index] * right[index]
        }
        return {
            correlation: StereoBands.correlation(power), sideMinusMidDb: StereoBands.sideDb(power),
            balanceDb: StereoBands.balanceDb(power), identical: StereoBands.isMono(left, right)
        }
    }

    export const correlationColor = (correlation: number): string =>
        correlation < 0 ? "#ff5c8a" : correlation < 0.5 ? "#f5c542" : "#3ddc84"

    export const widthToY = (widthDb: number, rect: ViewRect): number =>
        rect.y + rect.height * (WidthTopDb - Math.max(WidthBottomDb, Math.min(WidthTopDb, widthDb))) / (WidthTopDb - WidthBottomDb)

    const drawGonio = (context: ViewContext, rect: ViewRect, left: Float32Array, right: Float32Array,
                       summary: StereoSummary, compact: boolean): void => {
        const size = rect.width
        const gain = ViewMath.gonioGain(left, right)
        const density = ViewMath.gonioDensity(left, right, size, gain)
        const maxCount = density.reduce((max, value) => Math.max(max, value), 0)
        const image = context.createImageData(size, size)
        const logMax = Math.log(1 + Math.max(1, maxCount))
        const [plotRed, plotGreen, plotBlue] = [8, 9, 11]
        for (let index = 0; index < density.length; index++) {
            const count = density[index]
            const [red, green, blue] = count === 0 ? [plotRed, plotGreen, plotBlue]
                : ViewKit.heatColor(0.25 + 0.75 * Math.log(1 + count) / logMax)
            image.data[index * 4] = red
            image.data[index * 4 + 1] = green
            image.data[index * 4 + 2] = blue
            image.data[index * 4 + 3] = 255
        }
        context.putImageData(image, rect.x, rect.y)
        const centerX = rect.x + size / 2
        const centerY = rect.y + size / 2
        const radius = size / 2
        context.strokeStyle = ViewKit.Colors.grid
        context.lineWidth = 1
        context.beginPath()
        context.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2)
        context.stroke()
        ViewKit.verticalLine(context, centerX, rect.y, rect.y + size, ViewKit.Colors.grid)
        ViewKit.horizontalLine(context, centerY, rect.x, rect.x + size, ViewKit.Colors.grid)
        const diagonal = radius * Math.SQRT1_2
        ViewKit.dashed(context, centerX - diagonal, centerY - diagonal, centerX + diagonal, centerY + diagonal, ViewKit.Colors.grid)
        ViewKit.dashed(context, centerX + diagonal, centerY - diagonal, centerX - diagonal, centerY + diagonal, ViewKit.Colors.grid)
        const font = compact ? ViewKit.SmallFont : ViewKit.Font
        ViewKit.text(context, compact ? "M" : "M (mono)", centerX + 4, rect.y + 3, "left", "top", ViewKit.Colors.text, font)
        ViewKit.text(context, "L", centerX - diagonal * 0.92, centerY - diagonal * 0.92, "right", "bottom", ViewKit.LeftColor, font)
        ViewKit.text(context, "R", centerX + diagonal * 0.92, centerY - diagonal * 0.92, "left", "bottom", ViewKit.RightColor, font)
        ViewKit.text(context, compact ? "S" : "S (side)", rect.x + size - 3, centerY - 3, "right", "bottom", ViewKit.Colors.text, font)
        ViewKit.text(context, compact ? "-S" : "-S", rect.x + 3, centerY - 3, "left", "bottom", ViewKit.Colors.text, font)
        const gainDb = 20 * Math.log10(gain)
        ViewKit.labelBox(context, `${compact ? "" : "goniometer, "}gain ${gainDb >= 0 ? "+" : ""}${gainDb.toFixed(0)} dB`,
            rect.x + 2, rect.y + size - 16, ViewKit.Colors.textDim)
        if (summary.identical) {
            ViewKit.labelBox(context, "L = R (mono)", rect.x + size - (compact ? 66 : 76), rect.y + size - 16, ViewKit.Colors.text)
        }
    }

    const drawCorrelation = (context: ViewContext, request: ViewRequest, rect: ViewRect, left: Float32Array,
                             right: Float32Array, summary: StereoSummary): void => {
        const {render, compact} = request
        const columns = Math.round(rect.width)
        const curve = ViewMath.correlationCurve(left, right, columns, Math.round(CorrelationSeconds * render.sampleRate))
        const toY = (value: number): number => rect.y + rect.height * (1 - value) / 2
        const balance = Math.abs(summary.balanceDb) < 0.05 ? "centered"
            : `${summary.balanceDb > 0 ? "R" : "L"} +${Math.abs(summary.balanceDb).toFixed(1)} dB`
        const caption = compact
            ? `correlation ${summary.correlation.toFixed(2)}, S-M ${formatWidth(summary.sideMinusMidDb)}`
            : `L/R correlation over time - overall ${summary.correlation.toFixed(2)}, side minus mid ${formatWidth(summary.sideMinusMidDb)}, balance ${balance}`
        ViewKit.text(context, caption, rect.x, rect.y - 6, "left", "bottom", ViewKit.Colors.text, compact ? ViewKit.SmallFont : ViewKit.Font)
        ViewKit.plot(context, rect)
        ;[1, 0.5, 0, -0.5, -1].filter(value => !compact || value !== 0.5 && value !== -0.5).forEach(value => {
            const y = toY(value)
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, value === 0 ? ViewKit.Colors.gridStrong : ViewKit.Colors.grid)
            ViewKit.text(context, value > 0 ? `+${value}` : `${value}`, rect.x - 4, y, "right", "middle", ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
        ViewKit.drawTimeAxis(context, render, rect, true)
        curve.forEach((value, column) => {
            if (!Number.isFinite(value)) {return}
            context.fillStyle = value >= 0 ? "rgba(61,220,132,0.35)" : "rgba(255,92,138,0.55)"
            const y = toY(value)
            const zero = toY(0)
            context.fillRect(rect.x + column, Math.min(y, zero), 1, Math.max(1, Math.abs(zero - y)))
        })
        ViewKit.strokeCurve(context, curve, column => rect.x + column + 0.5, toY, ViewKit.Colors.mix, 1.25)
    }

    export const formatWidth = (widthDb: number): string => widthDb <= -60 ? "mono" : `${widthDb.toFixed(1)} dB`

    const drawBands = (context: ViewContext, {render, compact}: ViewRequest, rect: ViewRect,
                       bands: ReadonlyArray<StereoBandWidth>): void => {
        const caption = compact ? "width per octave (bar: S-M dB, number: corr.)"
            : "Width per octave band: bar = side minus mid (dB, 0 = uncorrelated, bottom = mono), color and number = L/R correlation"
        ViewKit.text(context, caption, rect.x, rect.y - (compact ? 4 : 18), "left", "bottom", ViewKit.Colors.text,
            compact ? ViewKit.SmallFont : ViewKit.Font)
        ViewKit.plot(context, rect)
        const steps = compact ? [0, -30] : [6, 0, -12, -24, -30]
        steps.forEach(db => {
            const y = widthToY(db, rect)
            if (db === 0) {
                ViewKit.dashed(context, rect.x, Math.round(y) + 0.5, rect.x + rect.width, Math.round(y) + 0.5, ViewKit.Colors.gridStrong)
            } else {
                ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, ViewKit.Colors.grid)
            }
            const label = db === WidthBottomDb ? "mono" : ViewKit.axisLabel(`${db > 0 ? "+" : ""}${db}`, "dB", db === steps[0])
            ViewKit.text(context, label, rect.x - 4, y, "right", "middle", ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
        const loudest = bands.reduce((max, {db}) => Math.max(max, db), -Infinity)
        const slot = rect.width / Math.max(1, bands.length)
        bands.forEach(({centerHz, db, correlation, widthDb}, index) => {
            const x = rect.x + slot * index
            const center = x + slot / 2
            ViewKit.text(context, ViewKit.formatHz(centerHz), center, rect.y + rect.height + 3, "center", "top",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
            const active = db > loudest - BandFloorDb && db > -100 && centerHz < render.sampleRate / 2
            if (!active) {
                ViewKit.text(context, "-", center, rect.y + rect.height - 8, "center", "bottom", ViewKit.Colors.textDim, ViewKit.SmallFont)
                return
            }
            const top = widthToY(widthDb, rect)
            const barWidth = Math.max(4, slot * 0.6)
            context.fillStyle = correlationColor(correlation)
            context.fillRect(center - barWidth / 2, top, barWidth, Math.max(2, rect.y + rect.height - top))
            const label = compact ? correlation.toFixed(1) : correlation.toFixed(2)
            const inside = top - rect.y < 12
            ViewKit.text(context, label, center, inside ? top + 2 : top - 2, "center", inside ? "top" : "bottom",
                inside ? ViewKit.Colors.plot : correlationColor(correlation), ViewKit.SmallFont)
        })
        if (!compact) {
            ViewKit.text(context, "Hz (octave centers)", rect.x + rect.width, rect.y + rect.height + 16, "right", "top",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
    }

    export const draw = (context: ViewContext, request: ViewRequest, width: int, height: int): void => {
        const {render, compact} = request
        const rects = layout(width, height, compact)
        ViewKit.fillBackground(context, width, height)
        ViewKit.header(context, compact ? "stereo" : "Stereo: goniometer (left), correlation over time and width per band (right)",
            request, compact ? 6 : rects.gonio.x)
        if (AgentRender.isSilent(render.mix)) {
            ViewKit.text(context, "silent", width / 2, height / 2, "center", "middle", ViewKit.Colors.textDim)
            return
        }
        const [left, right] = stereoPair(render.mix)
        const summary = summarize(left, right)
        drawGonio(context, rects.gonio, left, right, summary, compact)
        drawCorrelation(context, request, rects.correlation, left, right, summary)
        drawBands(context, request, rects.bands, ViewMath.octaveBands(left, right, render.sampleRate))
    }
}

export const renderStereoPng = async (request: ViewRequest): Promise<string> => {
    const [width, height] = ViewKit.viewSize(request.compact, Stereo.FullHeight)
    const [canvas, context] = ViewKit.createContext(width, height)
    Stereo.draw(context, request, width, height)
    return ViewKit.toPngDataUrl(canvas)
}

export const StereoView: ListenView = {
    key: "stereo",
    summary: "stereo: width and mono compatibility (goniometer, correlation, width per octave)",
    render: renderStereoPng
}
