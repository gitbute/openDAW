import {
    BooleanField,
    ByteArrayField,
    Constraints,
    Float32Field,
    Int32Field,
    PrimitiveField,
    PrimitiveValues,
    StringField
} from "@opendaw/lib-box"

/** A nested semantic mapping whose leaves are the real primitive box fields. */
export interface SemanticFieldRecord {
    readonly [key: string]: SemanticFieldSpec
}

type AnyPrimitiveField = PrimitiveField<any, any>

export type SemanticFieldSpec =
    | AnyPrimitiveField
    | SemanticFieldRecord
    | ReadonlyArray<SemanticFieldSpec>

const isRecord = (value: SemanticFieldSpec): value is SemanticFieldRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof PrimitiveField)

const invalid = (path: string, message: string): never => {
    throw new Error(`${path}: ${message}`)
}

const numeric = (value: unknown, path: string): number =>
    typeof value === "number" && Number.isFinite(value)
        ? value
        : invalid(path, "value must be a finite number")

const validateInt32 = (field: Int32Field, value: unknown, path: string): number => {
    const integer = numeric(value, path)
    if (!Number.isInteger(integer)) {return invalid(path, "value must be an integer")}
    const constraint: Constraints.Int32 = field.constraints
    if (constraint === "non-negative" || constraint === "index") {
        if (integer < 0) {return invalid(path, "value must be non-negative")}
    } else if (constraint === "positive") {
        if (integer <= 0) {return invalid(path, "value must be positive")}
    } else if (typeof constraint === "object") {
        if ("min" in constraint && "max" in constraint
            && (integer < constraint.min || integer > constraint.max)) {
            return invalid(path, `value must be between ${constraint.min} and ${constraint.max}`)
        }
        if ("length" in constraint && (integer < 0 || integer >= constraint.length)) {
            return invalid(path, `value must be in the range 0..${constraint.length - 1}`)
        }
        if ("values" in constraint && !constraint.values.includes(integer)) {
            return invalid(path, `value must be one of ${constraint.values.join(", ")}`)
        }
    }
    return integer
}

const validateFloat32 = (field: Float32Field, value: unknown, path: string): number => {
    const number = numeric(value, path)
    const constraint: Constraints.Float32 = field.constraints
    if (constraint === "unipolar" && (number < 0 || number > 1)) {
        return invalid(path, "value must be in the range 0..1")
    }
    if (constraint === "bipolar" && (number < -1 || number > 1)) {
        return invalid(path, "value must be in the range -1..1")
    }
    if (constraint === "decibel" && number > 0) {
        return invalid(path, "value must be at most 0")
    }
    if (constraint === "non-negative" && number < 0) {
        return invalid(path, "value must be non-negative")
    }
    if (constraint === "positive" && number <= 0) {
        return invalid(path, "value must be positive")
    }
    if (typeof constraint === "object" && "min" in constraint && "max" in constraint
        && (number < constraint.min || number > constraint.max)) {
        return invalid(path, `value must be between ${constraint.min} and ${constraint.max}`)
    }
    return number
}

const resolvePath = (spec: SemanticFieldSpec, path: string): AnyPrimitiveField | undefined => {
    if (path.length === 0) {return undefined}
    let current: SemanticFieldSpec = spec
    for (const segment of path.split(".")) {
        if (current instanceof PrimitiveField) {return undefined}
        if (Array.isArray(current)) {
            if (!/^\d+$/.test(segment)) {return undefined}
            current = current[Number(segment)]
            if (current === undefined) {return undefined}
        } else if (isRecord(current)) {
            if (!Object.hasOwn(current, segment)) {return undefined}
            current = current[segment]
        } else {
            return undefined
        }
    }
    return current instanceof PrimitiveField ? current : undefined
}

const enumeratePaths = (spec: SemanticFieldSpec): ReadonlyArray<string> => {
    const result: Array<string> = []
    const visit = (current: SemanticFieldSpec, prefix: string): void => {
        if (current instanceof PrimitiveField) {
            if (prefix.length > 0) {result.push(prefix)}
            return
        }
        if (Array.isArray(current)) {
            current.forEach((value, index) => visit(value,
                prefix.length === 0 ? String(index) : `${prefix}.${index}`))
            return
        }
        Object.entries(current).forEach(([key, value]) => visit(value,
            prefix.length === 0 ? key : `${prefix}.${key}`))
    }
    visit(spec, "")
    return result
}

/** Pure semantic field traversal and primitive validation helpers. */
export namespace SemanticFields {
    /** Return every leaf path in a semantic field specification. */
    export const paths = enumeratePaths

    /** Resolve a semantic path to the live primitive field it describes. */
    export const resolve = resolvePath

    /** Validate a semantic value using the constraints of its live primitive field. */
    export const coerceValue = (field: AnyPrimitiveField, value: unknown, path: string): PrimitiveValues => {
        if (field instanceof Float32Field) {return validateFloat32(field, value, path)}
        if (field instanceof Int32Field) {return validateInt32(field, value, path)}
        if (field instanceof BooleanField) {
            return typeof value === "boolean" ? value : invalid(path, "value must be a boolean")
        }
        if (field instanceof StringField) {
            return typeof value === "string" ? value : invalid(path, "value must be a string")
        }
        if (field instanceof ByteArrayField) {
            return value instanceof Int8Array
                ? value
                : invalid(path, "value must be an Int8Array")
        }
        return invalid(path, `unsupported primitive field type ${field.type}`)
    }
}

export const paths = SemanticFields.paths
export const resolve = SemanticFields.resolve
export const coerceValue = SemanticFields.coerceValue
