import type {AgentToolContent} from "./AgentTool"
import type {CodexInputModality} from "./types"

export namespace CodexContentGate {
    const omissionNote = (count: number, noun: string, modality: CodexInputModality): string =>
        `[${count} ${noun} attachment${count === 1 ? "" : "s"} omitted: the active model does not accept ${modality} input]`

    export const apply = (content: ReadonlyArray<AgentToolContent>,
                          modalities: ReadonlyArray<CodexInputModality>): ReadonlyArray<AgentToolContent> => {
        const acceptsImage = modalities.includes("image")
        const acceptsAudio = modalities.includes("audio")
        const images = acceptsImage ? 0 : content.filter(item => item.type === "inputImage").length
        const audio = acceptsAudio ? 0 : content.filter(item => item.type === "inputAudio").length
        if (images === 0 && audio === 0) {return content}
        const kept = content.filter(item => (item.type !== "inputImage" || acceptsImage)
            && (item.type !== "inputAudio" || acceptsAudio))
        const notes = [
            ...(images > 0 ? [omissionNote(images, "image", "image")] : []),
            ...(audio > 0 ? [omissionNote(audio, "audio", "audio")] : [])
        ]
        return [...kept, {type: "inputText", text: notes.join("\n")}]
    }
}
