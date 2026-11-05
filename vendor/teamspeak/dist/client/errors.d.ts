import { TeamspeakError } from "@honeybbq/teamspeak";
/**
 * The address a client was given cannot be connected to: no host, a host with
 * characters no host name or IP address has, or a port outside 1–65535.
 * `connect()` rejects with it before it starts, and the client stays
 * disconnected. A name that does not resolve is not this: that fails with a
 * TeamspeakError whose `cause` is the lookup's error, since DNS failures are
 * often transient.
 */
export declare class InvalidAddressError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    /** The address as given. */
    readonly address: string;
    constructor(address: string, reason: string);
}
/**
 * A packet failed authentication: it was corrupted, or not from the server.
 * Internal: the packet is dropped, and this never reaches a caller.
 */
export declare class EAXTagMismatchError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    constructor();
}
/**
 * An unencrypted packet failed its integrity check. Internal: the packet is
 * dropped, and this never reaches a caller.
 */
export declare class FakeSignatureMismatchError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    constructor();
}
/** A file transfer connection failed: it could not be opened, or broke during the transfer. */
export declare class FileTransferError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    constructor(message: string, options?: ErrorOptions);
}
/**
 * The handshake failed on what the server sent: a malformed or out-of-range
 * Init1 step, public key, license or proof. `connect()` rejects with it, the
 * underlying failure as its `cause`.
 */
export declare class HandshakeError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    constructor(message: string, options?: ErrorOptions);
}
/**
 * The server's Init1 puzzle asks for more squarings than this client will do:
 * a server that is flooded raises the level, but not this far. `connect()`
 * rejects with it, as with any {@link HandshakeError}, and nothing was solved.
 */
export declare class PuzzleTooHardError extends HandshakeError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    /** The number of squarings the server asked for. */
    readonly level: number;
    /** The most this client does. */
    readonly maxLevel: number;
    constructor(level: number, maxLevel: number);
}
/** An identity string `parseIdentity()` cannot read. */
export declare class InvalidIdentityError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    constructor(message?: string, options?: ErrorOptions);
}
/**
 * The server stopped answering: nothing arrived, or a packet went
 * unacknowledged, for a minute.
 */
export declare class ConnectionTimeoutError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    constructor();
}
/**
 * The server's command stream broke: a command packet stayed missing for
 * seconds while later ones arrived, although the server sends one again until
 * it is acknowledged. The connection is ended rather than carry on without the
 * missing command, which would drop an answer or a notification and could
 * leave the view out of step with the server's; a reconnect starts from a
 * consistent state.
 */
export declare class ConnectionStalledError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    constructor();
}
/**
 * The server ended this client's session: a kick, a ban, or the server
 * stopping. The default reconnect policy retries a server that stopped, but
 * not a kick or a ban.
 */
export declare class RemovedError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    /** Why: `Reason.KickServer`, `KickServerBan`, `ServerStop` or `ServerShutdown`. */
    readonly reason: number;
    /** The reason the server or the invoker gave, if any. */
    readonly reasonMessage: string;
    /** Who removed the client, for a kick or a ban. */
    readonly invokerName: string;
    constructor(reason: number, reasonMessage: string, invokerName: string);
}
//# sourceMappingURL=errors.d.ts.map