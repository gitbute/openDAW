import {clamp, int, Option} from "@opendaw/lib-std"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import {FftCache} from "@/agent/analysis/descriptors/dsp/FftCache"
import {HarmonicSpectrum} from "@/agent/analysis/descriptors/dsp/HarmonicSpectrum"
import {MeasureMath} from "@/agent/analysis/descriptors/dsp/MeasureMath"
import type {ListenView, ViewRequest} from "./ListenViews"
import {AgentRender, FrameWindow} from "./AgentRender"
import {ViewContext, ViewKit, ViewRect} from "./ViewKit"
import {Fundamental, PowerSpectrum, ViewMath} from "./ViewMath"

export type SpectrumTarget = {
    readonly note: SoundNote
    readonly span: FrameWindow
    readonly spectrum: PowerSpectrum
    readonly fundamental: Option<Fundamental>
}

/** db is the partial's main-lobe power (as in the timbre descriptor), so levels compare across harmonics. */
export type HarmonicLevel = { readonly number: int, readonly frequency: number, readonly db: number }

export type PixelLine = { readonly max: Float32Array, readonly min: Float32Array }

export namespace Spectrum {
    export const MinHz = 20.0
    export const MaxHz = 20_000.0
    export const HarmonicCount = 16
    export const MaxFrames = 24
    export const FullHeight = 448
    export const Ticks: ReadonlyArray<number> = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

    /** Welch spectrum of the loudest note's sustain (its middle, when longer than MaxFrames half-overlapping windows). */
    export const analyse = (channels: ReadonlyArray<Float32Array>, notes: ReadonlyArray<SoundNote>,
                            sampleRate: number): SpectrumTarget => {
        const note = ViewMath.loudestNote(channels, notes).unwrapOrElse(() => ViewMath.wholeNote(channels))
        const sustain = ViewMath.sustainSpan(note, sampleRate)
        const length = sustain.endFrame - sustain.startFrame
        const size = clamp(FftCache.ceilPow2(length), 4096, 16384)
        const used = Math.min(length, size * (MaxFrames + 1) / 2)
        const from = sustain.startFrame + ((length - used) >> 1)
        const {power, binHz} = HarmonicSpectrum.welch(MeasureMath.mono(channels, from, from + used), sampleRate, size, MaxFrames)
        const spectrum: PowerSpectrum = {power, binHz, db: Float32Array.from(power, value => MeasureMath.powerDb(value))}
        const fundamental = ViewMath.fundamental(channels, sustain, sampleRate, note.pitch)
        return {note, span: {startFrame: from, endFrame: from + used}, spectrum, fundamental}
    }

    export const harmonicLevels = (spectrum: PowerSpectrum, f0: number, maxHz: number): ReadonlyArray<HarmonicLevel> =>
        HarmonicSpectrum.partials(spectrum, f0, HarmonicCount, maxHz)
            .map(({harmonic, hz, power}) => ({number: harmonic, frequency: hz, db: MeasureMath.powerDb(power)}))

    export const frequencyToX = (frequency: number, rect: ViewRect, maxHz: number): number =>
        rect.x + ViewKit.logUnit(frequency, MinHz, maxHz) * rect.width

    /** Per pixel column the strongest and weakest bin, interpolated where a pixel is narrower than a bin. */
    export const pixelLine = ({binHz, db}: PowerSpectrum, columns: int, maxHz: number): PixelLine => {
        const max = new Float32Array(columns)
        const min = new Float32Array(columns)
        const at = (position: number): number => {
            const index = Math.max(0, Math.min(db.length - 2, Math.floor(position)))
            const ratio = Math.max(0, Math.min(1, position - index))
            return db[index] * (1 - ratio) + db[index + 1] * ratio
        }
        for (let column = 0; column < columns; column++) {
            const low = MinHz * Math.pow(maxHz / MinHz, column / columns) / binHz
            const high = MinHz * Math.pow(maxHz / MinHz, (column + 1) / columns) / binHz
            const first = Math.ceil(low)
            const last = Math.min(db.length - 1, Math.floor(high))
            if (last < first) {
                max[column] = min[column] = at((low + high) / 2)
                continue
            }
            let top = MeasureMath.FloorDb
            let bottom = Infinity
            for (let bin = first; bin <= last; bin++) {
                top = Math.max(top, db[bin])
                bottom = Math.min(bottom, db[bin])
            }
            max[column] = top
            min[column] = bottom
        }
        return {max, min}
    }

