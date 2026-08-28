import * as fs from "node:fs"
import * as path from "node:path"
import * as ts from "typescript"
import {fileURLToPath} from "node:url"
import type {
    GeneratedManifest,
    OperationDescriptor,
    ParameterSpec,
    PropertySpec,
    ReportEntry,
    TypeSpec
} from "../src/control-api/types"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const coreDirectory = path.resolve(__dirname, "..")
const repositoryDirectory = path.resolve(coreDirectory, "../../..")
const adapterParameterSource = path.join(
    repositoryDirectory, "packages/studio/adapters/src/AutomatableParameterFieldAdapter.ts")

type RootConfig = {
    readonly sourceFile: string
    readonly className: string
    readonly root: OperationDescriptor["root"]
    readonly idPrefix: string
    readonly target: OperationDescriptor["target"]
    readonly transaction: OperationDescriptor["transaction"]
}

const roots: ReadonlyArray<RootConfig> = [
    {
        sourceFile: path.join(coreDirectory, "src/project/ProjectApi.ts"),
        className: "ProjectApi",
        root: "project",
        idPrefix: "project",
        target: "singleton",
        transaction: "editing"
    },
    {
        sourceFile: path.join(coreDirectory, "src/project/ProjectModulation.ts"),
        className: "ProjectModulation",
        root: "modulation",
        idPrefix: "project.modulation",
        target: "singleton",
        transaction: "editing"
    },
    {
        sourceFile: path.join(coreDirectory, "src/EngineFacade.ts"),
        className: "EngineFacade",
        root: "transport",
        idPrefix: "transport",
        target: "singleton",
        transaction: "none"
    },
    {
        sourceFile: adapterParameterSource,
        className: "AutomatableParameterFieldAdapter",
        root: "parameter",
        idPrefix: "parameter",
        target: "address",
        transaction: "editing"
    }
]

class UnsupportedProjection extends Error {
    readonly typeText: string

    constructor(typeText: string, reason: string) {
        super(`${typeText}: ${reason}`)
        this.typeText = typeText
    }
}

const readProgram = (): ts.Program => {
    const tsconfigPath = path.join(coreDirectory, "tsconfig.json")
    const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
    if (config.error !== undefined) {throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"))}
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, coreDirectory)
    if (parsed.errors.length > 0) {
        throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"))
    }
    return ts.createProgram({
        rootNames: [...parsed.fileNames, adapterParameterSource],
        options: {...parsed.options, noEmit: true}
    })
}

const classDeclaration = (program: ts.Program, sourceFile: string, name: string): ts.ClassDeclaration => {
    const file = program.getSourceFile(sourceFile)
    if (file === undefined) {throw new Error(`Cannot load control API source ${sourceFile}`)}
    const declaration = file.statements.find(statement =>
        ts.isClassDeclaration(statement) && statement.name?.text === name)
    if (!ts.isClassDeclaration(declaration)) {throw new Error(`Cannot find ${name} in ${sourceFile}`)}
    return declaration
}

const typeName = (checker: ts.TypeChecker, type: ts.Type): string =>
    checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)

const symbolName = (type: ts.Type): string | undefined =>
    type.aliasSymbol?.getName() ?? type.getSymbol()?.getName()

const hasName = (type: ts.Type, name: string): boolean =>
    type.aliasSymbol?.getName() === name || type.getSymbol()?.getName() === name

const isLiteral = (type: ts.Type): boolean => {
    const flags = type.flags
    return (flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral
        | ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Null)) !== 0
}

