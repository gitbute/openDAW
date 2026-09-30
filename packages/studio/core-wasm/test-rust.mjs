import {spawnSync} from "node:child_process"
import {environmentWithLlvm, findLlvmBin} from "../../../scripts/llvm.mjs"

if (process.platform === "win32" && findLlvmBin() === undefined) {
    console.error("LLVM/libclang.dll is required for the Rust test suite. Install it with: choco install llvm -y")
    process.exit(1)
}

const result = spawnSync("cargo", ["test", "--manifest-path", "../../../crates/Cargo.toml", "--workspace"], {
    env: environmentWithLlvm(),
    stdio: "inherit",
    shell: false,
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
