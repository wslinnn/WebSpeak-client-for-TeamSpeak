import { readFile } from "node:fs/promises";
import { MissingDependencyError, QueryAuthError, SshHostKeyError } from "./errors.js";
import { KnownHosts, fingerprintOf, keyTypeOf } from "./knownhosts.js";
import { StreamTransport } from "./stream.js";
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
export function hostKeyDecision(options) {
    const { hostKey, knownHosts, insecureIgnoreHostKey, connection, username, password, guest } = options;
    if (hostKey !== undefined && typeof hostKey !== "function") {
        throw new TypeError("hostKey is a function that throws to refuse a host key");
    }
    if (knownHosts !== undefined && (typeof knownHosts !== "string" || knownHosts === "")) {
        throw new TypeError("knownHosts is the path of a known_hosts file");
    }
    if (insecureIgnoreHostKey !== undefined && insecureIgnoreHostKey !== true) {
        throw new TypeError("insecureIgnoreHostKey is `true` or left out: it is a decision, not a switch to set to false");
    }
    const given = [];
    if (hostKey !== undefined)
        given.push("hostKey");
    if (knownHosts !== undefined)
        given.push("knownHosts");
    if (insecureIgnoreHostKey !== undefined)
        given.push("insecureIgnoreHostKey");
    if (given.length > 1) {
        throw new TypeError(`${given.join(", ")} were given together; exactly one of hostKey, knownHosts and insecureIgnoreHostKey decides whether the host key is accepted`);
    }
    if (connection !== undefined) {
        if (given.length > 0) {
            throw new TypeError(`${given[0]} has no effect with connection, which makes the connection itself: its host key is checked by whoever made it`);
        }
        if (username !== undefined || password !== undefined || guest !== undefined) {
            throw new TypeError("username, password and guest have no effect with connection, which is authenticated already: nothing would send them");
        }
        return { kind: "connection" };
    }
    if (hostKey !== undefined)
        return { kind: "verifier", verify: hostKey };
    if (knownHosts !== undefined)
        return { kind: "knownHosts", path: knownHosts };
    if (insecureIgnoreHostKey !== undefined)
        return { kind: "insecure" };
    throw new Error("the SSH host key has to be checked, and none of hostKey, knownHosts or insecureIgnoreHostKey was given: a query login is a credential, normally serveradmin's, and this client will not send it to a host it has not verified");
}
/**
 * `ssh2`, or a `MissingDependencyError` naming it. Loaded on demand: it is an
 * optional peer dependency, so importing it at the top of this module would
 * make it a requirement of the whole entry point — including the TCP and
 * WebQuery transports, which need nothing but Node.
 */
async function loadSsh2() {
    try {
        return await import("ssh2");
    }
    catch (error) {
        if (typeof error === "object" &&
            error !== null &&
            error.code === "ERR_MODULE_NOT_FOUND") {
            throw new MissingDependencyError();
        }
        throw error;
    }
}
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
export async function connectSsh(options) {
    const { host, port = 10022, signal, connection } = options;
    const decision = hostKeyDecision(options);
    // The login is read only where this module dials: a supplied client is
    // authenticated already. Checked here, so a missing one fails before ssh2 is
    // loaded or anything is opened.
    const login = connection === undefined ? loginOf(options) : undefined;
    signal?.throwIfAborted();
    const verify = await verifierFor(decision, host, port);
    const ssh = await clientFor(connection);
    signal?.throwIfAborted();
    // What the caller's check said, so that the failure ssh2 reports for a
    // refused key can be told from any other and carry the reason.
    let refusal;
    return new Promise((resolve, reject) => {
        let settled = false;
        const failed = (error) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            reject(error);
        };
        const onAbort = () => {
            ssh.end();
            failed(signal.reason);
        };
        const onAuthError = (error) => {
            if (refusal !== undefined) {
                failed(new SshHostKeyError(host, port, `the SSH host key of ${host}:${port} was not accepted, so no login was sent: ${refusal.message}`, { cause: refusal }));
                return;
            }
            // ssh2 reports a refused credential through `level`, which its types do
            // not name; a wrong password is the one that leaves the client unable to
            // authenticate rather than unable to reach the server.
            const level = error.level;
            failed(level === "client-authentication"
                ? new QueryAuthError(login.username, `SSH authentication failed for ${login.username}`, { cause: error })
                : error);
        };
        const openShell = () => {
            ssh.shell(false, (error, channel) => {
                if (error) {
                    ssh.end();
                    failed(error);
                    return;
                }
                ssh.off("error", onAuthError);
                settled = true;
                signal?.removeEventListener("abort", onAbort);
                // `ssh2` reports a failure after the handshake on the connection, and the
                // stream closes with it.
                ssh.on("error", (failure) => channel.emit("error", failure));
                channel.once("close", () => ssh.end());
                resolve(new StreamTransport(channel, () => ssh.end(), {
                    transport: "ssh",
                    address: `${login === undefined ? "" : `${login.username}@`}${host}:${port}`,
                }));
            });
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        if (connection !== undefined) {
            // A client the caller handed over is one they say is connected, and one
            // from their own factory is dialled on their terms: neither is connected
            // here, and neither can be a wrong credential this module knows of.
            openShell();
            return;
        }
        ssh.once("error", onAuthError);
        ssh.once("ready", openShell);
        ssh.connect({
            host,
            port,
            // Set exactly when `connection` is not, and this is the dial path.
            username: login.username,
            // Left out for a guest, so ssh2 offers no password at all.
            ...(login.password === undefined ? {} : { password: login.password }),
            readyTimeout: 10_000,
            hostVerifier: (blob) => {
                const outcome = decide(verify, host, port, blob);
                if (outcome !== undefined)
                    refusal = outcome;
                return outcome === undefined;
            },
        });
    });
}
/**
 * Who logs in: the name and password given, or `guest` with none when
 * `guest: true` says so. Missing credentials are an error, never a guest.
 */
