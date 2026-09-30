import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {ScriptExecutionContext, ScriptExecutionProtocol} from "./ScriptExecutionProtocol"
import {ScriptRunner} from "./ScriptRunner"
import {ScriptHostSender} from "./ScriptHostSender"

const messenger: Messenger = Messenger.for(self)

const hostProtocol = ScriptHostSender.create(messenger.channel("scripting-host"))

Communicator.executor(messenger.channel("scripting-execution"), new class implements ScriptExecutionProtocol {
    readonly #scriptExecutor = new ScriptRunner(hostProtocol)

    async executeScript(script: string, context: ScriptExecutionContext): Promise<void> {
        await this.#scriptExecutor.run(script, context)
    }
})
