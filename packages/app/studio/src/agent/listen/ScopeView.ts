import {int, Option} from "@opendaw/lib-std"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import {MeasureMath} from "@/agent/analysis/descriptors/dsp/MeasureMath"
import type {ListenView, ViewRequest} from "./ListenViews"
import {AgentRender, FrameWindow} from "./AgentRender"
import {ViewContext, ViewKit, ViewRect} from "./ViewKit"
import {Envelope, Fundamental, ViewMath} from "./ViewMath"

export type ScopeLayout = { readonly envelope: ViewRect, readonly closeUp: ViewRect }

export type CloseUp = {
    readonly note: SoundNote
    readonly span: FrameWindow
    readonly fundamental: Option<Fundamental>
}

export namespace Scope {
    export const MinDb = -60.0
    export const FullHeight = 512

    export const layout = (width: int, height: int, compact: boolean): ScopeLayout => {
        if (compact) {
            const top = 24
            const plotHeight = height - top - 16
            const envelopeWidth = Math.round(width * 0.56) - 34
            const envelope: ViewRect = {x: 34, y: top, width: envelopeWidth, height: plotHeight}
            const closeX = envelope.x + envelopeWidth + 36
            return {envelope, closeUp: {x: closeX, y: top, width: width - closeX - 6, height: plotHeight}}
        }
        const left = 48
        const plotWidth = width - left - 16
        const envelope: ViewRect = {x: left, y: 46, width: plotWidth, height: Math.round((height - 46) * 0.42)}
        const closeY = envelope.y + envelope.height + 40
        return {envelope, closeUp: {x: left, y: closeY, width: plotWidth, height: height - closeY - 20}}
    }

    export const pickCloseUp = (channels: ReadonlyArray<Float32Array>, notes: ReadonlyArray<SoundNote>,
                                sampleRate: number): CloseUp => {
        const note = ViewMath.firstAudibleNote(channels, notes).unwrapOrElse(() => ViewMath.wholeNote(channels))
        const sustain = ViewMath.sustainSpan(note, sampleRate)
        const fundamental = ViewMath.fundamental(channels, sustain, sampleRate, note.pitch)
        const span = ViewMath.closeUpSpan(channels, sustain, sampleRate, fundamental.map(({frequency}) => sampleRate / frequency))
        return {note, span, fundamental}
    }

    export const dbToY = (db: number, rect: ViewRect, topDb: number): number =>
        rect.y + rect.height * Math.max(0, Math.min(1, (topDb - db) / (topDb - MinDb)))

