import { StreamTransport } from "./stream.js";
import type { QueryStream } from "./stream.js";
/**
 * The part of an SSH client this transport uses: `ssh2`'s `Client` is one, and
 * so is anything else with these methods.
 *
 * Declared here rather than imported from `@types/ssh2`, which a caller
 * without the optional peer dependency does not have: the types are a
 * devDependency and are not published with the package. A later release may
 * widen this, and every new member will be optional, so an implementation
 * written today keeps compiling.
 */
export interface SshClient {
    /**
     * Begin the connection; `ready` is emitted once the handshake is done.
     *
     * `hostVerifier` is asked about the server's key before anything is
     * authenticated, so before the password is sent. It is given the key's wire
     * encoding and returns whether to go on: a client must end the connection
     * when it returns `false`, and must not treat a missing answer as a yes.
     */
    connect(config: {
        host: string;
        port: number;
        username: string;
        /** Absent for the `guest` account, which logs in without a password. */
        password?: string;
        readyTimeout: number;
        hostVerifier: (key: Uint8Array) => boolean;
    }): void;
    /** Open a shell channel, or report why it could not be opened. */
    shell(pty: false, callback: (error: Error | undefined, channel: SshChannel) => void): void;
    /** End the connection. */
    end(): void;
    /** Listen for the handshake completing, once. */
    once(event: "ready", listener: () => void): unknown;
    /** Listen for the next failure, once. */
    once(event: "error", listener: (error: Error) => void): unknown;
    /** Listen for each failure. */
    on(event: "error", listener: (error: Error) => void): unknown;
    /** Stop listening for failures. */
    off(event: "error", listener: (error: Error) => void): unknown;
}
/** The channel an SSH client's shell opens: a byte stream, and the errors on it. */
export interface SshChannel extends QueryStream {
    /** Report a failure on the stream, as a socket would: the transport reads it. */
    emit(event: "error", error: Error): unknown;
    /** Listen for the stream closing, once. */
    once(event: "close", listener: () => void): unknown;
}
/**
 * An SSH client this transport uses instead of loading `ssh2` itself: either
 * one that is connected already, or a factory that makes one.
 *
 * A caller that holds its own connected client — authenticated through an
 * agent, a jump host or a key file this transport knows nothing about — hands
 * it over. A factory is asked for one per connection attempt, which a
 * reconnection needs.
 */
