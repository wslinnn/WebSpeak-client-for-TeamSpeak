import type { Unsubscribe } from "@honeybbq/teamspeak";
import type { PublishedStream, PublishOptions, StreamInfo, StreamsClient, StreamsEventMap, StreamsOptions, StreamView, WatchOptions } from "./types.js";
/**
 * TeamSpeak 6 streams, the screen share: who is streaming, publishing a
 * stream, and watching one.
 *
 * Only the signalling is here. A stream's video travels between the publisher
 * and each viewer over WebRTC, which is the application's: this gives it the
 * SDP and ICE messages as strings, and takes them back, and any WebRTC stack
 * can be plugged in. TeamSpeak does not document the protocol and it was
 * measured on TeamSpeak 6 6.0.0-beta13.1 and tried with the TeamSpeak 6 client
 * 6.0.0-beta5.
 *
 * `Streams` attaches to a voice client, before or after it connects, and finds
 * the streams of the clients it sees: a client with `client_is_streaming` set
 * is asked for them with `requeststreaminfo`. Every stream is known by its id,
 * and a client may run several. What `list()` holds is what this client has
 * heard of: a stream that ends while its publisher is out of the channel is
 * reported to nobody there, and stays until the connection ends.
 *
 * ```ts
 * const streams = new Streams(client);
 * streams.on("started", (info) => console.log(`${info.name} is streaming`));
 * const view = await streams.watch(info);
 * // hand view.offer to an RTCPeerConnection, send its answer with view.answer()
 * ```
 */
export declare class Streams {
    #private;
    /**
     * Attach to `client`, which may not have connected yet. Nothing is sent
     * until it has, and on a server that is not TeamSpeak 6 nothing is ever sent.
     */
    constructor(client: StreamsClient, options?: StreamsOptions);
    /**
     * Whether the connected server says it does peer to peer streams: its
     * `extensions` name `"STREAM_P2P"`.
     */
    get supported(): boolean;
    /** The streams known now, in the order they became known. */
    list(): readonly StreamInfo[];
    /** The stream with this id, if known. */
    get(id: string): StreamInfo | undefined;
    /** Listen for an event; returns a function that removes the listener. */
    on<K extends keyof StreamsEventMap>(event: K, listener: (payload: StreamsEventMap[K]) => void): Unsubscribe;
    /**
     * Stop listening to the client and end every session: the streams published
     * here, the views and the viewers, each closed once with the cause
     * `"disposed"`. While the client is connected, each stream published here is
     * stopped (`stopstream`) and each stream watched here is left
     * (`joinstreamrequest` with `is_remove=1`), as far as the server takes them;
     * a failure goes to the `error` event of these Streams, which still has its
     * listeners. A `publish` still waiting is rejected, and a stream it started
     * after all is stopped when the server announces it, if the client is still
     * connected. When the connection is already gone nothing is
     * sent, and the server ends the streams itself.
     */
    dispose(): void;
    /**
     * Start a stream and resolve once the server has announced it. The call
     * sends `setupstream` with all seven parameters, in peer to peer mode, the
     * only mode the server allows. A client may publish several streams, and
     * several calls may be in flight: the server echoes each command's
     * `return_code` on the announcement of the stream it started, so each call
     * receives its own, whatever the names. When the call gives up, by timeout or
     * abort, the command is kept open for five seconds after that moment, and
     * the stream it announces within is stopped; one announced later cannot be
     * told from any other of this client's, and is left to `list()`. The command
     * is sent even if the call is aborted before it leaves the throttle, and
     * then stopped the same way, so other clients may see the stream start and
     * stop.
     *
     * Throws a `StreamsUnsupportedError`, without sending anything, on a server
     * that does not name `STREAM_P2P` among its extensions, and a `RangeError` for an option that is out of
     * range.
     */
    publish(options: PublishOptions): Promise<PublishedStream>;
    /**
     * Ask to watch a stream and resolve once its publisher lets this client in,
     * with the SDP offer in the view. Pass the id of a stream in `list()`, or its
     * info.
     *
     * Rejects with a `StreamJoinDeniedError` when the publisher refuses, a
     * `StreamEndedError` when the id is not one this client has heard of, or the
     * stream ends first (or is gone: error 5635), a
     * `StreamsUnsupportedError` on a server without streams, a
     * `StreamTransportUnsupportedError` without sending anything for a stream
     * whose media does not travel peer to peer, and the server's own error
     * otherwise, among them 5638 (`ErrorCode.StreamAlreadyJoined`)
     * when this client already asked. When the wait runs out or `signal` aborts,
     * the request is withdrawn.
     */
    watch(target: string | StreamInfo, options?: WatchOptions): Promise<StreamView>;
}
//# sourceMappingURL=streams.d.ts.map