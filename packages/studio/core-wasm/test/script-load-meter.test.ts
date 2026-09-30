// The script load meter attributes JS time spent in the host_script_* calls to each device and folds it per
// render quantum, so the agent's offline render can estimate the live real-time load of a script device.
import {describe, expect, it} from "vitest"
import {UUID} from "@opendaw/lib-std"
import {ScriptBridges, ScriptEngine} from "../src/script-bridge"
import {ScriptLoadMeter} from "../src/script-load-meter"

describe("script load meter", () => {
    it("accumulates per device, tracks the worst block and over-budget blocks after warmup", () => {
        const meter = new ScriptLoadMeter(() => 0, 48000, 128, 1)
        const blockMillis = 128 / 48000 * 1000
        meter.add("a", blockMillis * 5) // warmup block: counted in the total, not in worst/overruns
        meter.endQuantum()
        meter.add("a", blockMillis * 0.5)
        meter.add("a", blockMillis * 0.7)
        meter.add("b", blockMillis * 0.1)
        meter.endQuantum()
        meter.add("a", blockMillis * 0.2)
        meter.endQuantum()
        const report = meter.report()
        expect(report.renderedQuanta).toBe(3)
        expect(report.measuredQuanta).toBe(2)
        const deviceA = report.devices.find(device => device.uuid === "a")!
        expect(deviceA.processSeconds * 1000).toBeCloseTo(blockMillis * 6.4, 9)
        expect(deviceA.worstQuantumSeconds * 1000).toBeCloseTo(blockMillis * 1.2, 9)
        expect(deviceA.overBudgetQuanta).toBe(1)
        const deviceB = report.devices.find(device => device.uuid === "b")!
        expect(deviceB.overBudgetQuanta).toBe(0)
    })
    it("the script bridge times a heavy Processor through the injected clock and leaves unmetered bridges untouched", () => {
        let clock = 0
        const meter = new ScriptLoadMeter(() => clock, 48000, 128, 0)
        const memory = new WebAssembly.Memory({initial: 1})
        const engine: ScriptEngine = {host_resolve_sample: () => 0, input_reserve: () => 0}
        const uuid = UUID.generate()
        new Uint8Array(memory.buffer, 0, 16).set(uuid)
        const key = UUID.toString(uuid)
        const scope = globalThis as unknown as {openDAW?: {werkstattProcessors?: Record<string, unknown>}}
        const registry = (scope.openDAW ??= {}).werkstattProcessors ??= {}
        registry[key] = {
            update: 1, params: [], samples: [], pass: true,
            create: class {process() {clock += 4}} // pretend every block costs 4 ms (> 2.67 ms budget)
        }
        const imports = new ScriptBridges(memory, engine, 48000, () => {}, meter).imports()
        const handle = imports.host_script_create(0, 1, 0) as number
        for (let quantum = 0; quantum < 10; quantum++) {
            imports.host_script_audio(handle, 1024, 1536, 2048, 2560, 0, 128, 0, 0, 0, 120, 0)
            meter.endQuantum()
        }
        const [device] = meter.report().devices
        expect(device.uuid).toBe(key)
        expect(device.processSeconds).toBeCloseTo(0.04, 9)
        expect(device.overBudgetQuanta).toBe(10)
        const unmetered = new ScriptBridges(memory, engine, 48000).imports()
        const other = unmetered.host_script_create(0, 1, 0) as number
        unmetered.host_script_audio(other, 1024, 1536, 2048, 2560, 0, 128, 0, 0, 0, 120, 0)
        expect(meter.report().devices[0].processSeconds).toBeCloseTo(0.04, 9)
        delete registry[key]
    })
})
