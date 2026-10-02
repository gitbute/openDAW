import {clamp, int, isDefined, Option} from "@opendaw/lib-std"
import {MeasureMath} from "@/agent/analysis/descriptors/dsp/MeasureMath"
import {ModulationRate} from "@/agent/analysis/descriptors/dsp/ModulationRate"
import {SpectralFrames} from "@/agent/analysis/descriptors/dsp/SpectralFrames"
import type {ListenView, ViewRequest} from "./ListenViews"
import {AgentRender} from "./AgentRender"
import {ViewContext, ViewKit, ViewRect} from "./ViewKit"
import {Spectrogram} from "./SpectrogramView"
import {ViewMath} from "./ViewMath"

export type MovementLayout = { readonly spectrogram: ViewRect, readonly loudness: ViewRect }

/** Spectrogram cells (index = column * rows + row, row 0 lowest), centroid (Hz, NaN when inactive) and level per column. */
export type MovementAnalysis = {
    readonly cells: Float32Array
    readonly centroid: Float32Array
    readonly rmsDb: Float32Array
    readonly frames: SpectralFrames.Frames
}

/** Modulation rates in Hz. */
export type MovementRates = { readonly brightness: Option<number>, readonly loudness: Option<number> }

export namespace Movement {
    export const MinHz = 20.0
    export const MaxHz = 20_000.0
    export const MinDb = -96.0
    export const MaxDb = 0.0
    export const LoudnessMinDb = -60.0
    export const CellSize = Spectrogram.CellSize
    export const FullHeight = 512
    export const CentroidColor = "#39d0d8"
    // same limits as the movement descriptor, so image and JSON report the same cycles
    export const MinRateHz = 0.25
    export const MaxRateHz = 16
    export const MinSegmentSeconds = 0.5
    export const AmpMinDepthDb = 1.5
    export const BrightMinDepthOct = 0.15

    const even = (value: number): int => Math.max(CellSize * 4, Math.floor(value / CellSize) * CellSize)

    export const layout = (width: int, height: int, compact: boolean): MovementLayout => {
        const left = compact ? 34 : 48
        const top = compact ? 24 : 34
        const plotWidth = even(width - left - (compact ? 8 : 16))
        const available = height - top - (compact ? 16 : 22)
        const gap = compact ? 4 : 8
        const spectrogramHeight = even(available * (compact ? 0.66 : 0.68))
        return {
            spectrogram: {x: left, y: top, width: plotWidth, height: spectrogramHeight},
            loudness: {x: left, y: top + spectrogramHeight + gap, width: plotWidth, height: available - spectrogramHeight - gap}
        }
    }

    export const fftSize = (frames: int): int => clamp(1 << Math.floor(Math.log2(Math.max(1, frames / 12))), 512, 2048)

    /** Spectrogram cells, the SpectralFrames centroid (about one hop per column) and block RMS per column. */
    export const analyse = (channels: ReadonlyArray<Float32Array>, sampleRate: number, columns: int,
                            rows: int): MovementAnalysis => {
        const totalFrames = MeasureMath.frameCount(channels)
        const size = fftSize(totalFrames)
        const cells = Spectrogram.analyse(channels, sampleRate, columns, rows, MinHz, Math.min(MaxHz, sampleRate / 2), size)
        const span = totalFrames / Math.max(1, columns)
        const hop = Math.max(1, Math.floor(span))
        const gapped = hop > size
        const windows = (channel: Float32Array): Float32Array => {
            const joined = new Float32Array(columns * size)
            for (let column = 0; column < columns; column++) {
                const start = clamp(Math.round((column + 0.5) * span - size / 2), 0, totalFrames - size)
                joined.set(channel.subarray(start, start + size), column * size)
            }
            return joined
        }
        // gapped frames only need their own samples: analyse the joined column windows, one frame each
        const frames = gapped ? SpectralFrames.analyse(channels.map(windows), sampleRate, size, size)
            : SpectralFrames.analyse(channels, sampleRate, size, hop)
        const centroid = new Float32Array(columns).fill(NaN)
        const rmsDb = ViewMath.rmsCurve(channels, columns, size).map(value => MeasureMath.amplitudeDb(value))
        const position = (frame: number): number => (frame - size / 2) / hop
        for (let column = 0; column < columns && frames.count > 0; column++) {
            const center = (column + 0.5) * span
            let first = Math.ceil(position(center - span / 2)), last = Math.floor(position(center + span / 2))
            if (gapped || last < first) {first = last = gapped ? column : Math.round(position(center))}
            first = clamp(first, 0, frames.count - 1)
            last = clamp(last, first, frames.count - 1)
            let hz = 0.0, active = 0
            for (let frame = first; frame <= last; frame++) {
                if (frames.active[frame] === 1 && frames.centroidHz[frame] >= MinHz) {
                    hz += frames.centroidHz[frame]
                    active++
                }
            }
            if (active > 0) {centroid[column] = hz / active}
        }
        return {cells, centroid, rmsDb, frames}
    }

