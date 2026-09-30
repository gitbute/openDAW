import {int, UUID} from "@opendaw/lib-std"
import type {Box} from "@opendaw/lib-box"
import type {ScriptLoadReport} from "@opendaw/studio-adapters"
import {ApparatDeviceBox, SpielwerkDeviceBox, WerkstattDeviceBox} from "@opendaw/studio-boxes"
import type {JsonObject} from "@opendaw/studio-codex"
import type {Project} from "@opendaw/studio-core"

export type DeviceIdentity = { readonly unitLabel: string, readonly device: string }

export type DeviceLoadEntry = DeviceIdentity & {
    readonly loadPercent: number
    readonly worstBlockPercent: number
    readonly overBudgetBlocksPercent: number
}

export namespace DeviceLoad {
    export const HeavyPercent = 50
    export const OverloadPercent = 100
    export const TotalRiskPercent = 70
    export const SpikeBlocksPercent = 1
    export const Note = "Estimated from the JS time each script device took during the offline render, as a share of the"
        + " real-time budget (the audio duration it rendered; one block = 128 frames). The live audio thread also runs the"
        + " rest of the engine, so keep the total well below 100%."

    const named = (label: string, kind: string): string => {
        const trimmed = label.trim()
        return trimmed.length > 0 && trimmed !== kind ? `${trimmed} (${kind})` : kind
    }

    const describeBox = (box: Box): string => {
        if (box instanceof ApparatDeviceBox) {return named(box.label.getValue(), "Apparat")}
        if (box instanceof WerkstattDeviceBox) {return named(box.label.getValue(), "Werkstatt")}
        if (box instanceof SpielwerkDeviceBox) {return named(box.label.getValue(), "Spielwerk")}
        return box.name
    }

    export const identify = (project: Project, owners: ReadonlyMap<string, string>) => (uuid: string): DeviceIdentity => ({
        unitLabel: owners.get(uuid) ?? "unknown unit",
        device: project.boxGraph.findBox(UUID.parse(uuid)).mapOr(describeBox, `script device ${uuid}`)
    })

    export const entries = (report: ScriptLoadReport,
                            identify: (uuid: string) => DeviceIdentity): ReadonlyArray<DeviceLoadEntry> => {
        const {sampleRate, quantumFrames, renderedQuanta, measuredQuanta, devices} = report
        const blockSeconds = quantumFrames / sampleRate
        const renderedSeconds = renderedQuanta * blockSeconds
        if (renderedSeconds <= 0) {return []}
        return devices
            .map(({uuid, processSeconds, worstQuantumSeconds, overBudgetQuanta}) => ({
                ...identify(uuid),
                loadPercent: processSeconds / renderedSeconds * 100.0,
                worstBlockPercent: worstQuantumSeconds / blockSeconds * 100.0,
                overBudgetBlocksPercent: measuredQuanta > 0 ? overBudgetQuanta / measuredQuanta * 100.0 : 0.0
            }))
            .sort((left, right) => right.loadPercent - left.loadPercent)
    }

    export const totalPercent = (loads: ReadonlyArray<DeviceLoadEntry>): number =>
        loads.reduce((sum, entry) => sum + entry.loadPercent, 0.0)

    const name = ({unitLabel, device}: DeviceLoadEntry): string =>
        device.startsWith(`${unitLabel} (`) ? device : `${device} on '${unitLabel}'`

    const percent = (value: number): string => `~${Math.round(value)}%`

    export const warnings = (loads: ReadonlyArray<DeviceLoadEntry>): ReadonlyArray<string> => {
        const result: Array<string> = []
        loads.forEach(entry => {
            const {loadPercent, worstBlockPercent, overBudgetBlocksPercent} = entry
            if (loadPercent >= OverloadPercent) {
                result.push(`${name(entry)} uses ${percent(loadPercent)} of the real-time budget: live playback will glitch and drop out. Optimise the script (real-time budget rules).`)
            } else if (loadPercent >= HeavyPercent) {
                result.push(`${name(entry)} uses ${percent(loadPercent)} of the real-time budget on its own: live playback is at risk with the rest of the project. Optimise the script (real-time budget rules).`)
            } else if (overBudgetBlocksPercent >= SpikeBlocksPercent) {
                result.push(`${name(entry)} overruns a whole block in ${overBudgetBlocksPercent.toFixed(1)}% of blocks (worst ${percent(worstBlockPercent)} of a block): expect crackles on busy passages. Spread per-note setup and coefficient work across blocks.`)
            }
        })
        const total = totalPercent(loads)
        if (loads.length > 1 && total >= TotalRiskPercent) {
            result.push(`Script devices together use ${percent(total)} of the real-time budget: live playback will likely glitch. Optimise the heaviest scripts first.`)
        }
        return result
    }

    const round = (value: number, digits: int): number => {
        const scale = Math.pow(10, digits)
        return Math.round(value * scale) / scale
    }

    export const facts = (loads: ReadonlyArray<DeviceLoadEntry>): JsonObject => loads.length === 0 ? {} : {
        scriptLoad: {
            totalPercent: round(totalPercent(loads), 1),
            devices: loads.map(({unitLabel, device, loadPercent, worstBlockPercent, overBudgetBlocksPercent}) => ({
                unit: unitLabel, device, loadPercent: round(loadPercent, 1),
                worstBlockPercent: round(worstBlockPercent, 1), overBudgetBlocksPercent: round(overBudgetBlocksPercent, 2)
            })),
            note: Note
        }
    }
}
