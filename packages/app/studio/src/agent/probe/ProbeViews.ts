import {int} from "@opendaw/lib-std"
import {MeasureMath} from "@/agent/analysis/descriptors/dsp/MeasureMath"
import {ViewContext, ViewKit, ViewRect} from "@/agent/listen/ViewKit"
import type {DynamicsResult, FrequencyResult, HarmonicsResult, ImdResult, ImpulseResult, ProbeResult, TransferResult} from "./ProbeMeasure"
import type {ProbeTest} from "./ProbeSignals"

export type ChartPoint = readonly [number, number]

export type ChartSeries = {
    readonly label: string
    readonly color: string
    readonly points: ReadonlyArray<ChartPoint>
    readonly style: "line" | "dashed" | "stems"
}

export type ProbeChart = {
    readonly title: string
    readonly xLabel: string
    readonly yLabel: string
    readonly logX: boolean
    readonly xRange: ChartPoint
    readonly yRange: ChartPoint
    readonly xTicks: ReadonlyArray<number>
    readonly series: ReadonlyArray<ChartSeries>
}

export type LabeledResult = { readonly label: string, readonly probe: ProbeResult }

export namespace ProbeViews {
    export const Size = {width: 720, height: 340} as const
    const Margin = {left: 48, right: 16, top: 44, bottom: 30} as const

    const span = (values: ReadonlyArray<number>, minSpan: number, fallback: ChartPoint): ChartPoint => {
        const finite = values.filter(value => Number.isFinite(value))
        if (finite.length === 0) {return fallback}
        const low = Math.min(...finite)
        const high = Math.max(...finite)
        const pad = Math.max(0, minSpan - (high - low)) / 2 + 1
        return [Math.floor((low - pad) / 3) * 3, Math.ceil((high + pad) / 3) * 3]
    }

    const colorOf = (index: int): string => ViewKit.seriesColor(index)

    const frequencyChart = (entries: ReadonlyArray<{ label: string, result: FrequencyResult }>): ProbeChart => ({
        title: "Frequency response (output vs input, -18 dBFS sweep, 1/12 octave)", xLabel: "Hz", yLabel: "dB", logX: true,
        xRange: [20, 20000], xTicks: ViewKit.frequencyTicks(20, 20000, true),
        yRange: span(entries.flatMap(({result}) => result.curve.map(({db}) => db)), 12, [-24, 6]),
        series: entries.map(({label, result}, index) => ({
            label, color: colorOf(index), style: "line", points: result.curve.map(({hz, db}) => [hz, db] as const)
        }))
    })

    const harmonicsChart = (entries: ReadonlyArray<{ label: string, result: HarmonicsResult }>): ProbeChart => ({
        title: `Harmonics H2-H10 relative to H1 (${entries[0]?.result.hz ?? 0} Hz sine), one line per input level`,
        xLabel: "harmonic", yLabel: "dB re H1", logX: false, xRange: [1.5, 10.5], xTicks: [2, 3, 4, 5, 6, 7, 8, 9, 10],
        yRange: [MeasureMath.FloorDb, 0],
        series: entries.flatMap(({label, result}, chain) => result.levels.map(({levelDb, harmonicsDb}, level) => ({
            label: `${entries.length > 1 ? `${label} ` : ""}${levelDb} dBFS (THD ${result.levels[level].thdPercent.toFixed(2)}%)`,
            color: colorOf(level + chain * result.levels.length), style: chain === 0 ? "line" : "dashed",
            points: harmonicsDb.map((db, index) => [index + 2, db] as const)
        })))
    })

