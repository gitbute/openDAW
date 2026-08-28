import {spawnSync} from "node:child_process"
import {copyFileSync, mkdirSync, renameSync, rmSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {environmentWithLlvm} from "../../../scripts/llvm.mjs"

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(packageDirectory, "../..", "..")
const crates = path.join(root, "crates")
const target = "wasm32-unknown-unknown"
const output = path.join(crates, "target", target, "release")
const sharedLinkArgs = ["-C", "link-arg=--no-check-features"]
const shared = sharedLinkArgs.join(" ")
const simd = "-C target-feature=+simd128"
const picRustflags = [
    "-C relocation-model=pic",
    simd,
    "-C link-arg=--experimental-pic",
    "-C link-arg=-shared",
    shared,
    "-Zunstable-options",
    "-Cpanic=abort",
    "-Zdefault-visibility=hidden",
].join(" ")
const deviceToolchain = process.env.DEVICE_TOOLCHAIN ?? "nightly"
const deviceCrates = [
    "device-cubed", "device-autotune", "device-revamp", "device-pitch", "device-arpeggio",
    "device-zeitgeist", "device-tidal", "device-vaporisateur", "device-neon", "device-nano",
    "device-delay", "device-playfield-sample", "device-gate", "device-werkstatt", "device-apparat",
    "device-spielwerk", "device-waveshaper", "device-crusher", "device-fold", "device-stereo-tool",
    "device-velocity", "device-maximizer", "device-compressor", "device-reverb", "device-dattorro-reverb",
    "device-convolver", "device-soundfont", "device-vocoder", "device-neural-amp",
]

const run = (command, args, env = {}) => {
    const result = spawnSync(command, args, {
        cwd: crates,
        env: environmentWithLlvm({...process.env, ...env}),
        stdio: "inherit",
        shell: false,
    })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
}

const wasmOptAvailable = () => spawnSync("wasm-opt", ["--version"], {stdio: "ignore"}).status === 0

const main = () => {
    run("cargo", ["rustc", "-p", "engine", "--release", "--target", target, "--",
        "-C", "link-arg=--import-memory", "-C", "link-arg=--import-table", ...sharedLinkArgs], {RUSTFLAGS: simd})
    run("cargo", ["build", "-p", "stretch-wasm", "--release", "--target", target], {RUSTFLAGS: simd})

    for (const crate of deviceCrates) {
        run("cargo", [
            `+${deviceToolchain}`, "build", "-p", crate, "--release", "--target", target, "-Zbuild-std=core",
        ], {RUSTFLAGS: picRustflags})
    }

    const modules = ["engine", "stretch_wasm", ...deviceCrates.map(crate => crate.replaceAll("-", "_"))]
    if (wasmOptAvailable()) {
        for (const module of modules) {
            const input = path.join(output, `${module}.wasm`)
            const optimized = `${input}.opt.${process.pid}`
            run("wasm-opt", [
                "-Oz", "--enable-bulk-memory", "--enable-mutable-globals", "--enable-simd",
                "--enable-sign-ext", "--enable-nontrapping-float-to-int", "--enable-multivalue",
                "--enable-reference-types", input, "-o", optimized,
            ])
            rmSync(input, {force: true})
            renameSync(optimized, input)
        }
        console.log(`wasm-opt: optimised ${modules.join(" ")}`)
    } else {
        console.log("wasm-opt not found (optional) — shipping unoptimised modules")
    }

    const destination = path.join(root, "packages", "studio", "core-wasm", "dist", "wasm")
    const plugins = path.join(destination, "plugins")
    mkdirSync(plugins, {recursive: true})
    copyFileSync(path.join(output, "engine.wasm"), path.join(destination, "engine.wasm"))
    copyFileSync(path.join(output, "stretch_wasm.wasm"), path.join(destination, "stretch_wasm.wasm"))
    for (const module of modules.slice(2)) {
        copyFileSync(path.join(output, `${module}.wasm`), path.join(plugins, `${module}.wasm`))
    }
    console.log("built: engine.wasm + stretch_wasm.wasm + stock devices + werkstatt/apparat/spielwerk")
}

try {
    main()
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