export type SshConnection = SshClient | (() => Promise<SshClient>);
/**
 * The key an SSH server presented, as the check a caller supplies sees it.
 *
 * A type of this package's own rather than the SSH library's, so a policy can
 * be written without importing that library.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface SshHostKey {
    /** The host that was dialled, as it was given. */
    readonly host: string;
    /** The port that was dialled. */
    readonly port: number;
    /** The key's algorithm, such as `ssh-ed25519`, as its own encoding names it. */
    readonly keyType: string;
    /** The key's wire encoding: the blob a `known_hosts` line carries in base64. */
    readonly key: Uint8Array;
    /**
     * The key's SHA-256 fingerprint in OpenSSH form, such as `SHA256:HR5y2ZQ…`.
     * It is what `ssh-keygen -lf` and `ssh-keyscan` print, so it can be compared
     * with the one the server's operator published.
     */
    readonly fingerprint: string;
}
/**
 * A caller's check of an SSH server's host key: returns to accept the key and
 * throws to refuse it.
 *
 * Throwing is how a callback with no error channel says no, and the error it
 * throws is kept as the `cause` of the {@link SshHostKeyError} the connection
 * fails with. It runs before the login is sent, and it has to be synchronous
 * and return nothing: a return value, a `false` included, is not an answer this
 * can read, so it refuses the key rather than guess, as does a promise, whose
 * rejection would arrive too late to stop anything.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export type SshHostKeyVerifier = (key: SshHostKey) => void;
/**
 * Your own check of the server's host key. Use it when the key you trust does
 * not live in a `known_hosts` file: a fingerprint from configuration, a pinned
 * key, a lookup somewhere else.
 *
 * One of the three arms of {@link SshHostKeyPolicy}: giving it excludes the
 * other two.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface SshHostKeyCallbackPolicy {
    /**
     * The check; see {@link SshHostKeyVerifier}. Called once per connection
     * attempt, before the login is sent.
     */
    readonly hostKey: SshHostKeyVerifier;
    /** Left out: `hostKey` is the policy, and a second one would not say which decides. */
    readonly knownHosts?: never;
    /** Left out: `hostKey` is the policy, and a second one would not say which decides. */
    readonly insecureIgnoreHostKey?: never;
}
/**
 * Accept whatever key the server presents. Use it for a test or a throwaway
 * server on a network that is already trusted, and for nothing else.
 *
 * One of the three arms of {@link SshHostKeyPolicy}: giving it excludes the
 * other two.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface SshInsecureHostKeyPolicy {
    /**
     * Only `true` is a value: this is not a switch to be left `false`, but a
     * decision a call site makes out loud.
     *
     * It gives up the one thing the host key is for. Anyone who can answer the
     * port, on the path or at the address, receives the query login and its
     * password and is indistinguishable from the server. Use
     * {@link SshKnownHostsPolicy.knownHosts} otherwise.
     */
    readonly insecureIgnoreHostKey: true;
    /** Left out: accepting any key leaves nothing for a second policy to decide. */
    readonly hostKey?: never;
    /** Left out: accepting any key leaves nothing for a second policy to decide. */
    readonly knownHosts?: never;
}
/**
 * Check the server against an OpenSSH `known_hosts` file. Use it for a server
 * whose key you have recorded with `ssh-keyscan`, or already trust through
 * `ssh`.
 *
 * One of the three arms of {@link SshHostKeyPolicy}: giving it excludes the
 * other two.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface SshKnownHostsPolicy {
    /**
     * A path to the `known_hosts` file, in the format `ssh-keyscan` writes and
     * `ssh-keygen -H` hashes.
     *
     * Read when each connection is attempted, so a reconnection sees the file as
     * it is then, and only from the path given: `~/.ssh/known_hosts` is never
     * assumed, because a library reading the home directory on its own is a
     * surprise. The check is what `ssh` does with `StrictHostKeyChecking=yes`: a
     * host the file does not mention is refused, so is one recorded with another
     * key, and so is a key a `@revoked` line names. Plain, `[host]:port` and
     * hashed entries are read; a line that cannot be read fails the connection
     * rather than being skipped.
     *
     * A port other than 22 is recorded as `[host]:port`, which is what
     * `ssh-keyscan -p` writes: an entry for port 22 does not vouch for the query
     * port.
     */
    readonly knownHosts: string;
    /** Left out: `knownHosts` is the policy, and a second one would not say which decides. */
    readonly hostKey?: never;
    /** Left out: `knownHosts` is the policy, and a second one would not say which decides. */
    readonly insecureIgnoreHostKey?: never;
}
/**
 * How the server's host key is checked: exactly one of `hostKey`, `knownHosts`
 * and `insecureIgnoreHostKey`.
 *
 * There is no default, and a missing or doubled choice does not compile. The
 * query login is a credential, normally `serveradmin`'s, and a client that
 * accepts any key hands it to whatever answers the port. The same rule is
 * checked when the program runs, for callers that are not type checked.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export type SshHostKeyPolicy = SshHostKeyCallbackPolicy | SshKnownHostsPolicy | SshInsecureHostKeyPolicy;
/**
 * The address and the login of a server this transport dials itself: the part
 * of {@link SshDialOptions} that is not the host key policy.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface SshDialTarget {
    /** The server's host. */
    readonly host: string;
    /** The SSH query port; 10022 by default. */
    readonly port?: number | undefined;
    /** The query login name, such as `serveradmin`. */
    readonly username: string;
    /** The query login's password. */
    readonly password: string;
    /** Left out: a login with a name and a password is not a guest's. */
    readonly guest?: never;
    /** Left out: a connection of your own is {@link SshSuppliedConnectionOptions}. */
    readonly connection?: never;
}
/**
 * The address of a server to connect to as its `guest` account: TeamSpeak 6
 * beta13 and later accept the SSH user `guest` without a password, and run it
 * with the Guest Server Query group's permissions.
 *
 * Connecting as a guest is a choice that is made out loud: a missing
 * `username` or `password` in {@link SshDialTarget} is an error and never
 * becomes a guest connection. The host key is still checked, by the same
 * policy: a guest's answers are only as good as the server they come from.
 *
 * What a guest may do is the server's to say. On beta13.1, `version` and
 * `whoami` answer, `serverinfo` and the like are refused with 2568, and
 * `servernotifyregister` is the Guest group's permission to give or withhold,
 * so pass `events: false` to a `QueryClient` that should not register for any.
 * A server that offers no guest access (TeamSpeak 3 has none, and TeamSpeak 6
 * can be started with `--query-ssh-allow-guest=0`) fails the login, which a
 * `QueryClient` reports as a `GuestAccessError` whose `cause` is the
 * {@link QueryAuthError}.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface SshGuestTarget {
    /** The server's host. */
    readonly host: string;
    /** The SSH query port; 10022 by default. */
    readonly port?: number | undefined;
    /** Only `true` is a value: log in as `guest`, with no password. */
    readonly guest: true;
    /** Left out: a guest logs in as `guest`. */
    readonly username?: never;
    /** Left out: a guest has no password. */
    readonly password?: never;
    /** Left out: a connection of your own is {@link SshSuppliedConnectionOptions}. */
    readonly connection?: never;
}
/**
 * Connect to a server this transport dials itself: with a login, and with a
 * host key policy. The usual way, and the one to use unless you already hold a
 * connected SSH client.
 *
 * It is {@link SshHostKeyPolicy} together with the address and the login, so
 * leaving the policy out is a type error that names the three ways to give one.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export type SshDialOptions = (SshDialTarget | SshGuestTarget) & SshHostKeyPolicy;
/**
 * Use an SSH client you made and connected yourself, or a factory for one:
 * authenticated through an agent, a jump host or a key file this transport
 * knows nothing about.
 *
 * Only a shell is opened on it, so no login and no host key policy are taken:
 * the client you supply has done both already, and an option nothing would
 * read is a type error rather than something that could suggest the key was
 * verified here. The host and port are the server's identity, for messages.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface SshSuppliedConnectionOptions {
    /** The server's host, for identity and messages: nothing is dialled. */
    readonly host: string;
    /** The server's SSH query port, for identity and messages; 10022 by default. */
    readonly port?: number | undefined;
    /**
     * The SSH client to use, or a factory for one. A client that is already
     * connected skips the handshake; a factory is asked for one per connection
     * attempt, which a reconnection needs.
     *
     * Deliberately narrow, so a later release can widen it without breaking an
     * implementation written today. Its host key is checked by whoever made it.
     */
    readonly connection: SshConnection;
    /** Left out: the supplied client is authenticated already. */
    readonly guest?: never;
    /** Left out: the supplied client is authenticated already. */
    readonly username?: never;
    /** Left out: the supplied client is authenticated already. */
    readonly password?: never;
    /** Left out: the supplied client's host key is checked by whoever made it. */
    readonly hostKey?: never;
    /** Left out: the supplied client's host key is checked by whoever made it. */
    readonly knownHosts?: never;
    /** Left out: the supplied client's host key is checked by whoever made it. */
    readonly insecureIgnoreHostKey?: never;
}
/**
 * How a ServerQuery over SSH is reached, without the cancellation: one of
 * {@link SshDialOptions} and {@link SshSuppliedConnectionOptions}.
 *
 * What a `QueryClient`'s `ssh` transport is built from, so that the two cannot
 * drift apart.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export type SshConnectOptions = SshDialOptions | SshSuppliedConnectionOptions;
/**
 * Where a ServerQuery over SSH listens, who logs in, and how the server's host
 * key is checked.
 *
 * One of two shapes. The usual one, {@link SshDialOptions}, takes the host, the
 * login and exactly one of `hostKey`, `knownHosts` and `insecureIgnoreHostKey`:
 * there is no default, because the login is a credential and a client that
 * accepts any key hands it to whatever answers the port. The other,
 * {@link SshSuppliedConnectionOptions}, takes an SSH client you connected
 * yourself, and no login or policy.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export type SshOptions = SshConnectOptions & {
    /** Abandons the connection attempt. */
    readonly signal?: AbortSignal | undefined;
};
/** How the host key is to be decided, once the options have been read. */
export type HostKeyDecision = {
    readonly kind: "verifier";
    readonly verify: SshHostKeyVerifier;
} | {
    readonly kind: "knownHosts";
    readonly path: string;
} | {
    readonly kind: "insecure";
}
/** The caller supplied the connection, so the key was theirs to check. */
 | {
    readonly kind: "connection";
};
/**
 * What the decision reads. Every member is `unknown`: the types of
 * {@link SshOptions} already make a wrong combination a compile error, and this
 * is for the callers they do not reach, a JavaScript program or an `as` cast.
 */
