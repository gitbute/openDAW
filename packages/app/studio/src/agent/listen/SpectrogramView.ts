import {int, TimeSpan} from "@opendaw/lib-std"
import {Window} from "@opendaw/lib-dsp"
import {Wait} from "@opendaw/lib-runtime"
import {FftCache} from "@/agent/analysis/descriptors/dsp/FftCache"
import {AgentRender} from "./AgentRender"
import {ViewContext, ViewKit, ViewRect} from "./ViewKit"

export type SpectrogramOptions = {
    readonly width?: int
    readonly height?: int
    readonly stems?: boolean
    readonly minDb?: number
    readonly maxDb?: number
    readonly title?: string
}

export type SpectrogramLayout = {
    readonly mix: ViewRect
    readonly stems: ReadonlyArray<ViewRect>
    readonly legend: ViewRect
}

export namespace Spectrogram {
    export const FftSize = 4096
    export const StemFftSize = 2048
    export const MinFrequency = 30.0
    export const MaxFrequency = 20_000.0
    export const MaxStemRows = 6
    export const CellSize = 2
    export const Margin = {left: 44, right: 58, top: 34, bottom: 8, gap: 6} as const

    const even = (value: number): int => Math.max(CellSize, Math.floor(value / CellSize) * CellSize)

    export const layout = (width: int, height: int, stemCount: int): SpectrogramLayout => {
        const {left, right, top, bottom, gap} = Margin
        const plotWidth = even(width - left - right)
        const available = height - top - bottom
        const mixHeight = stemCount === 0 ? even(available) : even(available * 0.4)
        const stemHeight = stemCount === 0 ? 0 : even((available - mixHeight - gap * stemCount) / stemCount)
        const mix: ViewRect = {x: left, y: top, width: plotWidth, height: mixHeight}
        const stems: Array<ViewRect> = []
        for (let index = 0; index < stemCount; index++) {
            stems.push({x: left, y: top + mixHeight + gap + index * (stemHeight + gap), width: plotWidth, height: stemHeight})
        }
        const legend: ViewRect = {x: left + plotWidth + 12, y: top, width: 10, height: Math.min(available, 200)}
        return {mix, stems, legend}
    }

