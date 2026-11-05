import type { CommandMiddleware, Logger, ReconnectOptions, ServerID } from "@honeybbq/teamspeak";
import type { QueryTransport } from "./transport.js";
import type { TcpConnector } from "./tcp.js";
import type { SshConnectOptions } from "./ssh.js";
import type { WebCredentials } from "./web.js";
/**
 * The connection a `QueryClient` talks over, as a description rather than an
 * open transport: the client builds one from it on every connection, so a
 * reconnect is the same connection as the first one was.
 *
 * `custom` is the escape hatch for anything the three built-in kinds do not
 * cover — a proxy, a tunnel, a test double — and is the only one that cannot
 * be rebuilt from data alone: it is called again for each attempt.
 */
export type QueryTransportOptions = {
    /** A raw ServerQuery connection. TeamSpeak 3 only: TS6 dropped it. */
    readonly kind: "tcp";
    /** The server's host. */
    readonly host: string;
    /** The raw query port; 10011 by default. */
    readonly port?: number | undefined;
    /**
     * Opens the connection; `net.createConnection` by default. See
     * {@link TcpOptions.connect}.
     */
    readonly connect?: TcpConnector | undefined;
    /**
     * The query account to log in as, sent as a `login` command once the
     * connection is open, and again on every reconnect. Left out, the
     * session starts unauthenticated. SSH and WebQuery carry their
     * credentials in their own arm.
     */
    readonly login?: {
        readonly name: string;
        readonly password: string;
    } | undefined;
} | ({
    /**
     * A ServerQuery over SSH. On TeamSpeak 6 a server may hold back the end
     * of a reply until the client writes again; this transport handles that
     * itself, by writing an empty line while a command waits.
     */
    readonly kind: "ssh";
} & SshConnectOptions) | ({
    /** WebQuery, the HTTP interface of TeamSpeak 3 (3.12 and later) and TeamSpeak 6. */
    readonly kind: "web";
    /**
     * The server's base URL, such as `http://127.0.0.1:10080` or
     * `https://ts.example.com:10443`.
     */
    readonly url: string;
    /**
     * The `fetch` to use; by default a small one over `node:http` or
     * `node:https` by the URL's scheme, verifying an HTTPS certificate
     * against Node's trust store. For a private CA, pass a `fetch` that
     * trusts it, or start Node with `NODE_EXTRA_CA_CERTS`.
     */
    readonly fetch?: typeof fetch | undefined;
} & WebCredentials) | {
    /** An application-supplied transport. */
    readonly kind: "custom";
    /**
     * Open the transport. Called once per connection attempt, with the
     * signal that abandons that attempt; a transport that ignores it is
     * abandoned all the same.
     */
    readonly open: (signal?: AbortSignal) => Promise<QueryTransport>;
};
/** The values of the table below, before freezing. */
declare const queryEventCategoryValues: {
    /** Server-wide events, such as clients joining and leaving. */
    readonly Server: "server";
    /** Events of the channels, such as one being created or edited. */
    readonly Channel: "channel";
    /** Text messages to the server. */
    readonly TextServer: "textserver";
    /** Text messages to a channel. */
    readonly TextChannel: "textchannel";
    /** Private text messages to this client. */
    readonly TextPrivate: "textprivate";
    /** Ban list changes. */
    readonly Bans: "bans";
    /** A privilege key being used. */
    readonly TokenUsed: "tokenused";
};
/**
 * One category of notifications to register for: the `event` parameter of
 * `servernotifyregister`.
 *
 * `bans` is not registered by default: TeamSpeak 3 refuses it with 1539,
 * which would fail the registration of every category after it. `tokenused`
 * is not registered by default either: both servers accept it (measured) and
 * then send `notifytokenused`, which carries a privilege key and has no typed
 * event, so it reaches `notification` only.
 */
