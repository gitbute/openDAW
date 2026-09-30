import {Arrays, int, isDefined, Optional, Terminable, UUID} from "@opendaw/lib-std"
import {applyUpdateTasks, BoxGraph, Update, UpdateTask} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import type {Project} from "@opendaw/studio-core"

type Touched = { uuid: UUID.Bytes, name: string, state: "created" | "deleted" | "modified", fields: int }

type LiveTouch = { readonly uuid: UUID.Bytes, readonly name: string }

type LiveChange = { readonly checksum: Int8Array, readonly touched: ReadonlyArray<LiveTouch> }

// UI state and project meta the studio writes while a script runs: selection, editing focus, the save date
const VolatileBoxes: ReadonlySet<string> = new Set(["SelectionBox", "UserInterfaceBox", "ProjectMetaBox"])

const uuidOf = (update: UpdateTask<BoxIO.TypeMap>): UUID.Bytes =>
    update.type === "new" || update.type === "delete" ? update.uuid : update.address[0]

const MaxNames = 8

const describe = (verb: string, entries: ReadonlyArray<Touched>, suffix: string = ""): string => {
    const counts = new Map<string, int>()
    entries.forEach(({name}) => counts.set(name, (counts.get(name) ?? 0) + 1))
    const names = Array.from(counts.entries()).sort(([, first], [, second]) => second - first)
    const listed = names.slice(0, MaxNames).map(([name, count]) => `${count}x ${name}`)
    if (names.length > MaxNames) {listed.push(`${names.length - MaxNames} more types`)}
    return `${verb} ${suffix}${entries.length} box${entries.length === 1 ? "" : "es"}: ${listed.join(", ")}`
}

export namespace ScriptEdits {
    export type Target = Pick<Project, "boxGraph" | "editing" | "loadScriptDevices">

    // Records the live graph's transactions while a script runs, so volatile changes do not refuse its edits.
    export class Watch implements Terminable {
        readonly #boxGraph: BoxGraph
        readonly #baseline: Int8Array
        readonly #changes: Array<LiveChange>
        readonly #pending: Array<LiveTouch>
        readonly #subscription: Terminable

        constructor(boxGraph: BoxGraph) {
            this.#boxGraph = boxGraph
            this.#baseline = boxGraph.checksum()
            this.#changes = []
            this.#pending = []
            this.#subscription = Terminable.many(
                boxGraph.subscribeToAllUpdatesImmediate({onUpdate: (update: Update) => this.#pending.push(this.#touchOf(update))}),
                boxGraph.subscribeTransaction({
                    onBeginTransaction: () => Arrays.clear(this.#pending),
                    onEndTransaction: (rolledBack: boolean) => {
                        if (!rolledBack && this.#pending.length > 0) {
                            this.#changes.push({checksum: boxGraph.checksum(), touched: this.#pending.slice()})
                        }
                        Arrays.clear(this.#pending)
                    }
                }))
        }

        get boxGraph(): BoxGraph {return this.#boxGraph}

        // Boxes changed after the state the script read, or undefined when that state never existed here.
        changedSince(origin: Int8Array): Optional<ReadonlyArray<LiveTouch>> {
            const states = [this.#baseline, ...this.#changes.map(change => change.checksum)]
            const index = states.findLastIndex(checksum => Arrays.equals(checksum, origin))
            return index < 0 ? undefined : this.#changes.slice(index).flatMap(change => change.touched)
        }

        // The script's edits still fit when only volatile boxes changed, none of them edited or pointing at a deleted box.
        accepts(origin: Int8Array, updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>): boolean {
            const changed = this.changedSince(origin)
            if (!isDefined(changed) || changed.some(({name}) => !VolatileBoxes.has(name))) {return false}
            const edited = UUID.newSet<UUID.Bytes>(uuid => uuid)
            const deleted = UUID.newSet<UUID.Bytes>(uuid => uuid)
            updates.forEach(update => {
                edited.add(uuidOf(update), true)
                if (update.type === "delete") {deleted.add(update.uuid, true)}
            })
            return changed.every(({uuid}) => !edited.hasKey(uuid) && this.#boxGraph.findBox(uuid)
                .mapOr(box => box.outgoingEdges().every(([, address]) => !deleted.hasKey(address.uuid)), true))
        }

        terminate(): void {this.#subscription.terminate()}

        #touchOf(update: Update): LiveTouch {
            if (update.type === "new" || update.type === "delete") {return {uuid: update.uuid, name: update.name}}
            const {uuid} = update.address
            return {uuid, name: this.#boxGraph.findBox(uuid).mapOr(box => box.name, "UnknownBox")}
        }
    }

    // Replays a script's edits as one undo step, refusing when the graph is not the one the script read.
    export const apply = (target: Target, updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>, checksum: Int8Array,
                          watch?: Watch): boolean => {
        const {boxGraph, editing} = target
        if (!Arrays.equals(boxGraph.checksum(), checksum)
            && !(isDefined(watch) && watch.boxGraph === boxGraph && watch.accepts(checksum, updates))) {return false}
        editing.modify(() => applyUpdateTasks(boxGraph, updates))
        target.loadScriptDevices()
        return true
    }

    export const describeChanges = (touched: ReadonlyArray<LiveTouch>): string => {
        const counts = new Map<string, int>()
        touched.forEach(({name}) => counts.set(name, (counts.get(name) ?? 0) + 1))
        return Array.from(counts.entries()).slice(0, MaxNames).map(([name, count]) => `${count}x ${name}`).join(", ")
    }

    export const summarize = (updates: ReadonlyArray<UpdateTask<BoxIO.TypeMap>>, boxGraph: BoxGraph): ReadonlyArray<string> => {
        const touched = UUID.newSet<Touched>(entry => entry.uuid)
        const nameOf = (uuid: UUID.Bytes): string => boxGraph.findBox(uuid).mapOr(box => box.name, "UnknownBox")
        updates.forEach(update => {
            if (update.type === "new") {
                touched.add({uuid: update.uuid, name: String(update.name), state: "created", fields: 0}, true)
            } else if (update.type === "delete") {
                const existing = touched.getOrNull(update.uuid)
                if (existing?.state === "created") {
                    touched.removeByKey(update.uuid)
                } else {
                    touched.add({uuid: update.uuid, name: existing?.name ?? nameOf(update.uuid), state: "deleted", fields: 0}, true)
                }
            } else {
                const [uuid] = update.address
                touched.getOrCreate(uuid, () => ({uuid, name: nameOf(uuid), state: "modified", fields: 0})).fields++
            }
        })
        const byState = (state: Touched["state"]) => touched.values().filter(entry => entry.state === state)
        const created = byState("created")
        const deleted = byState("deleted")
        const modified = byState("modified")
        const fields = modified.reduce((sum, entry) => sum + entry.fields, 0)
        return [
            ...(created.length > 0 ? [describe("created", created)] : []),
            ...(deleted.length > 0 ? [describe("deleted", deleted)] : []),
            ...(modified.length > 0 ? [describe("modified", modified, `${fields} field${fields === 1 ? "" : "s"} on `)] : [])
        ]
    }
}