    // dB per cell, index = column * rows + row, row 0 = lowest band
    export const analyse = (channels: ReadonlyArray<Float32Array>, sampleRate: number,
                            columns: int, rows: int, minFrequency: number, maxFrequency: number,
                            fftSize: int = FftSize): Float32Array => {
        const result = new Float32Array(columns * rows).fill(-Infinity)
        const length = channels.length === 0 ? 0 : channels[0].length
        if (length === 0 || columns === 0 || rows === 0) {return result}
        const fft = FftCache.fft(fftSize)
        const window = FftCache.window(Window.Type.Hanning, fftSize)
        const reference = window.reduce((sum, value) => sum + value, 0) / 2
        const real = new Float32Array(fftSize)
        const imag = new Float32Array(fftSize)
        const half = fftSize >> 1, mask = fftSize - 1
        const slots = [new Float32Array(half), new Float32Array(half)]
        const binHz = sampleRate / fftSize
        const top = Math.min(maxFrequency, sampleRate / 2)
        const bands = Array.from({length: rows}, (_band, row) => {
            const low = minFrequency * Math.pow(top / minFrequency, row / rows) / binHz
            const high = minFrequency * Math.pow(top / minFrequency, (row + 1) / rows) / binHz
            return [low, high] as const
        })
        const hop = length / columns
        const perColumn = Math.max(1, Math.min(2, Math.round(hop / fftSize)))
        const frames = columns * perColumn
        const scale = 1.0 / channels.length
        const load = (target: Float32Array, frame: int): void => {
            const center = (Math.floor(frame / perColumn) + 0.5) * hop
            const offset = Math.round(center + (frame % perColumn - (perColumn - 1) / 2) * hop / perColumn - fftSize / 2)
            const from = Math.max(0, -offset), to = Math.min(fftSize, length - offset)
            target.fill(0.0)
            for (const channel of channels) {
                for (let index = from; index < to; index++) {target[index] += channel[offset + index]}
            }
            for (let index = from; index < to; index++) {target[index] *= scale * window[index]}
        }
        const finish = (column: int): void => {
            const power = slots[column & 1]
            for (let row = 0; row < rows; row++) {
                const [low, high] = bands[row]
                let value: number
                if (high - low < 1.0) {
                    const position = Math.min(fftSize / 2 - 2, (low + high) / 2)
                    const index = Math.floor(position)
                    const ratio = position - index
                    value = power[index] * (1 - ratio) + power[index + 1] * ratio
                } else {
                    value = 0.0
                    const last = Math.min(fftSize / 2 - 1, Math.round(high))
                    for (let bin = Math.round(low); bin <= last; bin++) {value = Math.max(value, power[bin])}
                }
                result[column * rows + row] = 10 * Math.log10(value / (reference * reference) + 1e-20)
            }
            power.fill(0.0)
        }
        for (let frame = 0; frame < frames; frame += 2) {
            const paired = frame + 1 < frames
            load(real, frame)
            if (paired) {load(imag, frame + 1)} else {imag.fill(0.0)}
            fft.process(real, imag)
            const first = slots[Math.floor(frame / perColumn) & 1], second = slots[Math.floor((frame + 1) / perColumn) & 1]
            const weight = 0.25 / perColumn
            for (let bin = 0; bin < half; bin++) {
                const mirror = (fftSize - bin) & mask
                const re = real[bin], im = imag[bin], mirrorRe = real[mirror], mirrorIm = imag[mirror]
                first[bin] += ((re + mirrorRe) ** 2 + (im - mirrorIm) ** 2) * weight
                if (paired) {second[bin] += ((im + mirrorIm) ** 2 + (mirrorRe - re) ** 2) * weight}
            }
            if ((frame + 1) % perColumn === 0) {finish(Math.floor(frame / perColumn))}
            if (paired && (frame + 2) % perColumn === 0) {finish(Math.floor((frame + 1) / perColumn))}
        }
        return result
    }

    export const rasterize = (values: Float32Array, columns: int, rows: int, minDb: number, maxDb: number,
                              target: Uint8ClampedArray, targetWidth: int): void => {
        const range = maxDb - minDb
        for (let column = 0; column < columns; column++) {
            for (let row = 0; row < rows; row++) {
                const unit = (values[column * rows + row] - minDb) / range
                const [red, green, blue] = unit <= 0 ? [0, 0, 0] : ViewKit.heatColor(unit)
                const y0 = (rows - 1 - row) * CellSize
                for (let dy = 0; dy < CellSize; dy++) {
                    for (let dx = 0; dx < CellSize; dx++) {
                        const offset = ((y0 + dy) * targetWidth + column * CellSize + dx) * 4
                        target[offset] = red
                        target[offset + 1] = green
                        target[offset + 2] = blue
                        target[offset + 3] = 255
                    }
                }
            }
        }
    }

    const drawPlot = (context: ViewContext, channels: ReadonlyArray<Float32Array>, sampleRate: number,
                      rect: ViewRect, minDb: number, maxDb: number, maxFrequency: number, fftSize: int): void => {
        const columns = Math.floor(rect.width / CellSize)
        const rows = Math.floor(rect.height / CellSize)
        const values = analyse(channels, sampleRate, columns, rows, MinFrequency, maxFrequency, fftSize)
        const image = context.createImageData(columns * CellSize, rows * CellSize)
        rasterize(values, columns, rows, minDb, maxDb, image.data, columns * CellSize)
        context.putImageData(image, rect.x, rect.y)
    }

