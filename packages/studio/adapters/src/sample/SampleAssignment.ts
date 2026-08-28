import {BoxGraph, PointerField} from "@opendaw/lib-box"
import {
    AudioFileBox,
    NanoDeviceBox,
    PlayfieldDeviceBox,
    PlayfieldSampleBox,
    WerkstattSampleBox
} from "@opendaw/studio-boxes"
import {Pointers} from "@opendaw/studio-enums"
import {Option, UUID} from "@opendaw/lib-std"

export type SampleAssignmentInfo = {
    readonly uuid: UUID.Bytes
    readonly name: string
    readonly durationInSeconds: number
}

// The graph-level sample replacement rules are shared by the UI and the
// control API. A Nano owns its file pointer; a Playfield slot owns the
// pointer and is itself the removable resource.
export namespace SampleAssignment {
    export const ensureFile = (graph: BoxGraph, sample: SampleAssignmentInfo): AudioFileBox =>
        graph.findBox<AudioFileBox>(sample.uuid).unwrapOrElse(() => AudioFileBox.create(graph, sample.uuid, box => {
            box.fileName.setValue(sample.name)
            box.endInSeconds.setValue(sample.durationInSeconds)
        }))

    export const changePointer = (filePointer: PointerField<Pointers.AudioFile>,
                                  replacement: Option<AudioFileBox>): void => {
        if (!filePointer.box.isAttached()) {return}
        replacement.match({
            none: () => filePointer.targetVertex.match({
                none: () => filePointer.box.delete(),
                some: ({box: existingFile}) => {
                    const mustDelete = existingFile.pointerHub.size() === 1
                    filePointer.box.delete()
                    if (mustDelete) {existingFile.delete()}
                }
            }),
            some: newFile => filePointer.targetVertex.match({
                none: () => filePointer.refer(newFile),
                some: ({box: existingFile}) => {
                    if (UUID.equals(newFile.address.uuid, existingFile.address.uuid)) {return}
                    const mustDelete = existingFile.pointerHub.size() === 1
                    filePointer.refer(newFile)
                    if (mustDelete) {existingFile.delete()}
                }
            })
        })
    }

    export const clearPointer = (filePointer: PointerField<Pointers.AudioFile>): void => {
        if (!filePointer.box.isAttached()) {return}
        filePointer.targetVertex.ifSome(({box: existingFile}) => {
            const mustDelete = existingFile.pointerHub.size() === 1
            filePointer.defer()
            if (mustDelete) {existingFile.delete()}
        })
    }

    export const assignNano = (graph: BoxGraph, device: NanoDeviceBox, sample: SampleAssignmentInfo): void => {
        changePointer(device.file, Option.wrap(ensureFile(graph, sample)))
    }

    export const removeNano = (device: NanoDeviceBox): void => clearPointer(device.file)

    // Script declaration slots are persistent: assigning or removing a sample only changes their file pointer.
    export const assignScriptSample = (graph: BoxGraph,
                                       slot: WerkstattSampleBox,
                                       sample: SampleAssignmentInfo): void =>
        changePointer(slot.file, Option.wrap(ensureFile(graph, sample)))

    export const removeScriptSample = (slot: WerkstattSampleBox): void => clearPointer(slot.file)

    export const assignPlayfield = (graph: BoxGraph, device: PlayfieldDeviceBox,
                                    index: number, sample: SampleAssignmentInfo): PlayfieldSampleBox => {
        const file = ensureFile(graph, sample)
        const existing = device.samples.pointerHub.incoming()
            .map(({box}) => box as PlayfieldSampleBox)
            .find(box => box.index.getValue() === index)
        if (existing !== undefined) {
            changePointer(existing.file, Option.wrap(file))
            return existing
        }
        return PlayfieldSampleBox.create(graph, UUID.generate(), box => {
            box.device.refer(device.samples)
            box.file.refer(file)
            box.index.setValue(index)
        })
    }

    export const removePlayfield = (device: PlayfieldDeviceBox, index: number): void => {
        const existing = device.samples.pointerHub.incoming()
            .map(({box}) => box as PlayfieldSampleBox)
            .find(box => box.index.getValue() === index)
        if (existing !== undefined) {changePointer(existing.file, Option.None)}
    }
}
