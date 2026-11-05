import { hostKeyDecision } from "./ssh.js";
/** The values of the table below, before freezing. */
const queryEventCategoryValues = {
    /** Server-wide events, such as clients joining and leaving. */
    Server: "server",
    /** Events of the channels, such as one being created or edited. */
    Channel: "channel",
    /** Text messages to the server. */
    TextServer: "textserver",
    /** Text messages to a channel. */
    TextChannel: "textchannel",
    /** Private text messages to this client. */
    TextPrivate: "textprivate",
    /** Ban list changes. */
    Bans: "bans",
    /** A privilege key being used. */
    TokenUsed: "tokenused",
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
export const QueryEventCategory = 
/* @__PURE__ */ Object.freeze(queryEventCategoryValues);
/** The five categories both raw TCP on TS3 and SSH on TS6 accept. */
export const DEFAULT_EVENT_CATEGORIES = Object.freeze([
    QueryEventCategory.Server,
    QueryEventCategory.Channel,
    QueryEventCategory.TextServer,
    QueryEventCategory.TextChannel,
    QueryEventCategory.TextPrivate,
]);
const CATEGORIES = new Set([
    "server",
    "channel",
    "textserver",
    "textchannel",
    "textprivate",
    "bans",
    "tokenused",
]);
/** How long a session may be idle before the client keeps it open; the server drops one at 300 s. */
export const DEFAULT_KEEP_ALIVE_MS = 120_000;
function nonEmpty(value, name) {
    if (typeof value !== "string" || value === "") {
        throw new TypeError(`${name} is a non-empty string`);
    }
    return value;
}
/** `guest` is `true` or left out: it is a decision, not a switch to set to false. */
function guestFlag(value) {
    if (value === undefined)
        return false;
    if (value !== true) {
        throw new TypeError("transport.guest is `true` or left out: it is a decision, not a switch");
    }
    return true;
}
/**
 * The SSH login: a name and a password, or `guest` alone. Without `guest`,
 * missing credentials are an error rather than a guest connection.
 */
function sshCredentials(options) {
    if (guestFlag(options["guest"])) {
        if (options["username"] !== undefined || options["password"] !== undefined) {
            throw new TypeError("transport.username and transport.password were given with transport.guest; a guest logs in as `guest` with no password");
        }
        return { guest: true };
    }
    const missing = (name) => `transport.${name} is a non-empty string; to connect without a login, as a guest, set transport.guest to true`;
    const { username, password } = options;
    if (typeof username !== "string" || username === "")
        throw new TypeError(missing("username"));
    if (typeof password !== "string" || password === "")
        throw new TypeError(missing("password"));
    return { username, password };
}
function port(value, name) {
    if (value === undefined)
        return -1; // replaced by the caller's default
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
        throw new RangeError(`${name} is an integer port from 1 to 65535`);
    }
    return value;
}
function transportOptions(transport) {
    if (typeof transport !== "object" || transport === null) {
        throw new TypeError("transport is an object");
    }
    const options = transport;
    if (options["login"] !== undefined && options["kind"] !== "tcp") {
        throw new TypeError(`transport.login belongs to the "tcp" transport; the ${String(options["kind"])} transport carries its own credentials`);
    }
    switch (options["kind"]) {
        case "tcp": {
            const host = nonEmpty(options["host"], "transport.host");
            const raw = port(options["port"], "transport.port");
            const connect = options["connect"];
            if (connect !== undefined && typeof connect !== "function") {
                throw new TypeError("transport.connect is a function");
            }
            const login = options["login"];
            if (login !== undefined) {
                if (typeof login !== "object" || login === null) {
                    throw new TypeError("transport.login is { name, password }");
                }
                const { name, password } = login;
                nonEmpty(name, "transport.login.name");
                if (typeof password !== "string") {
                    throw new TypeError("transport.login.password is a string");
                }
            }
            return {
                kind: "tcp",
                host,
                port: raw < 0 ? 10011 : raw,
                connect: connect,
                login: login === undefined ? undefined : { ...login },
            };
        }
        case "ssh": {
            const host = nonEmpty(options["host"], "transport.host");
            const raw = port(options["port"], "transport.port");
            const connection = options["connection"];
            if (connection !== undefined &&
                typeof connection !== "function" &&
                (typeof connection !== "object" || connection === null)) {
                throw new TypeError("transport.connection is an SSH client or a factory for one");
            }
            // Asked here as well as when connecting: a client that could never
            // connect, for want of a decision about the host key, is the caller's
            // mistake and is reported when the client is made.
            const decision = hostKeyDecision(options);
            const address = { host, port: raw < 0 ? 10022 : raw };
            // Built from the decision rather than copied, so each arm is made of
            // exactly what it takes and the union needs no cast.
            if (decision.kind === "connection") {
                return {
                    kind: "ssh",
                    connect: { ...address, connection: connection },
                };
            }
            const login = {
                ...address,
                ...sshCredentials(options),
            };
            switch (decision.kind) {
                case "verifier":
                    return { kind: "ssh", connect: { ...login, hostKey: decision.verify } };
                case "knownHosts":
                    return { kind: "ssh", connect: { ...login, knownHosts: decision.path } };
                case "insecure":
                    return { kind: "ssh", connect: { ...login, insecureIgnoreHostKey: true } };
            }
        }
        case "web": {
            const fetchFn = options["fetch"];
            if (fetchFn !== undefined && typeof fetchFn !== "function") {
                throw new TypeError("transport.fetch is a function");
            }
            const url = nonEmpty(options["url"], "transport.url");
            const guest = guestFlag(options["guest"]);
            const apiKey = options["apiKey"];
            if (guest) {
                if (apiKey !== undefined) {
                    throw new TypeError("transport.apiKey and transport.guest were given together; a guest sends no api key");
                }
            }
            else if (typeof apiKey !== "string" || apiKey === "") {
                throw new TypeError("transport.apiKey is a non-empty string; to connect without one, as a guest, set transport.guest to true");
            }
            return {
                kind: "web",
                url,
                apiKey: guest ? undefined : apiKey,
                fetch: fetchFn,
            };
        }
        case "custom": {
            const open = options["open"];
            if (typeof open !== "function")
                throw new TypeError("transport.open is a function");
            return {
                kind: "custom",
                open: open,
            };
        }
        default:
            throw new TypeError('transport.kind is one of "tcp", "ssh", "web" or "custom"');
    }
}
/**
 * The categories to register for. These are a wish, not a capability: whether
 * the transport can deliver a notification is its own to report, and a request
 * on one that cannot is the caller's mistake, reported by
 * {@link assertEventsSupported}.
 */
