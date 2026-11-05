import type { ResponseSpec } from "../core/internal.js";
export interface CommandResult {
    err: Error | null;
    data: Array<Record<string, string>>;
}
/**
 * Matches the server's answers to the commands that asked for them.
 *
 * The server handles one client's commands in order and closes each answer
 * with `error … return_code=N`, so every row seen since the previous `error`
 * belongs to command N. Rows are therefore held, tagged with where they came
 * from, until that `error` says whose they are — attributing them on arrival
 * would mean guessing which in-flight command the server is answering, and a
 * command can be registered here well before it is sent (it first waits on the
 * throttle and the middleware chain).
 *
 * A nameless row always belongs to the command. A notification row belongs to
 * it only if the command declared that notification as its answer (see
 * command/responses.ts): the same `notifyclientmoved` that answers nothing can
 * arrive between any two commands.
 *
 * The welcome sequence is the exception. The server pushes channellist,
 * channelgrouplist and the rest unprompted right after the handshake, before
 * `channellistfinished`; without the gate they would land in the first
 * command's answer as duplicate rows and a phantom cid=0.
 */
export declare class CommandTracker {
    #private;
    /** @param ownClientID the client's clid, for answers filtered by invoker. */
    constructor(ownClientID?: () => number);
    register(spec?: ResponseSpec, correlation?: string, echo?: string): [rc: number, promise: Promise<CommandResult>];
    unregister(rc: number): void;
    /** Marks the end of the welcome sequence and drops what it left behind. */
    signalWelcomeComplete(): void;
    /** Whether some in-flight command declared `name` as its answer. */
    expects(name: string): boolean;
    /** Hold a row until the next `error` says which command it answered. */
    buffer(params: Record<string, string>, source?: string): void;
    /**
     * Offer a notification to commands answered after their `error`.
     *
     * Matching is on the echoed request field, so it does not matter whether the
     * notification beats the `error` or follows it.
     */
    offerCorrelated(name: string, params: Record<string, string>): void;
    resolve(rc: number, err: Error | null): void;
    discardBuffer(): void;
    /**
     * Forget every command and fail it with `err`.
     *
     * Dropping them silently would leave each caller waiting out its full
     * timeout for an answer that can no longer come.
     */
    reset(err: Error): void;
}
/**
 * Append the tracker's return_code to a command.
 *
 * The return_code belongs to the tracker: it is how an answer finds its
 * command, so a caller-supplied one would detach the command from its answer.
 * Checked as a parameter rather than as text, because a message body that
 * merely contains "return_code=" used to suppress the real one and time the
 * command out.
 */
export declare function appendReturnCode(cmd: string, rc: number): string;
//# sourceMappingURL=commands.d.ts.map