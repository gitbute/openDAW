import {BooleanField, Constraints, Float32Field, Int32Field, PointerTypes, PrimitiveField, PrimitiveValues, StringField} from "@opendaw/lib-box"
import {AudioData} from "@opendaw/lib-dsp"
import {isDefined, Option, panic} from "@opendaw/lib-std"
import {
    AnyDevice,
    ApiImpl,
    AudioEffects,
    Fields,
    Instruments,
    MIDIEffects,
    Project,
    Sample,
    ScriptHostProtocol,
    ScriptPreset
} from "@opendaw/studio-scripting"

export type DeviceCategory = "instrument" | "audio-effect" | "midi-effect"

export type ProbedField = {
    readonly path: string
    readonly kind: "float" | "int" | "boolean" | "string"
    readonly range: string
    readonly unit: string
    readonly value: string
}

export type ProbedPart = {
    readonly name: string
    readonly interfaceName: string
    readonly access: string
    readonly fields: ReadonlyArray<ProbedField>
}

type PartSpec = {
    readonly name: string
    readonly interfaceName: string
    readonly access: string
    readonly create: (device: AnyDevice) => object
}

type AnyField = PrimitiveField<PrimitiveValues, PointerTypes>

const BaseFields: ReadonlyArray<string> = ["label", "icon", "enabled", "minimized"]

const DummySample: Sample = {uuid: "00000000-0000-4000-8000-000000000000", name: "sample", duration: 1, bpm: 0, sample_rate: 48000}

const Parts: Readonly<Record<string, PartSpec>> = {
    Playfield: {
        name: "slot", interfaceName: "PlayfieldSlot", access: "device.addSample(sample, {note: 36})",
        create: device => device.key === "Playfield" ? device.addSample(DummySample, {note: 36}) : panic("Playfield")
    },
    InstrumentComposite: {
        name: "layer", interfaceName: "InstrumentCompositeLayer", access: "device.addLayer(\"Vaporisateur\")",
        create: device => device.key === "InstrumentComposite" ? device.addLayer("Vaporisateur") : panic("InstrumentComposite")
    },
    MIDIOutput: {
        name: "parameter", interfaceName: "MIDIOutputParameter", access: "device.addParameter({controller: 74})",
        create: device => device.key === "MIDIOutput" ? device.addParameter() : panic("MIDIOutput")
    },
    Composite: {
        name: "entry", interfaceName: "AudioEffectCompositeEntry", access: "device.addEntry()",
        create: device => device.key === "Composite" ? device.addEntry() : panic("Composite")
    },
    StereoSplit: {
        name: "entry", interfaceName: "AudioEffectCompositeEntry", access: "device.entries[0] (0 = left, 1 = right)",
        create: device => device.key === "StereoSplit" ? device.entries[0] : panic("StereoSplit")
    },
    FrequencySplit: {
        name: "entry", interfaceName: "AudioEffectCompositeEntry", access: "device.entries[0..3] (Low, Low Mid, High Mid, High)",
        create: device => device.key === "FrequencySplit" ? device.entries[0] : panic("FrequencySplit")
    }
}

class DetachedHost implements ScriptHostProtocol {
    openProject(): void {}
    applyUpdates(): void {}
    hasProject(): Promise<boolean> {return Promise.resolve(false)}
    fetchProject(): Promise<{ buffer: ArrayBuffer, name: string }> {return this.#reject()}
    showInfo(): Promise<void> {return this.#reject()}
    addSample(): Promise<Sample> {return this.#reject()}
    listSamples(): Promise<ReadonlyArray<Sample>> {return this.#reject()}
    renderMixdown(): Promise<AudioData> {return this.#reject()}
    saveFile(): Promise<void> {return this.#reject()}
    fetchPreset(): Promise<ScriptPreset> {return this.#reject()}
    fetchTubularVoice(): Promise<Uint8Array> {return this.#reject()}
    #reject<T>(): Promise<T> {return Promise.reject(new Error("The device probe has no studio"))}
}

const formatNumber = (value: number): string => {
    if (value === Number.NEGATIVE_INFINITY) {return "-inf"}
    if (value === Number.POSITIVE_INFINITY) {return "inf"}
    return String(Number.parseFloat(value.toPrecision(4)))
}

const hasKey = <K extends string>(value: object, key: K): value is Record<K, unknown> => Object.hasOwn(value, key)

const floatRange = (constraints: Constraints.Float32): string => {
    if (typeof constraints === "string") {
        switch (constraints) {
            case "unipolar": return "0..1"
            case "bipolar": return "-1..1"
            case "decibel": return "-inf..0"
            case "non-negative": return ">=0"
            case "positive": return ">0"
            default: return ""
        }
    }
    const scaling = constraints.scaling === "exponential" ? " exp" : ""
    return `${formatNumber(constraints.min)}..${formatNumber(constraints.max)}${scaling}`
}

const intRange = (constraints: Constraints.Int32): string => {
    if (typeof constraints === "string") {
        return constraints === "index" || constraints === "non-negative" ? ">=0" : constraints === "positive" ? ">0" : ""
    }
    if (hasKey(constraints, "values") && Array.isArray(constraints.values)) {return constraints.values.join("|")}
    if (hasKey(constraints, "length") && typeof constraints.length === "number") {return `0..${constraints.length - 1}`}
    if (hasKey(constraints, "min") && hasKey(constraints, "max")) {return `${constraints.min}..${constraints.max}`}
    return ""
}

const describeField = (path: string, field: AnyField): ProbedField => {
    if (field instanceof Float32Field) {
        return {path, kind: "float", range: floatRange(field.constraints), unit: field.unit, value: formatNumber(field.getValue())}
    }
    if (field instanceof Int32Field) {
        return {path, kind: "int", range: intRange(field.constraints), unit: field.unit, value: String(field.getValue())}
    }
    if (field instanceof BooleanField) {return {path, kind: "boolean", range: "", unit: "", value: String(field.getValue())}}
    if (field instanceof StringField) {return {path, kind: "string", range: "", unit: "", value: JSON.stringify(field.getValue())}}
    return {path, kind: "string", range: "", unit: "", value: ""}
}

export class DeviceProbe {
    readonly #project: Project

    constructor() {this.#project = new ApiImpl(new DetachedHost()).newProject("Device Probe")}

    fields(target: object): ReadonlyArray<ProbedField> {
        return Fields.paths(target)
            .filter(path => !BaseFields.includes(path))
            .flatMap(path => Fields.resolve(target, path).match({
                none: () => [],
                some: field => [describeField(path, field)]
            }))
    }

    create(category: DeviceCategory, key: string): Option<AnyDevice> {
        const unit = this.#project.addInstrumentUnit("Vaporisateur")
        switch (category) {
            case "instrument":
                return Option.wrap(unit.setInstrument(key as keyof Instruments))
            case "audio-effect":
                return Option.wrap(unit.addAudioEffect(key as keyof AudioEffects))
            case "midi-effect":
                return Option.wrap(unit.addMIDIEffect(key as keyof MIDIEffects))
        }
    }

    parts(device: AnyDevice): Option<ProbedPart> {
        const spec = Parts[device.key]
        if (!isDefined(spec)) {return Option.None}
        const {name, interfaceName, access, create} = spec
        return Option.wrap({name, interfaceName, access, fields: this.fields(create(device))})
    }
}
