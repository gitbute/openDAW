import {Optional} from "@opendaw/lib-std"
import type {SoundNote} from "@/agent/analysis/SoundTarget"
import type {AgentRender} from "./AgentRender"
import {renderSpectrogramPng} from "./SpectrogramView"
import {renderLoudnessPng} from "./LoudnessView"
import {ScopeView} from "./ScopeView"
import {SpectrumView} from "./SpectrumView"
import {MovementView} from "./MovementView"
import {StereoView} from "./StereoView"
import {ViewKit} from "./ViewKit"

/** What a view draws: a render (already cut to the focus window when zoomed in) and the notes inside it. */
export type ViewRequest = {
    readonly render: AgentRender
    readonly notes: ReadonlyArray<SoundNote>
    /** One of several sandbox variations: draw small, without stems. */
    readonly compact: boolean
    readonly title: Optional<string>
}

export interface ListenView {
    readonly key: string
    /** The view draws note boundaries, so the caller has to find the notes. */
    readonly usesNotes?: boolean
    /** One line for the tool description: what the image shows. */
    readonly summary: string
    render(request: ViewRequest): Promise<string>
}

const SpectrogramView: ListenView = {
    key: "spectrogram",
    summary: "spectrogram: arrangement and frequency over time, mix plus a row per stem (at most 6)",
    render: ({render, compact, title}: ViewRequest) =>
        renderSpectrogramPng(render, compact ? {...ViewKit.CompactSize, stems: false, title} : {title})
}

const LoudnessView: ListenView = {
    key: "loudness",
    summary: "loudness: levels of the mix and stems over time",
    render: ({render, compact, title}: ViewRequest) => renderLoudnessPng(render, compact ? {...ViewKit.CompactSize, title} : {title})
}

// One entry per view; each view lives in its own file with its own tests.
const Registry: ReadonlyArray<ListenView> = [
    SpectrogramView,
    LoudnessView,
    ScopeView,
    SpectrumView,
    MovementView,
    StereoView
]

export namespace ListenViews {
    export const all = (): ReadonlyArray<ListenView> => Registry

    export const keys = (): ReadonlyArray<string> => Registry.map(({key}) => key)

    export const find = (key: string): Optional<ListenView> => Registry.find(view => view.key === key)
}
