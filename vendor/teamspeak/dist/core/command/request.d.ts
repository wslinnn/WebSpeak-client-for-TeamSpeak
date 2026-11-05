/**
 * A command as the typed layer describes it, before a transport encodes it.
 *
 * The typed commands run on any connection that can execute a command — the
 * voice client today, ServerQuery later — and the two disagree about how some
 * values go on the wire. A channel password is the case that matters: the
 * voice protocol expects `base64(sha1(password))`, while ServerQuery takes the
 * password itself and hashes it server-side. So a request says *which*
 * parameters are passwords and leaves their encoding to the transport.
 */
import type { CommandName } from "../command-name.js";
/** A parameter value as a caller may supply it. */
export type ParamValue = string | number | bigint | boolean | undefined;
/** A command and its parameters, in the order they are sent. */
export interface CommandRequest {
    /** The command's name, such as `clientlist`; {@link CommandName} lists the known ones. */
    readonly command: CommandName | (string & {});
    /**
     * Its parameters, as wire name and value pairs, in the order they are sent;
     * an undefined value is omitted.
     */
    readonly params?: ReadonlyArray<readonly [string, ParamValue]> | undefined;
    /**
     * Further rows, for a command that takes a list: each is a group of
     * parameters sent after a `|`, as `ftdeletefile cid=1 cpw= name=/a|name=/b`
     * sends two names. The first row's parameters follow `params`.
     */
    readonly rows?: ReadonlyArray<ReadonlyArray<readonly [string, ParamValue]>> | undefined;
    /** Names of the parameters that carry a channel password. */
    readonly passwords?: readonly string[] | undefined;
}
/** How long a command may take, and how to abandon it. */
export interface CommandOptions {
    /** Abandons the command; it then rejects with the signal's reason. */
    readonly signal?: AbortSignal | undefined;
    /** Milliseconds to wait for the answer before failing with a CommandTimeoutError. */
    readonly timeoutMs?: number | undefined;
    /**
     * Called once, when the command has left the flood throttle and was handed to
     * the connection. A command that fails without it was never sent; one that
     * fails after it may have been carried out.
     */
    readonly onSent?: (() => void) | undefined;
}
/**
 * A connection the typed commands can run on.
 *
 * It is deliberately this narrow. A caller implements it to run the typed
 * commands over a transport of their own, and `CommandMiddleware` wraps its
 * `send`, so a method added here would break every implementation and every
 * middleware along with it: this interface gains no methods in a minor
 * release. A new capability arrives as an interface, a function or an option
 * of its own instead, and an implementer or a middleware author may rely on
 * that.
 */
export interface CommandExecutor {
    /** Send a command and return the rows that answer it. */
    send(request: CommandRequest, options?: CommandOptions): Promise<Record<string, string>[]>;
}
/**
 * Render a request as a command line.
 *
 * `encodePassword` is the transport's rule for password parameters. An empty
 * password is sent as is: it means "no password", in every encoding.
 */
export declare function encodeRequest(request: CommandRequest, encodePassword: (password: string) => string): string;
//# sourceMappingURL=request.d.ts.map