import {Address} from "@opendaw/lib-box"
import {Option, Provider} from "@opendaw/lib-std"

export type LabeledAudioOutput = {
    readonly address: Address
    readonly label: string
    readonly children: Provider<Option<Iterable<LabeledAudioOutput>>>
}

export interface LabeledAudioOutputsOwner {
    labeledAudioOutputs(): Iterable<LabeledAudioOutput>
}

export type LabeledAudioOutputLeaf = {
    readonly address: Address
    readonly label: string
    /** The labels along the same hierarchy the UI renders for this output. */
    readonly path: ReadonlyArray<string>
}

/**
 * Flatten the public audio-output tree without inventing a second source list.
 * A node with children is only navigation in the UI; selectable sources are its
 * leaves, so those are the resources exposed to control-tool callers.
 */
export const labeledAudioOutputLeaves = (owner: LabeledAudioOutputsOwner): ReadonlyArray<LabeledAudioOutputLeaf> => {
    const result: Array<LabeledAudioOutputLeaf> = []
    const visit = (outputs: Iterable<LabeledAudioOutput>, parentPath: ReadonlyArray<string>): void => {
        for (const output of outputs) {
            const path = [...parentPath, output.label]
            const children = output.children().unwrapOrUndefined()
            if (children === undefined) {
                result.push({address: output.address, label: output.label, path})
            } else {
                visit(children, path)
            }
        }
    }
    visit(owner.labeledAudioOutputs(), [])
    return result
}
