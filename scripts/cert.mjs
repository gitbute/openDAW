import {mkdirSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const certs = path.join(root, "certs")
mkdirSync(certs, {recursive: true})

const result = spawnSync("mkcert", ["localhost"], {cwd: certs, stdio: "inherit", shell: false})
if (result.error) {
    console.error("Error: mkcert was not found. Install it with Chocolatey: choco install mkcert -y")
    process.exit(1)
}
if (result.status !== 0) process.exit(result.status ?? 1)
