import {existsSync} from "node:fs"
import path from "node:path"

const libraryNames = process.platform === "win32"
    ? ["libclang.dll"]
    : process.platform === "darwin"
        ? ["libclang.dylib"]
        : ["libclang.so", "libclang.so.1"]

const asDirectory = value => {
    if (typeof value !== "string" || value.length === 0) return undefined
    return value.replace(/[\\/]libclang(?:\.dll|\.dylib|\.so(?:\.1)?)$/i, "")
}

export const findLlvmBin = (environment = process.env) => {
    const candidates = [environment.LIBCLANG_PATH, environment.LLVM_PATH]
    if (process.platform === "win32") {
        candidates.push(
            path.join(environment.ProgramFiles ?? "C:\\Program Files", "LLVM", "bin"),
            path.join(environment["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "LLVM", "bin"),
            ...(environment.Path ?? "").split(path.delimiter),
        )
    } else {
        candidates.push(...(environment.PATH ?? "").split(path.delimiter))
    }
    return [...new Set(candidates.map(asDirectory).filter(Boolean))]
        .find(directory => libraryNames.some(name => existsSync(path.join(directory, name))))
}

export const environmentWithLlvm = (environment = process.env) => {
    const llvmBin = findLlvmBin(environment)
    if (llvmBin === undefined) return {...environment}
    const result = {...environment, LIBCLANG_PATH: llvmBin}
    const pathKey = Object.keys(environment).find(key => key.toLowerCase() === "path")
        ?? (process.platform === "win32" ? "Path" : "PATH")
    Object.keys(result)
        .filter(key => key.toLowerCase() === "path" && key !== pathKey)
        .forEach(key => delete result[key])
    result[pathKey] = `${llvmBin}${path.delimiter}${environment[pathKey] ?? ""}`
    return result
}
