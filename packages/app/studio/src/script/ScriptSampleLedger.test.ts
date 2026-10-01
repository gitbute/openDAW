import {describe, expect, it} from "vitest"
import {UUID} from "@opendaw/lib-std"
import {Sample} from "@opendaw/studio-adapters"
import {ScriptSampleLedger, ScriptSampleStorage} from "./ScriptSampleLedger"

class FakeStorage implements ScriptSampleStorage {
    readonly stored = UUID.newSet<UUID.Bytes>(uuid => uuid)
    readonly deleted: Array<string> = []

    async exists(uuid: UUID.Bytes): Promise<boolean> {return this.stored.hasKey(uuid)}
    async deleteItem(uuid: UUID.Bytes): Promise<void> {
        this.stored.removeByKey(uuid)
        this.deleted.push(UUID.toString(uuid))
    }
}

const bytes = (value: number): ArrayBuffer => new Uint8Array([value, 1, 2, 3]).buffer

const importer = (storage: FakeStorage, name: string) => async (uuid: UUID.Bytes): Promise<Sample> => {
    storage.stored.add(uuid, true)
    return {uuid: UUID.toString(uuid), name, duration: 1, bpm: 0, sample_rate: 48000, origin: "import"}
}

describe("ScriptSampleLedger", () => {
    it("discards the samples it added that are not used", async () => {
        const storage = new FakeStorage()
        const ledger = new ScriptSampleLedger(storage)
        const used = await ledger.add(bytes(1), importer(storage, "Used"))
        const orphan = await ledger.add(bytes(2), importer(storage, "Orphan"))
        const discarded = await ledger.discardUnused(uuid => UUID.toString(uuid) === used.uuid)
        expect(discarded.map(UUID.toString)).toEqual([orphan.uuid])
        expect(storage.deleted).toEqual([orphan.uuid])
        expect(await storage.exists(UUID.parse(used.uuid))).toBe(true)
        expect(await ledger.discardUnused(() => false)).toEqual([])
    })

    it("never discards a sample that was in storage before", async () => {
        const storage = new FakeStorage()
        const userSample = await importer(storage, "User")(await UUID.sha256(bytes(7)))
        const ledger = new ScriptSampleLedger(storage)
        const again = await ledger.add(bytes(7), importer(storage, "Same Audio"))
        expect(again.uuid).toBe(userSample.uuid)
        expect(await ledger.discardUnused(() => false)).toEqual([])
        expect(storage.deleted).toEqual([])
    })

    it("does not record a failed import", async () => {
        const storage = new FakeStorage()
        const ledger = new ScriptSampleLedger(storage)
        await expect(ledger.add(bytes(3), () => Promise.reject(new Error("empty")))).rejects.toThrow("empty")
        expect(await ledger.discardUnused(() => false)).toEqual([])
    })
})
