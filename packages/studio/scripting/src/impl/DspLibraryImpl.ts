import {ScriptDsp} from "@opendaw/studio-adapters"
import {DspBlock, DspLibrary} from "../Api"
import {Guard} from "./Guard"

const isBlock = (name: string): name is DspBlock => ScriptDsp.blockNames.includes(name)

export const DspLibraryImpl: DspLibrary = {
    link: (code: string): string => ScriptDsp.link(Guard.string(code, "code")),
    include: (...blocks: ReadonlyArray<DspBlock>): string => ScriptDsp.include(blocks),
    strip: (code: string): string => ScriptDsp.strip(Guard.string(code, "code")),
    isLinked: (code: string): boolean => ScriptDsp.isLinked(Guard.string(code, "code")),
    blocks: ScriptDsp.blockNames.filter(isBlock),
    version: ScriptDsp.version
}
