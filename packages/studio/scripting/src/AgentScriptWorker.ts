import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {ScriptHostSender} from "./ScriptHostSender"
import {AgentScriptChannels} from "./agent/AgentScriptProtocol"
import {AgentScriptExecutor} from "./agent/AgentScriptExecutor"

const messenger: Messenger = Messenger.for(self)

Communicator.executor(messenger.channel(AgentScriptChannels.Execution),
    new AgentScriptExecutor(ScriptHostSender.create(messenger.channel(AgentScriptChannels.Host))))
