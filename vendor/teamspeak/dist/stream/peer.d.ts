import type { ClientID, Unsubscribe } from "@honeybbq/teamspeak";
import type { IceCandidate, Peer, PeerClosed, PeerEvents, StreamView, StreamWarning, ViewerPeer } from "./types.js";
/** What a peer needs of the `Streams` that made it. */
export interface PeerLink {
    /** Send a signalling JSON to the other end. */
    sendJson(json: string): Promise<void>;
    /** Tell the server this end is leaving; absent where there is nothing to tell. */
    leave?(): Promise<void>;
    /** The peer closed, whoever closed it. */
    closed(peer: PeerImpl): void;
    /** Something happened that nobody awaits, such as an event dropped for want of a listener. */
    report(error: Error): void;
    /** Something noticed that is let through; absent where nothing is checked. */
    warn?(warning: StreamWarning): void;
}
/** The warning for an offer with no audio section. */
export declare function noAudioWarning(streamId: string, clientId: ClientID): StreamWarning;
/** One end of a stream's signalling with one other client. */
export declare class PeerImpl implements Peer {
    #private;
    readonly streamId: string;
    readonly clientId: ClientID;
    constructor(streamId: string, clientId: ClientID, link: PeerLink);
    get closed(): boolean;
    on<K extends keyof PeerEvents>(event: K, listener: (payload: PeerEvents[K]) => void): Unsubscribe;
    sendCandidate(candidate: IceCandidate): Promise<void>;
    sendSignal(cmd: string, args: unknown): Promise<void>;
    close(): Promise<void>;
    /** Warn that an offer for this peer has no audio section. */
    protected warnWithoutAudio(): void;
    /** Send a message of the subclasses'. */
    protected send(json: string): Promise<void>;
    /** A signalling JSON from the other end. */
    deliver(json: string): void;
    /** Close without telling the server, once. */
    end(closed: PeerClosed): void;
}
/** The publisher's end for one accepted viewer. */
export declare class ViewerPeerImpl extends PeerImpl implements ViewerPeer {
    sendOffer(sdp: string): Promise<void>;
}
/** The viewer's end of a stream it was let into. */
export declare class StreamViewImpl extends PeerImpl implements StreamView {
    readonly offer: string;
    constructor(streamId: string, streamer: ClientID, offer: string, link: PeerLink);
    answer(sdp: string): Promise<void>;
    leave(): Promise<void>;
}
//# sourceMappingURL=peer.d.ts.map