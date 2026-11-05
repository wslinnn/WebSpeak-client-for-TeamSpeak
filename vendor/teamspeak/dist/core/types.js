/** A no-op logger that discards all messages. */
export const noopLogger = Object.freeze({
    debug() { },
    info() { },
    warn() { },
    error() { },
});
/** A console-backed logger. */
export const consoleLogger = Object.freeze({
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
});
/** The values of the table below, before freezing. */
const clientStatusValues = {
    /** Not connected: before `connect()`, after `disconnect()`, or after a drop. */
    Disconnected: "disconnected",
    /** Connecting: `connect()` is waiting for the handshake. */
    Connecting: "connecting",
    /** Connected: the handshake completed and commands can be sent. */
    Connected: "connected",
};
/** Where a client is in its connection's life. */
export const ClientStatus = 
/* @__PURE__ */ Object.freeze(clientStatusValues);
/** The values of the table below, before freezing. */
const serverFamilyValues = {
    /** TeamSpeak 3: major version 3. */
    TS3: "ts3",
    /** TeamSpeak 6: major version 6 or later. */
    TS6: "ts6",
    /** A version string that names neither generation, or has no number. */
    Unknown: "unknown",
};
/** The server generation a version string belongs to. */
export const ServerFamily = 
/* @__PURE__ */ Object.freeze(serverFamilyValues);
/**
 * Pick the server generation from a `virtualserver_version` string such as
 * "6.0.0-beta13.1" or "3.13.8 [Build: 1779874471]": major version 3 is TS3,
 * 6 and later TS6, anything else, including a string with no number, unknown.
 * Both clients use it, so they cannot disagree about the same server.
 */
export function serverFamilyForVersion(version) {
    const major = Number.parseInt(version, 10);
    if (Number.isNaN(major))
        return ServerFamily.Unknown;
    if (major === 3)
        return ServerFamily.TS3;
    if (major >= 6)
        return ServerFamily.TS6;
    return ServerFamily.Unknown;
}
//# sourceMappingURL=types.js.map