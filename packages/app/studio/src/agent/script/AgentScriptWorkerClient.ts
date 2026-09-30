import {int, isDefined, isNull, Nullable, Terminable} from "@opendaw/lib-std"
import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {
    AgentScriptChannels,
    AgentScriptExecutionProtocol,
    AgentScriptOutcome,
    ScriptExecutionContext,
    ScriptHostProtocol
} from "@opendaw/studio-scripting"

type Connection = { worker: Worker, executor: AgentScriptExecutionProtocol, host: Terminable }

// Owns the agent's script worker and replaces it when a script hangs past the timeout.
export class AgentScriptWorkerClient implements Terminable {
    readonly #host: ScriptHostProtocol
    readonly #workerUrl: string
    readonly #timeoutMillis: int
    #connection: Nullable<Connection>

    constructor(host: ScriptHostProtocol, workerUrl: string, timeoutMillis: int) {
        this.#host = host
        this.#workerUrl = workerUrl
        this.#timeoutMillis = timeoutMillis
        this.#connection = null
    }

    execute(script: string, context: ScriptExecutionContext): Promise<AgentScriptOutcome> {
        const {executor} = this.#connect()
        return new Promise<AgentScriptOutcome>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.terminate()
                reject(new Error(`Script did not finish within ${Math.round(this.#timeoutMillis / 1000)}s and was stopped`))
            }, this.#timeoutMillis)
            executor.executeAgentScript(script, context).then(resolve, reject).finally(() => clearTimeout(timer))
        })
    }

    terminate(): void {
        if (isNull(this.#connection)) {return}
        this.#connection.host.terminate()
        this.#connection.worker.terminate()
        this.#connection = null
    }

    #connect(): Connection {
        if (isDefined(this.#connection)) {return this.#connection}
        const worker = new Worker(this.#workerUrl, {type: "module"})
        const messenger = Messenger.for(worker)
        const host = Communicator.executor<ScriptHostProtocol>(messenger.channel(AgentScriptChannels.Host), this.#host)
        const executor = Communicator.sender<AgentScriptExecutionProtocol>(messenger.channel(AgentScriptChannels.Execution),
            dispatcher => new class implements AgentScriptExecutionProtocol {
                executeAgentScript(script: string, context: ScriptExecutionContext): Promise<AgentScriptOutcome> {
                    return dispatcher.dispatchAndReturn(this.executeAgentScript, script, context)
                }
            })
        this.#connection = {worker, executor, host}
        return this.#connection
    }
}
