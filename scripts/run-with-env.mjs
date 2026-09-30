import {spawnSync} from "node:child_process"

const args = process.argv.slice(2)
const environment = {...process.env}
while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0] ?? "")) {
    const separator = args[0].indexOf("=")
    environment[args[0].slice(0, separator)] = args.shift().slice(separator + 1)
}
const [command, ...commandArgs] = args
if (command === undefined) {
    console.error("Usage: node run-with-env.mjs KEY=value command [args...]")
    process.exit(1)
}
const result = spawnSync(command, commandArgs, {
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32",
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
