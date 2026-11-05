import type { QueryTransport, QueryTransportStats } from "./transport.js";
/**
 * The part of a duplex byte stream a line transport uses. A `node:net` socket
 * is one; so is an SSH shell channel, or a test double.
 */
export interface QueryStream {
    /** Write bytes to the peer; `callback` runs once they are flushed, with the failure if any. */
    write(data: string, callback: (error?: Error | null) => void): unknown;
    /** Close the stream. */
    end(): unknown;
    /** Drop the stream without waiting for the peer; used for a peer that must not be read on. */
    destroy?(): unknown;
    /** Listen for each chunk received. */
    on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
    /** Listen for a failure, which ends the connection. */
    on(event: "error", listener: (error: Error) => void): unknown;
    /** Listen for the stream closing. */
    on(event: "close", listener: () => void): unknown;
}
/**
 * A {@link QueryTransport} over a byte stream: raw TCP, or an SSH shell.
 *
 * Both greet with a two-line banner, `TS3` and a welcome sentence, before any
 * answer. It is skipped, so the client sees only answers and notifications.
 */
export declare class StreamTransport implements QueryTransport {
    #private;
    /** A raw TCP connection and an SSH session both carry pushed notifications. */
    readonly supportsNotifications = true;
    onLine: ((line: string) => void) | null;
    onClose: ((error: Error | undefined) => void) | null;
    /**
     * `onEnd` runs once the stream is closed, to release what the stream sits
     * on: an SSH session's connection, say. `identity` says which kind of
     * connection this is and where it points, for {@link StreamTransport.stats}.
     */
    constructor(stream: QueryStream, onEnd?: () => void, identity?: {
        readonly transport: "tcp" | "ssh";
        readonly address: string;
    });
    send(line: string): Promise<void>;
    stats(): QueryTransportStats;
    /**
     * Say `quit`, give the server a moment to end the session, and close.
     *
     * Ending the connection without it is not always noticed: a TeamSpeak 3
     * server can keep an SSH session, and its slot among the few each address
     * gets, long after the client has gone. `quit` is the command that ends a
     * session, and the server answers it by closing the stream.
     */
    close(): Promise<void>;
}
//# sourceMappingURL=stream.d.ts.map