    const transferChart = (entries: ReadonlyArray<{ label: string, result: TransferResult }>): ProbeChart => ({
        title: "Static transfer (1 kHz sine steps): output level vs input level", xLabel: "in dBFS", yLabel: "out dBFS", logX: false,
        xRange: [-48, 6], xTicks: [-48, -42, -36, -30, -24, -18, -12, -6, 0, 6],
        yRange: span(entries.flatMap(({result}) => [...result.steps.map(({outDb}) => outDb ?? NaN), -48, 6]), 12, [-60, 12]),
        series: [
            {label: "unity", color: ViewKit.Colors.gridStrong, style: "dashed", points: [[-48, -48], [6, 6]]},
            ...entries.flatMap(({label, result}, index): ReadonlyArray<ChartSeries> => [
                {label: `${label} rms`, color: colorOf(index), style: "line", points: result.steps.map(({levelDb, outDb}) => [levelDb, outDb ?? NaN] as const)},
                {label: `${label} peak`, color: colorOf(index), style: "dashed", points: result.steps.map(({levelDb, outPeakDb}) => [levelDb, outPeakDb ?? NaN] as const)}
            ])
        ]
    })

    const imdChart = (entries: ReadonlyArray<{ label: string, result: ImdResult }>): ProbeChart => ({
        title: `Intermodulation (60 Hz + 7 kHz, 4:1): strongest sidebands relative to the 7 kHz tone`, xLabel: "Hz", yLabel: "dB re 7 kHz",
        logX: false, xRange: [6650, 7350], xTicks: [6700, 6800, 6900, 7000, 7100, 7200, 7300], yRange: [-120, 0],
        series: entries.map(({label, result}, index) => ({
            label: `${label} IMD ${result.imdPercent.toFixed(2)}%`, color: colorOf(index), style: "stems",
            points: [[7000 + index * 4, 0] as const, ...result.products.map(({hz, db}) => [hz + index * 4, db] as const)]
        }))
    })

    const dynamicsChart = (entries: ReadonlyArray<{ label: string, result: DynamicsResult }>): ProbeChart => {
        const length = Math.max(1, ...entries.map(({result}) => result.curve.length === 0 ? 0 : result.curve[result.curve.length - 1].ms))
        return {
            title: "Gain change over time (1 kHz tone: -30 / -6 / -30 dBFS), relative to the gain at -30 dBFS", xLabel: "ms", yLabel: "dB",
            logX: false, xRange: [0, length], xTicks: Array.from({length: Math.floor(length / 200) + 1}, (_value, index) => index * 200),
            yRange: span(entries.flatMap(({result}) => result.curve.map(({db}) => db)), 6, [-12, 3]),
            series: entries.map(({label, result}, index) => ({
                label, color: colorOf(index), style: "line", points: result.curve.map(({ms, db}) => [ms, db] as const)
            }))
        }
    }

    const impulseChart = (entries: ReadonlyArray<{ label: string, result: ImpulseResult }>): ProbeChart => {
        const length = Math.max(1, ...entries.map(({result}) => result.envelope.length))
        return {
            title: "Impulse response: 1 ms energy envelope (line) and Schroeder decay (dashed), dB re peak / total", xLabel: "ms",
            yLabel: "dB", logX: false, xRange: [0, length], yRange: [-100, 0],
            xTicks: Array.from({length: Math.floor(length / 500) + 1}, (_value, index) => index * 500),
            series: entries.flatMap(({label, result}, index): ReadonlyArray<ChartSeries> => [
                {label, color: colorOf(index), style: "line", points: result.envelope.map(({ms, db}) => [ms, db] as const)},
                {label: `${label} decay`, color: colorOf(index), style: "dashed", points: result.decay.map(({ms, db}) => [ms, db] as const)}
            ])
        }
    }

    export const chartOf = (test: ProbeTest, entries: ReadonlyArray<LabeledResult>): ProbeChart => {
        switch (test) {
            case "frequency":
                return frequencyChart(entries.flatMap(({label, probe}) => probe.test === "frequency" ? [{label, result: probe.result}] : []))
            case "harmonics":
                return harmonicsChart(entries.flatMap(({label, probe}) => probe.test === "harmonics" ? [{label, result: probe.result}] : []))
            case "transfer":
                return transferChart(entries.flatMap(({label, probe}) => probe.test === "transfer" ? [{label, result: probe.result}] : []))
            case "imd":
                return imdChart(entries.flatMap(({label, probe}) => probe.test === "imd" ? [{label, result: probe.result}] : []))
            case "dynamics":
                return dynamicsChart(entries.flatMap(({label, probe}) => probe.test === "dynamics" ? [{label, result: probe.result}] : []))
            case "impulse":
                return impulseChart(entries.flatMap(({label, probe}) => probe.test === "impulse" ? [{label, result: probe.result}] : []))
        }
    }