    const drawFrequencyAxis = (context: ViewContext, rect: ViewRect, minFrequency: number, maxFrequency: number,
                               dense: boolean): void => {
        ViewKit.frequencyTicks(minFrequency, maxFrequency, dense).forEach(frequency => {
            const y = rect.y + rect.height * (1 - ViewKit.logUnit(frequency, minFrequency, maxFrequency))
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, ViewKit.Colors.grid)
            ViewKit.text(context, ViewKit.formatHz(frequency), rect.x - 4, y, "right", "middle",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
    }

    const drawDbLegend = (context: ViewContext, rect: ViewRect, minDb: number, maxDb: number): void => {
        for (let y = 0; y < rect.height; y++) {
            const [red, green, blue] = ViewKit.heatColor(1 - y / rect.height)
            context.fillStyle = `rgb(${red},${green},${blue})`
            context.fillRect(rect.x, rect.y + y, rect.width, 1)
        }
        const step = (maxDb - minDb) > 60 ? 24 : 12
        for (let db = maxDb; db >= minDb; db -= step) {
            const y = rect.y + rect.height * (maxDb - db) / (maxDb - minDb)
            ViewKit.text(context, `${Math.round(db)}`, rect.x + rect.width + 4, y, "left", "middle",
                ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
        ViewKit.text(context, "dBFS", rect.x, rect.y + rect.height + 12, "left", "middle",
            ViewKit.Colors.textDim, ViewKit.SmallFont)
    }

    export const draw = async (context: ViewContext, render: AgentRender, width: int, height: int,
                               options?: SpectrogramOptions): Promise<void> => {
        const minDb = options?.minDb ?? -96.0
        const maxDb = options?.maxDb ?? 0.0
        const stems = (options?.stems ?? true) && render.stems.length <= MaxStemRows ? render.stems : []
        const {sampleRate, mix, bars, bpm, signature: [nominator, denominator]} = render
        const maxFrequency = Math.min(MaxFrequency, sampleRate / 2)
        const plots = layout(width, height, stems.length)
        ViewKit.fillBackground(context, width, height)
        ViewKit.text(context, `${options?.title ?? "Spectrogram"} (log frequency) - ${ViewKit.barRange(bars)} -${Math.round(bpm * 100) / 100} BPM - ${nominator}/${denominator}`,
            Margin.left, 14, "left", "middle")
        drawPlot(context, mix, sampleRate, plots.mix, minDb, maxDb, maxFrequency, FftSize)
        for (const [index, stem] of stems.entries()) {
            await Wait.timeSpan(TimeSpan.millis(0))
            drawPlot(context, stem.channels, sampleRate, plots.stems[index], minDb, maxDb, maxFrequency, StemFftSize)
        }
        drawFrequencyAxis(context, plots.mix, MinFrequency, maxFrequency, true)
        plots.stems.forEach(rect => drawFrequencyAxis(context, rect, MinFrequency, maxFrequency, false))
        ViewKit.drawBars(context, render, [plots.mix, ...plots.stems], plots.mix.y - 2)
        ViewKit.labelBox(context, "Mix", plots.mix.x + 4, plots.mix.y + 4, ViewKit.Colors.mix)
        stems.forEach((stem, index) => {
            const rect = plots.stems[index]
            ViewKit.labelBox(context, stem.silent ? `${stem.label} (silent)` : stem.label, rect.x + 4, rect.y + 4,
                ViewKit.seriesColor(index))
        })
        drawDbLegend(context, plots.legend, minDb, maxDb)
    }
}

export const renderSpectrogramPng = async (render: AgentRender, options?: SpectrogramOptions): Promise<string> => {
    const [width, height] = ViewKit.clampSize(options?.width ?? ViewKit.MaxWidth, options?.height ?? ViewKit.MaxHeight)
    const [canvas, context] = ViewKit.createContext(width, height)
    await Spectrogram.draw(context, render, width, height, options)
    return ViewKit.toPngDataUrl(canvas)
}
