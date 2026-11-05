import {} from "./types.js";
import { ConnectPhase } from "./trace.js";
import { callHook } from "./hooks.js";
import { puzzleOf } from "./handshake/crypt-handshake.js";
import { asChannelID, asClientID, AlreadyConnectedError, backoffDelay, ClientStatus, ErrorCode, Reason, TeamspeakError, noopLogger, } from "@honeybbq/teamspeak";
import { HandshakeError, RemovedError } from "./errors.js";
import { abortable, abortReason } from "./abort.js";
import { Crypt } from "./crypto/index.js";
import { RESOLVE_BUDGET_MS, Resolver } from "./discovery/resolver.js";
import { PacketHandler } from "./transport/handler.js";
import { PacketType } from "./transport/packet.js";
import { CommandTracker, appendReturnCode } from "./commands.js";
import { buildCommand, buildCommandChain, encodeRequest, floodHoldMs, FLOOD_RETRIES, floodRetryDelayMs, parseServerError, resolveBackoffPolicy, } from "../core/internal.js";
import { uploadFileData, downloadFileData } from "./transfer.js";
import { buildSetConnectionInfo } from "./connection-info.js";
import { buildEventChain } from "./events.js";
import { processInit1 } from "./handshake/crypt-handshake.js";
import { handleHandshakeInitIV, handleHandshakeExpand2, defaultClientVersion, handleInitServer, prepareClientPassword, } from "./handshake.js";
import { handleNotification } from "../core/internal.js";
import { parseChannel, parseChannelGroup, parseCommand, parseServerGroup, parseUint16, } from "../core/internal.js";
import { CommandThrottle } from "./throttle.js";
import { splitCommandRows, sleep } from "../core/internal.js";
import { isAutoNicknameMatch } from "./helpers.js";
import { CommandTimeoutError, NotConnectedError } from "@honeybbq/teamspeak";
import { responseSpec } from "../core/internal.js";
import { unknownServerCapabilities } from "./capabilities.js";
import { joinHostPort, parseConnectAddress, splitHostPort } from "./address.js";
import { commandChannel, incomingChannel } from "./diagnostics.js";
import { defaultShouldRetry } from "./reconnect.js";
import { ViewStore } from "./view.js";
/** The signature is Ed25519, 64 bytes; the server verifies it, so only its shape is checked. */
function normalizeClientVersion(version) {
    if (version === undefined)
        return defaultClientVersion;
    const { platform, version: text, sign } = version;
    for (const [name, value] of [
        ["platform", platform],
        ["version", text],
        ["sign", sign],
    ]) {
        if (typeof value !== "string" || value === "") {
            throw new TypeError(`a client version's ${name} is a non-empty string`);
        }
    }
    const raw = Buffer.from(sign, "base64");
    if (raw.length !== 64 || raw.toString("base64") !== sign) {
        throw new RangeError("a client version's sign is the base64 of a 64-byte signature");
    }
    return { platform, version: text, sign };
}
function normalizeClientInitOptions(options) {
    return {
        serverPasswordHash: prepareClientPassword(options.serverPassword ?? ""),
        defaultChannel: options.defaultChannel ?? "",
        defaultChannelPasswordHash: prepareClientPassword(options.defaultChannelPassword ?? ""),
        privilegeKey: options.privilegeKey ?? "",
        metaData: options.metaData ?? "",
        version: normalizeClientVersion(options.version),
    };
}
let internalsOf;
let sentLineHook;
/**
 * Observe every command line the client sends, as encoded. A seam for the
 * package's own tests; not exported from the package.
 *
 * @internal
 */
export function onSentLine(hook) {
    sentLineHook = hook;
}
/** @internal The internals of `client`. */
export function clientInternals(client) {
    return internalsOf(client);
}
/** How long a command waits for its answer unless told otherwise. */
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
/**
 * How long `disconnect()` waits for the server to acknowledge its goodbye
 * unless told otherwise: the acknowledgement is a courtesy, and a connection
 * that has already died would otherwise hold it for a full command timeout.
 */
const DISCONNECT_TIMEOUT_MS = 1_000;
/** How long each reconnection attempt may take. */
const RECONNECT_ATTEMPT_TIMEOUT_MS = 30_000;
/** What an attempt is waiting for now, for the report of an attempt that ended. */
function describeWaiting(trace, clientEkPending) {
    if (trace.phase === ConnectPhase.Open) {
        return trace.target === "" ? "the server address to resolve" : "the connection to open";
    }
    if (trace.phase === ConnectPhase.Join) {
        return clientEkPending
            ? "the server's answer to clientek"
            : "the server's answer to clientinit";
    }
    if (trace.stage === "puzzleSolving")
        return "the RSA puzzle to be solved";
    if (trace.stage === "puzzleAnswered")
        return "the server's answer to the RSA puzzle";
    return trace.init1Step < 0
        ? "the server's first answer to init1"
        : `the server's init1 step after step ${trace.init1Step}`;
}
/** The `initserver` parameters a trace never sees, because they could carry a secret. */
const SECRET_INITSERVER_PARAMS = new Set([
    "client_server_password",
    "client_default_channel_password",
    "client_default_token",
    "client_key_offset",
]);
function newConnectAttempt() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    // The failure is reported to whoever awaits connect(); an attempt nobody
    // awaits any more must not surface as an unhandled rejection.
    promise.catch(() => { });
    const controller = new AbortController();
    const attempt = {
        promise,
        signal: controller.signal,
        settled: false,
        trace: undefined,
        onFail: undefined,
        resolve() {
            if (attempt.settled)
                return;
            attempt.settled = true;
            resolve();
        },
        reject(error) {
            if (attempt.settled)
                return;
            attempt.settled = true;
            attempt.onFail?.(error);
            controller.abort(error);
            reject(error);
        },
        rejectAfter(error, until) {
            if (attempt.settled)
                return;
            attempt.settled = true;
            attempt.onFail?.(error);
            controller.abort(error);
            void until.finally(() => reject(error));
        },
    };
    return attempt;
}
/**
 * Voice deliveries are dropped while more than this many deliveries of any
 * kind are waiting: audio is fifty packets a second per speaker, and a
 * listener that cannot keep up would otherwise queue it without bound.
 */
const MAX_PENDING_DELIVERIES = 256;
/** How often dropped voice is reported, at most. */
const VOICE_DROP_WARN_INTERVAL_MS = 10_000;
/** The only commands handled before crypto init completes. */
const PRE_INIT_COMMANDS = new Set(["clientinitiv", "initivexpand2", "error"]);
/**
 * A TeamSpeak client over the voice protocol.
 *
 * Listeners run one at a time, in the order their events arrived, after the
 * packet that carried them has been handled, so a listener may call the client
 * and await an answer.
 */