function loginOf(options) {
    if (options.guest !== undefined) {
        if (options.guest !== true) {
            throw new TypeError("guest is `true` or left out: it is a decision, not a switch");
        }
        if (options.username !== undefined || options.password !== undefined) {
            throw new TypeError("username and password were given with guest; a guest logs in as `guest` with no password");
        }
        return { username: "guest", password: undefined };
    }
    const hint = "; to connect without a login, as a guest, set guest to true";
    const username = nonEmptyString(options.username, "username", hint);
    // Measured on TeamSpeak 6 6.0.0-beta13.1: the user `guest` logs in as a guest
    // whatever password it is given, the administrator's included, so a password
    // sent with it is silently ignored and the access is not the account's. The
    // server matches the name exactly: `GUEST` is refused.
    if (username === "guest") {
        throw new TypeError('"guest" is the server\'s guest user, which takes no password; to connect as a guest, set guest to true');
    }
    return { username, password: nonEmptyString(options.password, "password", hint) };
}
function nonEmptyString(value, name, hint = "") {
    if (typeof value !== "string" || value === "")
        throw new TypeError(`${name} is a non-empty string${hint}`);
    return value;
}
/**
 * The check the options chose, ready to run: the caller's own, one over the
 * `known_hosts` file read now, or the one that accepts anything.
 *
 * A file that cannot be read or parsed is a failure to verify, and ends the
 * connection as a refused key does.
 */
async function verifierFor(policy, host, port) {
    if (policy.kind === "verifier")
        return policy.verify;
    // `connection` never reaches a handshake of ours, so for it this is not asked.
    if (policy.kind !== "knownHosts")
        return () => { };
    let hosts;
    try {
        hosts = KnownHosts.parse(await readFile(policy.path, "utf8"), policy.path);
    }
    catch (error) {
        throw new SshHostKeyError(host, port, `the host key of ${host}:${port} cannot be checked: ${error.message}`, { cause: error });
    }
    return (key) => hosts.verify(key);
}
/**
 * Run the check on the key ssh2 found, returning why it was refused, or
 * `undefined` for a key it accepted.
 *
 * Everything that is not a plain return counts as a refusal: a throw, naturally,
 * but also an answer. A check that returns `false` was written in ssh2's
 * convention and means no; one that returns `true` means yes in that
 * convention, and a promise means whatever it later settles to. None of those
 * is the contract, and acting on a guess at which was meant is how a refused key
 * gets through, so each fails closed and says what to write instead.
 */
function decide(verify, host, port, blob) {
    try {
        const key = new Uint8Array(blob);
        const answer = verify({
            host,
            port,
            keyType: keyTypeOf(key),
            key,
            fingerprint: fingerprintOf(key),
        });
        if (answer === undefined)
            return undefined;
        // A rejection nobody awaits would otherwise surface as an unhandled one.
        if (typeof answer.then === "function") {
            void Promise.resolve(answer).catch(() => { });
        }
        return new TypeError("the hostKey check returned a value; it has to return nothing to accept the key and throw to refuse it, and be synchronous");
    }
    catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }
}
/** The client to talk over: the caller's, their factory's, or a fresh `ssh2`. */
async function clientFor(connection) {
    if (typeof connection === "function")
        return connection();
    if (connection !== undefined)
        return connection;
    const { Client } = await loadSsh2();
    return new Client();
}
//# sourceMappingURL=ssh.js.map