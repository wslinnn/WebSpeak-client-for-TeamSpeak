import { type PermissionID } from "./command/ids.js";
/**
 * The base of every error the SDK throws, so `instanceof TeamspeakError` tells
 * the SDK's failures from anything else.
 *
 * `instanceof` works across copies of the package: an application can end up
 * with two installed (two versions, or one bundled), and an error from one is
 * still an instance of the other's classes. Each class names itself in a fixed
 * {@link TeamspeakError.kind} that a minifier leaves alone, where a class's
 * own name would not survive one.
 */
export declare class TeamspeakError extends Error {
    /**
     * The fixed name `instanceof` matches this class by across copies of the
     * package. Every SDK error class declares its own.
     */
    static readonly kind: string;
    constructor(message: string, options?: ErrorOptions);
    /**
     * Whether `value` is an error of this class from any copy of the package:
     * one whose kinds, its own class's and those it extends, include this
     * class's {@link TeamspeakError.kind}. A subclass that declares no kind of
     * its own matches only its own instances.
     */
    static [Symbol.hasInstance](value: unknown): boolean;
}
/**
 * A refusal from the server: the `error` line that answered a command carried a
 * non-zero code.
 *
 * Compare {@link ServerError.code} with {@link ErrorCode} to tell refusals apart.
 */
export declare class ServerError extends TeamspeakError {
    /** {@inheritDoc TeamspeakError.kind} */
    static readonly kind: string;
    /**
     * The protocol's numeric error code, as in `error id=…`: compare it with
     * {@link ErrorCode}. It is not a Node-style string code such as `ENOENT`.
     * A server may report one {@link ErrorCode} does not name.
     */
    readonly code: number;
    /** The server's own text, such as "invalid channel password". */
    readonly serverMessage: string;
    /** Detail the server adds to some refusals (`extra_msg`). */
    readonly extraMessage: string | undefined;
    /** The permission a refused permission check failed on, when the server names one (`failed_permid`). */
    readonly failedPermissionID: PermissionID | undefined;
    /**
     * The missing permission's name, as WebQuery reports it (`failed_permission`);
     * undefined when the server named none. The voice protocol and raw or SSH
     * ServerQuery report an id instead, in {@link ServerError.failedPermissionID}.
     */
    readonly failedPermission: string | undefined;
    constructor(code: number, serverMessage: string, details?: {
        extraMessage?: string | undefined;
        failedPermissionID?: PermissionID | undefined;
        failedPermission?: string | undefined;
    });
}
/**
 * A command's answer did not arrive within its timeout. The command may still
 * have taken effect on the server.
 */
export declare class CommandTimeoutError extends TeamspeakError {
    /** {@inheritDoc TeamspeakError.kind} */
    static readonly kind: string;
    /** The name of the command that timed out; never its parameters. */
    readonly command: string;
    constructor(command: string);
}
/**
 * A command was sent with no connection to send it on, or the connection was
 * lost while it waited for its answer.
 *
 * Without it such a command would wait out its full timeout and fail as if the
 * server were slow.
 */
export declare class NotConnectedError extends TeamspeakError {
    /** {@inheritDoc TeamspeakError.kind} */
    static readonly kind: string;
    constructor(options?: ErrorOptions);
}
/** `connect()` was called on a client that is connecting or connected. */
export declare class AlreadyConnectedError extends TeamspeakError {
    /** {@inheritDoc TeamspeakError.kind} */
    static readonly kind: string;
    constructor();
}
/**
 * A command that answers with data succeeded without it: the server sent no
 * row, or a row without the value the command exists to return — a created
 * channel's id, a transfer's key.
 *
 * Without it the caller would get an id of 0 or an object of empty fields,
 * which reads like a real answer.
 *
 * From a command that creates something, this means the command took effect:
 * TS6 WebQuery answers a successful create with no data while a Server Admin
 * voice client is connected (6.0.0-beta13.1). Do not retry blindly, or a second
 * object is made — or the retry is refused as a duplicate. Creating a channel
 * or a group looks the new one up by its unique name first, and throws this
 * only when none is found; a privilege key cannot be told apart from an
 * identical one, and an API key's secret is never listed, so those two throw it
 * whenever the answer lacks the key, and one made this way is orphaned.
 */
export declare class NoDataError extends TeamspeakError {
    /** {@inheritDoc TeamspeakError.kind} */
    static readonly kind: string;
    /** The name of the command that answered with nothing. */
    readonly command: string;
    constructor(command: string, message?: string);
}
/**
 * Read an error id. One that is missing or unreadable (not an unsigned 32-bit
 * number) is reported as {@link ErrorCode.Undefined}: an error line that does
 * not say what went wrong has still not said that nothing did.
 */
export declare function parseErrorCode(raw: string | undefined): number;
/**
 * How many times a command refused as flooding is sent again after the pause
 * the server asked for. On the voice protocol the first resend is usually
 * refused once more with a shorter wait, and the second goes through (measured
 * on TeamSpeak 3 and 6); on ServerQuery a refusal can be answered with a
 * longer wait, which the caller's timeout then decides whether to sit out.
 */
export declare const FLOOD_RETRIES = 3;
/**
 * How long to pause for a refusal that asked for `waitMs`. The wait is a floor:
 * on the voice protocol a resend after exactly the wait is refused again, and
 * one after half as long again goes through; on ServerQuery a resend after
 * exactly 1 second was refused 2 times in 5, and one after 2.2 seconds went
 * through 5 times in 5 (TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0). Every
 * refusal costs a retry and lengthens the server's pause, so the pause is
 * twice the wait.
 */
export declare function floodHoldMs(waitMs: number): number;
/**
 * How long the server asks a client it refused as flooding to wait, in
 * milliseconds. Undefined for any other error, or one that names no wait.
 *
 * Measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0: a voice client whose
 * antiflood points pass `virtualserver_antiflood_points_needed_command_block`
 * gets `error id=524 msg=client\sis\sflooding extra_msg=retry\sin\s1985ms`
 * for each command, and the command is not run. The wait is a floor, not a
 * promise: a command sent as the wait ends is refused again with a shorter one,
 * and the second try went through in every measurement.
 *
 * A ServerQuery client (raw TCP and SSH; over WebQuery the server closes the
 * connection and says nothing) that sends faster than
 * `serverinstance_serverquery_flood_commands` per `_flood_time` gets the same
 * error with the wait in whole seconds,
 * `extra_msg=please\swait\s1\sseconds`, and the command is not run. The first
 * refusals say 1; later ones say the instance's
 * `serverinstance_serverquery_ban_time`, as the address is banned for that long
 * (new connections are dropped meanwhile). Asking again every half second kept
 * the ban going for as long as it was kept up (9 seconds against a ban time of
 * 4), while waiting out the pause and asking once got through. The wait is a
 * floor here too: about one resend in three after exactly the wait was refused
 * again, with the ban time.
 */
export declare function floodRetryDelayMs(error: Error): number | undefined;
/**
 * Parse and handle an `error` command from the server.
 * Returns the error (or null on success) and the resolved return_code.
 */
export declare function parseServerError(params: Record<string, string>): {
    err: ServerError | null;
    rc: number | null;
};
//# sourceMappingURL=errors.d.ts.map