    // symmetric amplitude range: at least full scale once the signal gets near it, so +-1 stays in view
    export const amplitudeRange = (peak: number): number => {
        if (peak >= 0.7) {return Math.max(1.1, peak * 1.05)}
        const steps = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7]
        return steps.find(step => step >= peak * 1.15) ?? 1.1
    }

    const drawEnvelope = (context: ViewContext, {render, notes, compact}: ViewRequest, rect: ViewRect,
                          envelope: Envelope, closeUp: CloseUp, topDb: number, windowMs: number): void => {
        const totalFrames = AgentRender.frameCount(render)
        ViewKit.plot(context, rect)
        const step = compact ? 20 : 12
        for (let db = Math.floor(topDb / step) * step; db >= MinDb; db -= step) {
            const y = dbToY(db, rect, topDb)
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, db === 0 ? ViewKit.Colors.gridStrong : ViewKit.Colors.grid)
            ViewKit.text(context, ViewKit.axisLabel(`${db}`, "dB", db === 0), rect.x - 4, y, "right", "middle",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
        ViewKit.drawTimeAxis(context, render, rect, compact)
        const {peak, rms} = envelope
        const bottom = rect.y + rect.height
        context.fillStyle = "rgba(78,155,255,0.55)"
        context.beginPath()
        context.moveTo(rect.x, bottom)
        rms.forEach((value, column) => context.lineTo(rect.x + column + 0.5, dbToY(MeasureMath.amplitudeDb(value), rect, topDb)))
        context.lineTo(rect.x + rms.length, bottom)
        context.closePath()
        context.fill()
        ViewKit.strokeCurve(context, peak, column => rect.x + column + 0.5,
            value => dbToY(MeasureMath.amplitudeDb(value), rect, topDb), ViewKit.Colors.mix, 1)
        ViewKit.drawNoteMarkers(context, notes, totalFrames, rect, true)
        const fromX = ViewKit.frameToX(closeUp.span.startFrame, totalFrames, rect)
        const toX = Math.max(fromX + 2, ViewKit.frameToX(closeUp.span.endFrame, totalFrames, rect))
        context.fillStyle = "rgba(61,220,132,0.25)"
        context.fillRect(fromX, rect.y, toX - fromX, rect.height)
        ViewKit.verticalLine(context, fromX, rect.y, rect.y + rect.height, "rgba(61,220,132,0.8)")
        ViewKit.labelBoxes(context, [
            {label: compact ? "zoom" : "close-up (green)", color: "#3ddc84"},
            {label: compact ? "RMS" : `RMS ${windowMs} ms (blue)`, color: ViewKit.Series[0]},
            {label: compact ? "peak" : "peak dBFS (white)", color: ViewKit.Colors.mix}
        ], rect.x + rect.width - 4, rect.y + 4)
    }

    const closeUpCaption = (closeUp: CloseUp, render: AgentRender, peak: number, stereo: boolean, clipped: int,
                            compact: boolean): ReadonlyArray<string> => {
        const {note, span, fundamental} = closeUp
        const frames = span.endFrame - span.startFrame
        const ms = frames / render.sampleRate * 1000
        const at = `${(span.startFrame / render.sampleRate).toFixed(3)} s`
        const what = note.index > 0 ? `note ${note.index}` : "render"
        const periods = fundamental.match({
            none: () => compact ? `${ms.toFixed(1)} ms` : `${ms.toFixed(1)} ms (no clear pitch)`,
            some: ({frequency, source}) => compact
                ? `${(frames * frequency / render.sampleRate).toFixed(1)} x ${frequency.toFixed(1)} Hz`
                : `${(frames * frequency / render.sampleRate).toFixed(1)} periods of ${frequency.toFixed(1)} Hz (${ViewMath.pitchName(frequency)}, ${source}) = ${ms.toFixed(1)} ms`
        })
        const level = `peak ${peak.toFixed(2)}`
        const channels = stereo ? (compact ? "L blue R orange" : "L blue, R orange") : (compact ? "" : "L = R")
        const clip = clipped > 0 ? `${clipped} samples at or over full scale` : ""
        return compact
            ? [`${what}: ${periods}`, [level, clipped > 0 ? `${clipped} at/over FS` : "", channels].filter(part => part.length > 0).join(", ")]
            : [`Waveform close-up of ${what} at ${at}: ${[periods, `${level} (${MeasureMath.amplitudeDb(peak).toFixed(1)} dBFS)`, channels, clip]
                .filter(part => part.length > 0).join(", ")}`]
    }

    const drawCloseUp = (context: ViewContext, {render, compact}: ViewRequest, rect: ViewRect, closeUp: CloseUp): void => {
        const {span} = closeUp
        const channels = render.mix.map(channel => channel.subarray(span.startFrame, span.endFrame))
        const frames = channels.length === 0 ? 0 : channels[0].length
        const peak = AgentRender.peak(channels)
        const stereo = channels.length > 1 && channels[0].some((value, index) => Math.abs(value - channels[1][index]) > Math.max(1e-5, peak * 1e-3))
        const clipped = channels.reduce((count, channel) => count + channel.reduce((sum, value) => Math.abs(value) >= 0.999 ? sum + 1 : sum, 0), 0)
        const range = amplitudeRange(peak)
        const toY = (value: number): number => rect.y + rect.height / 2 - value / range * rect.height / 2
        const toX = (index: int): number => rect.x + (frames <= 1 ? 0 : index / (frames - 1)) * rect.width
        const caption = closeUpCaption(closeUp, render, peak, stereo, clipped, compact)
        ViewKit.plot(context, rect)
        const gridStep = range > 1 ? 0.5 : ViewKit.niceStep(range / 2.2)
        const gridValues: Array<number> = []
        for (let value = Math.floor(range / gridStep) * gridStep; value >= -range; value -= gridStep) {gridValues.push(Number(value.toFixed(6)))}
        gridValues.forEach(value => {
            const y = toY(value)
            const fullScale = Math.abs(value) === 1
            if (fullScale) {
                ViewKit.dashed(context, rect.x, Math.round(y) + 0.5, rect.x + rect.width, Math.round(y) + 0.5, "rgba(255,92,138,0.8)")
            } else {
                ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, value === 0 ? ViewKit.Colors.gridStrong : ViewKit.Colors.grid)
            }
            const label = value === 0 ? "0" : `${value > 0 ? "+" : ""}${Number(value.toFixed(3))}`
            ViewKit.text(context, label, rect.x - 4, y, "right", "middle", fullScale ? "#ff5c8a" : ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
        const seconds = frames / render.sampleRate
        const ticks = ViewKit.timeTicks(seconds, rect.width, compact ? 48 : 72)
        const step = ticks.length > 1 ? ticks[1] : seconds
        ticks.forEach(value => {
            const x = rect.x + (seconds <= 0 ? 0 : value / seconds) * rect.width
            ViewKit.verticalLine(context, x, rect.y, rect.y + rect.height, ViewKit.Colors.grid)
            const align: CanvasTextAlign = x - rect.x < 12 ? "left" : rect.x + rect.width - x < 16 ? "right" : "center"
            ViewKit.text(context, ViewKit.formatSeconds(value, Math.min(step, 0.009)), x, rect.y + rect.height + 3, align, "top",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
        const colors = stereo ? [ViewKit.LeftColor, ViewKit.RightColor] : [ViewKit.Colors.mix]
        const pixelsPerSample = frames <= 1 ? rect.width : rect.width / (frames - 1)
        context.save()
        context.beginPath()
        context.rect(rect.x, rect.y, rect.width, rect.height)
        context.clip()
        colors.forEach((color, channelIndex) => {
            const channel = channels[channelIndex]
            ViewKit.strokeCurve(context, channel, toX, toY, color, stereo ? 1.25 : 1.5)
            if (pixelsPerSample >= 5) {
                context.fillStyle = color
                channel.forEach((value, index) => context.fillRect(toX(index) - 1.5, toY(value) - 1.5, 3, 3))
            }
        })
        context.restore()
        if (compact) {
            caption.forEach((line, index) => ViewKit.labelBox(context, line, rect.x + 2, rect.y + 2 + index * 15, ViewKit.Colors.text))
        } else {
            ViewKit.text(context, caption[0], rect.x, rect.y - 8, "left", "bottom", ViewKit.Colors.text, ViewKit.Font)
        }
    }

    export const draw = (context: ViewContext, request: ViewRequest, width: int, height: int): void => {
        const {render, notes, compact} = request
        const channels = render.mix
        const rects = layout(width, height, compact)
        const closeUp = pickCloseUp(channels, notes, render.sampleRate)
        const windowFrames = ViewMath.envelopeFrames(render.sampleRate, closeUp.fundamental.map(({frequency}) => frequency),
            AgentRender.frameCount(render))
        const envelope = ViewMath.envelope(channels, Math.round(rects.envelope.width), windowFrames)
        const maxPeak = envelope.peak.reduce((max, value) => Math.max(max, value), 0)
        const topDb = Math.max(0, Math.ceil((MeasureMath.amplitudeDb(maxPeak) + 0.5) / 3) * 3)
        ViewKit.fillBackground(context, width, height)
        ViewKit.header(context, compact ? "scope" : "Scope: amplitude envelope (top) and waveform close-up (bottom)", request,
            compact ? 6 : rects.envelope.x)
        if (AgentRender.isSilent(channels)) {
            ViewKit.text(context, "silent", width / 2, height / 2, "center", "middle", ViewKit.Colors.textDim)
            return
        }
        drawEnvelope(context, request, rects.envelope, envelope, closeUp, topDb, Math.round(windowFrames / render.sampleRate * 1000))
        drawCloseUp(context, request, rects.closeUp, closeUp)
    }
}

export const renderScopePng = async (request: ViewRequest): Promise<string> => {
    const [width, height] = ViewKit.viewSize(request.compact, Scope.FullHeight)
    const [canvas, context] = ViewKit.createContext(width, height)
    Scope.draw(context, request, width, height)
    return ViewKit.toPngDataUrl(canvas)
}

export const ScopeView: ListenView = {
    key: "scope",
    summary: "scope: one note's wave shape and envelope (clipping, attack, gating)",
    usesNotes: true,
    render: renderScopePng
}