const literalValue = (type: ts.Type): null | boolean | number | string => {
    if ((type.flags & ts.TypeFlags.Null) !== 0) {return null}
    if ((type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
        return (type as ts.IntrinsicType).intrinsicName === "true"
    }
    return (type as ts.LiteralType).value as number | string
}

const baseTypes = (checker: ts.TypeChecker, type: ts.Type): ReadonlyArray<ts.Type> => {
    try {
        return checker.getBaseTypes(type as ts.InterfaceType) ?? []
    } catch (_error) {
        return []
    }
}

const derivesFrom = (checker: ts.TypeChecker, type: ts.Type, name: string, seen = new Set<string>()): boolean => {
    const currentName = symbolName(type)
    if (currentName === name) {return true}
    if (currentName !== undefined && seen.has(currentName)) {return false}
    if (currentName !== undefined) {seen.add(currentName)}
    return baseTypes(checker, type).some(base => derivesFrom(checker, base, name, seen))
}

const isBoxAdapterType = (checker: ts.TypeChecker, type: ts.Type): boolean => {
    const name = symbolName(type)
    return hasName(type, "BoxAdapter") || derivesFrom(checker, type, "BoxAdapter")
        || hasName(type, "IndexedBoxAdapter") || derivesFrom(checker, type, "IndexedBoxAdapter")
        || (name?.endsWith("BoxAdapter") ?? false)
}

const isPromise = (type: ts.Type): boolean => hasName(type, "Promise")

const isListenerLike = (type: ts.Type): boolean => {
    const name = symbolName(type)
    return name === "Observer" || name === "Procedure" || name === "Subscription" || name === "Terminable"
}

const containsCallback = (checker: ts.TypeChecker, type: ts.Type, seen = new Set<string>()): boolean => {
    if (isListenerLike(type) || type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
        return true
    }
    if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never
        | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void
        | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike
        | ts.TypeFlags.TypeParameter)) !== 0) {
        return false
    }
    if (derivesFrom(checker, type, "Box") || isBoxAdapterType(checker, type)
        || derivesFrom(checker, type, "Field") || hasName(type, "Address")
        || hasName(type, "AutomatableParameterFieldAdapter") || hasName(type, "Option")
        || hasName(type, "InstrumentFactory") || hasName(type, "EffectFactory")
        || hasName(type, "Promise")) {
        return false
    }
    if (type.isUnion() || type.isIntersection()) {
        return type.types.some(member => containsCallback(checker, member, seen))
    }
    if (hasName(type, "Array") || hasName(type, "ReadonlyArray")) {
        const args = (type as ts.TypeReference).typeArguments ?? []
        return args.some(member => containsCallback(checker, member, seen))
    }
    const text = typeName(checker, type)
    if (seen.has(text)) {return false}
    seen.add(text)
    return checker.getPropertiesOfType(type)
        .some(property => containsCallback(checker, checker.getTypeOfSymbolAtLocation(
            property, property.valueDeclaration ?? property.declarations[0]), seen))
}

const propertyType = (checker: ts.TypeChecker, property: ts.Symbol, fallback: ts.Node): ts.Type =>
    checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration ?? property.declarations[0] ?? fallback)

const objectProperties = (checker: ts.TypeChecker, type: ts.Type, fallback: ts.Node,
                          filter: (property: ts.Symbol) => boolean = () => true,
                          parameterValueAllowed = false): ReadonlyArray<PropertySpec> => {
    const properties = checker.getPropertiesOfType(type).filter(filter).toSorted((left, right) =>
        left.getName().localeCompare(right.getName()))
    return properties.map(property => ({
        name: property.getName(),
        optional: (property.flags & ts.SymbolFlags.Optional) !== 0,
        type: projectType(checker, propertyType(checker, property, fallback), fallback, 0, parameterValueAllowed)
    }))
}

