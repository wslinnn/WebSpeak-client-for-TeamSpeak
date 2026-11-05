import type { ClientID, CommandRequest, Unsubscribe } from "@honeybbq/teamspeak";
import { ViewerPeerImpl } from "./peer.js";
import type { PublishedStream, PublishedStreamEvents, StreamEnded, StreamInfo, StreamWarning, ViewerIdentity, ViewerPeer } from "./types.js";
/** What a published stream needs of the `Streams` that made it. */
export interface PublishHost {
    /**
     * The viewer's identity: from the clients in view when it is one, else asked
     * of the server; as far as that goes.
     */
    identity(clientId: ClientID): ViewerIdentity | Promise<ViewerIdentity>;
    /** Report a failure nobody awaits. */
    report(error: Error): void;
    /** Whether a viewer was denied and is to be left unanswered. */
    isDenied(identity: ViewerIdentity): boolean;
    /** Note that a viewer was denied. */
    remember(identity: ViewerIdentity): void;
    /** Pass on something noticed that is let through. */
    warn(warning: StreamWarning): void;
    /** Send a stream command; a stream the server does not know is a StreamEndedError. */
    send(request: CommandRequest, streamId: string): Promise<void>;
    /** Send `stopstream` for a stream of this client's; a stream already gone is not an error. */
    stop(streamId: string, reason: number): Promise<void>;
    /** What is known of the stream now. */
    info(streamId: string): StreamInfo | undefined;
    /** End the stream here and say so, for `stop()`. */
    stopped(streamId: string, reason: number): void;
}
/** A stream this client publishes. */
export declare class PublishedImpl implements PublishedStream {
    #private;
    readonly id: string;
    readonly host: PublishHost;
    constructor(info: StreamInfo, host: PublishHost);
    get info(): StreamInfo;
    get ended(): boolean;
    on<K extends keyof PublishedStreamEvents>(event: K, listener: (payload: PublishedStreamEvents[K]) => void): Unsubscribe;
    viewers(): readonly ViewerPeer[];
    stop(reason?: number): Promise<void>;
    /** The peer for a viewer this stream let in. */
    openViewer(clientId: ClientID): ViewerPeerImpl;
    /** A viewer asked to watch. */
    request(clientId: ClientID, message: string): void;
    /** The client left view: a request of its that nobody answered is forgotten, as the clid may be reused. */
    dropPending(clientId: ClientID): void;
    /** A viewer is gone, by saying so or by disconnecting. */
    viewerGone(clientId: ClientID): void;
    /**
     * A signalling JSON from a viewer; false when this stream has no such
     * viewer. A viewer whose peer is over is answered true and ignored: the
     * server cannot remove a viewer, so it may keep sending.
     */
    signal(clientId: ClientID, json: string): boolean;
    /** The stream is over: close everything that hangs on it, once. */
    finish(ended: StreamEnded): void;
}
//# sourceMappingURL=published.d.ts.map