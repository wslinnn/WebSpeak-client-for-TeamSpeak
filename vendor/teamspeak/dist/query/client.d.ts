import { ClientStatus, type CommandExecutor, type CommandOptions, type CommandRequest, type Listener, type ServerEventMap, type ServerFamily, type ServerID, type SessionEventMap, type Unsubscribe } from "@honeybbq/teamspeak";
import type { QueryTransport, QueryTransportStats } from "./transport.js";
import { type QueryClientOptions, type QueryEventCategory } from "./options.js";
export type { QueryClientOptions, QueryEventsOption, QueryTransportOptions } from "./options.js";
export { QueryEventCategory } from "./options.js";
/**
 * The events `QueryClient.on()` takes, and what each delivers.
 *
 * The server's own events are the core's, unchanged: ServerQuery and the voice
 * protocol carry the same notifications with the same fields, so a listener
 * written for one client reads the other. `connected` and `disconnected` come
 * from this client's own lifecycle.
 *
 * A notification reaches this client on two layers at once, as it does the
 * voice client: the typed event for it, if it has one, and then `notification`,
 * which carries every notification with its wire name and unescaped parameters.
 * So a typed event added here is additive — the notification it names stays on
 * the catch-all — and none of these keys is removed in a minor release.
 *
 * `TextMessageEvent.invokerGroups` is, for this client, what it knew when it
 * listed the clients on connecting or saw the sender enter: a ServerQuery
 * connection is not told when a client's groups change later.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export interface QueryEventMap extends ServerEventMap, SessionEventMap {
}
/** The values of the table below, before freezing. */
declare const queryEventNameValues: {
    /** A text message to this client, its channel or the server. */
    readonly TextMessage: "textMessage";
    /** A client coming into view, including every client already there on connecting. */
    readonly ClientEnter: "clientEnter";
    /** A client going out of view. */
    readonly ClientLeave: "clientLeave";
    /** A client changing channel. */
    readonly ClientMoved: "clientMoved";
    /** A channel being created. */
    readonly ChannelCreated: "channelCreated";
    /** A channel's properties being edited. */
    readonly ChannelEdited: "channelEdited";
    /** A channel being moved or reordered. */
    readonly ChannelMoved: "channelMoved";
    /** A channel being deleted. */
    readonly ChannelDeleted: "channelDeleted";
    /** A channel's description changing; the text is not in it. */
    readonly ChannelDescriptionChanged: "channelDescriptionChanged";
    /** A channel's password being set, changed or removed. */
    readonly ChannelPasswordChanged: "channelPasswordChanged";
    /** The server's settings being edited. */
    readonly ServerEdited: "serverEdited";
    /**
     * Every notification the server sends, modelled or not, after any event it
     * produces; one with a typed event arrives here as well, not only there.
     */
    readonly Notification: "notification";
    /** The handshake completing, on `connect()` and on every reconnection. */
    readonly Connected: "connected";
    /** The connection ending, with its cause and whether a reconnection follows. */
    readonly Disconnected: "disconnected";
    /** A kick from the server or from its channel; a kick from the server also ends the connection. */
    readonly Kicked: "kicked";
};
/**
 * The names of the events `QueryClient.on()` takes, as constants.
 * `on(QueryEventName.TextMessage, ...)` and `on("textMessage", ...)` are the
 * same call, and both give the listener the same payload type.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export declare const QueryEventName: typeof queryEventNameValues;
/**
 * One of {@link QueryEventName}, and so a key of {@link QueryEventMap}. May
 * gain members in a minor release: a `switch` over it needs a default case.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export type QueryEventName = (typeof QueryEventName)[keyof typeof QueryEventName];
/**
 * A ServerQuery client: runs the typed commands from `@honeybbq/teamspeak` over
 * one of the three ServerQuery transports, and delivers the notifications the
 * server sends as the core's typed events.
 *
 * ServerQuery answers one command at a time, in order: data lines, then an
 * `error` line that ends the answer. So commands are queued and sent one after
 * another, which also keeps the server's flood protection from seeing a burst.
 * Notifications (`notify…`) can arrive at any point and are not part of an
 * answer.
 *
 * The transport is given as a {@link QueryClientOptions.transport} description
 * rather than an open connection, so the client can build it again when it
 * reconnects.
 *
 * @experimental New in 1.x and may change in a minor release: the options, the
 * transport union and the event map are all still settling.
 */
