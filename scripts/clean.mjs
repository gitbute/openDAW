import {existsSync, readdirSync, rmSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const removableDirectories = new Set(["node_modules", "dist", ".turbo"])

const cleanTree = directory => {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            if (removableDirectories.has(entry.name)) {
                rmSync(entryPath, {recursive: true, force: true})
            } else if (entry.name !== ".git") {
                cleanTree(entryPath)
            }
        } else if (entry.isFile() && entry.name === "package-lock.json") {
            rmSync(entryPath, {force: true})
        }
    }
}

console.log("Removing node_modules, dist, package-lock.json, and .turbo...")
cleanTree(root)

const generatedBoxes = path.join(root, "packages", "studio", "boxes", "src")
if (existsSync(generatedBoxes)) {
    for (const entry of readdirSync(generatedBoxes, {withFileTypes: true, encoding: "utf8"})) {
        rmSync(path.join(generatedBoxes, entry.name), {recursive: true, force: true})
    }
}
