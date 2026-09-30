import {Attempt, Attempts, int, isDefined, Optional} from "@opendaw/lib-std"
import type {JsonObject, JsonValue} from "@opendaw/studio-codex"

export type ParamValue = number | boolean | string

export type ParamSetting = { readonly path: string, readonly value: ParamValue }

export type SoundSpec = {
    readonly device: Optional<string>
    readonly preset: Optional<string>
    readonly code: Optional<string>
    readonly params: ReadonlyArray<ParamSetting>
}

export type EffectSpec = { readonly device: string, readonly code: Optional<string>, readonly params: ReadonlyArray<ParamSetting> }

export type AuditionNote = { readonly pitch: int, readonly position: number, readonly duration: number, readonly velocity: number }

export type AuditionPattern = "sustain" | "quarters" | "8ths" | "16ths" | "offbeats" | "chord-stabs" | "chords" | "arp"

export type AuditionView = "spectrogram"

export type AuditionVariation = { readonly label: string, readonly sound: SoundSpec }

export type AuditionRequest = {
    readonly effects: ReadonlyArray<EffectSpec>
    readonly notes: ReadonlyArray<AuditionNote>
    readonly pattern: Optional<AuditionPattern>
    readonly bpm: number
    readonly bars: int
    readonly variations: ReadonlyArray<AuditionVariation>
    readonly views: ReadonlyArray<AuditionView>
}

export namespace AuditionSpec {
    export const MaxVariations = 4
    export const MaxBars = 4
    export const MaxEffects = 8
    export const MaxNotes = 256
    export const MaxParams = 64
    export const DefaultBpm = 120
    export const DefaultBars = 2
    export const DefaultRoot = 48
    export const DefaultPattern: AuditionPattern = "quarters"
    export const Patterns: ReadonlyArray<AuditionPattern> = ["sustain", "quarters", "8ths", "16ths", "offbeats", "chord-stabs", "chords", "arp"]
    export const UnsupportedInstruments: ReadonlyArray<string> = ["Tape", "MIDIOutput"]

    const paramsSchema = (subject: string): JsonObject => ({
        type: "array",
        maxItems: MaxParams,
        description: `${subject} settings. 'path' is a property path exactly as device_reference lists it (e.g. 'cutoff', 'lfo.rate', 'oscillators.1.volume'); for Apparat/Werkstatt it is a '// @param' label and 'value' is in the param's own unit.`,
        items: {
            type: "object",
            additionalProperties: false,
            properties: {
                path: {type: "string"},
                value: {anyOf: [{type: "number"}, {type: "boolean"}, {type: "string"}]}
            },
            required: ["path", "value"]
        }
    })

    const soundProperties = (subject: string): JsonObject => ({
        device: {type: "string", description: "Instrument key as device_reference lists it (e.g. 'Apparat', 'Vaporisateur', 'Nano'). Optional when 'preset' is given."},
        preset: {type: "string", description: "Preset uuid from browse; loaded first, then 'code' and 'params' apply on top."},
        code: {type: "string", description: "Apparat script source (the same code you would assign to apparat.code)."},
        params: paramsSchema(subject)
    })