export class Client {
    static {
        internalsOf = (client) => client.#internals;
    }
    #crypt;
    #handler;
    #logger;
    /**
     * The nickname the server reports for this client now. It differs from
     * `#requestedNickname` when the server renamed the client, because the
     * requested one was taken or an admin edited it.
     */
    #nickname;
    /**
     * The nickname the caller asked for: the constructor's, or the one a
     * `clientupdate` of this client's own last changed. Every connection attempt
     * sends it, so a server-assigned "bot1" is not asked for again after a drop.
     */
    #requestedNickname;
    #clid = 0;
    /**
     * What the server reported about itself in initserver, including the UID
     * hash it uses: TS3 hashes the public key with SHA-1 and TS6 with SHA-256.
     */
    #capabilities = unknownServerCapabilities();
    #internals;
    #identity;
    #addr;
    #resolver;
    #clientInitOptions;
    #socketFactory;
    #fileTransferSocketFactory;
    /** A copy of the caller's trace, so changing theirs later changes nothing. */
    #trace;
    /** The session in progress, for its `sessionEnd`; cleared when that has been reported. */
    #session;
    /** Undefined when the client does not reconnect. */
    #reconnectOptions;
    /**
     * Set while a reconnect attempt is in flight, so overlapping failures do not
     * start competing loops.
     */
    #reconnecting = false;
    /** The reconnect loop's latest attempt; 0 while it has made none. */
    #loopAttempt = 0;
    /** The last answer of `shouldRetry`, so that one failure asks it once. */
    #retryAnswer;
    /**
     * Why the last established session dropped: a reconnect loop whose own
     * attempt connected and then dropped before the loop resumed retries for it.
     */
    #lastDrop;
    /** Set by an explicit disconnect(), which must never be undone by a retry. */
    #stopped = false;
    /**
     * The goodbye of a disconnect() still in progress, which a connect() waits
     * for: tearing the old session down after a new one has started would end
     * the new one instead.
     */
    #leaving;
    /** Ends a disconnect()'s wait for its goodbye to be answered, while it waits. */
    #goodbyeAnswered;
    /** How many times disconnect() was called, so a waiting connect() sees one. */
    #disconnects = 0;
    /**
     * Settles once the last queued `disconnected` has been delivered. A
     * connect() waits for it, so the end of one session is never heard during
     * the next: not by a listener added for the new session, and not by an
     * events() iterator started for it.
     */
    #disconnectedDelivered;
    /** Cuts short the reconnect loop's wait, on disconnect(). */
    #stopReconnecting;
    #status = ClientStatus.Disconnected;
    #throttle = new CommandThrottle();
    #cmdTrack = new CommandTracker(() => this.#clid);
    #viewStore;
    #clients;
    #attempt = newConnectAttempt();
    #listeners = new Map();
    /** Deliveries waiting for their turn; see #emit. */
    #queue = [];
    #draining = false;
    /** The group list rows of the command line being handled, by the name of the line. */
    #groupLine;
    #voiceDropped = 0;
    #voiceDropTimer;
    #sessionCount = 0;
    #voiceDropWarnedAt = -Infinity;
    #eventMiddlewares;
    #send;
    #eventChain;
    constructor(identity, addr, nickname, options = {}) {
        this.#identity = identity;
        this.#addr = addr;
        this.#nickname = nickname;
        this.#requestedNickname = nickname;
        this.#logger = options.logger ?? noopLogger;
        this.#resolver = options.resolver ?? new Resolver({ nicknameLookup: options.nicknameLookup });
        this.#clientInitOptions = normalizeClientInitOptions(options);
        this.#socketFactory = options.socketFactory;
        this.#fileTransferSocketFactory = options.fileTransferSocketFactory;
        // Refused here, not when the loop first runs: a bad policy would flood.
        if (options.reconnect !== undefined)
            resolveBackoffPolicy(options.reconnect);
        this.#reconnectOptions = options.reconnect;
        this.#trace = options.trace === undefined ? undefined : { ...options.trace };
        this.#viewStore = new ViewStore(this.#logger, () => this.#clid, () => this.#scheduleDrain());
        this.#clients = this.#viewStore.roster;
        this.#crypt = new Crypt(identity);
        this.#handler = this.#newHandler();
        // oxlint-disable-next-line no-this-alias -- accessors cannot be arrow functions
        const self = this;
        this.#internals = {
            get crypt() {
                return self.#crypt;
            },
            get handler() {
                return self.#handler;
            },
            get logger() {
                return self.#logger;
            },
            get initOptions() {
                return self.#clientInitOptions;
            },
            get nickname() {
                return self.#nickname;
            },
            set nickname(value) {
                self.#nickname = value;
            },
            get requestedNickname() {
                return self.#requestedNickname;
            },
            get clid() {
                return self.#clid;
            },
            set clid(value) {
                self.#clid = value;
            },
            get clients() {
                return self.#clients;
            },
            get capabilities() {
                return self.#capabilities;
            },
            set capabilities(value) {
                self.#capabilities = value;
            },
            markConnected: (initServer) => this.#markConnected(initServer),
            markHandshakeDone: (serverPublicKey) => this.#markHandshakeDone(serverPublicKey),
            execNoWait: (command) => this.#execNoWait(command, undefined, true),
            handlePacket: (packet) => this.#handlePacket(packet),
        };
        // Built once: the chains are read on every command and event, and
        // changing them while those run would make the behaviour depend on timing.
        const cmdMiddlewares = options.commandMiddleware ?? [];
        this.#eventMiddlewares = options.eventMiddleware ?? [];
        this.#send = buildCommandChain(cmdMiddlewares, (request, commandOptions = {}) => this.#exec(encodeRequest(request, prepareClientPassword), commandOptions, false));
        this.#eventChain = buildEventChain([...this.#eventMiddlewares], (event) => this.#deliver(event.name, event.payload));
    }
    /**
     * What this client knows of the server: the channel tree, the clients it
     * has been told about, and itself. Always there, and `"empty"` until the
     * first `connect()`.
     *
     * @experimental New in 1.x and may change in a minor release.
     */
    get view() {
        return this.#viewStore.view;
    }
    /** Where the client is in its connection's life. */
    get status() {
        return this.#status;
    }
    /**
     * The keepalive ping/pong round trip of the voice connection: the mean and
     * the standard deviation over the last 10 pongs, or `undefined` when the
     * client is not connected or no pong has arrived yet. A ping goes every 5
     * seconds, so the first value comes about 5 seconds after connecting, and
     * each connection, a reconnect included, starts over.
     *
     * It is the value this client reports as `connection_ping` and
     * `connection_ping_deviation` when the server asks for its connection info,
     * and the server keeps what it was told: the ping other clients see for this
     * one is this value as it was when the server last asked, not as it is now
     * (measured on TeamSpeak 3 and 6). A client cannot read its own
     * `connection_ping` from the server: `getconnectioninfo` about itself has no
     * such field.
     */
    get roundTrip() {
        if (this.#status !== ClientStatus.Connected)
            return undefined;
        return this.#handler.roundTrip ?? undefined;
    }
    // ---- Connection -----------------------------------------------------------
    /**
     * Connect to the server. Resolves once the handshake completes.
     *
     * An address that cannot be one — no host, a port outside 1–65535 — rejects
     * with an InvalidAddressError at once, before anything starts. A host name
     * that does not resolve fails the attempt with a TeamspeakError whose
     * `cause` is the lookup's error.
     *
     * A failed attempt rejects with its cause, such as the server's error for a
     * rejected password. Aborting `signal` abandons the attempt and rejects with
     * the signal's reason. The signal bounds only the connecting: once this
     * resolves, the connection lasts until `disconnect()` or a drop.
     * `connect()` does not retry; the `reconnect` option only retries a
     * connection that drops after it was established.
     *
     * Called while a `disconnect()` is still saying goodbye, or while an earlier
     * session's `disconnected` is still waiting to be delivered, this waits for
     * that first, so the old session is closed, and its `disconnected`
     * delivered, before the new one starts: no listener or `events()` iterator
     * of the new session hears the old one end. A `disconnect()` called during
     * that wait wins: this then rejects with a NotConnectedError.
     *
     * `connected` is delivered after this resolves, so a listener added right
     * after `await client.connect()` still hears it.
     */
    async connect(options = {}) {
        return this.#connect(options, 1, false);
    }
    async #connect(options, attemptNumber, reconnect) {
        const { signal } = options;
        signal?.throwIfAborted();
        const disconnects = this.#disconnects;
        if (this.#leaving !== undefined)
            await abortable(this.#leaving, signal);
        while (this.#disconnectedDelivered !== undefined) {
            await abortable(this.#disconnectedDelivered, signal);
        }
        if (this.#disconnects !== disconnects)
            throw new NotConnectedError();
        if (this.#status !== ClientStatus.Disconnected)
            throw new AlreadyConnectedError();
        // Checked before anything changes: an address that can never work leaves
        // the client as it was, with no attempt to announce the end of.
        parseConnectAddress(this.#addr);
        this.#stopped = false;
        this.#resetForConnect();
        this.#status = ClientStatus.Connecting;
        const attempt = this.#attempt;
        const trace = {
            attempt: attemptNumber,
            reconnect,
            startedAt: performance.now(),
            connectStartedAt: 0,
            phase: ConnectPhase.Open,
            target: "",
            sessionStarted: false,
            welcomeDone: false,
            channels: 0,
            stage: "init1",
            init1Step: -1,
        };
        attempt.trace = trace;
        attempt.onFail = (error) => {
            const waitingFor = describeWaiting(trace, this.#handler.clientEkPending);
            this.#logger.info("connection attempt ended", {
                phase: trace.phase,
                waitingFor,
                error: String(error),
            });
            this.#callHook(this.#trace?.attemptFailed, () => ({
                attempt: trace.attempt,
                reconnect: trace.reconnect,
                phase: trace.phase,
                error,
                target: trace.target,
                waitingFor,
                durationMs: performance.now() - trace.startedAt,
            }));
        };
        // The handshake may complete just as the signal fires, in which case
        // #failConnection leaves the session alone and the caller gets the
        // connection it made rather than one it would believe had failed.
        const onAbort = () => this.#failConnection(abortReason(signal));
        signal?.addEventListener("abort", onAbort, { once: true });
        try {
            try {
                this.#callHook(this.#trace?.resolveStart, () => ({
                    attempt: trace.attempt,
                    reconnect: trace.reconnect,
                    addr: this.#addr,
                }));
                const resolveStarted = performance.now();
                const resolution = await this.#resolveAddr(attempt.signal);
                const targetAddr = resolution.target;
                trace.target = targetAddr;
                if (!attempt.settled) {
                    this.#callHook(this.#trace?.resolveDone, () => ({
                        attempt: trace.attempt,
                        reconnect: trace.reconnect,
                        addr: this.#addr,
                        target: targetAddr,
                        source: resolution.source,
                        candidates: resolution.candidates,
                        error: resolution.error,
                        durationMs: performance.now() - resolveStarted,
                    }));
                }
                if (!attempt.settled) {
                    this.#logger.info("connecting to server", { address: targetAddr });
                    trace.connectStartedAt = performance.now();
                    this.#callHook(this.#trace?.connectStart, () => ({
                        attempt: trace.attempt,
                        reconnect: trace.reconnect,
                        target: targetAddr,
                    }));
                }
                if (!attempt.settled) {
                    await this.#handler.connect(targetAddr, attempt.signal);
                    // The socket is open and the first packet is out: a failure from
                    // here to the shared secret is the handshake's.
                    if (trace.phase === ConnectPhase.Open)
                        trace.phase = ConnectPhase.Handshake;
                }
            }
            catch (error) {
                // Without this the client stays Connecting and every later connect()
                // fails with AlreadyConnectedError.
                this.#failConnection(error);
            }
            await attempt.promise;
        }
        finally {
            signal?.removeEventListener("abort", onAbort);
        }
    }
    /**
     * Leave the server and close the connection.
     *
     * Says goodbye first, waiting for the server's acknowledgement for a second
     * at most, or less if `signal` aborts sooner. The goodbye is sent at once,
     * past the flood throttle, and also by a client still connecting whose
     * clientinit is out; commands still waiting for their turn reject with a
     * NotConnectedError and are never sent. The connection is closed
     * either way. A `connect()` still waiting for its handshake rejects with a
     * NotConnectedError, and so do the commands still waiting for an answer.
     * Resolves once `disconnected` has been delivered to the listeners, so one
     * added after `await client.disconnect()` does not hear it. Does nothing on
     * a client that is not connected; called again while an earlier call is
     * still saying goodbye, it waits for that one (and its message is the first
     * call's).
     *
     * `reasonMessage` is what the server tells the other clients who see this
     * one leave, in `clientLeave`'s `reasonMessage` (`reasonmsg` of
     * `clientdisconnect`, sent with `reasonid=8`, `Reason.Disconnect`: measured
     * on TeamSpeak 3 and 6, the server drops the message without it);
     * default `"Shutdown"`.
     */
    async disconnect(options = {}) {
        // Recorded before anything else: a dropped socket during the goodbye below
        // must not be mistaken for an outage worth retrying.
        this.#stopped = true;
        this.#disconnects++;
        this.#stopReconnecting?.abort();
        if (this.#leaving !== undefined)
            return this.#leaving;
        // Already ended, by a drop or a failed attempt: its `disconnected` may
        // still be on its way.
        if (this.#status === ClientStatus.Disconnected)
            return this.#disconnectedDelivered;
        // The server may hold a session for this client from the moment clientinit
        // is out, which is as soon as the keys exist, well before Connected.
        const holdsSession = this.#status === ClientStatus.Connected ||
            (this.#status === ClientStatus.Connecting && this.#crypt.cryptoInitComplete);
        this.#status = ClientStatus.Disconnected;
        // Whatever still waits for its turn is rejected and never sent; the
        // goodbye does not wait for one.
        this.#throttle.rejectAll(new NotConnectedError());
        let left;
        this.#attempt.rejectAfter(new NotConnectedError(), new Promise((r) => (left = r)));
        const leaving = this.#leave(holdsSession, options.signal, options.reasonMessage ?? "Shutdown").finally(left);
        this.#leaving = leaving;
        try {
            await leaving;
        }
        finally {
            this.#leaving = undefined;
        }
    }
    async #leave(holdsSession, signal, reasonMessage) {
        this.#logger.info("disconnecting from server");
        if (holdsSession) {
            this.#callHook(this.#trace?.disconnectStart, () => ({}));
            const goodbyeStarted = performance.now();
            // The server answers clientdisconnect with a notifyclientleftview about
            // this client, and no error line; either one ends the wait. A goodbye
            // that is not answered in time is a courtesy lost: the connection
            // closes regardless.
            const left = new Promise((resolve) => {
                this.#goodbyeAnswered = () => resolve(true);
            });
            // On the internal path: the status already says Disconnected.
            const answered = this.#exec(buildCommand("clientdisconnect", {
                reasonid: String(Reason.Disconnect),
                reasonmsg: reasonMessage,
            }), { signal, timeoutMs: DISCONNECT_TIMEOUT_MS }, true, true).then(() => true, () => false);
            const acknowledged = await Promise.race([answered, left]);
            this.#goodbyeAnswered = undefined;
            this.#callHook(this.#trace?.disconnectDone, () => ({
                acknowledged,
                durationMs: performance.now() - goodbyeStarted,
            }));
        }
        this.#handler.close();
        this.#cmdTrack.reset(new NotConnectedError());
        this.#endSession(undefined);
        // Announced here; #handleConnectionClosed stays quiet once the status is
        // already Disconnected, so listeners hear about it once.
        await this.#announceDisconnected(undefined, false);
    }
    /** `await using client = …` disconnects when the scope ends. */
    [Symbol.asyncDispose]() {
        return this.disconnect();
    }
    // ---- Commands ------------------------------------------------------------
    /**
     * Send a raw command line and return the rows that answer it: the escape
     * hatch for a command the typed functions do not cover. The line is sent as
     * given, so its values must already be escaped and any channel password
     * already hashed. `CommandName` lists the command names.
     *
     * Rejects with a NotConnectedError unless the client is connected: while it
     * is still connecting, the session's keys may not exist yet.
     *
     * A command the server refuses as flooding (`ErrorCode.ClientIsFlooding`)
     * with a time to wait is sent again after it, and every other command waits
     * too, up to three times and while its timeout allows; the refusal that
     * remains rejects as it is.
     */
    // oxlint-disable-next-line typescript/array-type -- the public API report spells this `[]`; respelling it changes the report
    exec(command, options = {}) {
        return this.#exec(command, options, false);
    }
    /**
     * Send a raw command line without waiting for an answer, for the few
     * commands the server answers with nothing at all. `CommandName` lists
     * the command names.
     *
     * Commands are paced by a flood throttle; aborting `signal` while this waits
     * for its turn rejects with the signal's reason and sends nothing. Rejects
     * with a NotConnectedError unless the client is connected.
     */
    execNoWait(command, options = {}) {
        return this.#execNoWait(command, options.signal, false);
    }
    /**
     * Whether a command may go out now. The handshake's own commands (`internal`)
     * need only an open socket; everything else needs a connected session, so
     * nothing a caller sends can go out under the public dummy key, or after
     * disconnect() has begun saying goodbye.
     */
    #canSend(internal) {
        return this.#handler.isOpen && (internal || this.#status === ClientStatus.Connected);
    }
    async #execNoWait(command, signal, internal) {
        signal?.throwIfAborted();
        if (!this.#canSend(internal))
            throw new NotConnectedError();
        await this.#throttle.wait(signal);
        if (!this.#canSend(internal))
            throw new NotConnectedError();
        this.#sendLine(command);
    }
    /**
     * Send a typed command; this is the CommandExecutor the typed commands run on.
     *
     * The request passes through the `commandMiddleware` first. Channel
     * passwords are then hashed, because that is this protocol's rule: the voice
     * protocol expects `base64(sha1(password))`, where ServerQuery takes the
     * password itself.
     */
    // oxlint-disable-next-line typescript/array-type -- the public API report spells this `[]`; respelling it changes the report
    send(request, options = {}) {
        return this.#send(request, options);
    }
    #sendLine(line) {
        const hook = sentLineHook;
        if (hook)
            hook(this, line);
        this.#handler.sendPacket(PacketType.Command, Buffer.from(line), 0);
    }
    #exec(command, options, internal, goodbye = false) {
        if (!commandChannel.hasSubscribers) {
            return this.#execUntraced(command, options, internal, goodbye);
        }
        const trace = {
            command: parseCommand(command)?.name ?? "",
            client: this,
        };
        return commandChannel.tracePromise(() => this.#execUntraced(command, options, internal, goodbye), trace);
    }
    async #execUntraced(command, options, internal, goodbye) {
        const { signal, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, onSent } = options;
        signal?.throwIfAborted();
        // A command sent on no socket used to vanish and surface 10 seconds later
        // as a timeout, which reads like a slow server rather than a usage error.
        if (!this.#canSend(internal))
            throw new NotConnectedError();
        // Which notifications answer this command, and — for answers that arrive
        // after the `error` — the request field they echo back.
        const parsed = parseCommand(command);
        const spec = responseSpec(parsed?.name ?? "");
        const key = spec?.correlated?.key;
        const correlation = key === undefined ? undefined : parsed?.params[key];
        const echo = spec?.echoKey === undefined ? undefined : parsed?.params[spec.echoKey];
        let [rc, answered] = this.#cmdTrack.register(spec, correlation, echo);
        const deadline = performance.now() + timeoutMs;
        let timer;
        let onAbort;
        // Started before the throttle: the timeout bounds the whole command, its
        // wait for a turn included, and so does the signal.
        const givenUp = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new CommandTimeoutError(parsed?.name ?? "")), timeoutMs);
            onAbort = () => reject(abortReason(signal));
            signal?.addEventListener("abort", onAbort, { once: true });
        });
        givenUp.catch(() => { });
        const throttleAbort = new AbortController();
        try {
            for (let refused = 0;; refused++) {
                const withRc = appendReturnCode(command, rc);
                // The goodbye of a disconnect goes out at once: queued behind other
                // commands it would not leave in time, and the server would keep the
                // session.
                if (!goodbye)
                    await Promise.race([this.#throttle.wait(throttleAbort.signal), givenUp]);
                if (!this.#canSend(internal))
                    throw new NotConnectedError();
                this.#sendLine(withRc);
                if (refused === 0)
                    onSent?.();
                const result = await Promise.race([answered, givenUp]);
                // Refused as flooding with a time to wait, which the command can
                // afford: nothing is sent until then, and the command, which the
                // server did not run, goes out again.
                const wait = result.err ? floodRetryDelayMs(result.err) : undefined;
                const hold = wait === undefined ? undefined : floodHoldMs(wait);
                if (hold !== undefined &&
                    !goodbye &&
                    refused < FLOOD_RETRIES &&
                    hold < deadline - performance.now()) {
                    this.#logger.debug("the server asked for a pause", {
                        command: parsed?.name,
                        waitMs: wait,
                    });
                    this.#throttle.hold(hold);
                    this.#cmdTrack.unregister(rc);
                    [rc, answered] = this.#cmdTrack.register(spec, correlation, echo);
                    continue;
                }
                if (result.err)
                    throw result.err;
                // The server took the rename, so it is what this client now asks for.
                if (!internal && parsed?.name === "clientupdate") {
                    const renamed = parsed.params["client_nickname"];
                    if (renamed !== undefined)
                        this.#requestedNickname = renamed;
                }
                return result.data;
            }
        }
        finally {
            // A command given up while it waited for its turn gives the turn back.
            throttleAbort.abort();
            // Cleared, not left to fire: a pending timer keeps the process alive for
            // the full timeout after the last command has long been answered.
            clearTimeout(timer);
            if (onAbort)
                signal?.removeEventListener("abort", onAbort);
            this.#cmdTrack.unregister(rc);
        }
    }
    // ---- Events --------------------------------------------------------------
    /**
     * Listen for an event. Returns a function that removes the listener.
     *
     * The event is named by an {@link EventName} constant or by its string, and
     * the listener's payload type follows from it:
     *
     * ```ts
     * client.on(EventName.TextMessage, (message) => console.log(message.message));
     * ```
     *
     * A listener that throws does not stop the others: the rest of the event's
     * listeners, and the events after it, are still delivered, and the exception
     * is rethrown on its own, from a microtask, so it surfaces as an
     * `uncaughtException` just as an EventEmitter listener's would. An async
     * listener's rejection is not caught, and surfaces as an unhandled
     * rejection.
     */
    on(event, listener) {
        const subscription = {
            listener: listener,
            removed: false,
        };
        // A new array rather than an edit in place: a delivery may be iterating
        // over the old one.
        this.#listeners.set(event, [...(this.#listeners.get(event) ?? []), subscription]);
        const unsubscribe = () => {
            if (subscription.removed)
                return;
            subscription.removed = true;
            const list = this.#listeners.get(event) ?? [];
            this.#listeners.set(event, list.filter((s) => s !== subscription));
        };
        return Object.assign(unsubscribe, { [Symbol.dispose]: unsubscribe });
    }
    /** Listen for the next occurrence of an event only. */
    once(event, listener) {
        const unsubscribe = this.on(event, ((payload) => {
            unsubscribe();
            listener(payload);
        }));
        return unsubscribe;
    }
    /**
     * An event as an async iterator, for `for await`:
     *
     * ```ts
     * for await (const message of client.events("textMessage", { signal })) { … }
     * ```
     *
     * Events that arrive while the loop body runs are buffered, so none is
     * missed. The buffer is unbounded: an iterator that is not consumed as fast
     * as events arrive holds every one of them in memory until it is read, so
     * stop iterating (or abort `signal`) when you stop reading. Voice is the
     * exception: at most 256 `voiceData` frames are buffered, and when it is
     * full the OLDEST frame is dropped for each one that arrives, because for
     * live audio the newest is the one still worth playing. The iterator's
     * `dropped` counts them.
     *
     * Iteration ends when the loop exits early (`break`, `return`, a throw), and
     * — for every event but `disconnected` — when the client disconnects. When
     * `signal` aborts, listening stops at once, whatever is buffered is
     * discarded, and the pending and every later `next()` reject with the
     * signal's reason, as `events.on` in Node does.
     *
     * `next()` may be called again before an earlier call has settled; the calls
     * are answered in order.
     */
    events(event, options = {}) {
        const { signal } = options;
        let dropped = 0;
        const buffered = [];
        // The next() calls waiting for an event, oldest first.
        const waiting = [];
        let ended = false;
        let aborted = false;
        const finishWaiting = () => {
            for (const waiter of waiting.splice(0)) {
                waiter.resolve({ value: undefined, done: true });
            }
        };
        const stopListening = this.on(event, ((payload) => {
            if (ended)
                return;
            const waiter = waiting.shift();
            if (waiter) {
                waiter.resolve({ value: payload, done: false });
                return;
            }
            if (event === "voiceData" && buffered.length >= MAX_PENDING_DELIVERIES) {
                buffered.shift();
                dropped++;
                this.#dropVoice();
            }
            buffered.push(payload);
        }));
        // Ends after what is already buffered, which arrived before the disconnect.
        const stopOnDisconnect = event === "disconnected"
            ? undefined
            : this.on("disconnected", () => {
                cleanup();
                finishWaiting();
            });
        const cleanup = () => {
            ended = true;
            stopListening();
            stopOnDisconnect?.();
            signal?.removeEventListener("abort", abort);
        };
        const abort = () => {
            aborted = true;
            buffered.length = 0;
            cleanup();
            const reason = abortReason(signal);
            for (const waiter of waiting.splice(0))
                waiter.reject(reason);
        };
        if (signal?.aborted)
            abort();
        else
            signal?.addEventListener("abort", abort, { once: true });
        const iterator = {
            get dropped() {
                return dropped;
            },
            next() {
                if (aborted)
                    return Promise.reject(abortReason(signal));
                if (buffered.length > 0)
                    return Promise.resolve({ value: buffered.shift(), done: false });
                if (ended) {
                    cleanup();
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
            },
            return() {
                buffered.length = 0;
                cleanup();
                finishWaiting();
                return Promise.resolve({ value: undefined, done: true });
            },
            [Symbol.asyncIterator]() {
                return iterator;
            },
        };
        return iterator;
    }
    // ---- API shorthand -------------------------------------------------------
    /**
     * Numbers the sessions this client has completed, from 1; it is 0 before the
     * first. Every connect, and every reconnect, is a new session, even when the
     * server hands out the client id the last one had. `VoiceDataEvent.session`
     * is this at the time the packet arrived.
     */
    get session() {
        return this.#sessionCount;
    }
    /** This client's id on the server, assigned in the handshake; 0 before it. */
    get clientID() {
        return asClientID(this.#clid);
    }
    /**
     * What the connected server is: version, generation, and the uid hash it
     * uses. Read from `initserver`; before connecting the family is `unknown`
     * and the uid hash SHA-1.
     */
    get serverCapabilities() {
        return this.#capabilities;
    }
    /**
     * Our own `client_unique_identifier`, hashed with the algorithm the connected
     * server uses.
     *
     * TS3 uses SHA-1 and TS6 SHA-256, so this reads the algorithm learned during
     * initserver rather than assuming one. Comparing a hard-coded SHA-1 UID to a
     * TS6 server silently never matches.
     */
    get uid() {
        return this.#identity.uid(this.#capabilities.uidAlgorithm);
    }
    /**
     * The host this client connects to, as it was given, without the port: where
     * the file transfer port is, for `uploadFileData` and the avatar and icon
     * helpers.
     */
    get host() {
        return splitHostPort(this.#addr).host;
    }
    /** The channel this client is in, as it last learned; 0 before connecting. */
    get channelID() {
        return this.#clients.get(this.#clid)?.channelID ?? asChannelID(0n);
    }
    /**
     * Send Opus voice directly to clients, to channels, or to both: the
     * packet's direct form. Throws a NotConnectedError unless the client is
     * connected, and a RangeError for no target at all, more than 32 clients,
     * more than 255 channels, or an id the packet cannot hold. Whether a target
     * hears it is the server's decision, from `i_client_whisper_power` against
     * the target's `i_client_needed_whisper_power`. Talk power does not apply to
     * a whisper, but the rest of what decides whether voice is relayed does: see
     * `sendVoice`.
     */
    sendWhisper(data, targets, codec) {
        if (!this.#canSend(false))
            throw new NotConnectedError();
        this.#handler.sendWhisperPacket(data, [...(targets.clients ?? [])], codec, [
            ...(targets.channels ?? []),
        ]);
    }
    /**
     * Send Opus voice to a group of clients: a server group, a channel group,
     * the channel commanders or everyone, within the channels the target's
     * `scope` picks. The packet's group form; `sendWhisper` is the direct one.
     * Throws a NotConnectedError unless the client is connected, and a
     * RangeError for a type, scope or group id the packet cannot hold. Whether
     * a client hears it is the server's decision, as for `sendWhisper`.
     */
    sendGroupWhisper(data, target, codec) {
        if (!this.#canSend(false))
            throw new NotConnectedError();
        const id = "group" in target ? target.group : 0n;
        this.#handler.sendGroupWhisperPacket(data, target.type, target.scope, id, codec);
    }
    /**
     * Send one encoded audio frame to the channel this client is in. An empty
     * frame marks the end of speech: the server relays it, and listeners get a
     * `voiceData` event with empty `data`. Throws a NotConnectedError unless the
     * client is connected.
     *
     * The server relays it only while this client may talk in the channel, its
     * `isTalker` set or its talk power at least the channel's needed talk power,
     * and is not away, input-muted or without input hardware, as it last told
     * the server with `updateClient`; otherwise the frame is dropped without an
     * error. A listener gets it only while it is not output-muted and has
     * output hardware. Subscribing to a channel does not bring its voice.
     * Measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0-beta13.1.
     */
    sendVoice(data, codec, options) {
        // Reserved: VoiceOptions has no fields to read yet.
        void options;
        if (!this.#canSend(false))
            throw new NotConnectedError();
        this.#handler.sendVoicePacket(data, codec);
    }
    // ---- File Transfer -------------------------------------------------------
    /**
     * Upload `data` over a negotiated transfer, through the client's
     * `fileTransferSocketFactory` if it has one.
     */
    uploadFileData(host, info, data, options = {}) {
        return uploadFileData(host, info, data, {
            ...options,
            socketFactory: this.#fileTransferSocketFactory,
        });
    }
    /**
     * Download a negotiated transfer into `dest`, through the client's
     * `fileTransferSocketFactory` if it has one.
     */
    downloadFileData(host, info, dest, options = {}) {
        return downloadFileData(host, info, dest, {
            ...options,
            socketFactory: this.#fileTransferSocketFactory,
        });
    }
    // ---- Internal (package-visible) ------------------------------------------
    #markConnected(initServer = {}) {
        // Only the attempt in progress can complete: never one that disconnect()
        // or a failure has already ended.
        if (this.#status !== ClientStatus.Connecting || this.#attempt.settled)
            return;
        this.#status = ClientStatus.Connected;
        this.#sessionCount++;
        // A privilege key is spent by the join that used it: a reconnection must
        // not present it again.
        if (this.#clientInitOptions.privilegeKey !== "") {
            this.#clientInitOptions = {
                ...this.#clientInitOptions,
                privilegeKey: "",
            };
        }
        // Settled before the hook runs, so that nothing it does can turn this
        // attempt into a failed one; connect() resumes only after the hook returns.
        this.#attempt.resolve();
        const trace = this.#attempt.trace;
        if (trace !== undefined) {
            trace.sessionStarted = true;
            this.#session = {
                clientID: asClientID(this.#clid),
                startedAt: performance.now(),
                attempt: trace.attempt,
                reconnect: trace.reconnect,
            };
            this.#callHook(this.#trace?.sessionStart, () => {
                const safe = {};
                for (const [key, value] of Object.entries(initServer)) {
                    if (!SECRET_INITSERVER_PARAMS.has(key))
                        safe[key] = value;
                }
                const talkPower = Number.parseInt(initServer["client_talk_power"] ?? "", 10);
                return {
                    attempt: trace.attempt,
                    reconnect: trace.reconnect,
                    clientID: asClientID(this.#clid),
                    nickname: initServer["acn"] ?? this.#requestedNickname,
                    talkPower: Number.isNaN(talkPower) ? 0 : talkPower,
                    initServer: Object.freeze(safe),
                    capabilities: this.#capabilities,
                    durationMs: performance.now() - trace.connectStartedAt,
                };
            });
        }
        this.#emit("connected", { reconnected: trace?.reconnect ?? false });
    }
    /** The socket is open: the attempt's handshake begins. */
    #markConnectDone(socket) {
        const trace = this.#attempt.trace;
        if (trace === undefined || this.#attempt.settled || trace.phase !== ConnectPhase.Open)
            return;
        trace.phase = ConnectPhase.Handshake;
        this.#callHook(this.#trace?.connectDone, () => {
            let localAddr = "";
            try {
                const local = socket.address?.();
                if (local !== undefined)
                    localAddr = joinHostPort(local.address, String(local.port));
            }
            catch {
                // A socket that cannot say where it is bound has no local address to report.
            }
            return {
                attempt: trace.attempt,
                reconnect: trace.reconnect,
                target: trace.target,
                localAddr,
                durationMs: performance.now() - trace.connectStartedAt,
            };
        });
    }
    #markHandshakeDone(serverPublicKey = "") {
        const trace = this.#attempt.trace;
        if (trace === undefined || this.#attempt.settled || trace.phase !== ConnectPhase.Handshake) {
            return;
        }
        trace.phase = ConnectPhase.Join;
        this.#callHook(this.#trace?.handshakeDone, () => {
            const puzzle = puzzleOf(this.#crypt);
            return {
                attempt: trace.attempt,
                reconnect: trace.reconnect,
                durationMs: performance.now() - trace.connectStartedAt,
                puzzleLevel: puzzle.level,
                puzzleDurationMs: puzzle.durationMs,
                // The handler is this attempt's own, so its count starts at the socket.
                resends: this.#handler.resends,
                serverPublicKey,
            };
        });
    }
    #markWelcomeDone() {
        const trace = this.#attempt.trace;
        if (trace === undefined || !trace.sessionStarted || trace.welcomeDone)
            return;
        if (this.#status !== ClientStatus.Connected)
            return;
        trace.welcomeDone = true;
        this.#callHook(this.#trace?.welcomeDone, () => ({
            attempt: trace.attempt,
            reconnect: trace.reconnect,
            channelID: this.channelID,
            channels: trace.channels,
            clients: this.#clients.size,
            durationMs: performance.now() - trace.connectStartedAt,
        }));
    }
    /** Report the end of the session in progress, once. */
    #endSession(error) {
        this.#viewStore.end(error);
        // Report the voice this session dropped now, not after it ended.
        this.#reportVoiceDrops(performance.now());
        const session = this.#session;
        if (session === undefined)
            return;
        this.#session = undefined;
        this.#callHook(this.#trace?.sessionEnd, () => ({
            clientID: session.clientID,
            error,
            durationMs: performance.now() - session.startedAt,
            attempt: session.attempt,
            reconnect: session.reconnect,
        }));
    }
    /**
     * Call a trace hook, if there is one, and never let it touch the
     * connection: see callHook. The info is built only when there is a hook.
     */
    #callHook(hook, info) {
        callHook(hook, this.#trace, info);
    }
    // ---- Private -------------------------------------------------------------
    #newHandler() {
        const handler = new PacketHandler(this.#crypt, this.#logger, this.#socketFactory);
        // Each callback checks that its handler is still the current one: a
        // packet or close reported late by one a later connect() already replaced
        // must not reach, or tear down, the new connection.
        handler.onPacket = (p) => {
            if (handler === this.#handler)
                this.#handlePacket(p);
        };
        handler.onClosed = (err) => {
            if (handler === this.#handler)
                this.#handleConnectionClosed(err);
        };
        handler.onOpen = (socket) => {
            if (handler === this.#handler)
                this.#markConnectDone(socket);
        };
        handler.onReceiveError = (error) => {
            if (handler === this.#handler)
                this.#handleReceiveError(error);
        };
        return handler;
    }
    #resetForConnect() {
        this.#handler.close();
        this.#crypt = new Crypt(this.#identity);
        this.#handler = this.#newHandler();
        this.#attempt = newConnectAttempt();
        this.#cmdTrack.reset(new NotConnectedError());
        this.#viewStore.reset();
        this.#clid = 0;
        this.#capabilities = unknownServerCapabilities();
    }
    async #resolveAddr(signal) {
        // Parsed, not tested for a colon: an IPv6 literal has colons and no port.
        const { host, port } = splitHostPort(this.#addr);
        const fallback = joinHostPort(host, port);
        // Every resolver, a custom one too, gets the same budget: past it the
        // address is used as given. A timer the tests can control, not
        // AbortSignal.timeout().
        const budget = new AbortController();
        const timer = setTimeout(() => budget.abort(new TeamspeakError("address resolution took too long")), RESOLVE_BUDGET_MS);
        const lookup = AbortSignal.any([signal, budget.signal]);
        try {
            // Raced against the signal: a resolver that ignores it must still not
            // hold up an attempt that has been given up.
            const resolved = await abortable(this.#resolver.resolve(this.#addr, { signal: lookup }), lookup);
            const first = resolved[0];
            return {
                target: first?.addr ?? fallback,
                source: first?.source ?? "",
                candidates: resolved,
                error: undefined,
            };
        }
        catch (error) {
            signal.throwIfAborted();
            const reason = budget.signal.aborted ? budget.signal.reason : error;
            this.#logger.warn("address resolution failed, falling back to direct", {
                error: String(reason),
            });
            return { target: fallback, source: "", candidates: [], error: reason };
        }
        finally {
            clearTimeout(timer);
        }
    }
    /**
     * A datagram from the server could not be handled. During the handshake that
     * is the connection failing, reported as a HandshakeError with the cause;
     * once connected, one bad packet is not worth the session, so it is dropped.
     */
    #handleReceiveError(error) {
        if (this.#status !== ClientStatus.Connected) {
            this.#failConnection(error instanceof HandshakeError
                ? error
                : new HandshakeError("the handshake failed on a malformed packet", {
                    cause: error,
                }));
            return;
        }
        this.#logger.debug("dropped a malformed packet", { error: String(error) });
    }
    #handlePacket(p) {
        const pType = p.typeFlagged & 0x0f;
        if (pType === 8 /* Init1 */) {
            if (this.#crypt.cryptoInitComplete)
                return;
            const signal = this.#attempt.signal;
            const handler = this.#handler;
            const trace = this.#attempt.trace;
            const step = p.data[0] ?? 0x7f;
            const response = processInit1(this.#crypt, p.data, signal);
            if (response instanceof Promise) {
                // The puzzle: solved in slices, so the loop keeps running meanwhile.
                if (trace !== undefined)
                    trace.stage = "puzzleSolving";
                response.then((answer) => {
                    if (answer && !signal.aborted) {
                        handler.sendPacket(PacketType.Init1, answer, 0);
                        if (trace !== undefined)
                            trace.stage = "puzzleAnswered";
                    }
                }, (error) => {
                    // An attempt that ended did so for its own reason; the abandoned
                    // solve has nothing more to report.
                    if (!signal.aborted)
                        this.#handleReceiveError(error);
                });
            }
            else if (response) {
                handler.sendPacket(PacketType.Init1, response, 0);
                if (trace !== undefined)
                    trace.init1Step = step === 0x7f ? -1 : step;
            }
            return;
        }
        if ((pType === 0 /* Voice */ || pType === 1) /* VoiceWhisper */ && p.data.length >= 5) {
            this.#handleVoicePacket(p.data, pType === 1, p.receivedAt);
            return;
        }
        if ((pType === 2 /* Command */ || pType === 3) /* CommandLow */ && p.data.length > 0) {
            this.#handleCommandLines(Buffer.from(p.data).toString("utf8"));
        }
    }
    /**
     * Parse an incoming S2C voice packet.
     * Format: [VId: u16] [CId: u16] [Codec: u8] [Data: var]. The VId is the
     * sender's own packet counter; Voice and VoiceWhisper have the same layout.
     *
     * A packet with no data is how a speaker's last frame is followed: the
     * server relays the empty frame a client sends when it stops talking, and it
     * is delivered as an event with empty `data`. Measured on TeamSpeak 3 3.13.8
     * and TeamSpeak 6 6.0.0: the frames of `sendVoice` arrive as 45-byte packets
     * and an empty one as a 5-byte packet.
     */
    #handleVoicePacket(payload, whisper, receivedAt) {
        // Audio arrives fifty times a second per speaker; build no event nobody
        // will see.
        if (!this.#listeners.get("voiceData")?.length && this.#eventMiddlewares.length === 0)
            return;
        if (this.#queue.length > MAX_PENDING_DELIVERIES) {
            this.#dropVoice();
            return;
        }
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const seq = view.getUint16(0, false);
        const clientId = view.getUint16(2, false);
        if (clientId === this.#clid)
            return;
        // Copied: the packet's buffer is reused once this returns, and a listener
        // runs later.
        const data = payload.slice(5);
        this.#emitServerEvent({
            name: "voiceData",
            payload: {
                session: this.#sessionCount,
                clientID: asClientID(clientId),
                whisper,
                seq,
                codec: payload[4],
                data,
                receivedAt,
            },
        });
    }
    #handleCommandLines(s) {
        if (!s)
            return;
        const lines = s.split("\0").join("\n").split("\n");
        for (const line of lines) {
            const trimmed = line.replace(/\r$/, "");
            if (!trimmed)
                continue;
            for (const row of splitCommandRows(trimmed)) {
                this.#handleCommandStr(row);
            }
            this.#applyGroupLine();
        }
    }
    /**
     * A group list is a whole set, and the server sends it as one command line,
     * so it is applied once its last row has been handled.
     */
    #applyGroupLine() {
        const line = this.#groupLine;
        if (line === undefined)
            return;
        this.#groupLine = undefined;
        if (line.name === "notifyservergrouplist") {
            this.#viewStore.setServerGroups(line.rows.map(parseServerGroup).filter((group) => group.id !== 0n));
        }
        else {
            this.#viewStore.setChannelGroups(line.rows.map(parseChannelGroup).filter((group) => group.id !== 0n));
        }
    }
    #handleCommandStr(s) {
        const cmd = parseCommand(s);
        if (!cmd)
            return;
        // Before crypto init a packet needs only the public dummy key, so anyone
        // on the path could have sent it: nothing but the handshake's own steps,
        // and an error that may end the attempt, is taken then. A notification
        // would be a forged event, a row a forged answer.
        if (!this.#crypt.cryptoInitComplete && !PRE_INIT_COMMANDS.has(cmd.name)) {
            this.#logger.debug("dropped a command that arrived before crypto init", {
                command: cmd.name,
            });
            return;
        }
        if (incomingChannel.hasSubscribers)
            incomingChannel.publish({ command: cmd.name, client: this });
        // No name means a response row: the server sends data without echoing the
        // command, so the row belongs to whichever command is awaiting a result.
        if (cmd.name === "") {
            if (Object.keys(cmd.params).length > 0)
                this.#cmdTrack.buffer(cmd.params);
            return;
        }
        // `channellistfinished` ends the server's welcome sequence. It carries no
        // data of its own, so it is the only reliable marker: the guard used to
        // trip on our own notifycliententerview, which the server sends *in the
        // middle* of the sequence — the channellist rows after it were then
        // buffered as if they were the response to the caller's first command,
        // which is how a channellist could come back with duplicate and empty rows.
        if (cmd.name === "channellistfinished") {
            // The tree and the clients of the own channel are complete here, so the
            // view is too; the group lists and permissions the server sends next
            // are not part of it.
            const revision = this.#status === ClientStatus.Connected ? this.#viewStore.finish() : undefined;
            if (revision !== undefined)
                this.#emit("viewReady", { revision });
            this.#cmdTrack.signalWelcomeComplete();
            this.#markWelcomeDone();
            return;
        }
        if (cmd.name === "channellist") {
            const trace = this.#attempt.trace;
            if (trace !== undefined && !trace.welcomeDone) {
                trace.channels++;
                if (this.#status === ClientStatus.Connected) {
                    this.#viewStore.collect(parseChannel(cmd.params));
                }
            }
        }
        // The server answers our goodbye by announcing that we left, not with an
        // error line; that announcement is what disconnect() waits for.
        if (cmd.name === "notifyclientleftview" &&
            this.#goodbyeAnswered !== undefined &&
            cmd.params["clid"] === String(this.#clid)) {
            this.#goodbyeAnswered();
        }
        if (cmd.name.startsWith("notify")) {
            // Some commands are answered by a notification instead of data rows;
            // it still goes on to be dispatched as an event, since the same
            // notification also arrives unprompted.
            if (this.#cmdTrack.expects(cmd.name)) {
                this.#cmdTrack.buffer(cmd.params, cmd.name);
                this.#cmdTrack.offerCorrelated(cmd.name, cmd.params);
            }
            if (cmd.name === "notifyconnectioninforequest")
                this.#answerConnectionInfoRequest();
            if (cmd.name === "notifyservergrouplist" || cmd.name === "notifychannelgrouplist") {
                if (this.#groupLine?.name !== cmd.name)
                    this.#applyGroupLine();
                this.#groupLine ??= { name: cmd.name, rows: [] };
                this.#groupLine.rows.push(cmd.params);
            }
            else if (cmd.name === "notifyserverupdated") {
                this.#viewStore.mergeServer(cmd.params);
            }
            // The roster entry goes with the notification, so it is read first.
            const leaving = cmd.name === "notifyclientleftview"
                ? this.#clients.get(parseUint16(cmd.params["clid"] ?? ""))
                : undefined;
            const result = handleNotification(cmd, this.#clid, this.#clients);
            this.#processNotificationResult(result, leaving);
            if (this.#listeners.get("notification")?.length || this.#eventMiddlewares.length > 0) {
                this.#emitServerEvent({
                    name: "notification",
                    payload: { name: cmd.name, params: { ...cmd.params } },
                });
            }
            return;
        }
        switch (cmd.name) {
            // The handshake's steps happen once: repeated after crypto init, they
            // could only re-key or re-announce a session that is already set up.
            case "clientinitiv":
                if (!this.#crypt.cryptoInitComplete)
                    handleHandshakeInitIV(this.#internals, cmd.params);
                break;
            case "initivexpand2":
                if (!this.#crypt.cryptoInitComplete)
                    handleHandshakeExpand2(this.#internals, cmd.params);
                break;
            case "initserver":
                // Only on a session with its keys: before crypto init a packet needs
                // nothing but the public dummy key, and an initserver taken then would
                // report a connection whose next command — clientinit with its password
                // hashes among them — goes out under that dummy key.
                if (this.#status === ClientStatus.Connecting && this.#crypt.cryptoInitComplete) {
                    this.#viewStore.seedServer(cmd.params);
                    handleInitServer(this.#internals, cmd.params);
                }
                break;
            case "error":
                this.#handleError(cmd.params);
                break;
            default:
                // A named command the SDK does not model. Held under its own name, so
                // it answers a command only if that command declared it — not merely by
                // arriving while one is in flight.
                this.#cmdTrack.buffer(cmd.params, cmd.name);
                break;
        }
    }
    /**
     * Someone asked the server for this client's connection info, and it asks
     * us for the figures: answer with what this connection has measured. A
     * failure is only logged, as the request is not one a caller made.
     */
    #answerConnectionInfoRequest() {
        const line = buildSetConnectionInfo(this.#handler.trafficSnapshot(), this.#handler.roundTrip);
        this.#execNoWait(line, undefined, false).catch((error) => {
            this.#logger.debug("could not answer a connection info request", {
                error: String(error),
            });
        });
    }
    #handleError(params) {
        const { err, rc } = parseServerError(params);
        if (rc !== null) {
            this.#cmdTrack.resolve(rc, err);
        }
        else {
            // No return_code: server is acknowledging an unsolicited command
            // (welcome-sequence channellist, no-RC commands like clientupdate, etc.).
            // Discard any rows buffered since the last resolved command.
            this.#cmdTrack.discardBuffer();
        }
        // A server error before the welcome sequence finished is the connection
        // failure itself — a rejected password, or an invalid clientinit parameter.
        // Report it as the cause instead of leaving the caller with a bare timeout.
        if (err && this.#status !== ClientStatus.Connected) {
            this.#failConnection(err);
            return;
        }
        // Only a connected session gets here, so only after crypto init: an error
        // under the public dummy key can fail an attempt, never stop the client.
        if (err?.code === ErrorCode.ConnectFailedBanned) {
            this.#logger.warn("banned by the server, closing the connection");
            setImmediate(() => {
                this.disconnect().catch(() => { });
            });
        }
    }
    #processNotificationResult(result, leaving) {
        switch (result.kind) {
            case "clientEnter": {
                const info = result.info;
                // Identify self by the clid initserver already assigned rather than by
                // nickname: any other client whose nickname happens to be "<our
                // nick><digits>" — which is how the server renames a client whose
                // nickname was taken — would otherwise be mistaken for us, poisoning
                // every outgoing packet header with a foreign clientID until the server
                // drops the connection for command-resend timeout.
                //
                // This no longer marks the end of the welcome sequence: the server
                // sends more welcome data after it, and `channellistfinished` is the
                // real terminator.
                if (info.id === this.#clid) {
                    // Carries the rename the server applied if our nickname was taken;
                    // the nickname asked for stays as it was.
                    this.#nickname = info.nickname;
                }
                else if (this.#clid === 0 &&
                    isAutoNicknameMatch(this.#requestedNickname, info.nickname)) {
                    // initserver carried no aclid, so the welcome enter is the only way
                    // to learn our clid. Gated on clid still being unknown so a later
                    // lookalike can never hijack an established session.
                    this.#clid = info.id;
                    this.#handler.setClientID(info.id);
                    this.#nickname = info.nickname;
                }
                this.#emitServerEvent({ name: "clientEnter", payload: info });
                break;
            }
            case "clientLeave": {
                const event = leaving === undefined ? result.event : { ...result.event, previous: leaving };
                this.#emitServerEvent({ name: "clientLeave", payload: event });
                if (!result.isSelf)
                    break;
                if (event.reason === Reason.KickServer || event.reason === Reason.KickServerBan) {
                    this.#emit("kicked", kickedEvent(event));
                }
                this.#removedByServer(new RemovedError(event.reason, event.reasonMessage, event.invokerName));
                break;
            }
            case "clientMoved":
                this.#emitServerEvent({ name: "clientMoved", payload: result.event });
                // A channel kick moves the client to the default channel; it arrives
                // as a move, not as leaving view, which is where it used to be looked
                // for.
                if (result.event.clientID === this.#clid && result.event.reason === Reason.KickChannel) {
                    this.#emit("kicked", kickedEvent(result.event));
                }
                break;
            case "textMessage":
                this.#emitServerEvent({ name: "textMessage", payload: result.message });
                break;
            case "clientUpdated":
                // The server may rename a client, this one included. That changes the
                // name it reports, not the one this client asks for on reconnecting.
                if (result.event.clientID === this.#clid && "nickname" in result.event.changes) {
                    this.#nickname = result.event.changes.nickname ?? this.#nickname;
                }
                this.#emitServerEvent({ name: "clientUpdated", payload: result.event });
                break;
            case "clientServerGroupAdded":
                this.#emitServerEvent({
                    name: "clientServerGroupAdded",
                    payload: result.event,
                });
                break;
            case "clientServerGroupRemoved":
                this.#emitServerEvent({
                    name: "clientServerGroupRemoved",
                    payload: result.event,
                });
                break;
            case "clientChannelGroupChanged":
                this.#emitServerEvent({
                    name: "clientChannelGroupChanged",
                    payload: result.event,
                });
                break;
            case "channelCreated":
                this.#viewStore.applyCreated(result.event);
                this.#emitServerEvent({
                    name: "channelCreated",
                    payload: result.event,
                });
                break;
            case "channelEdited":
                this.#viewStore.applyEdited(result.event);
                this.#emitServerEvent({ name: "channelEdited", payload: result.event });
                break;
            case "channelMoved":
                this.#viewStore.applyMoved(result.event);
                this.#emitServerEvent({ name: "channelMoved", payload: result.event });
                break;
            case "channelDeleted": {
                const previous = this.#viewStore.channelBeforeDeletion(result.event.channelID);
                this.#viewStore.applyDeleted(result.event);
                this.#emitServerEvent({
                    name: "channelDeleted",
                    payload: previous === undefined ? result.event : { ...result.event, previous },
                });
                break;
            }
            case "channelDescriptionChanged":
                this.#emitServerEvent({
                    name: "channelDescriptionChanged",
                    payload: result.event,
                });
                break;
            case "channelPasswordChanged":
                this.#emitServerEvent({
                    name: "channelPasswordChanged",
                    payload: result.event,
                });
                break;
            case "serverEdited":
                this.#viewStore.patchServer(result.event.changes);
                this.#emitServerEvent({ name: "serverEdited", payload: result.event });
                break;
            case "channelSubscribed":
                this.#emitServerEvent({
                    name: "channelSubscribed",
                    payload: result.event,
                });
                break;
            case "channelUnsubscribed":
                // The server does not say the clients of the channel left.
                this.#viewStore.dropChannel(result.event.channelID);
                this.#emitServerEvent({
                    name: "channelUnsubscribed",
                    payload: result.event,
                });
                break;
            case "pluginCommand":
                this.#emitServerEvent({ name: "pluginCommand", payload: result.event });
                break;
            case "clientChatComposing":
                this.#emitServerEvent({
                    name: "clientChatComposing",
                    payload: result.event,
                });
                break;
            case "clientChatClosed":
                this.#emitServerEvent({
                    name: "clientChatClosed",
                    payload: result.event,
                });
                break;
            case "poked":
                this.#emitServerEvent({ name: "poked", payload: result.event });
                break;
            case "unknown":
                break;
        }
    }
    /**
     * End a session the server has ended. The server stops answering a client it
     * has removed, so waiting for the transport to notice reported the end a
     * minute late, without its cause, and with the client claiming to be
     * connected meanwhile.
     */
    #removedByServer(cause) {
        this.#handleConnectionClosed(cause);
        this.#handler.close();
    }
    /**
     * Count a dropped voice delivery, and report the drops now and then: at most
     * once every ten seconds, with how many were dropped since the last report.
     */
    #dropVoice() {
        this.#voiceDropped++;
        const now = performance.now();
        const wait = VOICE_DROP_WARN_INTERVAL_MS - (now - this.#voiceDropWarnedAt);
        if (wait <= 0) {
            this.#reportVoiceDrops(now);
            return;
        }
        // Inside the interval: the drops are not lost, the report is deferred to
        // its end. Reporting only on a later drop would leave the count of a short
        // burst, which stops before the interval does, unreported for good.
        this.#voiceDropTimer ??= setTimeout(() => this.#reportVoiceDrops(performance.now()), wait);
        this.#voiceDropTimer.unref();
    }
    #reportVoiceDrops(now) {
        clearTimeout(this.#voiceDropTimer);
        this.#voiceDropTimer = undefined;
        if (this.#voiceDropped === 0)
            return;
        this.#voiceDropWarnedAt = now;
        // The count since the last warning, so each one says how bad it is now.
        this.#logger.warn("voice dropped: listeners are not keeping up", {
            dropped: this.#voiceDropped,
        });
        this.#voiceDropped = 0;
    }
    /** Queue a server event, through the event middleware. */
    #emitServerEvent(event) {
        this.#enqueue(() => this.#eventChain(event));
    }
    /**
     * Queue `disconnected`; the promise settles once it has been delivered, and
     * a connect() waits for it until then.
     */
    #announceDisconnected(cause, willReconnect) {
        const delivered = new Promise((resolve) => this.#enqueue(() => {
            try {
                this.#deliver("disconnected", { error: cause, willReconnect });
            }
            finally {
                resolve();
            }
        }));
        this.#disconnectedDelivered = delivered;
        void delivered.then(() => {
            if (this.#disconnectedDelivered === delivered)
                this.#disconnectedDelivered = undefined;
        });
        return delivered;
    }
    /** Queue a lifecycle event, which middleware does not see. */
    #emit(event, payload) {
        this.#enqueue(() => this.#deliver(event, payload));
    }
    #deliver(event, payload) {
        for (const subscription of this.#listeners.get(event) ?? []) {
            // Checked at delivery: a listener removed while its event was queued
            // does not get it.
            if (subscription.removed)
                continue;
            try {
                subscription.listener(payload);
            }
            catch (error) {
                // Rethrown on its own, as an uncaught exception, so it surfaces as one
                // from an EventEmitter listener would, and the listeners after it
                // still get the event.
                queueMicrotask(() => {
                    throw error;
                });
            }
        }
    }
    /**
     * Run deliveries one at a time, in order, once the packet being handled is
     * done with. A listener that throws does so as an uncaught exception, as it
     * would from an EventEmitter, and the listeners and deliveries behind it
     * still run.
     */
    #enqueue(delivery) {
        this.#queue.push(delivery);
        this.#scheduleDrain();
    }
    #scheduleDrain() {
        if (this.#draining)
            return;
        this.#draining = true;
        setImmediate(this.#drain);
    }
    #drain = () => {
        try {
            while (this.#queue.length > 0)
                this.#queue.shift()();
            // Everything handled so far is delivered: say once that the view moved.
            // Listeners cannot change the view, so this is the last word of the run.
            const revision = this.#viewStore.announce();
            if (revision !== undefined)
                this.#deliver("viewChanged", { revision });
        }
        finally {
            if (this.#queue.length > 0)
                setImmediate(this.#drain);
            else
                this.#draining = false;
        }
    };
    #handleConnectionClosed(err) {
        if (this.#status === ClientStatus.Disconnected)
            return;
        // Nothing in flight can be answered any more; failing it now, with the
        // reason, beats every caller timing out one by one.
        this.#cmdTrack.reset(new NotConnectedError(err ? { cause: err } : undefined));
        if (this.#status !== ClientStatus.Connected) {
            // The socket closed before the handshake finished, so this is a failed
            // connection attempt rather than a disconnect of a live session.
            this.#failConnection(err ?? new TeamspeakError("connection closed before the TeamSpeak handshake completed"));
            return;
        }
        this.#status = ClientStatus.Disconnected;
        // Never undefined for a drop: undefined means disconnect() only.
        const cause = err ?? new TeamspeakError("connection closed");
        this.#lastDrop = cause;
        this.#endSession(cause);
        // Announced first, then retried: a caller watching `disconnected` should
        // hear about the drop even when a reconnect is already on its way, because
        // a silent recovery hides an outage.
        void this.#announceDisconnected(cause, this.#willReconnect(cause, this.#loopAttempt + 1));
        this.#scheduleReconnect(cause).catch((error) => {
            this.#logger.error("reconnecting failed", { error: String(error) });
        });
    }
    /**
     * Whether the reconnect loop will make attempt number `attempt` after `err`.
     * `disconnected` reports it, and the loop acts on the same answer: the
     * caller's `shouldRetry` is asked once per failure, not once to announce it
     * and again to act on it.
     */
    #willReconnect(err, attempt) {
        const options = this.#reconnectOptions;
        if (options === undefined || this.#stopped)
            return false;
        const { maxAttempts } = resolveBackoffPolicy(options);
        if (maxAttempts !== 0 && attempt > maxAttempts)
            return false;
        const asked = this.#retryAnswer;
        if (asked?.err === err && asked.attempt === attempt)
            return asked.retry;
        let retry;
        let threw = false;
        try {
            retry = (options.shouldRetry ?? defaultShouldRetry)(err, attempt);
        }
        catch (error) {
            this.#logger.error("shouldRetry threw; not reconnecting", {
                error: String(error),
            });
            retry = false;
            threw = true;
        }
        this.#retryAnswer = { err, attempt, retry, threw };
        return retry;
    }
    /**
     * Retry a dropped connection according to the reconnect policy.
     *
     * Never runs after an explicit disconnect, and never more than one at a time:
     * two failures in quick succession would otherwise start competing loops, and
     * a loop shorter than the server's antiflood window bans the IP rather than
     * reconnecting it. A drop while the loop runs is the loop's to retry: it
     * ends only once its attempt is still connected when it resumes.
     */
    async #scheduleReconnect(err) {
        const options = this.#reconnectOptions;
        if (options === undefined || this.#stopped || this.#reconnecting)
            return;
        const policy = resolveBackoffPolicy(options);
        this.#reconnecting = true;
        const stop = new AbortController();
        this.#stopReconnecting = stop;
        // The attempts the loop has made, and why it stopped, for `reconnectStopped`.
        let made = 0;
        let stoppedBy;
        try {
            for (let attempt = 1; policy.maxAttempts === 0 || attempt <= policy.maxAttempts; attempt++) {
                if (this.#stopped) {
                    stoppedBy = { cause: undefined };
                    return;
                }
                if (!this.#willReconnect(err, attempt)) {
                    if (!this.#retryAnswer?.threw) {
                        this.#logger.info("not retrying", { attempt, reason: err.message });
                    }
                    stoppedBy = { cause: err };
                    return;
                }
                const delay = backoffDelay(policy, attempt);
                this.#logger.info("reconnecting", { attempt, delayMs: delay });
                this.#callHook(this.#trace?.reconnectScheduled, () => ({
                    attempt,
                    delayMs: delay,
                    cause: err,
                }));
                // A timer that keeps the process alive: an application that does
                // nothing but stay connected would otherwise exit during the wait.
                await sleep(delay, stop.signal);
                if (this.#stopped) {
                    stoppedBy = { cause: undefined };
                    return;
                }
                // Connected, or connecting, by hand during the wait: nothing is left to
                // retry, and an attempt now would only fail with AlreadyConnectedError.
                if (this.#status !== ClientStatus.Disconnected) {
                    this.#logger.info("reconnect loop ended: connected by other means", {
                        attempt,
                    });
                    return;
                }
                try {
                    made++;
                    this.#loopAttempt = attempt;
                    await this.#connect({ signal: AbortSignal.timeout(RECONNECT_ATTEMPT_TIMEOUT_MS) }, attempt, true);
                    // Read afresh: the status may have changed while connect() resolved.
                    if (this.status === ClientStatus.Connected) {
                        this.#logger.info("reconnected", { attempt });
                        return;
                    }
                    // The new session dropped before this loop resumed — initserver and
                    // the server's goodbye in one datagram, say. That drop found this
                    // loop running and left the retrying to it.
                    err = this.#lastDrop ?? new TeamspeakError("connection closed");
                }
                catch (retryErr) {
                    if (retryErr instanceof AlreadyConnectedError)
                        return;
                    err =
                        retryErr instanceof Error
                            ? retryErr
                            : new TeamspeakError(String(retryErr), { cause: retryErr });
                }
            }
            this.#logger.warn("reconnect attempts exhausted", {
                attempts: policy.maxAttempts,
            });
            stoppedBy = { cause: err };
        }
        finally {
            if (stoppedBy !== undefined) {
                const { cause } = stoppedBy;
                this.#callHook(this.#trace?.reconnectStopped, () => ({
                    attempts: made,
                    cause,
                }));
            }
            this.#reconnecting = false;
            this.#loopAttempt = 0;
            if (this.#stopReconnecting === stop)
                this.#stopReconnecting = undefined;
        }
    }
    /**
     * A connection attempt has failed for good: settle it with the cause, and
     * tear the connection down. Does nothing once the handshake has completed,
     * so it cannot end a live session.
     *
     * Without this, a handshake the server rejects (a wrong password, say, which
     * the server answers with an error instead of closing the socket) surfaces
     * only as the caller's own timeout, and the client stays in `Connecting`
     * forever without ever emitting `disconnected`.
     */
    #failConnection(error) {
        if (this.#status === ClientStatus.Connected)
            return;
        this.#attempt.reject(error);
        this.#viewStore.end(error);
        if (this.#status === ClientStatus.Disconnected)
            return;
        this.#status = ClientStatus.Disconnected;
        this.#handler.close();
        const cause = error instanceof Error ? error : new TeamspeakError(String(error), { cause: error });
        // Only an attempt of the reconnect loop can be followed by another; a
        // connect() that fails is the caller's to retry.
        void this.#announceDisconnected(cause, this.#reconnecting && this.#willReconnect(cause, this.#loopAttempt + 1));
    }
}
function kickedEvent(event) {
    return {
        reason: event.reason,
        reasonMessage: event.reasonMessage,
        invokerName: event.invokerName,
        invokerUID: event.invokerUID,
        invokerID: event.invokerID,
    };
}
//# sourceMappingURL=client.js.map