    export const toX = (value: number, {logX, xRange: [low, high]}: ProbeChart, rect: ViewRect): number => {
        const unit = logX ? ViewKit.logUnit(Math.max(low, value), low, high) : (value - low) / (high - low)
        return rect.x + Math.max(0, Math.min(1, unit)) * rect.width
    }

    export const toY = (value: number, {yRange: [low, high]}: ProbeChart, rect: ViewRect): number =>
        rect.y + rect.height * (1 - Math.max(0, Math.min(1, (value - low) / (high - low))))

    const formatTick = (value: number, logX: boolean): string => logX ? ViewKit.formatHz(value) : String(value)

    const drawSeries = (context: ViewContext, chart: ProbeChart, rect: ViewRect, {color, points, style}: ChartSeries): void => {
        context.strokeStyle = color
        context.lineWidth = style === "stems" ? 2 : 1.5
        context.setLineDash(style === "dashed" ? [5, 4] : [])
        context.beginPath()
        let pen = false
        points.forEach(([x, y]) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                pen = false
                return
            }
            const px = toX(x, chart, rect)
            const py = toY(y, chart, rect)
            if (style === "stems") {
                context.moveTo(px, rect.y + rect.height)
                context.lineTo(px, py)
            } else if (pen) {
                context.lineTo(px, py)
            } else {
                context.moveTo(px, py)
                pen = true
            }
        })
        context.stroke()
        context.setLineDash([])
    }

    export const draw = (context: ViewContext, chart: ProbeChart, width: int, height: int): void => {
        ViewKit.fillBackground(context, width, height)
        ViewKit.text(context, chart.title, Margin.left, 14, "left", "middle")
        const legendBottom = ViewKit.drawLegend(context, chart.series.filter(({label}) => label !== "unity")
            .map(({label, color}) => ({label, color})), Margin.left, 30, width - Margin.left - Margin.right)
        const top = Math.max(Margin.top, legendBottom + 4)
        const rect: ViewRect = {x: Margin.left, y: top, width: width - Margin.left - Margin.right, height: Math.max(48, height - top - Margin.bottom)}
        context.fillStyle = ViewKit.Colors.plot
        context.fillRect(rect.x, rect.y, rect.width, rect.height)
        const [low, high] = chart.yRange
        const step = high - low > 60 ? 20 : high - low > 24 ? 6 : 3
        for (let value = Math.ceil(low / step) * step; value <= high; value += step) {
            const y = toY(value, chart, rect)
            ViewKit.horizontalLine(context, y, rect.x, rect.x + rect.width, value === 0 ? ViewKit.Colors.gridStrong : ViewKit.Colors.grid)
            ViewKit.text(context, String(value), rect.x - 4, y, "right", "middle", ViewKit.Colors.textDim, ViewKit.SmallFont)
        }
        chart.xTicks.forEach(tick => {
            const x = toX(tick, chart, rect)
            ViewKit.verticalLine(context, x, rect.y, rect.y + rect.height, ViewKit.Colors.grid)
            ViewKit.text(context, formatTick(tick, chart.logX), x, rect.y + rect.height + 4, "center", "top", ViewKit.Colors.textDim, ViewKit.SmallFont)
        })
        ViewKit.text(context, chart.xLabel, rect.x + rect.width, height - 4, "right", "bottom", ViewKit.Colors.textDim, ViewKit.SmallFont)
        ViewKit.text(context, chart.yLabel, 4, rect.y - 6, "left", "bottom", ViewKit.Colors.textDim, ViewKit.SmallFont)
        chart.series.forEach(series => drawSeries(context, chart, rect, series))
    }

    export const renderPng = async (chart: ProbeChart): Promise<string> => {
        const [width, height] = ViewKit.clampSize(Size.width, Size.height)
        const [canvas, context] = ViewKit.createContext(width, height)
        draw(context, chart, width, height)
        return ViewKit.toPngDataUrl(canvas)
    }
}
