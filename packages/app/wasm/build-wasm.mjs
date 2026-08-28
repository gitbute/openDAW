import {spawnSync} from "node:child_process"
import {copyFileSync, cpSync, mkdirSync, readdirSync, rmSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {environmentWithLlvm} from "../../../scripts/llvm.mjs"

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(packageDirectory, "../..", "..")
const crates = path.join(root, "crates")
const target = "wasm32-unknown-unknown"

const run = (command, args, cwd) => {
    const result = spawnSync(command, args, {cwd, env: environmentWithLlvm(), stdio: "inherit", shell: false})
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
}

const main = () => {
    run(process.execPath, [path.join(root, "packages", "studio", "core-wasm", "build-wasm.mjs")], root)
    run("cargo", ["build", "-p", "sine", "--release", "--target", target], crates)

    const publicDirectory = path.join(packageDirectory, "public")
    const publicWasm = path.join(publicDirectory, "wasm")
    const coreWasm = path.join(root, "packages", "studio", "core-wasm", "dist", "wasm")
    rmSync(publicWasm, {recursive: true, force: true})
    for (const entry of readdirSync(publicDirectory)) {
        if (entry.endsWith(".wasm")) rmSync(path.join(publicDirectory, entry), {force: true})
    }
    mkdirSync(publicDirectory, {recursive: true})
    cpSync(coreWasm, publicWasm, {recursive: true})
    copyFileSync(path.join(crates, "target", target, "release", "sine.wasm"), path.join(publicWasm, "sine.wasm"))
    console.log("app-wasm: refreshed public/wasm from @opendaw/studio-core-wasm (+ sine)")
}

try {
    main()
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
