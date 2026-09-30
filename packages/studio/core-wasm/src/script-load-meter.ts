import {int, isDefined, Provider} from "@opendaw/lib-std"
import type {ScriptDeviceLoad, ScriptLoadReport} from "@opendaw/studio-adapters"

class DeviceTally {
    current = 0.0
    total = 0.0
    worst = 0.0
    overBudget = 0 | 0
}

// Times the script devices' JS per render quantum (milliseconds from `now`) to estimate their real-time load.
export class ScriptLoadMeter {
    readonly #now: Provider<number>
    readonly #sampleRate: number
    readonly #quantumFrames: int
    readonly #quantumMillis: number
    readonly #warmupQuanta: int
    readonly #tallies = new Map<string, DeviceTally>()
    #quanta: int = 0

    constructor(now: Provider<number>, sampleRate: number, quantumFrames: int, warmupQuanta: int) {
        this.#now = now
        this.#sampleRate = sampleRate
        this.#quantumFrames = quantumFrames
        this.#quantumMillis = quantumFrames / sampleRate * 1000.0
        this.#warmupQuanta = warmupQuanta
    }

    now(): number {return this.#now()}

    add(uuid: string, elapsedMillis: number): void {
        let tally = this.#tallies.get(uuid)
        if (!isDefined(tally)) {
            tally = new DeviceTally()
            this.#tallies.set(uuid, tally)
        }
        tally.current += elapsedMillis
    }

    endQuantum(): void {
        const measured = this.#quanta >= this.#warmupQuanta
        for (const tally of this.#tallies.values()) {
            const current = tally.current
            tally.total += current
            if (measured) {
                if (current > tally.worst) {tally.worst = current}
                if (current > this.#quantumMillis) {tally.overBudget++}
            }
            tally.current = 0.0
        }
        this.#quanta++
    }

    report(): ScriptLoadReport {
        const devices: Array<ScriptDeviceLoad> = Array.from(this.#tallies.entries(), ([uuid, tally]) => ({
            uuid, processSeconds: tally.total / 1000.0, worstQuantumSeconds: tally.worst / 1000.0, overBudgetQuanta: tally.overBudget
        }))
        return {
            sampleRate: this.#sampleRate, quantumFrames: this.#quantumFrames, devices,
            renderedQuanta: this.#quanta,
            measuredQuanta: Math.max(0, this.#quanta - this.#warmupQuanta)
        }
    }
}