export interface SshChoice {
    readonly hostKey?: unknown;
    readonly knownHosts?: unknown;
    readonly insecureIgnoreHostKey?: unknown;
    readonly connection?: unknown;
    readonly username?: unknown;
    readonly password?: unknown;
    readonly guest?: unknown;
}
/**
 * Read the trust decision out of the options, or refuse them.
 *
 * Fails closed: with none of the three there is no policy, and this throws
 * rather than choose one. Two is a `TypeError`, since a caller who passed both
 * has not decided which is authoritative. Runs when a client is built as well
 * as when it connects, so a missing decision is heard about before the first
 * attempt.
 *
 * The same rule as the types state, for the callers they do not reach.
 */
export declare function hostKeyDecision(options: SshChoice): HostKeyDecision;
/**
 * Open a ServerQuery over SSH.
 *
 * SSH logs in itself, so there is no `login` command to send afterwards: the
 * session is already the query account, and only `use` is left.
 *
 * The server's host key is checked first, by whichever of `hostKey`,
 * `knownHosts` and `insecureIgnoreHostKey` was given, and the password is sent
 * only to a server whose key was accepted. With none of them, or with two,
 * this rejects before anything is opened or dialled.
 */
export declare function connectSsh(options: SshOptions): Promise<StreamTransport>;
//# sourceMappingURL=ssh.d.ts.map