const projectType = (checker: ts.TypeChecker, type: ts.Type, fallback: ts.Node,
                     depth = 0, parameterValueAllowed = false): TypeSpec => {
    if (depth > 16) {throw new UnsupportedProjection(typeName(checker, type), "type nesting is too deep")}
    const text = typeName(checker, type)
    const name = symbolName(type)

    if (hasName(type, "InstrumentFactory")) {return {kind: "factory", factory: "instrument"}}
    if (hasName(type, "EffectFactory")) {return {kind: "factory", factory: "effect"}}
    if (hasName(type, "InstrumentOptions")) {return {kind: "instrumentOptions"}}
    if (hasName(type, "Option")) {
        const args = (type as ts.TypeReference).typeArguments ?? []
        if (args.length !== 1) {throw new UnsupportedProjection(text, "Option has no single value type")}
        return {kind: "option", value: projectType(checker, args[0], fallback, depth + 1, parameterValueAllowed)}
    }
    if (hasName(type, "Address")) {return {kind: "handle", handle: "address", name: "Address"}}
    if (hasName(type, "AutomatableParameterFieldAdapter")) {
        return {kind: "handle", handle: "parameter", name: "AutomatableParameterFieldAdapter"}
    }
    if (hasName(type, "PointerField")) {return {kind: "handle", handle: "pointerField", name: "PointerField"}}
    if (hasName(type, "PrimitiveField")) {return {kind: "handle", handle: "primitiveField", name: "PrimitiveField"}}
    if (hasName(type, "Field")) {return {kind: "handle", handle: "field", name: "Field"}}
    if (derivesFrom(checker, type, "Box")) {
        return {kind: "handle", handle: "box", name: name ?? "Box"}
    }
    if (isBoxAdapterType(checker, type)) {
        return {kind: "handle", handle: "adapter", name: name ?? "BoxAdapter"}
    }

    if ((type.flags & ts.TypeFlags.Any) !== 0) {
        throw new UnsupportedProjection(text, "any is not a projectable API type")
    }
    if ((type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Never)) !== 0) {
        throw new UnsupportedProjection(text, "unknown/never is not a projectable API type")
    }
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
        if (parameterValueAllowed) {return {kind: "parameterValue"}}
        throw new UnsupportedProjection(text, "unresolved generic type parameter")
    }
    if ((type.flags & ts.TypeFlags.Undefined) !== 0) {
        throw new UnsupportedProjection(text, "undefined is only valid as an optional property")
    }
    if ((type.flags & ts.TypeFlags.Void) !== 0) {return {kind: "void"}}
    if ((type.flags & ts.TypeFlags.StringLike) !== 0) {return {kind: "primitive", type: "string"}}
    if ((type.flags & ts.TypeFlags.NumberLike) !== 0) {return {kind: "primitive", type: "number"}}
    if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {return {kind: "primitive", type: "boolean"}}
    if (isLiteral(type)) {return {kind: "literal", values: [literalValue(type)]}}

    if (type.isUnion()) {
        const defined = type.types.filter(member => (member.flags & ts.TypeFlags.Undefined) === 0)
        if (defined.length === 0) {throw new UnsupportedProjection(text, "empty union")}
        const nullMembers = defined.filter(member => (member.flags & ts.TypeFlags.Null) !== 0)
        const nonNull = defined.filter(member => (member.flags & ts.TypeFlags.Null) === 0)
        if (nullMembers.length > 0 && nonNull.length === 1) {
            return {kind: "nullable", value: projectType(checker, nonNull[0], fallback, depth + 1, parameterValueAllowed)}
        }
        if (defined.every(isLiteral)) {
            return {kind: "literal", values: defined.map(literalValue)}
        }
        const alternatives = defined.map(member => projectType(checker, member, fallback, depth + 1, parameterValueAllowed))
        return alternatives.length === 1 ? alternatives[0] : {kind: "union", alternatives}
    }

    if (type.isIntersection()) {
        return {
            kind: "object",
            name: name === "__type" ? undefined : name,
            properties: objectProperties(checker, type, fallback, () => true, parameterValueAllowed)
        }
    }

    if (hasName(type, "Array") || hasName(type, "ReadonlyArray")) {
        const args = (type as ts.TypeReference).typeArguments ?? []
        if (args.length !== 1) {throw new UnsupportedProjection(text, "array has no element type")}
        return {kind: "array", element: projectType(checker, args[0], fallback, depth + 1, parameterValueAllowed)}
    }
    if (hasName(type, "Promise")) {
        throw new UnsupportedProjection(text, "Promise results are outside the synchronous first slice")
    }

    if ((type.flags & ts.TypeFlags.Object) !== 0) {
        if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
            throw new UnsupportedProjection(text, "function/constructor type")
        }
        const declarationKinds = type.getSymbol()?.declarations?.map(declaration => declaration.kind) ?? []
        if (declarationKinds.includes(ts.SyntaxKind.ClassDeclaration)) {
            throw new UnsupportedProjection(text, "unrecognised class/resource type")
        }
        const properties = objectProperties(checker, type, fallback, () => true, parameterValueAllowed)
        if (properties.length === 0) {throw new UnsupportedProjection(text, "empty object type")}
        return {kind: "object", name: name === "__type" ? undefined : name, properties}
    }

    throw new UnsupportedProjection(text, "no codec is registered for this type family")
}

const parameterName = (parameter: ts.ParameterDeclaration, index: number): {name: string, binding: "identifier" | "pattern"} => {
    if (ts.isIdentifier(parameter.name)) {return {name: parameter.name.text, binding: "identifier"}}
    if (ts.isObjectBindingPattern(parameter.name)) {return {name: `arg${index}`, binding: "pattern"}}
    throw new Error("array binding patterns are not supported")
}

const hasInitializerOrQuestion = (parameter: ts.ParameterDeclaration): boolean =>
    parameter.questionToken !== undefined || parameter.initializer !== undefined

const isLifecycleMethod = (name: string): boolean => name === "terminate" || /worklet$/i.test(name)

const documentation = (checker: ts.TypeChecker, method: ts.MethodDeclaration): string | undefined => {
    const symbol = checker.getSymbolAtLocation(method.name)
    if (symbol === undefined) {return undefined}
    const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()
    return text.length === 0 ? undefined : text
}

