import {ScriptCompiler} from "./ScriptCompiler"

export namespace ScriptDeviceConfigs {
    export const Apparat: ScriptCompiler.Config = Object.freeze({
        headerTag: "apparat",
        registryName: "apparatProcessors",
        functionName: "apparat"
    })

    export const Werkstatt: ScriptCompiler.Config = Object.freeze({
        headerTag: "werkstatt",
        registryName: "werkstattProcessors",
        functionName: "werkstatt"
    })

    export const Spielwerk: ScriptCompiler.Config = Object.freeze({
        headerTag: "spielwerk",
        registryName: "spielwerkProcessors",
        functionName: "spielwerk"
    })
}
