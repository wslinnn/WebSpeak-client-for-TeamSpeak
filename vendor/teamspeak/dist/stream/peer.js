import { TeamspeakError } from "@honeybbq/teamspeak";
import { Emitter, MAX_KEPT } from "./emitter.js";
import { answerJson, candidateJson, encodeSignal, hasAudioSection, offerJson, parseSignal, } from "./wire.js";
/** The warning for an offer with no audio section. */
export function noAudioWarning(streamId, clientId) {
    return {
        code: "offer-without-audio",
        streamId,
        clientId,
        message: `the offer for client ${clientId} has no m=audio section: the TeamSpeak 6 client does not answer an offer without audio, and its Join button then does nothing`,
    };
}
/** One end of a stream's signalling with one other client. */
export class PeerImpl {
    streamId;
    clientId;
    #link;
    #closed = false;
    #emitter;
    constructor(streamId, clientId, link) {
        this.streamId = streamId;
        this.clientId = clientId;
        this.#link = link;
        let reported = false;
        this.#emitter = new Emitter(["offer", "answer", "candidate", "signal", "closed"], (event) => {
            // Once for the peer, not for every message past the bound.
            if (reported)
                return;
            reported = true;
            link.report(new TeamspeakError(`stream ${streamId}: dropping the oldest ${event} from client ${clientId}: ${MAX_KEPT} are waiting for a listener`));
        });
    }
    get closed() {
        return this.#closed;
    }
    on(event, listener) {
        return this.#emitter.on(event, listener);
    }
    sendCandidate(candidate) {
        return this.#send(() => candidateJson(candidate));
    }
    sendSignal(cmd, args) {
        return this.#send(() => encodeSignal(cmd, args));
    }
    async close() {
        if (this.#closed)
            return;
        this.end({ cause: "closed" });
        await this.#link.leave?.();
    }
    /** Warn that an offer for this peer has no audio section. */
    warnWithoutAudio() {
        this.#link.warn?.(noAudioWarning(this.streamId, this.clientId));
    }
    /** Send a message of the subclasses'. */
    send(json) {
        return this.#send(() => json);
    }
    async #send(json) {
        if (this.#closed)
            throw new TeamspeakError("the peer is closed");
        await this.#link.sendJson(json());
    }
    /** A signalling JSON from the other end. */
    deliver(json) {
        if (this.#closed)
            return;
        const signal = parseSignal(json);
        switch (signal.kind) {
            case "offer":
                this.#emitter.emit("offer", signal.sdp);
                break;
            case "answer":
                this.#emitter.emit("answer", signal.sdp);
                break;
            case "candidate":
                this.#emitter.emit("candidate", signal.candidate);
                break;
            case "raw":
                this.#emitter.emit("signal", signal.signal);
                break;
        }
    }
    /** Close without telling the server, once. */
    end(closed) {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#link.closed(this);
        this.#emitter.emit("closed", closed);
    }
}
/** The publisher's end for one accepted viewer. */
export class ViewerPeerImpl extends PeerImpl {
    sendOffer(sdp) {
        if (!hasAudioSection(sdp))
            this.warnWithoutAudio();
        return this.send(offerJson(sdp));
    }
}
/** The viewer's end of a stream it was let into. */
export class StreamViewImpl extends PeerImpl {
    offer;
    constructor(streamId, streamer, offer, link) {
        super(streamId, streamer, link);
        this.offer = offer;
    }
    answer(sdp) {
        return this.send(answerJson(sdp));
    }
    leave() {
        return this.close();
    }
}
//# sourceMappingURL=peer.js.map