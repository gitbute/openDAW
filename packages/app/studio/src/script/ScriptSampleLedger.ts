import {Predicate, SortedSet, UUID} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {Sample} from "@opendaw/studio-adapters"

export type ScriptSampleStorage = {
    exists(uuid: UUID.Bytes): Promise<boolean>
    deleteItem(uuid: UUID.Bytes): Promise<void>
}

// Only samples that were not in storage before are recorded, so discarding never deletes the user's samples.
export class ScriptSampleLedger {
    readonly #storage: ScriptSampleStorage
    readonly #added: SortedSet<UUID.Bytes, UUID.Bytes>

    constructor(storage: ScriptSampleStorage) {
        this.#storage = storage
        this.#added = UUID.newSet<UUID.Bytes>(uuid => uuid)
    }

    async add(arrayBuffer: ArrayBuffer, importer: (uuid: UUID.Bytes) => Promise<Sample>): Promise<Sample> {
        const uuid = await UUID.sha256(arrayBuffer)
        const existed = await this.#storage.exists(uuid)
        const sample = await importer(uuid)
        if (!existed) {this.#added.add(uuid, true)}
        return sample
    }

    async discardUnused(isUsed: Predicate<UUID.Bytes>): Promise<ReadonlyArray<UUID.Bytes>> {
        const unused = this.#added.values().filter(uuid => !isUsed(uuid))
        this.#added.clear()
        await Promise.all(unused.map(uuid => Promises.tryCatch(this.#storage.deleteItem(uuid))))
        return unused
    }
}
