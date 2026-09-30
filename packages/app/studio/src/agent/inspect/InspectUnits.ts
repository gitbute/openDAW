import {Address, Box, Field, PointerField} from "@opendaw/lib-box"
import {int, isDefined, Option, UUID} from "@opendaw/lib-std"
import {
    ApparatDeviceBoxAdapter,
    AudioUnitBoxAdapter,
    AutomatableParameterFieldAdapter,
    InstrumentFactories,
    LabeledAudioOutput,
    SpielwerkDeviceBoxAdapter,
    WerkstattDeviceBoxAdapter
} from "@opendaw/studio-adapters"
import {AudioUnitType, Pointers} from "@opendaw/studio-enums"
import {EffectFactories, Project} from "@opendaw/studio-core"

export type UnitEntry = {
    readonly adapter: AudioUnitBoxAdapter
    readonly label: string
}

export type ScriptDeviceAdapter = ApparatDeviceBoxAdapter | WerkstattDeviceBoxAdapter | SpielwerkDeviceBoxAdapter

export namespace InspectUnits {
    export const kindOf = (adapter: AudioUnitBoxAdapter): string => {
        switch (adapter.type) {
            case AudioUnitType.Instrument:
                return "instrument"
            case AudioUnitType.Aux:
                return "aux"
            case AudioUnitType.Bus:
                return "group"
            case AudioUnitType.Output:
                return "output"
            default:
                return "bus"
        }
    }

    export const list = (project: Project): ReadonlyArray<UnitEntry> => {
        const counts = new Map<string, int>()
        return project.rootBoxAdapter.audioUnits.adapters().map(adapter => {
            const base = adapter.label.trim().length > 0 ? adapter.label.trim() : kindOf(adapter)
            const count = (counts.get(base) ?? 0) + 1
            counts.set(base, count)
            return {adapter, label: count === 1 ? base : `${base} #${count}`}
        })
    }

    export const find = (entries: ReadonlyArray<UnitEntry>, label: string): Option<UnitEntry> => {
        const exact = entries.find(entry => entry.label === label)
        if (isDefined(exact)) {return Option.wrap(exact)}
        const normalized = label.trim().toLowerCase()
        return Option.wrap(entries.find(entry => entry.label.toLowerCase() === normalized))
    }

    export const labelOf = (entries: ReadonlyArray<UnitEntry>, adapter: AudioUnitBoxAdapter): string =>
        entries.find(entry => UUID.equals(entry.adapter.uuid, adapter.uuid))?.label ?? adapter.label

    export const deviceType = (box: Box): string =>
        InstrumentFactories.keyOfBox(box) ?? EffectFactories.keyOfBox(box) ?? box.name.replace(/(Device)?Box$/, "")

    export const isScriptDevice = (adapter: unknown): adapter is ScriptDeviceAdapter =>
        adapter instanceof ApparatDeviceBoxAdapter
        || adapter instanceof WerkstattDeviceBoxAdapter
        || adapter instanceof SpielwerkDeviceBoxAdapter

    export const printValue = (parameter: AutomatableParameterFieldAdapter): string => {
        const {value, unit} = parameter.getPrintValue()
        return unit.length > 0 ? `${value} ${unit}` : value
    }

    const collectFields = (fields: ReadonlyArray<Field>, target: Array<Field>): void =>
        fields.forEach(field => {
            target.push(field)
            field.accept({
                visitArrayField: array => collectFields(array.fields(), target),
                visitObjectField: object => collectFields(object.fields(), target)
            })
        })

    export const fieldsOf = (box: Box): ReadonlyArray<Field> => {
        const fields: Array<Field> = []
        collectFields(box.fields(), fields)
        return fields
    }

    export const parametersOf = (project: Project, box: Box): ReadonlyArray<AutomatableParameterFieldAdapter> =>
        fieldsOf(box).flatMap(field => project.parameterFieldAdapters.opt(field.address).mapOr(parameter => [parameter], []))

    export const sideChainTargets = (box: Box): ReadonlyArray<Address> =>
        fieldsOf(box).flatMap(field => field.accept<Option<Address>>({
            visitPointerField: (pointer: PointerField) => pointer.pointerType === Pointers.SideChain
                ? pointer.targetAddress : Option.None
        })?.mapOr(address => [address], []) ?? [])

    const collectOutputs = (outputs: Iterable<LabeledAudioOutput>, prefix: string, unitAddress: Address,
                            target: Array<{ address: Address, label: string }>): void => {
        for (const output of outputs) {
            target.push({
                address: output.address,
                label: output.address.equals(unitAddress) ? prefix : `${prefix} / ${output.label}`
            })
            output.children().ifSome(children => collectOutputs(children, prefix, unitAddress, target))
        }
    }

    export const labelAudioOutput = (entries: ReadonlyArray<UnitEntry>, address: Address): string => {
        const outputs: Array<{ address: Address, label: string }> = []
        entries.forEach(({adapter, label}) => collectOutputs(adapter.labeledAudioOutputs(), label, adapter.address, outputs))
        return outputs.find(output => output.address.equals(address))?.label ?? address.toString()
    }
}
