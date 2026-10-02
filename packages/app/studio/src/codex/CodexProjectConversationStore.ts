import {isDefined, Option} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {ProjectPaths, ProjectProfile, Workers} from "@opendaw/studio-core"
import {CodexConversationSnapshot, CodexConversationStore} from "./CodexConversationSnapshot"

export namespace CodexProjectConversationStore {
    export const FileName = "codex.json"

    export const path = (profile: ProjectProfile): string =>
        `${ProjectPaths.projectFolder(profile.uuid)}/${FileName}`

    /** Save As copies a saved project: its conversation goes along and continues in a fork of the thread. */
    export const copyToCopy = async (from: ProjectProfile, to: ProjectProfile): Promise<void> => {
        const read = await Promises.tryCatch(Workers.Opfs.read(path(from)))
        if (read.status === "rejected") {return}
        const snapshot = CodexConversationSnapshot.decode(new TextDecoder().decode(read.value))
        await snapshot.match({
            none: () => Promise.resolve(),
            some: ({threadId, entries}) => Workers.Opfs.write(path(to),
                new TextEncoder().encode(CodexConversationSnapshot.encode({threadId, entries, forkPending: isDefined(threadId)})))
        })
    }

    // Unsaved projects have no folder yet, their conversation is written on the first project save.
    export const forProfile = (profile: ProjectProfile): CodexConversationStore => ({
        load: async () => {
            const read = await Promises.tryCatch(Workers.Opfs.read(path(profile)))
            return read.status === "resolved"
                ? CodexConversationSnapshot.decode(new TextDecoder().decode(read.value))
                : Option.None
        },
        save: async snapshot => {
            if (!profile.saved()) {return}
            await Workers.Opfs.write(path(profile), new TextEncoder().encode(CodexConversationSnapshot.encode(snapshot)))
        }
    })
}
