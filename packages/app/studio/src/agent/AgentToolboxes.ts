import {Optional} from "@opendaw/lib-std"
import type {AgentTool, AgentToolbox} from "@opendaw/studio-codex"
import type {Project} from "@opendaw/studio-core"
import type {StudioService} from "@/service/StudioService"
import {AGENT_DEVELOPER_INSTRUCTIONS} from "@/agent/AgentInstructions"
import {BarClock, createInspectNotesTool, createInspectProjectTool, PianoRollRenderer} from "@/agent/inspect"
import {createListenTool} from "@/agent/listen/ListenTool"
import {renderPianoRollPng} from "@/agent/listen/PianoRollView"
import {ListenAnalysis} from "@/agent/analysis/ListenAnalysis"
import {CatalogToolbox} from "@/agent/catalog/CatalogToolbox"
import {AgentScriptStudio} from "@/agent/script/AgentScriptStudio"
import type {AgentScriptRunner} from "@/agent/script/AgentScriptRunner"
import {createRunScriptTool} from "@/agent/script/RunScriptTool"
import {createAuditionTool} from "@/agent/audition/AuditionTool"
import {StudioScriptHost} from "@/script/StudioScriptHost"

export namespace AgentToolboxes {
    export const developerInstructions = (): string =>
        `${AGENT_DEVELOPER_INSTRUCTIONS}

DEVICE PALETTE (all available; device_reference({device}) for parameters)
${CatalogToolbox.devices().palette()}`

    let runner: Optional<AgentScriptRunner> = undefined

    const runnerFor = (service: StudioService): AgentScriptRunner => runner ??= AgentScriptStudio.createRunner(service)

    const concurrent = (tool: AgentTool): AgentTool => ({
        name: tool.name, description: tool.description, inputSchema: tool.inputSchema, concurrent: true,
        execute: args => tool.execute(args)
    })

    const pianoRoll = (project: Project): PianoRollRenderer => (notes, {from, to}) => {
        const clock = new BarClock(project.timelineBoxAdapter.signatureTrack)
        const {bar} = clock.locate(from)
        return renderPianoRollPng(notes.map(note => ({...note, track: "notes"})),
            {startPpqn: from, endPpqn: to, ppqnPerBar: clock.barDuration(bar)}, {firstBar: bar + 1})
    }

    export const create = (service: StudioService, project: Project): ReadonlyArray<AgentToolbox> => [{
        namespace: "daw",
        description: "Produce music in the open openDAW project: inspect, script, listen, audition, browse.",
        tools: [
            concurrent(createInspectProjectTool(() => project)),
            createRunScriptTool(runnerFor(service)),
            concurrent(createInspectNotesTool(() => project, pianoRoll(project))),
            createListenTool({project: () => project, analyze: ListenAnalysis.analyze, supportsImages: () => true}),
            createAuditionTool({host: StudioScriptHost.createHeadless(service), env: () => service, supportsImages: () => true}),
            ...CatalogToolbox.create(service).tools.map(concurrent)
        ]
    }]
}