export declare class QueryClient implements CommandExecutor, AsyncDisposable {
    #private;
    constructor(options: QueryClientOptions);
    /** Where the client is in its connection's life. */
    get status(): ClientStatus;
    /**
     * Which server generation the server is, read from its `version` answer.
     * `"unknown"` before connecting.
     *
     * @experimental Part of the entry, which may change in a minor release.
     */
    get serverFamily(): ServerFamily;
    /** The `version` string the server answered with; "" before connecting. */
    get serverVersion(): string;
    /**
     * What the current connection reports about itself: its kind, where it
     * points, when it opened and how many bytes went each way, for a metrics
     * exporter. Read-only. A client with no connection, and a `custom` transport
     * that keeps no counts, report no kind, an empty address, no open time and
     * zero bytes. A reconnection starts the counts again.
     *
     * @experimental Part of the entry, which may change in a minor release.
     */
    get stats(): QueryTransportStats;
    /**
     * The transport carrying this connection, or `undefined` when there is none.
     *
     * Read-only, and the transport is the interface the client itself talks
     * over. The socket underneath is not exposed:
     * a caller that needs it supplies the seam instead (the `connect` option of
     * a `tcp` transport, or `connection` of an `ssh` one), where it is theirs to
     * keep.
     *
     * @experimental Part of the entry, which may change in a minor release.
     */
    get transport(): QueryTransport | undefined;
    /**
     * The notification categories this connection registered for: what `events`
     * asked for, and empty when the transport delivers no notifications or the
     * client is not connected.
     */
    get eventCategories(): readonly QueryEventCategory[];
    /**
     * Connect and set the session up: open the transport, then `login` (the raw
     * TCP transport's `login` option), `use`, `version`, the notification registrations, and one client
     * list.
     *
     * The transport's `login` and the `server` option are applied here rather than left to the
     * caller so that a reconnection is the same session as the first connection
     * was.
     *
     * A failure rejects with its cause and leaves the client disconnected; the
     * transport it opened is closed. `signal` bounds only the connecting: once
     * this resolves, the connection lasts until `disconnect()` or a drop.
     * `connect()` does not retry itself; the `reconnect` option retries a
     * connection that dropped after it was established.
     *
     * `connected` is delivered before this resolves, so a listener added after
     * `await client.connect()` has missed it — add the listeners first.
     */
    connect(options?: {
        readonly signal?: AbortSignal | undefined;
    }): Promise<void>;
    /**
     * Leave the server and close the connection.
     *
     * A `connect()` still in flight fails with a NotConnectedError, and so do
     * the commands still waiting for an answer. Resolves once `disconnected` has
     * been delivered, so a listener added after `await client.disconnect()` does
     * not hear it. Does nothing on a client that is not connected; called again
     * while an earlier call is still running, it waits for that one. An explicit
     * `disconnect()` never reconnects.
     */
    disconnect(): Promise<void>;
    /** `await using client = …` disconnects when the scope ends. */
    [Symbol.asyncDispose](): Promise<void>;
    /**
     * Send a typed command. Passwords go as they are: ServerQuery takes the
     * password itself and hashes it server-side, where the voice protocol wants
     * the hash.
     */
    send(request: CommandRequest, options?: CommandOptions): Promise<Array<Record<string, string>>>;
    /** Send a raw command line and return the rows that answer it. */
    exec(line: string, options?: CommandOptions): Promise<Array<Record<string, string>>>;
    /**
     * Log in with a query account. Over WebQuery the api key does this, and the
     * server refuses the command; over SSH the session is logged in already.
     *
     * Public because a caller driving the client by hand needs it: `connect()`
     * runs it from the tcp transport's `login` option, and this is the same `login` command.
     *
     * On TeamSpeak 3 a failed login gets the caller's IP address banned for 600
     * seconds, so a retry loop on a wrong password locks itself out of every
     * connection from that address.
     */
    login(name: string, password: string, options?: CommandOptions): Promise<void>;
    /**
     * Log out of the server instance, which also deselects the virtual server:
     * commands that need a login or a server fail until `login` and `use` run
     * again. The connection stays open.
     *
     * Not served over WebQuery, whose api key is the login: the server refuses it
     * there (5120, command not in api key scope). A reconnect logs in again from
     * the `login` option.
     *
     * The client's own id and the roster it kept are cleared, as they belong to
     * the server that was left. `use` still selects a server afterwards, as a
     * client with no rights.
     */
    logout(options?: CommandOptions): Promise<void>;
    /**
     * Select the virtual server the following commands address, by id or by
     * voice port. `nickname` names the query client on it.
     *
     * Public for the same reason as {@link QueryClient.login}: `connect()` runs
     * it from the `server` option, and this is the same `use` command. Over
     * WebQuery the transport answers it, by addressing that server from then on.
     *
     * The connection becomes a client of the new server, with an id of its own,
     * so the client reads its id again and drops the roster it kept of the server
     * it was on; with events configured it lists the new server's clients, as
     * `connect()` does. Selecting the server the connection is already on
     * changes nothing, a new nickname included. A refusal leaves the connection
     * on no server, not on the one it was on: the id and the roster are cleared,
     * and the notifications registered are gone, so `use` again and
     * {@link QueryClient.registerNotifications} again.
     *
     * A client connected with no `server` has registered no `events` yet, as
     * the server refuses that with none selected: the first successful `use`
     * registers them.
     *
     * A reconnect starts over from the options the client was made with: it logs
     * in, selects `server` and registers `events` again, and does not repeat a
     * `use` made by hand.
     */
    use(server: {
        readonly id: ServerID | number;
    } | {
        readonly port: number;
    }, options?: CommandOptions & {
        readonly nickname?: string | undefined;
    }): Promise<void>;
    /**
     * Ask the server for the notifications of one category: `server`, `channel`
     * (for one channel, or `0` for all), `textserver`, `textchannel`,
     * `textprivate`, and on TeamSpeak 6 `bans`.
     *
     * Public for the same reason as {@link QueryClient.login}: `connect()` runs
     * it once per configured category. With the WebQuery transport there is
     * nothing to register for and the server refuses it, so the client never
     * calls it there, and neither should a caller.
     *
     * Once the server has accepted it, the client lists the server's clients
     * again, as `connect()` does, so the events it fills from the roster are
     * filled. With no server selected the server refuses it (1024).
     */
    registerNotifications(event: QueryEventCategory, channelID?: bigint | number, options?: CommandOptions): Promise<void>;
    /**
     * Stop receiving the notifications of one category, or of every category
     * when none is named; the counterpart of {@link QueryClient.registerNotifications}.
     * `channelID` narrows `channel` to one channel, as it does there.
     *
     * The server accepts a category it does not know and does nothing. With the
     * WebQuery transport there is nothing registered and the server refuses it.
     * {@link QueryClient.eventCategories} keeps listing what `events` asked for,
     * and a reconnect registers those again.
     */
    unregisterNotifications(event?: QueryEventCategory, channelID?: bigint | number, options?: CommandOptions): Promise<void>;
    /**
     * Listen for an event. Returns a function that removes the listener, which is
     * also a `Disposable` (`using stop = client.on(...)`).
     *
     * ```ts
     * client.on("textMessage", (message) => console.log(message.message));
     * ```
     *
     * A listener that throws does not stop the others: the rest of the event's
     * listeners, and the events after it, are still delivered, and the exception
     * is rethrown on its own, from a microtask, so it surfaces as an
     * `uncaughtException` just as an EventEmitter listener's would.
     *
     * With the WebQuery transport no server event can ever arrive, so this throws
     * a `TypeError` for one rather than accepting a listener that would never
     * run. `connected` and `disconnected` are still accepted: they come from the
     * client, not the server.
     */
    on<K extends keyof QueryEventMap>(event: K, listener: Listener<QueryEventMap, K>): Unsubscribe;
    /** Listen for the next occurrence of an event only. */
    once<K extends keyof QueryEventMap>(event: K, listener: Listener<QueryEventMap, K>): Unsubscribe;
    /**
     * An event as an async iterator, for `for await`:
     *
     * ```ts
     * for await (const message of client.events("textMessage")) { … }
     * ```
     *
     * Events that arrive while the loop body runs are buffered, so none is
     * missed. The buffer is unbounded: an iterator that is not consumed as fast
     * as events arrive holds every one of them, so stop iterating (or abort
     * `signal`) when you stop reading.
     *
     * Iteration ends when the loop exits early (`break`, `return`, a throw), and
     * — for every event but `disconnected` — when the client disconnects. When
     * `signal` aborts, listening stops at once, whatever is buffered is
     * discarded, and the pending and every later `next()` reject with the
     * signal's reason.
     */
    events<K extends keyof QueryEventMap>(event: K, options?: {
        readonly signal?: AbortSignal | undefined;
    }): AsyncIterableIterator<QueryEventMap[K]>;
}
//# sourceMappingURL=client.d.ts.map