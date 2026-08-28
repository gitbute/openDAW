import css from "./BrowserPanel.sass?inline"
import {Lifecycle, Terminator} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService.ts"
import {createElement, DomElement, Group, replaceChildren} from "@opendaw/lib-jsx"
import {RadioGroup} from "@/ui/components/RadioGroup.tsx"
import {SampleBrowser} from "@/ui/browse/SampleBrowser.tsx"
import {PresetBrowser} from "@/ui/browse/PresetBrowser.tsx"
import {BrowseScope} from "@/ui/browse/BrowseScope"
import {Html} from "@opendaw/lib-dom"
import {SoundfontBrowser} from "@/ui/browse/SoundfontBrowser"
import {CodexAgentPanel} from "@/ui/browse/CodexAgentPanel"

const className = Html.adoptStyleSheet(css, "BrowserPanel")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const BrowserPanel = ({lifecycle, service}: Construct) => {
    const placeholder: DomElement = <Group/>
    const contentLifecycle = lifecycle.own(new Terminator())
    lifecycle.own(service.browseScope.catchupAndSubscribe(owner => {
        contentLifecycle.terminate()
        replaceChildren(placeholder, (() => {
            switch (owner.getValue()) {
                case BrowseScope.Presets:
                    return <PresetBrowser lifecycle={contentLifecycle}
                                          service={service}/>
                case BrowseScope.Samples:
                    return <SampleBrowser lifecycle={contentLifecycle}
                                          service={service}
                                          background
                                          fontSize="0.75em"/>
                case BrowseScope.Soundfonts:
                    return <SoundfontBrowser lifecycle={contentLifecycle}
                                             service={service}
                                             background
                                             fontSize="0.75em"/>
                case BrowseScope.Agent:
                    return <CodexAgentPanel lifecycle={contentLifecycle}
                                            service={service}/>
                default:
                    return <span>Unknown</span>
            }
        })())
    }))
    return (
        <div className={className}>
            <RadioGroup lifecycle={lifecycle} elements={[
                {value: BrowseScope.Presets, element: <span>Presets</span>},
                {value: BrowseScope.Samples, element: <span>Samples</span>},
                {value: BrowseScope.Soundfonts, element: <span>Soundfonts</span>},
                {value: BrowseScope.Agent, element: <span>Agent</span>}
            ]} model={service.browseScope}
                style={{fontSize: "11px", columnGap: "8px", padding: "0.5em 0.75em"}}/>
            {placeholder}
        </div>
    )
}
