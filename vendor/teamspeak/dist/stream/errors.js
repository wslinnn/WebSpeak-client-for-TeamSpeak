import { TeamspeakError } from "@honeybbq/teamspeak";
/**
 * The connected server does not say it does peer to peer streams: its
 * `extensions` (`virtualserver_capability_extensions`) do not name
 * `"STREAM_P2P"`. A TeamSpeak 3 server names none, and answers none of the
 * stream commands, not even with an error, so `publish` and `watch` refuse
 * before sending rather than wait out a timeout. Before the client has
 * connected no server has named any, and it is refused the same way.
 */
export class StreamsUnsupportedError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static kind = "StreamsUnsupportedError";
    static {
        // On the prototype, not the instance, as built-in errors do: an own `name`
        // would be enumerable and show up in JSON.stringify and object spread.
        Object.defineProperty(this.prototype, "name", {
            value: "StreamsUnsupportedError",
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
    /** The server generation the client found. */
    family;
    /** The `virtualserver_version` the server sent; empty before the client has connected. */
    version;
    /** The extensions the server named, `"STREAM_P2P"` not among them. Frozen. */
    extensions;
    constructor(family, version, extensions) {
        const server = family === "unknown" ? "an unknown server" : family;
        const named = extensions.length === 0 ? "none" : extensions.join(", ");
        super(`streams need a server that names STREAM_P2P among its extensions; this is ${server}${version === "" ? "" : ` (${version})`}, which names ${named}`);
        this.family = family;
        this.version = version;
        this.extensions = Object.freeze([...extensions]);
    }
}
/**
 * The stream's owner refused a request to watch it. `watch` rejects with it.
 *
 * The server remembers no decision, so a client can ask again, and every ask
 * is relayed to the publisher. A publisher that means to refuse for good can
 * set `rememberDenied`, or leave the request unanswered.
 */
export class StreamJoinDeniedError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static kind = "StreamJoinDeniedError";
    static {
        // On the prototype, not the instance, as built-in errors do: an own `name`
        // would be enumerable and show up in JSON.stringify and object spread.
        Object.defineProperty(this.prototype, "name", {
            value: "StreamJoinDeniedError",
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
    /** The stream that was asked for. */
    streamId;
    /** The message the owner gave with the refusal; empty for none. */
    serverMessage;
    constructor(streamId, message) {
        super(`the stream's owner denied the request to watch it${message === "" ? "" : `: ${message}`}`);
        this.streamId = streamId;
        this.serverMessage = message;
    }
}
/**
 * A stream command is too long for the server to take. It drops a command
 * line of about 9.2 KB, escaped, without an answer, so the call fails before
 * sending instead of timing out; `MAX_COMMAND_LINE_BYTES` has the exact
 * figure. An SDP offer of a few kilobytes is far under it.
 */
export class StreamPayloadTooLargeError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static kind = "StreamPayloadTooLargeError";
    static {
        // On the prototype, not the instance, as built-in errors do: an own `name`
        // would be enumerable and show up in JSON.stringify and object spread.
        Object.defineProperty(this.prototype, "name", {
            value: "StreamPayloadTooLargeError",
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
    /** The command that would have been sent. */
    command;
    /** The size of its line on the wire, escaped, in bytes. */
    size;
    /** The largest line this SDK sends. */
    limit;
    constructor(command, size, limit) {
        super(`${command} is ${size} bytes escaped; the server takes at most ${limit}`);
        this.command = command;
        this.size = size;
        this.limit = limit;
    }
}
/**
 * The stream is gone: it ended, or its id is not one this client knows or the
 * server does (error 5635). `watch` rejects with it for an id it has not heard
 * of, and when the stream ends before its owner answers; a signalling call
 * does when the stream ended under it. The server's
 * own refusal, when there was one, is the `cause`.
 */
export class StreamEndedError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static kind = "StreamEndedError";
    static {
        // On the prototype, not the instance, as built-in errors do: an own `name`
        // would be enumerable and show up in JSON.stringify and object spread.
        Object.defineProperty(this.prototype, "name", {
            value: "StreamEndedError",
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
    /** The stream that ended. */
    streamId;
    constructor(streamId, options) {
        super(`stream ${streamId} has ended, or is not known`, options);
        this.streamId = streamId;
    }
}
/**
 * The stream's media does not travel peer to peer, the one mode this SDK
 * watches: the server announced it in another mode (`StreamInfo.transport`).
 * `watch` rejects with it before sending anything.
 */
export class StreamTransportUnsupportedError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static kind = "StreamTransportUnsupportedError";
    static {
        // On the prototype, not the instance, as built-in errors do: an own `name`
        // would be enumerable and show up in JSON.stringify and object spread.
        Object.defineProperty(this.prototype, "name", {
            value: "StreamTransportUnsupportedError",
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
    /** The stream that was asked for. */
    streamId;
    /** The mode the server announced it in, as the wire number. */
    transport;
    constructor(streamId, transport) {
        super(`stream ${streamId} is in mode ${transport}; only peer to peer streams can be watched`);
        this.streamId = streamId;
        this.transport = transport;
    }
}
//# sourceMappingURL=errors.js.map