    export const dbRange = (spectrum: PowerSpectrum, compact: boolean): [number, number] => {
        const loudest = spectrum.db.reduce((best, value) => Math.max(best, value), MeasureMath.FloorDb)
        const top = Math.min(6, Math.max(-48, Math.ceil((loudest + 3) / 12) * 12))
        return [top, top - (compact ? 84 : 96)]
    }

    const layout = (width: int, height: int, compact: boolean): ViewRect => compact
        ? {x: 36, y: 30, width: width - 36 - 8, height: height - 30 - 16}
        : {x: 48, y: 66, width: width - 48 - 16, height: height - 66 - 30}

    const describeTarget = ({note, span, spectrum, fundamental}: SpectrumTarget, render: AgentRender, notes: int,
                            compact: boolean): string => {
        const from = (span.startFrame / render.sampleRate).toFixed(2)
        const to = (span.endFrame / render.sampleRate).toFixed(2)
        const what = note.index > 0 ? `note ${note.index}${notes > 1 ? " (loudest)" : ""}` : "whole render"
        const pitch = fundamental.match({
            none: () => compact ? "no clear pitch" : "no clear pitch (noise or inharmonic)",
            some: ({frequency, source}) => compact
                ? `f0 ${frequency.toFixed(1)} Hz ${ViewMath.pitchName(frequency)}`
                : `f0 ${frequency.toFixed(1)} Hz (${ViewMath.pitchName(frequency)}, ${source})`
        })
        const resolution = `${spectrum.binHz.toFixed(1)} Hz bins`
        return compact
            ? `${what}, ${pitch}`
            : `Spectrum of ${what}, sustain ${from}-${to} s - ${pitch} - ${resolution}`
    }

