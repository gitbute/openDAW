import {describe, expect, it} from "vitest"
import {applyUpdateTasks} from "@opendaw/lib-box"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {Arrays, asDefined} from "@opendaw/lib-std"
import {AgentScriptExecutor} from "../agent/AgentScriptExecutor"
import {createFixture, FakeHost} from "./Fixture"

const context = {sampleRate: 48000, baseFrequency: 440}

// A host with an open project, the way the studio serves it to the agent worker
const liveHost = (): FakeHost => {
    const {host, project} = createFixture()
    project.openInStudio()
    host.opened.length = 0
    return host
}

const liveBpm = (host: FakeHost): number =>
    ProjectSkeleton.findMandatoryBoxes(asDefined(host.current).graph).timelineBox.bpm.getValue()

describe("AgentScriptExecutor", () => {
    it("returns the top-level return value as JSON and the edits without forwarding them", async () => {
        const host = liveHost()
        const outcome = await new AgentScriptExecutor(host).executeAgentScript(`
            const project = await openDAW.getProject();
            project.bpm = 99;
            return {bpm: project.bpm, name: project.name};`, context)
        expect(outcome.error).toBeNull()
        expect(JSON.parse(outcome.returned)).toEqual({bpm: 99, name: "Test"})
        expect(outcome.edits?.updates.length).toBeGreaterThan(0)
        expect(host.applied).toHaveLength(0)
        expect(liveBpm(host)).toBe(120)
    })

    it("produces edits that replay onto the live graph", async () => {
        const host = liveHost()
        const outcome = await new AgentScriptExecutor(host).executeAgentScript(`
            const project = await openDAW.getProject();
            project.bpm = 99;`, context)
        const {graph} = asDefined(host.current)
        expect(Arrays.equals(graph.checksum(), asDefined(outcome.edits).checksum)).toBe(true)
        graph.beginTransaction()
        applyUpdateTasks(graph, asDefined(outcome.edits).updates)
        graph.endTransaction()
        expect(liveBpm(host)).toBe(99)
    })

    it("captures console output and restores the console", async () => {
        const host = liveHost()
        const original = console.log
        const outcome = await new AgentScriptExecutor(host).executeAgentScript(`
            console.log("hello", {a: 1}, [1, 2]);
            console.warn("careful");
            await openDAW.showInfo("Head", "Body");`, context)
        expect(outcome.logs).toEqual(["hello {\"a\":1} [1,2]", "[warn] careful", "[showInfo] Head: Body"])
        expect(console.log).toBe(original)
        expect(host.dialogs).toHaveLength(0)
    })

    it("caps the log buffer", async () => {
        const outcome = await new AgentScriptExecutor(liveHost()).executeAgentScript(`
            for (let i = 0; i < 250; i++) {console.log(i)}`, context)
        expect(outcome.logs).toHaveLength(201)
        expect(outcome.logs.at(-1)).toBe("[50 more log lines dropped]")
    })

    it("reports a throw with its line and drops the edits", async () => {
        const outcome = await new AgentScriptExecutor(liveHost()).executeAgentScript(
            `const project = await openDAW.getProject();\nproject.bpm = 99;\nthrow new Error("boom");`, context)
        expect(outcome.error?.message).toBe("Error: boom")
        expect(outcome.error?.line).toBe(3)
        expect(outcome.edits).toBeNull()
    })

    it("reports errors raised inside the API at the calling line", async () => {
        const outcome = await new AgentScriptExecutor(liveHost()).executeAgentScript(
            `const project = await openDAW.getProject();\n\nproject.bpm = "fast";`, context)
        expect(outcome.error?.message).toContain("bpm")
        expect(outcome.error?.line).toBe(3)
    })

    it("buffers openInStudio() so all edits form one change set", async () => {
        const host = liveHost()
        const outcome = await new AgentScriptExecutor(host).executeAgentScript(`
            const project = await openDAW.getProject();
            project.bpm = 99;
            project.openInStudio();
            project.bpm = 100;`, context)
        expect(host.applied).toHaveLength(0)
        expect(host.opened).toHaveLength(0)
        const {graph} = asDefined(host.current)
        expect(Arrays.equals(graph.checksum(), asDefined(outcome.edits).checksum)).toBe(true)
        graph.beginTransaction()
        applyUpdateTasks(graph, asDefined(outcome.edits).updates)
        graph.endTransaction()
        expect(liveBpm(host)).toBe(100)
    })

    it("hands out one project copy per run", async () => {
        const outcome = await new AgentScriptExecutor(liveHost()).executeAgentScript(
            `return (await openDAW.getProject()) === (await openDAW.getProject());`, context)
        expect(outcome.returned).toBe("true")
    })

    it("refuses to open a new project", async () => {
        const host = liveHost()
        const outcome = await new AgentScriptExecutor(host).executeAgentScript(
            `openDAW.newProject("Other").openInStudio();`, context)
        expect(outcome.error?.message).toContain("getProject")
        expect(host.opened).toHaveLength(0)
    })

    it("expands API objects through their getters", async () => {
        const outcome = await new AgentScriptExecutor(liveHost()).executeAgentScript(
            `const project = await openDAW.getProject(); return project.timeSignature;`, context)
        expect(JSON.parse(outcome.returned)).toEqual({numerator: 4, denominator: 4})
    })

    it("expands nested API objects several levels deep", async () => {
        const outcome = await new AgentScriptExecutor(liveHost()).executeAgentScript(`
            const project = await openDAW.getProject();
            const synth = project.addInstrumentUnit("Vaporisateur");
            const region = synth.noteTracks[0].addRegion({position: 0, duration: 3840});
            region.addEvent({position: 0, duration: 240, pitch: 60});
            return {units: project.audioUnits};`, context)
        const text = outcome.returned
        expect(text).not.toContain("[object]")
        expect(text).not.toMatch(/"(context|box|instrumentBox)"/)
        const {units: [unit]} = JSON.parse(text)
        expect(unit.instrument.lfo).toMatchObject({rate: 1, sync: false})
        expect(unit.tracks[0].regions[0].events[0]).toMatchObject({position: 0, duration: 240, pitch: 60})
    })

    it("drops deep levels before truncating", async () => {
        const script = `return Array.from({length: 40}, (_, index) => ({index, a: {b: {c: {d: {e: {f: "x".repeat(40)}}}}}}))`
        const full = await new AgentScriptExecutor(liveHost()).executeAgentScript(script, context)
        expect(full.returned.length).toBeGreaterThan(2000)
        const shrunk = await new AgentScriptExecutor(liveHost(), 2000).executeAgentScript(script, context)
        expect(shrunk.returned.length).toBeLessThanOrEqual(2000)
        const parsed = JSON.parse(shrunk.returned)
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed[0].index).toBe(0)
        expect(shrunk.returned).not.toContain("truncated")
    })

    it("keeps scalar members past the depth limit", async () => {
        const outcome = await new AgentScriptExecutor(liveHost()).executeAgentScript(
            `return {a: {b: {c: {d: {e: {f: {g: {x: 1, y: "two"}, h: {deeper: {z: 1}}}}}}}}}`, context)
        const {a: {b: {c: {d: {e: {f}}}}}} = JSON.parse(outcome.returned)
        expect(f).toEqual({g: {x: 1, y: "two"}, h: {deeper: "[object]"}})
    })

    it("serialises awkward values and caps the size", async () => {
        const circular = await new AgentScriptExecutor(liveHost()).executeAgentScript(
            `const value = {n: NaN, f: () => 1, big: 10n}; value.self = value; return value;`, context)
        expect(JSON.parse(circular.returned)).toEqual({n: "NaN", big: "10", self: "[circular]"})
        const capped = await new AgentScriptExecutor(liveHost(), 20).executeAgentScript(`return "x".repeat(100);`, context)
        expect(JSON.parse(capped.returned)).toMatch(/truncated, 102 chars/)
        const nothing = await new AgentScriptExecutor(liveHost()).executeAgentScript(`const a = 1;`, context)
        expect(nothing.returned).toBe("null")
        expect(nothing.edits).toBeNull()
    })
})