    const modulation = (curve: Float64Array, frameRate: number, minHz: number, maxHz: number, minDepth: number,
                        response: (rateHz: number) => number): Option<number> => {
        const {residual} = ModulationRate.trend(curve, frameRate)
        return ModulationRate.periodicity(residual, frameRate, minHz, maxHz).flatMap(({rateHz}) =>
            ModulationRate.depth(residual, frameRate, rateHz) / response(rateHz) >= minDepth ? Option.wrap(rateHz) : Option.None)
    }

    /** Periodic level and brightness (log centroid) movement over the active frames; none from gapped frames (aliasing). */
    export const rates = ({frames: {active, powerDb, centroidHz, frameRate, hop, fftSize}}: MovementAnalysis): MovementRates => {
        const from = active.indexOf(1), to = active.lastIndexOf(1) + 1
        const seconds = (to - from) / frameRate
        const minHz = Math.max(MinRateHz, 2 / seconds), maxHz = Math.min(MaxRateHz, frameRate / 3)
        if (from < 0 || seconds < MinSegmentSeconds || maxHz <= minHz || hop > fftSize / 2) {
            return {brightness: Option.None, loudness: Option.None}
        }
        const peak = powerDb.subarray(from, to).reduce((max, value) => Math.max(max, value), -Infinity)
        const level = Float64Array.from(powerDb.subarray(from, to), value => Math.max(value, peak - 60))
        const octaves = Float64Array.from(centroidHz.subarray(from, to), value => Math.log2(Math.max(20, value)))
        return {
            brightness: modulation(octaves, frameRate, minHz, maxHz, BrightMinDepthOct, () => 1),
            loudness: modulation(level, frameRate, minHz, maxHz, AmpMinDepthDb, SpectralFrames.envelopeResponse)
        }
    }

    const rateText = (name: string, rateHz: Option<number>, bpm: number): string => rateHz.mapOr(hz => {
        const sync = ModulationRate.tempoSync(hz, bpm)
        return `${name} cycles at ${hz.toFixed(2)} Hz${isDefined(sync) ? ` (${sync} at ${Math.round(bpm)} BPM)` : ""}`
    }, "")

    const range = (values: Float32Array): [number, number] => values.reduce<[number, number]>(([low, high], value) =>
        Number.isFinite(value) ? [Math.min(low, value), Math.max(high, value)] : [low, high], [Infinity, -Infinity])

    const frequencyToY = (frequency: number, rect: ViewRect, maxHz: number): number =>
        rect.y + rect.height * (1 - ViewKit.logUnit(Math.max(MinHz, Math.min(maxHz, frequency)), MinHz, maxHz))