    export const InputSchema: JsonObject = {
        type: "object",
        additionalProperties: false,
        properties: {
            sound: {
                type: "object",
                additionalProperties: false,
                description: "The instrument to audition. Every variation starts from it.",
                properties: soundProperties("Instrument")
            },
            effects: {
                type: "array",
                maxItems: MaxEffects,
                description: "Audio effects after the instrument, in order (shared by all variations).",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        device: {type: "string", description: "Audio effect key as device_reference lists it (e.g. 'Reverb', 'Werkstatt')."},
                        code: {type: "string", description: "Werkstatt script source."},
                        params: paramsSchema("Effect")
                    },
                    required: ["device"]
                }
            },
            notes: {
                type: "array",
                maxItems: MaxNotes,
                description: "Notes to play instead of a pattern. Positions and durations are in 16th steps from the start (4 per beat, 16 per 4/4 bar, fractions allowed).",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        pitch: {type: "integer", minimum: 0, maximum: 127, description: "MIDI pitch, 60 = middle C"},
                        position: {type: "number", minimum: 0, description: "start in 16th steps"},
                        duration: {type: "number", minimum: 0.01, description: "length in 16th steps"},
                        velocity: {type: "number", minimum: 0, maximum: 1, description: "0..1, default 0.8"}
                    },
                    required: ["pitch", "position", "duration"]
                }
            },
            pattern: {
                type: "string",
                enum: [...Patterns],
                description: "Built-in note pattern when 'notes' is omitted (default 'quarters'): sustain (one held note, last half bar free for the release), quarters, 8ths, 16ths, offbeats (8th offbeats), chord-stabs (short minor triads on the offbeats), chords (held minor 7th chord per bar), arp (16th minor arpeggio)."
            },
            root: {type: "integer", minimum: 0, maximum: 127, description: "Root pitch of the pattern (default 48 = C one octave below middle C)."},
            bpm: {type: "number", minimum: 30, maximum: 300, description: "Tempo (default 120), 4/4."},
            bars: {type: "integer", minimum: 1, maximum: MaxBars, description: "Bars to render (default 2); a 1 s tail is added."},
            variations: {
                type: "array",
                minItems: 1,
                maxItems: MaxVariations,
                description: "Alternatives to compare, each rendered separately. Each overrides the base sound: 'params' are merged over the base params, 'code'/'preset' replace them, a different 'device' starts from scratch. Omit to render the base sound alone.",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {label: {type: "string", description: "Short unique name"}, ...soundProperties("Instrument")},
                    required: ["label"]
                }
            },
            views: {
                type: "array",
                maxItems: 1,
                description: "Images per variation (default none). 'spectrogram' is drawn at matched loudness.",
                items: {type: "string", enum: ["spectrogram"]}
            }
        },
        required: ["sound"]
    }

    const isObject = (value: Optional<JsonValue>): value is JsonObject =>
        isDefined(value) && typeof value === "object" && !Array.isArray(value)

    const isArray = (value: Optional<JsonValue>): value is ReadonlyArray<JsonValue> => Array.isArray(value)

    const isPattern = (value: JsonValue): value is AuditionPattern => Patterns.some(pattern => pattern === value)

    const optionalString = (value: Optional<JsonValue>, name: string): Attempt<Optional<string>, string> => {
        if (!isDefined(value)) {return Attempts.ok(undefined)}
        return typeof value === "string" ? Attempts.ok(value) : Attempts.err(`'${name}' must be a string`)
    }

    const parseParams = (value: Optional<JsonValue>, name: string): Attempt<ReadonlyArray<ParamSetting>, string> => {
        if (!isDefined(value)) {return Attempts.ok([])}
        if (!isArray(value)) {return Attempts.err(`'${name}' must be a list of {path, value}`)}
        if (value.length > MaxParams) {return Attempts.err(`'${name}' has ${value.length} entries; at most ${MaxParams}`)}
        const settings: Array<ParamSetting> = []
        for (const entry of value) {
            if (!isObject(entry)) {return Attempts.err(`'${name}' entries must be objects {path, value}`)}
            const {path, value: setting} = entry
            if (typeof path !== "string" || path.trim().length === 0) {return Attempts.err(`'${name}' entries need a non-empty 'path'`)}
            if (typeof setting !== "number" && typeof setting !== "boolean" && typeof setting !== "string") {
                return Attempts.err(`'${name}' entry '${path}' needs a number, boolean or string 'value'`)
            }
            if (typeof setting === "number" && !Number.isFinite(setting)) {return Attempts.err(`'${name}' entry '${path}' is not finite`)}
            settings.push({path: path.trim(), value: setting})
        }
        return Attempts.ok(settings)
    }

    const parseSound = (value: JsonObject, name: string): Attempt<SoundSpec, string> => {
        const {device: deviceValue, preset: presetValue, code: codeValue, params: paramsValue} = value
        const device = optionalString(deviceValue, `${name}.device`)
        if (device.isFailure()) {return Attempts.err(device.failureReason())}
        const preset = optionalString(presetValue, `${name}.preset`)
        if (preset.isFailure()) {return Attempts.err(preset.failureReason())}
        const code = optionalString(codeValue, `${name}.code`)
        if (code.isFailure()) {return Attempts.err(code.failureReason())}
        const params = parseParams(paramsValue, `${name}.params`)
        if (params.isFailure()) {return Attempts.err(params.failureReason())}
        const deviceName = device.result()
        if (isDefined(deviceName) && UnsupportedInstruments.includes(deviceName)) {
            return Attempts.err(`'${name}.device' ${deviceName} cannot be auditioned (no note-driven audio)`)
        }
        return Attempts.ok({device: deviceName, preset: preset.result(), code: code.result(), params: params.result()})
    }

    export const mergeSound = (base: SoundSpec, override: SoundSpec): SoundSpec => {
        if (isDefined(override.device) && override.device !== base.device) {return override}
        const overridden = new Set(override.params.map(({path}) => path))
        return {
            device: base.device,
            preset: override.preset ?? base.preset,
            code: override.code ?? base.code,
            params: [...base.params.filter(({path}) => !overridden.has(path)), ...override.params]
        }
    }

    const parseVariations = (value: Optional<JsonValue>, base: SoundSpec): Attempt<ReadonlyArray<AuditionVariation>, string> => {
        if (!isDefined(value)) {return Attempts.ok([{label: "base", sound: base}])}
        if (!isArray(value) || value.length === 0) {return Attempts.err("'variations' must be a non-empty list")}
        if (value.length > MaxVariations) {return Attempts.err(`${value.length} variations; audition renders at most ${MaxVariations} per call`)}
        const variations: Array<AuditionVariation> = []
        for (const [index, entry] of value.entries()) {
            if (!isObject(entry)) {return Attempts.err(`'variations[${index}]' must be an object`)}
            const {label} = entry
            if (typeof label !== "string" || label.trim().length === 0) {return Attempts.err(`'variations[${index}].label' must be a non-empty string`)}
            if (variations.some(variation => variation.label === label.trim())) {return Attempts.err(`Duplicate variation label '${label}'`)}
            const sound = parseSound(entry, `variations[${index}]`)
            if (sound.isFailure()) {return Attempts.err(sound.failureReason())}
            variations.push({label: label.trim(), sound: mergeSound(base, sound.result())})
        }
        return Attempts.ok(variations)
    }

    const parseEffects = (value: Optional<JsonValue>): Attempt<ReadonlyArray<EffectSpec>, string> => {
        if (!isDefined(value)) {return Attempts.ok([])}
        if (!isArray(value)) {return Attempts.err("'effects' must be a list of {device, params?}")}
        if (value.length > MaxEffects) {return Attempts.err(`${value.length} effects; at most ${MaxEffects}`)}
        const effects: Array<EffectSpec> = []
        for (const [index, entry] of value.entries()) {
            if (!isObject(entry)) {return Attempts.err(`'effects[${index}]' must be an object`)}
            const {device, code, params: paramsValue} = entry
            if (typeof device !== "string" || device.length === 0) {return Attempts.err(`'effects[${index}].device' must be an effect key`)}
            if (isDefined(code) && typeof code !== "string") {return Attempts.err(`'effects[${index}].code' must be a string`)}
            const params = parseParams(paramsValue, `effects[${index}].params`)
            if (params.isFailure()) {return Attempts.err(params.failureReason())}
            effects.push({device, code: typeof code === "string" ? code : undefined, params: params.result()})
        }
        return Attempts.ok(effects)
    }

    const parseNotes = (value: JsonValue): Attempt<ReadonlyArray<AuditionNote>, string> => {
        if (!isArray(value) || value.length === 0) {return Attempts.err("'notes' must be a non-empty list of {pitch, position, duration, velocity?}")}
        if (value.length > MaxNotes) {return Attempts.err(`${value.length} notes; at most ${MaxNotes}`)}
        const notes: Array<AuditionNote> = []
        for (const [index, entry] of value.entries()) {
            if (!isObject(entry)) {return Attempts.err(`'notes[${index}]' must be an object`)}
            const {pitch, position, duration, velocity} = entry
            if (typeof pitch !== "number" || !Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
                return Attempts.err(`'notes[${index}].pitch' must be an integer 0..127`)
            }
            if (typeof position !== "number" || !Number.isFinite(position) || position < 0) {
                return Attempts.err(`'notes[${index}].position' must be a number >= 0 (16th steps)`)
            }
            if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
                return Attempts.err(`'notes[${index}].duration' must be a number > 0 (16th steps)`)
            }
            if (isDefined(velocity) && (typeof velocity !== "number" || velocity < 0 || velocity > 1)) {
                return Attempts.err(`'notes[${index}].velocity' must be a number 0..1`)
            }
            notes.push({pitch, position, duration, velocity: typeof velocity === "number" ? velocity : 0.8})
        }
        return Attempts.ok(notes)
    }

    const MinorTriad: ReadonlyArray<int> = [0, 3, 7]
    const MinorSeventh: ReadonlyArray<int> = [0, 3, 7, 10]
    const ArpSteps: ReadonlyArray<int> = [0, 3, 7, 12, 15, 12, 7, 3]

    const repeat = (bars: int, perBar: int, create: (step: int, index: int) => ReadonlyArray<AuditionNote>): ReadonlyArray<AuditionNote> =>
        Array.from({length: bars * perBar}, (_value, index) => create(index * (16 / perBar), index)).flat()

    export const patternNotes = (pattern: AuditionPattern, root: int, bars: int): ReadonlyArray<AuditionNote> => {
        const note = (pitch: int, position: number, duration: number, velocity: number = 0.8): AuditionNote =>
            ({pitch: Math.max(0, Math.min(127, pitch)), position, duration, velocity})
        switch (pattern) {
            case "sustain":
                return [note(root, 0, Math.max(4, bars * 16 - 8))]
            case "quarters":
                return repeat(bars, 4, step => [note(root, step, 3)])
            case "8ths":
                return repeat(bars, 8, (step, index) => [note(root, step, 1.5, index % 2 === 0 ? 0.85 : 0.65)])
            case "16ths":
                return repeat(bars, 16, (step, index) => [note(root, step, 0.75, index % 4 === 0 ? 0.9 : index % 2 === 0 ? 0.7 : 0.55)])
            case "offbeats":
                return repeat(bars, 4, step => [note(root, step + 2, 1.5)])
            case "chord-stabs":
                return repeat(bars, 4, step => MinorTriad.map(interval => note(root + 12 + interval, step + 2, 1)))
            case "chords":
                return repeat(bars, 1, step => MinorSeventh.map(interval => note(root + 12 + interval, step, 15, 0.7)))
            case "arp":
                return repeat(bars, 16, (step, index) => [note(root + 12 + ArpSteps[index % ArpSteps.length], step, 0.9, index % 4 === 0 ? 0.85 : 0.65)])
        }
    }

    const numberIn = (value: Optional<JsonValue>, name: string, fallback: number, min: number, max: number,
                      integer: boolean): Attempt<number, string> => {
        if (!isDefined(value)) {return Attempts.ok(fallback)}
        if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
            return Attempts.err(`'${name}' must be ${integer ? "an integer" : "a number"} ${min}..${max}`)
        }
        return Attempts.ok(value)
    }

    export const parseArguments = (args: JsonObject): Attempt<AuditionRequest, string> => {
        const {sound: soundValue, effects: effectsValue, notes: notesValue, pattern: patternValue, root: rootValue,
            bpm: bpmValue, bars: barsValue, variations: variationsValue, views: viewsValue} = args
        if (!isObject(soundValue)) {return Attempts.err("'sound' is required: {device?, preset?, code?, params?}")}
        const base = parseSound(soundValue, "sound")
        if (base.isFailure()) {return Attempts.err(base.failureReason())}
        const variations = parseVariations(variationsValue, base.result())
        if (variations.isFailure()) {return Attempts.err(variations.failureReason())}
        const unspecified = variations.result().find(({sound}) => !isDefined(sound.device) && !isDefined(sound.preset))
        if (isDefined(unspecified)) {return Attempts.err(`Variation '${unspecified.label}' has neither a 'device' nor a 'preset'`)}
        const effects = parseEffects(effectsValue)
        if (effects.isFailure()) {return Attempts.err(effects.failureReason())}
        const bpm = numberIn(bpmValue, "bpm", DefaultBpm, 30, 300, false)
        if (bpm.isFailure()) {return Attempts.err(bpm.failureReason())}
        const bars = numberIn(barsValue, "bars", DefaultBars, 1, MaxBars, true)
        if (bars.isFailure()) {return Attempts.err(bars.failureReason())}
        const root = numberIn(rootValue, "root", DefaultRoot, 0, 127, true)
        if (root.isFailure()) {return Attempts.err(root.failureReason())}
        if (isDefined(notesValue) && isDefined(patternValue)) {return Attempts.err("Pass either 'notes' or 'pattern', not both")}
        if (isDefined(patternValue) && !isPattern(patternValue)) {return Attempts.err(`'pattern' must be one of ${Patterns.join(", ")}`)}
        const pattern: Optional<AuditionPattern> = isDefined(notesValue) ? undefined
            : isDefined(patternValue) && isPattern(patternValue) ? patternValue : DefaultPattern
        const notes = isDefined(pattern) ? Attempts.ok(patternNotes(pattern, root.result(), bars.result())) : parseNotes(notesValue ?? null)
        if (notes.isFailure()) {return Attempts.err(notes.failureReason())}
        const barSteps = bars.result() * 16
        const late = notes.result().findIndex(note => note.position >= barSteps)
        if (late >= 0) {return Attempts.err(`Note ${late} starts at step ${notes.result()[late].position}, after the ${bars.result()} rendered bar(s) (${barSteps} steps)`)}
        let views: ReadonlyArray<AuditionView> = []
        if (isDefined(viewsValue)) {
            if (!isArray(viewsValue) || !viewsValue.every(view => view === "spectrogram")) {return Attempts.err("'views' must be [] or ['spectrogram']")}
            views = viewsValue.length > 0 ? ["spectrogram"] : []
        }
        return Attempts.ok({effects: effects.result(), notes: notes.result(), pattern, bpm: bpm.result(), bars: bars.result(),
            variations: variations.result(), views})
    }
}
