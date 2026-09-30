import {int} from "@opendaw/lib-std"
import {MidiKeys, ppqn, PPQN} from "@opendaw/lib-dsp"
import {LegendEntry, ViewContext, ViewKit, ViewRect} from "./ViewKit"

export type PianoRollNote = {
    readonly pitch: int
    readonly position: ppqn
    readonly duration: ppqn
    readonly velocity: number
    readonly track: string
}

export type PianoRollRange = { readonly startPpqn: ppqn, readonly endPpqn: ppqn, readonly ppqnPerBar: ppqn }

export type PianoRollOptions = {
    readonly width?: int
    readonly height?: int
    readonly firstBar?: int
    readonly beatPpqn?: ppqn
    readonly title?: string
}

export namespace PianoRoll {
    export const Margin = {left: 44, right: 12, bottom: 8} as const
    export const MinPitchSpan = 12

    export const pitchRange = (notes: ReadonlyArray<PianoRollNote>): [int, int] => {
        if (notes.length === 0) {return [60, 60 + MinPitchSpan - 1]}
        let low = notes.reduce((min, note) => Math.min(min, note.pitch), 127) - 1
        let high = notes.reduce((max, note) => Math.max(max, note.pitch), 0) + 1
        while (high - low + 1 < MinPitchSpan) {
            if ((high - low) % 2 === 0) {high++} else {low--}
        }
        return [Math.max(0, low), Math.min(127, high)]
    }

    export const trackNames = (notes: ReadonlyArray<PianoRollNote>): ReadonlyArray<string> =>
        notes.reduce((names: Array<string>, note) => {
            if (!names.includes(note.track)) {names.push(note.track)}
            return names
        }, [])

    export const positionToX = (position: ppqn, range: PianoRollRange, rect: ViewRect): number =>
        rect.x + (position - range.startPpqn) / Math.max(1, range.endPpqn - range.startPpqn) * rect.width

    export const noteRect = (note: PianoRollNote, range: PianoRollRange, rect: ViewRect,
                             low: int, high: int): ViewRect => {
        const rowHeight = rect.height / (high - low + 1)
        const start = Math.max(range.startPpqn, note.position)
        const end = Math.min(range.endPpqn, note.position + note.duration)
        const x = positionToX(start, range, rect)
        const width = Math.max(1, positionToX(end, range, rect) - x)
        return {x, y: rect.y + (high - note.pitch) * rowHeight, width, height: rowHeight}
    }

    export const isVisible = (note: PianoRollNote, range: PianoRollRange): boolean =>
        note.position < range.endPpqn && note.position + note.duration > range.startPpqn

    export const labeledPitch = (pitch: int, rowHeight: number): boolean => {
        const key = pitch % 12
        return rowHeight >= 10 || key === 0 || (rowHeight * 3 >= 10 && (key === 4 || key === 7))
    }

    export const draw = (context: ViewContext, notes: ReadonlyArray<PianoRollNote>, range: PianoRollRange,
                         width: int, height: int, options?: PianoRollOptions): void => {
        const visible = notes.filter(note => isVisible(note, range))
        const [low, high] = pitchRange(visible)
        const tracks = trackNames(notes)
        const colorOf = (track: string): string => ViewKit.seriesColor(tracks.indexOf(track))
        const firstBar = options?.firstBar ?? Math.floor(range.startPpqn / range.ppqnPerBar) + 1
        const beatPpqn = options?.beatPpqn ?? PPQN.Quarter
        ViewKit.fillBackground(context, width, height)
        const lastBar = firstBar + Math.ceil((range.endPpqn - range.startPpqn) / range.ppqnPerBar) - 1
        const title = options?.title ?? "Piano roll"
        ViewKit.text(context, `${title} - bars ${firstBar}-${lastBar} - ${visible.length} notes (brightness = velocity)`,
            Margin.left, 14, "left", "middle")
        const legend: ReadonlyArray<LegendEntry> = tracks.map(track => ({label: track, color: colorOf(track)}))
        const top = ViewKit.drawLegend(context, legend, Margin.left, 32, width - Margin.left - Margin.right) + 12
        const rect: ViewRect = {
            x: Margin.left, y: top, width: width - Margin.left - Margin.right, height: Math.max(24, height - top - Margin.bottom)
        }
        const rowHeight = rect.height / (high - low + 1)
        context.fillStyle = ViewKit.Colors.plot
        context.fillRect(rect.x, rect.y, rect.width, rect.height)
        for (let pitch = low; pitch <= high; pitch++) {
            const y = rect.y + (high - pitch) * rowHeight
            if (MidiKeys.isBlackKey(pitch)) {
                context.fillStyle = "rgba(255,255,255,0.035)"
                context.fillRect(rect.x, y, rect.width, rowHeight)
            }
            if (pitch % 12 === 0) {ViewKit.horizontalLine(context, y + rowHeight, rect.x, rect.x + rect.width, ViewKit.Colors.grid)}
            if (labeledPitch(pitch, rowHeight)) {
                ViewKit.text(context, MidiKeys.toFullString(pitch), rect.x - 4, y + rowHeight / 2, "right", "middle",
                    pitch % 12 === 0 ? ViewKit.Colors.text : ViewKit.Colors.textDim, ViewKit.SmallFont)
            }
        }
        const beatSpacing = beatPpqn / Math.max(1, range.endPpqn - range.startPpqn) * rect.width
        if (beatSpacing >= 6) {
            for (let position = range.startPpqn; position < range.endPpqn; position += beatPpqn) {
                ViewKit.verticalLine(context, positionToX(position, range, rect), rect.y, rect.y + rect.height, "rgba(255,255,255,0.05)")
            }
        }
        const barCount = lastBar - firstBar + 1
        const barSpacing = rect.width * range.ppqnPerBar / Math.max(1, range.endPpqn - range.startPpqn)
        const stride = ViewKit.labelStride(barCount, barSpacing, 24)
        for (let index = 0; index < barCount; index++) {
            const x = positionToX(range.startPpqn + index * range.ppqnPerBar, range, rect)
            const labeled = index % stride === 0
            ViewKit.verticalLine(context, x, rect.y, rect.y + rect.height, labeled ? ViewKit.Colors.gridStrong : ViewKit.Colors.grid)
            if (labeled) {ViewKit.text(context, String(firstBar + index), x + 2, rect.y - 2, "left", "bottom", ViewKit.Colors.text, ViewKit.SmallFont)}
        }
        visible.forEach(note => {
            const {x, y, width: noteWidth, height: noteHeight} = noteRect(note, range, rect, low, high)
            context.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.min(1, note.velocity))
            context.fillStyle = colorOf(note.track)
            context.fillRect(x, y + 0.5, noteWidth, Math.max(1, noteHeight - 1))
            context.globalAlpha = 1.0
            if (noteHeight >= 4 && noteWidth >= 3) {
                context.strokeStyle = "rgba(0,0,0,0.6)"
                context.lineWidth = 1
                context.strokeRect(x + 0.5, y + 1, noteWidth - 1, Math.max(1, noteHeight - 2))
            }
        })
    }
}

export const renderPianoRollPng = async (notes: ReadonlyArray<PianoRollNote>, range: PianoRollRange,
                                         options?: PianoRollOptions): Promise<string> => {
    const [width, height] = ViewKit.clampSize(options?.width ?? ViewKit.MaxWidth, options?.height ?? ViewKit.MaxHeight)
    const [canvas, context] = ViewKit.createContext(width, height)
    PianoRoll.draw(context, notes, range, width, height, options)
    return ViewKit.toPngDataUrl(canvas)
}