const generateManifest = (program: ts.Program): GeneratedManifest => {
    const checker = program.getTypeChecker()
    const operations: OperationDescriptor[] = []
    const skipped: ReportEntry[] = []
    const unsupported: ReportEntry[] = []

    for (const root of roots) {
        const declaration = classDeclaration(program, root.sourceFile, root.className)
        const seenMethods = new Set<string>()
        for (const member of declaration.members) {
            if (!ts.isMethodDeclaration(member) || member.name === undefined) {continue}
            if (!ts.isIdentifier(member.name)) {continue}
            const method = member.name.text
            if (method.startsWith("#") || seenMethods.has(method)) {continue}
            seenMethods.add(method)
            const flags = ts.getCombinedModifierFlags(member)
            if ((flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Static)) !== 0) {
                continue
            }
            const reportRoot = root.className
            const reportMethod = `${reportRoot}.${method}`
            if (isLifecycleMethod(method)) {
                skipped.push({root: reportRoot, method, reason: "lifecycle/worklet infrastructure method"})
                continue
            }
            if (member.typeParameters !== undefined && member.typeParameters.length > 0) {
                skipped.push({root: reportRoot, method, reason: "generic method signature is not instantiated"})
                continue
            }
            const signature = checker.getSignatureFromDeclaration(member)
            if (signature === undefined) {
                unsupported.push({root: reportRoot, method, reason: "TypeScript did not produce a method signature"})
                continue
            }
            const returnType = checker.getReturnTypeOfSignature(signature)
            if (isPromise(returnType)) {
                skipped.push({root: reportRoot, method, reason: "async Promise operation is outside the synchronous first slice"})
                continue
            }
            const parameterTypes = signature.parameters.map((parameter, index) =>
                checker.getTypeOfSymbolAtLocation(parameter, member.parameters[index]))
            if (parameterTypes.some(type => containsCallback(checker, type)) || containsCallback(checker, returnType)) {
                skipped.push({root: reportRoot, method, reason: "callback, listener, subscription, or function type"})
                continue
            }
            if (isListenerLike(returnType)) {
                skipped.push({root: reportRoot, method, reason: "subscription/lifecycle result"})
                continue
            }
            try {
                const parameterValueAllowed = root.root === "parameter"
                const parameters: ParameterSpec[] = member.parameters.map((parameter, index) => {
                    const named = parameterName(parameter, index)
                    return {
                        name: named.name,
                        optional: hasInitializerOrQuestion(parameter),
                        binding: named.binding,
                        type: projectType(checker, parameterTypes[index], parameter, 0, parameterValueAllowed)
                    }
                })
                const result = projectType(checker, returnType, member, 0, parameterValueAllowed)
                operations.push({
                    id: `${root.idPrefix}.${method}`,
                    root: root.root,
                    ownerType: root.className,
                    method,
                    target: root.target,
                    transaction: root.transaction,
                    async: false,
                    parameters,
                    result,
                    description: documentation(checker, member)
                })
            } catch (error) {
                const reason = error instanceof UnsupportedProjection ? error.message : String(error)
                unsupported.push({root: reportRoot, method, reason})
            }
        }
    }

    return {operations, skipped, unsupported}
}

const formatReport = (manifest: GeneratedManifest): string => {
    const lines = ["CONTROL API GENERATION", ""]
    for (const root of roots) {
        const exposed = manifest.operations.filter(operation => operation.ownerType === root.className).length
        const skipped = manifest.skipped.filter(entry => entry.root === root.className).length
        const unsupported = manifest.unsupported.filter(entry => entry.root === root.className).length
        lines.push(`  ${root.className}`, `    exposed: ${exposed}`, `    skipped: ${skipped}`, `    unsupported: ${unsupported}`, "")
    }
    if (manifest.skipped.length > 0) {
        lines.push("SKIPPED")
        manifest.skipped.forEach(entry => lines.push(`  ${entry.root}.${entry.method}`, `    ${entry.reason}`, ""))
    }
    if (manifest.unsupported.length > 0) {
        lines.push("UNSUPPORTED")
        manifest.unsupported.forEach(entry => lines.push(`  ${entry.root}.${entry.method}`, `    ${entry.reason}`, ""))
    }
    return lines.join("\n")
}

const main = (): void => {
    const manifest = generateManifest(readProgram())
    const outputFile = path.join(coreDirectory, "src/control-api/generated.ts")
    const output = [
        "// This file is generated. Do not edit manually.",
        "import type {GeneratedManifest} from \"./types\"",
        "",
        `export const generatedControlManifest: GeneratedManifest = ${JSON.stringify(manifest, null, 4)}`,
        ""
    ].join("\n")
    fs.mkdirSync(path.dirname(outputFile), {recursive: true})
    if (!fs.existsSync(outputFile) || fs.readFileSync(outputFile, "utf8") !== output) {
        fs.writeFileSync(outputFile, output, "utf8")
    }
    console.log(formatReport(manifest))
}

main()