export declare const QueryEventCategory: typeof queryEventCategoryValues;
/** One of {@link QueryEventCategory}. */
export type QueryEventCategory = (typeof QueryEventCategory)[keyof typeof QueryEventCategory];
/**
 * Which notification categories to register for.
 *
 * `true` (the default) registers the ones raw TCP and SSH both accept;
 * `{ categories }` names them; `false` registers nothing. This says nothing
 * about whether the transport can deliver notifications — a transport
 * declares that itself, see {@link QueryTransport.supportsNotifications} — so
 * asking for categories on one that cannot is an error rather than a silent
 * no-op.
 *
 * What each category delivers, as events of the client (measured on TeamSpeak 3
 * over raw TCP and TeamSpeak 6 over SSH, which agree):
 *
 * | Category                                | Events                                                                                                                                      |
 * | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
 * | `server`                                | `serverEdited`                                                                                                                              |
 * | `channel` (registered for every channel) | `channelCreated`, `channelEdited`, `channelMoved`, `channelDeleted`, `channelDescriptionChanged`, `channelPasswordChanged`, `clientEnter`, `clientLeave`, `clientMoved` |
 * | `textserver`, `textchannel`, `textprivate` | `textMessage`, for the server, the channel and private messages                                                                         |
 * | `bans`                                  | `banUpdated`                                                                                                                                |
 * | `tokenused`                             | none (`notification` only)                                                                                                                  |
 *
 * Leaving a category out leaves its events out: `{ categories: ["textprivate"] }`
 * delivers no channel event. The voice client's events about clients' updates,
 * group changes, subscriptions, plugin commands and typing are not sent to a
 * ServerQuery connection by either server, so this client does not offer them.
 */