    const drawAxes = (context: ViewContext, rect: ViewRect, maxHz: number, topDb: number, bottomDb: number,
                      compact: boolean): void => {
        ViewKit.plot(context, rect)
        const toY = (db: number): number => rect.y + (topDb - db) / (topDb - bottomDb) * rect.height
        for (let db = Math.floor(topDb / 12) * 12; db >= bottomDb; db -= 12) {
            const y = toY(db)
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, db === 0 ? ViewKit.Colors.gridStrong : ViewKit.Colors.grid)
            ViewKit.text(context, ViewKit.axisLabel(`${db}`, "dB", db === Math.floor(topDb / 12) * 12), rect.x - 4, y, "right", "middle",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
        Ticks.filter(frequency => frequency <= maxHz).forEach(frequency => {
            const x = frequencyToX(frequency, rect, maxHz)
            ViewKit.verticalLine(context, x, rect.y, rect.y + rect.height, ViewKit.Colors.grid)
            const align: CanvasTextAlign = x - rect.x < 10 ? "left" : rect.x + rect.width - x < 14 ? "right" : "center"
            ViewKit.text(context, ViewKit.formatHz(frequency), x, rect.y + rect.height + 3, align, "top", ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
        if (!compact) {
            ViewKit.text(context, "Hz", rect.x + rect.width, rect.y + rect.height + 16, "right", "top", ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
    }

    const drawHarmonics = (context: ViewContext, rect: ViewRect, spectrum: PowerSpectrum, levels: ReadonlyArray<HarmonicLevel>,
                           maxHz: number, toY: (db: number) => number): void => {
        const color = "#3ddc84"
        let lastLabel = -Infinity
        levels.filter(({frequency}) => frequency >= MinHz).forEach(({number, frequency}) => {
            const x = Math.round(frequencyToX(frequency, rect, maxHz)) + 0.5
            ViewKit.dashed(context, x, rect.y + 12, x, rect.y + rect.height, "rgba(61,220,132,0.22)", [2, 4])
            ViewKit.verticalLine(context, x, rect.y, rect.y + 6, color)
            if (x - lastLabel >= (number === 1 ? 0 : 13)) {
                ViewKit.text(context, number === 1 ? "H1" : `${number}`, x, rect.y - 2, number === 1 ? "left" : "center", "bottom",
                    color, ViewKit.SmallFont)
                lastLabel = x + (number === 1 ? 8 : 0)
            }
            const y = toY(ViewMath.peakDbNear(spectrum, frequency, spectrum.binHz))
            if (y < rect.y + rect.height) {
                context.fillStyle = color
                context.beginPath()
                context.arc(x, y, 2.5, 0, Math.PI * 2)
                context.fill()
            }
        })
    }

    const harmonicText = (levels: ReadonlyArray<HarmonicLevel>): string => {
        if (levels.length === 0) {return ""}
        const reference = levels[0].db
        return `Harmonic levels re H1 (dB): ${levels.slice(1, 12).map(({number, db}) => `H${number} ${(db - reference).toFixed(0)}`).join("  ")}`
    }

    export const draw = (context: ViewContext, request: ViewRequest, width: int, height: int): void => {
        const {render, notes, compact} = request
        const maxHz = Math.min(MaxHz, render.sampleRate / 2)
        const rect = layout(width, height, compact)
        ViewKit.fillBackground(context, width, height)
        if (AgentRender.isSilent(render.mix)) {
            ViewKit.header(context, compact ? "spectrum" : "Spectrum", request, compact ? 6 : rect.x)
            ViewKit.text(context, "silent", width / 2, height / 2, "center", "middle", ViewKit.Colors.textDim)
            return
        }
        const target = analyse(render.mix, notes, render.sampleRate)
        const {spectrum, fundamental} = target
        const [topDb, bottomDb] = dbRange(spectrum, compact)
        const toY = (db: number): number => rect.y + Math.max(0, Math.min(1, (topDb - db) / (topDb - bottomDb))) * rect.height
        const levels = fundamental.match<ReadonlyArray<HarmonicLevel>>({none: () => [], some: ({frequency}) => harmonicLevels(spectrum, frequency, maxHz)})
        const description = describeTarget(target, render, notes.length, compact)
        ViewKit.header(context, compact ? `spectrum of ${description}` : "Spectrum: magnitude of one note (log frequency)", request,
            compact ? 6 : rect.x)
        if (!compact) {ViewKit.text(context, description, rect.x, 32, "left", "middle")}
        if (!compact && levels.length > 1) {
            ViewKit.text(context, harmonicText(levels), rect.x, 48, "left", "middle", "#3ddc84", ViewKit.SmallFont)
        }
        drawAxes(context, rect, maxHz, topDb, bottomDb, compact)
        const columns = Math.round(rect.width)
        const line = pixelLine(spectrum, columns, maxHz)
        context.save()
        context.beginPath()
        context.rect(rect.x, rect.y, rect.width, rect.height)
        context.clip()
        context.fillStyle = "rgba(78,155,255,0.30)"
        context.beginPath()
        line.max.forEach((value, column) => context.lineTo(rect.x + column + 0.5, toY(value)))
        for (let column = columns - 1; column >= 0; column--) {context.lineTo(rect.x + column + 0.5, toY(line.min[column]))}
        context.closePath()
        context.fill()
        ViewKit.strokeCurve(context, line.max, column => rect.x + column + 0.5, toY, ViewKit.Series[0], 1)
        const f0 = fundamental.mapOr(({frequency}) => frequency, 0)
        const frequencies = ViewMath.logFrequencies(Math.round(rect.width / 2), MinHz, maxHz)
        const smooth = ViewMath.spectralEnvelope(spectrum, frequencies,
            frequency => Math.max(frequency * 0.12, Math.min(f0 * 0.55, frequency * 0.6)))
        ViewKit.strokeCurve(context, smooth, index => frequencyToX(frequencies[index], rect, maxHz), toY, ViewKit.Series[1], 2)
        context.restore()
        drawHarmonics(context, rect, spectrum, levels, maxHz, toY)
        ViewKit.labelBoxes(context, [
            ...(levels.length > 0 ? [{label: compact ? "harmonics" : "harmonics (green dots)", color: "#3ddc84"}] : []),
            {label: compact ? "envelope" : "smoothed envelope (orange)", color: ViewKit.Series[1]},
            {label: compact ? "FFT" : "FFT (blue line, band = min-max)", color: ViewKit.Series[0]}
        ], rect.x + rect.width - 4, rect.y + 10)
    }
}

export const renderSpectrumPng = async (request: ViewRequest): Promise<string> => {
    const [width, height] = ViewKit.viewSize(request.compact, Spectrum.FullHeight)
    const [canvas, context] = ViewKit.createContext(width, height)
    Spectrum.draw(context, request, width, height)
    return ViewKit.toPngDataUrl(canvas)
}

export const SpectrumView: ListenView = {
    key: "spectrum",
    summary: "spectrum: one note's overtones H1-H16 (odd/even, brightness, resonances)",
    usesNotes: true,
    render: renderSpectrumPng
}