function eventCategories(events) {
    if (events === false)
        return [];
    if (events === undefined || events === true)
        return DEFAULT_EVENT_CATEGORIES;
    if (typeof events !== "object" || events === null) {
        throw new TypeError("events is a boolean or { categories }");
    }
    const categories = events.categories ?? DEFAULT_EVENT_CATEGORIES;
    if (!Array.isArray(categories))
        throw new TypeError("events.categories is an array");
    for (const category of categories) {
        if (typeof category !== "string" || !CATEGORIES.has(category)) {
            throw new TypeError(`events.categories has an unknown category ${JSON.stringify(category)}`);
        }
    }
    return [...categories];
}
/**
 * Refuse a request to register on a transport that cannot deliver what it
 * would register for.
 *
 * WebQuery refuses `servernotifyregister` with 5120, and a listener that can
 * never run is worse than an error: the caller would be left believing the
 * server had nothing to say. Naming `events` at all is the mistake, even as
 * `false`, since it says the caller read the option as a capability.
 */
export function assertEventsSupported(resolved) {
    if (resolved.notificationsSupported !== false || !resolved.eventsRequested)
        return;
    throw new TypeError("this transport delivers no notifications, so `events` cannot be set");
}
/**
 * Check the options and fill in the defaults, once, when the client is made:
 * an option that cannot be one is a bug in the caller's code, and is worth
 * hearing about before a connection is attempted.
 */
export function normalizeQueryOptions(options) {
    // Plain JavaScript can still pass the old top-level `login`; dropping it
    // quietly would leave the caller unauthenticated and believing otherwise.
    if (options.login !== undefined) {
        throw new TypeError("login is no longer a client option: give it to the tcp transport, as transport.login");
    }
    const transport = transportOptions(options.transport);
    const server = options.server;
    if (server !== undefined) {
        if (typeof server !== "object" || server === null) {
            throw new TypeError("server is { id } or { port }");
        }
        const byID = "id" in server;
        const raw = byID ? server.id : server.port;
        const value = typeof raw === "bigint" ? Number(raw) : raw;
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
            throw new RangeError(`server.${byID ? "id" : "port"} is a non-negative integer`);
        }
        // A port names a virtual server's voice port, which is 1 to 65535; an id
        // is a server's own number, which starts at 1 and has no ceiling here.
        if (!byID && (value < 1 || value > 65535)) {
            throw new RangeError("server.port is an integer from 1 to 65535");
        }
    }
    const keepAliveMs = options.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS;
    if (!Number.isInteger(keepAliveMs) || keepAliveMs < 0) {
        throw new RangeError("keepAliveMs is a non-negative integer, 0 to turn it off");
    }
    const nickname = options.nickname;
    if (nickname !== undefined)
        nonEmpty(nickname, "nickname");
    const commandMiddleware = options.commandMiddleware;
    if (commandMiddleware !== undefined && !Array.isArray(commandMiddleware)) {
        throw new TypeError("commandMiddleware is an array");
    }
    const resolved = {
        transport,
        server: server === undefined ? undefined : { ...server },
        nickname,
        eventCategories: eventCategories(options.events),
        // `web` is the only kind whose capability is known before it is opened.
        notificationsSupported: transport.kind === "custom" ? undefined : transport.kind !== "web",
        eventsRequested: options.events !== undefined,
        reconnect: options.reconnect,
        commandMiddleware,
        keepAliveMs,
        logger: options.logger,
    };
    assertEventsSupported(resolved);
    return resolved;
}
//# sourceMappingURL=options.js.map