    const drawSpectrogram = (context: ViewContext, rect: ViewRect, analysis: MovementAnalysis, maxHz: number,
                             compact: boolean): void => {
        const columns = Math.floor(rect.width / CellSize)
        const rows = Math.floor(rect.height / CellSize)
        const image = context.createImageData(columns * CellSize, rows * CellSize)
        Spectrogram.rasterize(analysis.cells, columns, rows, MinDb, MaxDb, image.data, columns * CellSize)
        context.putImageData(image, rect.x, rect.y)
        ViewKit.frequencyTicks(MinHz, maxHz, !compact).forEach(frequency => {
            const y = frequencyToY(frequency, rect, maxHz)
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, ViewKit.Colors.grid)
            ViewKit.text(context, ViewKit.formatHz(frequency), rect.x - 4, y, "right", "middle", ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
        ViewKit.text(context, "Hz", rect.x - 4, rect.y + rect.height, "right", "bottom", ViewKit.Colors.textDim, ViewKit.SmallFont)
        const toX = (column: int): number => rect.x + (column + 0.5) * CellSize
        const toY = (frequency: number): number => frequencyToY(frequency, rect, maxHz)
        ViewKit.strokeCurve(context, analysis.centroid, toX, toY, "rgba(0,0,0,0.85)", compact ? 3.5 : 4.5)
        ViewKit.strokeCurve(context, analysis.centroid, toX, toY, CentroidColor, compact ? 1.5 : 2)
    }

    const drawLoudness = (context: ViewContext, rect: ViewRect, analysis: MovementAnalysis, compact: boolean): void => {
        ViewKit.plot(context, rect)
        const toY = (db: number): number => rect.y + rect.height * Math.max(0, Math.min(1, db / LoudnessMinDb))
        const step = compact || rect.height < 80 ? 30 : 12
        for (let db = 0; db >= LoudnessMinDb; db -= step) {
            const y = toY(db)
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, ViewKit.Colors.grid)
            ViewKit.text(context, ViewKit.axisLabel(`${db}`, "dB", db === 0), rect.x - 4, y, "right", "middle",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
        const columns = analysis.rmsDb.length
        const toX = (column: int): number => rect.x + (column + 0.5) * rect.width / Math.max(1, columns)
        context.fillStyle = "rgba(255,255,255,0.18)"
        context.beginPath()
        context.moveTo(rect.x, rect.y + rect.height)
        analysis.rmsDb.forEach((value, column) => context.lineTo(toX(column), toY(value)))
        context.lineTo(rect.x + rect.width, rect.y + rect.height)
        context.closePath()
        context.fill()
        ViewKit.strokeCurve(context, analysis.rmsDb, toX, toY, ViewKit.Colors.mix, 1.5)
    }

    export const draw = (context: ViewContext, request: ViewRequest, width: int, height: int): void => {
        const {render, notes, compact} = request
        const maxHz = Math.min(MaxHz, render.sampleRate / 2)
        const rects = layout(width, height, compact)
        const totalFrames = AgentRender.frameCount(render)
        ViewKit.fillBackground(context, width, height)
        ViewKit.header(context, compact ? "movement" : "Movement: spectrogram with brightness (cyan) and RMS loudness below",
            request, compact ? 6 : rects.spectrogram.x)
        if (AgentRender.isSilent(render.mix)) {
            ViewKit.text(context, "silent", width / 2, height / 2, "center", "middle", ViewKit.Colors.textDim)
            return
        }
        const analysis = analyse(render.mix, render.sampleRate, Math.floor(rects.spectrogram.width / CellSize),
            Math.floor(rects.spectrogram.height / CellSize))
        drawSpectrogram(context, rects.spectrogram, analysis, maxHz, compact)
        drawLoudness(context, rects.loudness, analysis, compact)
        ViewKit.drawTimeAxis(context, render, rects.loudness, compact, [rects.spectrogram, rects.loudness])
        ViewKit.drawNoteMarkers(context, notes, totalFrames, rects.spectrogram, false)
        ViewKit.drawNoteMarkers(context, notes, totalFrames, rects.loudness, false, false)
        const [lowHz, highHz] = range(analysis.centroid)
        const [lowDb, highDb] = range(analysis.rmsDb.map(value => value <= -100 ? NaN : value))
        const {brightness, loudness} = rates(analysis)
        const centroidLabel = Number.isFinite(lowHz)
            ? `brightness (centroid) ${ViewKit.formatHz(lowHz)}-${ViewKit.formatHz(highHz)} Hz` : "brightness: -"
        const loudnessLabel = Number.isFinite(lowDb) ? `RMS ${lowDb.toFixed(0)} to ${highDb.toFixed(0)} dBFS` : "RMS: silent"
        const brightnessRate = rateText("brightness", brightness, render.bpm)
        const loudnessRate = rateText("loudness", loudness, render.bpm)
        const spectrogram = rects.spectrogram
        ViewKit.labelBoxes(context, [{label: centroidLabel, color: CentroidColor}], spectrogram.x + spectrogram.width - 4, spectrogram.y + 4)
        if (brightnessRate.length > 0) {
            ViewKit.labelBoxes(context, [{label: brightnessRate, color: CentroidColor}], spectrogram.x + spectrogram.width - 4, spectrogram.y + 20)
        }
        const loudnessY = Number.isFinite(lowDb) && (lowDb + highDb) / 2 > LoudnessMinDb / 2
            ? rects.loudness.y + rects.loudness.height - 17 : rects.loudness.y + 3
        ViewKit.labelBox(context, [loudnessLabel, loudnessRate].filter(part => part.length > 0).join(", "),
            rects.loudness.x + 4, loudnessY, ViewKit.Colors.mix)
        if (!compact) {
            ViewKit.text(context, `heat: ${MinDb} to ${MaxDb} dBFS, FFT ${fftSize(totalFrames)}`, width - 16, 14,
                "right", "middle", ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
    }
}

export const renderMovementPng = async (request: ViewRequest): Promise<string> => {
    const [width, height] = ViewKit.viewSize(request.compact, Movement.FullHeight)
    const [canvas, context] = ViewKit.createContext(width, height)
    Movement.draw(context, request, width, height)
    return ViewKit.toPngDataUrl(canvas)
}

export const MovementView: ListenView = {
    key: "movement",
    summary: "movement: modulation over time (wobble rate, filter or vowel sweeps)",
    usesNotes: true,
    render: renderMovementPng
}
