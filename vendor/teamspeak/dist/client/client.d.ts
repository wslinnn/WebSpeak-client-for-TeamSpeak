import { type EventMap, type VoiceOptions, type WhisperTargets, type GroupWhisperTarget, type ClientOptions } from "./types.js";
import { type ChannelID, type ClientID, type Codec, type CommandOptions, type UID, type Listener, type Unsubscribe, ClientStatus } from "@honeybbq/teamspeak";
import type { Identity } from "./crypto/index.js";
import { type FileTransferOptions } from "./transfer.js";
import type { ClientVersion, CommandExecutor, CommandRequest } from "@honeybbq/teamspeak";
import type { FileUploadInfo, FileDownloadInfo } from "@honeybbq/teamspeak";
import type { Readable, Writable } from "node:stream";
import type { EventIterator, RoundTripEstimate } from "./types.js";
import { type ServerCapabilities } from "./capabilities.js";
import { type ServerView } from "./view.js";
/**
 * What clientinit sends about the connection, with the passwords already in
 * their wire form, `base64(sha1(password))`: hashed once, when the client is
 * made, so the plain text is never held.
 */
export interface ClientInitOptions {
    readonly serverPasswordHash: string;
    readonly defaultChannel: string;
    readonly defaultChannelPasswordHash: string;
    /** The privilege key (`client_default_token`), or `""`; dropped once a connection succeeds. */
    readonly privilegeKey: string;
    /** The meta data (`client_meta_data`), or `""`. */
    readonly metaData: string;
    /** The platform, version and signature, copied so later changes to the option have no effect. */
    readonly version: ClientVersion;
}
/**
 * A TeamSpeak client over the voice protocol.
 *
 * Listeners run one at a time, in the order their events arrived, after the
 * packet that carried them has been handled, so a listener may call the client
 * and await an answer.
 */
export declare class Client implements CommandExecutor, AsyncDisposable {
    #private;
    constructor(identity: Identity, addr: string, nickname: string, options?: ClientOptions);
    /**
     * What this client knows of the server: the channel tree, the clients it
     * has been told about, and itself. Always there, and `"empty"` until the
     * first `connect()`.
     *
     * @experimental New in 1.x and may change in a minor release.
     */
    get view(): ServerView;
    /** Where the client is in its connection's life. */
    get status(): ClientStatus;
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
    get roundTrip(): RoundTripEstimate | undefined;
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
    connect(options?: {
        readonly signal?: AbortSignal | undefined;
    }): Promise<void>;
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
    disconnect(options?: {
        readonly signal?: AbortSignal | undefined;
        readonly reasonMessage?: string | undefined;
    }): Promise<void>;
    /** `await using client = …` disconnects when the scope ends. */
    [Symbol.asyncDispose](): Promise<void>;
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
    exec(command: string, options?: CommandOptions): Promise<Record<string, string>[]>;
    /**
     * Send a raw command line without waiting for an answer, for the few
     * commands the server answers with nothing at all. `CommandName` lists
     * the command names.
     *
     * Commands are paced by a flood throttle; aborting `signal` while this waits
     * for its turn rejects with the signal's reason and sends nothing. Rejects
     * with a NotConnectedError unless the client is connected.
     */
    execNoWait(command: string, options?: {
        readonly signal?: AbortSignal | undefined;
    }): Promise<void>;
    /**
     * Send a typed command; this is the CommandExecutor the typed commands run on.
     *
     * The request passes through the `commandMiddleware` first. Channel
     * passwords are then hashed, because that is this protocol's rule: the voice
     * protocol expects `base64(sha1(password))`, where ServerQuery takes the
     * password itself.
     */
    send(request: CommandRequest, options?: CommandOptions): Promise<Record<string, string>[]>;
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
    on<K extends keyof EventMap>(event: K, listener: Listener<EventMap, K>): Unsubscribe;
    /** Listen for the next occurrence of an event only. */
    once<K extends keyof EventMap>(event: K, listener: Listener<EventMap, K>): Unsubscribe;
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
    events<K extends keyof EventMap>(event: K, options?: {
        readonly signal?: AbortSignal | undefined;
    }): EventIterator<EventMap[K]>;
    /**
     * Numbers the sessions this client has completed, from 1; it is 0 before the
     * first. Every connect, and every reconnect, is a new session, even when the
     * server hands out the client id the last one had. `VoiceDataEvent.session`
     * is this at the time the packet arrived.
     */
    get session(): number;
    /** This client's id on the server, assigned in the handshake; 0 before it. */
    get clientID(): ClientID;
    /**
     * What the connected server is: version, generation, and the uid hash it
     * uses. Read from `initserver`; before connecting the family is `unknown`
     * and the uid hash SHA-1.
     */
    get serverCapabilities(): ServerCapabilities;
    /**
     * Our own `client_unique_identifier`, hashed with the algorithm the connected
     * server uses.
     *
     * TS3 uses SHA-1 and TS6 SHA-256, so this reads the algorithm learned during
     * initserver rather than assuming one. Comparing a hard-coded SHA-1 UID to a
     * TS6 server silently never matches.
     */
    get uid(): UID;
    /**
     * The host this client connects to, as it was given, without the port: where
     * the file transfer port is, for `uploadFileData` and the avatar and icon
     * helpers.
     */
    get host(): string;
    /** The channel this client is in, as it last learned; 0 before connecting. */
    get channelID(): ChannelID;
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
    sendWhisper(data: Uint8Array, targets: WhisperTargets, codec: Codec): void;
    /**
     * Send Opus voice to a group of clients: a server group, a channel group,
     * the channel commanders or everyone, within the channels the target's
     * `scope` picks. The packet's group form; `sendWhisper` is the direct one.
     * Throws a NotConnectedError unless the client is connected, and a
     * RangeError for a type, scope or group id the packet cannot hold. Whether
     * a client hears it is the server's decision, as for `sendWhisper`.
     */
    sendGroupWhisper(data: Uint8Array, target: GroupWhisperTarget, codec: Codec): void;
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
    sendVoice(data: Uint8Array, codec: Codec, options?: VoiceOptions): void;
    /**
     * Upload `data` over a negotiated transfer, through the client's
     * `fileTransferSocketFactory` if it has one.
     */
    uploadFileData(host: string, info: FileUploadInfo, data: Readable, options?: Pick<FileTransferOptions, "signal" | "trace" | "idleTimeoutMs">): Promise<void>;
    /**
     * Download a negotiated transfer into `dest`, through the client's
     * `fileTransferSocketFactory` if it has one.
     */
    downloadFileData(host: string, info: FileDownloadInfo, dest: Writable, options?: Pick<FileTransferOptions, "signal" | "trace" | "idleTimeoutMs">): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map