export type QueryEventsOption = boolean | {
    readonly categories?: readonly QueryEventCategory[];
};
/** How a `QueryClient` connects, logs and behaves. */
export interface QueryClientOptions {
    /** How to reach the server. Required: a client cannot connect without one. */
    readonly transport: QueryTransportOptions;
    /**
     * The virtual server to select with `use`, by id or by voice port. Over
     * WebQuery the transport answers `use` itself, by addressing that server in
     * its requests. Unset leaves the instance selected on raw TCP, where the
     * server's own default applies.
     *
     * Without it the client connects with no server selected, which serves the
     * instance-level commands (`instanceinfo`, `serverlist`, `use`). The events
     * need a server, so they are registered by the first {@link QueryClient.use}.
     */
    readonly server?: {
        readonly id: ServerID | number;
    } | {
        readonly port: number;
    } | undefined;
    /** The query client's nickname on the server (`client_nickname` of `use`). */
    readonly nickname?: string | undefined;
    /**
     * Register for server notifications: `true` (the default) for the five
     * categories raw TCP and SSH both accept, `{ categories }` to name them, or
     * `false` for none. See {@link QueryEventsOption}.
     *
     * Registering for anything on a transport that cannot deliver notifications
     * throws a `TypeError`, at construction when the `transport` kind says so
     * and when connecting for a `custom` transport.
     *
     * The client keeps a roster of who is on the server, to fill the fields a
     * notification leaves out, such as a sender's groups: a snapshot taken on
     * connecting (`clientlist -uid -groups -away -voice`), kept up to date by the
     * enter, leave and move notifications. A ServerQuery connection is not sent
     * `clientupdated`, so a client's groups, away flag and mute state are as of
     * the listing, or of the moment it entered view, and do not follow later
     * changes.
     */
    readonly events?: QueryEventsOption | undefined;
    /**
     * Reconnect after a dropped connection. Off by default, as for the voice
     * client, and a deliberate `disconnect()` never reconnects. The retry
     * decision is {@link defaultShouldRetry}.
     */
    readonly reconnect?: ReconnectOptions | undefined;
    /**
     * How long a raw TCP or SSH session may sit idle before the client sends
     * `version` to keep it open, in milliseconds. 120000 (two minutes) by default;
     * `0` turns it off.
     *
     * Measured on TeamSpeak 3 3.13.8 (raw TCP and SSH) and TeamSpeak 6
     * 6.0.0-beta13.1 (SSH): the server closes a query session that has sent no
     * command for 300 seconds, and a session that sends one every 200 seconds
     * stays open. Notifications arriving do not count: a raw TCP session on
     * TeamSpeak 3 that received nine and sent nothing was closed at 300 seconds
     * all the same. The command is sent only when none has been
     * for this long, so a busy client sends nothing extra. WebQuery has no session
     * to keep, and a `custom` transport is left to its own owner.
     */
    readonly keepAliveMs?: number | undefined;
    /**
     * Wraps every typed command, outermost first; see `CommandMiddleware`. Raw
     * lines sent with `exec` do not pass through it. Fixed for the client's life.
     */
    readonly commandMiddleware?: readonly CommandMiddleware[] | undefined;
    /** Where the client logs. Silent unless set. */
    readonly logger?: Logger | undefined;
}
/** The five categories both raw TCP on TS3 and SSH on TS6 accept. */
export declare const DEFAULT_EVENT_CATEGORIES: readonly QueryEventCategory[];
/** A transport with its defaults filled, and its fields copied. */
export type ResolvedTransport = {
    readonly kind: "tcp";
    readonly host: string;
    readonly port: number;
    readonly connect: TcpConnector | undefined;
    readonly login: {
        readonly name: string;
        readonly password: string;
    } | undefined;
} | {
    readonly kind: "ssh";
    /** What `connectSsh` is given, with the port filled in; one arm of {@link SshConnectOptions}. */
    readonly connect: SshConnectOptions;
} | {
    readonly kind: "web";
    readonly url: string;
    /** Absent exactly for a guest connection, which sends no api key. */
    readonly apiKey: string | undefined;
    readonly fetch: typeof fetch | undefined;
} | {
    readonly kind: "custom";
    readonly open: (signal?: AbortSignal) => Promise<QueryTransport>;
};
/** Options with their defaults filled and their fields copied. */
export interface ResolvedQueryOptions {
    readonly transport: ResolvedTransport;
    readonly server: {
        readonly id: ServerID | number;
    } | {
        readonly port: number;
    } | undefined;
    readonly nickname: string | undefined;
    /** The categories the caller asked to register for; `events: false` leaves this empty. */
    readonly eventCategories: readonly QueryEventCategory[];
    /**
     * Whether the transport the options name can deliver notifications. False
     * for `web`; `undefined` for `custom`, whose transport object does not exist
     * until it is opened, and which is checked then.
     */
    readonly notificationsSupported: boolean | undefined;
    /**
     * Whether the caller named `events` at all, whatever its value. On a
     * transport that cannot deliver notifications, naming it is the mistake to
     * report; leaving it unset is not.
     */
    readonly eventsRequested: boolean;
    readonly reconnect: ReconnectOptions | undefined;
    readonly commandMiddleware: readonly CommandMiddleware[] | undefined;
    readonly keepAliveMs: number;
    readonly logger: Logger | undefined;
}
/** How long a session may be idle before the client keeps it open; the server drops one at 300 s. */
export declare const DEFAULT_KEEP_ALIVE_MS = 120000;
/**
 * Refuse a request to register on a transport that cannot deliver what it
 * would register for.
 *
 * WebQuery refuses `servernotifyregister` with 5120, and a listener that can
 * never run is worse than an error: the caller would be left believing the
 * server had nothing to say. Naming `events` at all is the mistake, even as
 * `false`, since it says the caller read the option as a capability.
 */
export declare function assertEventsSupported(resolved: ResolvedQueryOptions): void;
/**
 * Check the options and fill in the defaults, once, when the client is made:
 * an option that cannot be one is a bug in the caller's code, and is worth
 * hearing about before a connection is attempted.
 */
export declare function normalizeQueryOptions(options: QueryClientOptions): ResolvedQueryOptions;
export {};
//# sourceMappingURL=options.d.ts.map