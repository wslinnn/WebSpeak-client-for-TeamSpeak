import { TeamspeakError } from "@honeybbq/teamspeak";
import { Emitter, MAX_KEPT } from "./emitter.js";
import { ViewerPeerImpl, noAudioWarning } from "./peer.js";
import { assertFits, hasAudioSection, respondRequest, signalRequest } from "./wire.js";
/** How many identity lookups of one stream run at once. */
const MAX_LOOKUPS = 8;
class JoinRequestImpl {
    streamId;
    viewer;
    message;
    #state = "pending";
    #stream;
    #emitter = new Emitter(["closed"]);
    constructor(stream, viewer, message) {
        this.#stream = stream;
        this.streamId = stream.id;
        this.viewer = viewer;
        this.message = message;
    }
    get state() {
        return this.#state;
    }
    on(event, listener) {
        return this.#emitter.on(event, listener);
    }
    /** The request will not be answered: the viewer withdrew it, or the stream ended. */
    close(cause) {
        if (this.#state !== "pending")
            return;
        this.#state = cause;
        this.#emitter.emit("closed", { cause });
    }
    #assertPending() {
        if (this.#state !== "pending") {
            throw new TeamspeakError(`the request cannot be answered: it is ${this.#state}`);
        }
    }
    async accept(offer, message = "") {
        if (typeof offer !== "string" || offer === "") {
            throw new RangeError("the offer must be a non-empty SDP string");
        }
        this.#assertPending();
        const request = respondRequest(this.streamId, this.viewer.clientId, message, offer, true);
        // Before the request is used up: a too long offer may be shortened and tried again.
        assertFits(request);
        if (!hasAudioSection(offer)) {
            this.#stream.host.warn(noAudioWarning(this.streamId, this.viewer.clientId));
        }
        this.#state = "accepted";
        // Made before the offer goes out: the viewer answers, and the publisher's
        // side starts sending candidates, as soon as it has the offer, and what
        // arrives before this returns waits in the peer for its first listener.
        const peer = this.#stream.openViewer(this.viewer.clientId);
        try {
            await this.#stream.host.send(request, this.streamId);
        }
        catch (error) {
            this.#state = "failed";
            peer.end({ cause: "closed" });
            throw error;
        }
        return peer;
    }
    async deny(reason = "") {
        this.#assertPending();
        const request = respondRequest(this.streamId, this.viewer.clientId, reason, "", false);
        assertFits(request);
        this.#state = "denied";
        try {
            await this.#stream.host.send(request, this.streamId);
        }
        catch (error) {
            this.#state = "failed";
            throw error;
        }
        this.#stream.host.remember(this.viewer);
    }
}
/** A stream this client publishes. */
export class PublishedImpl {
    id;
    host;
    #initial;
    #ended = false;
    #emitter;
    #peers = new Map();
    #pending = new Map();
    /** Viewers asked about, until the answer comes back, so that a repeat is no new request. */
    #resolving = new Map();
    /** Requests are announced in the order they came, whatever the lookups take; the lookups run side by side. */
    #slots = [];
    #lookups = 0;
    /** Viewers whose peer is over: what they still send is not worth a report. */
    #closedViewers = new Set();
    constructor(info, host) {
        this.id = info.id;
        this.host = host;
        this.#initial = info;
        let reported = false;
        this.#emitter = new Emitter(["request", "ended"], (event) => {
            if (reported)
                return;
            reported = true;
            host.report(new TeamspeakError(`stream ${info.id}: dropping the oldest ${event}: ${MAX_KEPT} are waiting for a listener`));
        });
    }
    get info() {
        return this.host.info(this.id) ?? this.#initial;
    }
    get ended() {
        return this.#ended;
    }
    on(event, listener) {
        return this.#emitter.on(event, listener);
    }
    viewers() {
        return [...this.#peers.values()];
    }
    async stop(reason = 0) {
        if (!Number.isSafeInteger(reason) || reason < 0 || reason > 0xffff_ffff) {
            throw new RangeError("the stop reason must be an integer from 0 to 4294967295");
        }
        if (this.#ended)
            return;
        await this.host.stop(this.id, reason);
        this.host.stopped(this.id, reason);
    }
    /** The peer for a viewer this stream let in. */
    openViewer(clientId) {
        const peer = new ViewerPeerImpl(this.id, clientId, {
            sendJson: (json) => this.host.send(signalRequest(this.id, clientId, json), this.id),
            closed: (closing) => {
                if (this.#peers.get(clientId) !== closing)
                    return;
                this.#peers.delete(clientId);
                this.#closedViewers.add(clientId);
                // Bounded: the oldest is forgotten first, and a forgotten one is merely reported again.
                if (this.#closedViewers.size > 1024) {
                    this.#closedViewers.delete(this.#closedViewers.values().next().value);
                }
            },
            report: (error) => this.host.report(error),
            warn: (warning) => this.host.warn(warning),
        });
        this.#closedViewers.delete(clientId);
        this.#peers.set(clientId, peer);
        return peer;
    }
    /** A viewer asked to watch. */
    request(clientId, message) {
        // Asking again while pending, being looked up or let in is no new request.
        if (this.#ended || this.#peers.has(clientId) || this.#resolving.has(clientId))
            return;
        if (this.#pending.get(clientId)?.state === "pending")
            return;
        const slot = { clientId, message, identity: undefined, looking: false };
        this.#resolving.set(clientId, slot);
        this.#slots.push(slot);
        this.#advance();
    }
    /** Start the lookups that may start, then announce the requests whose turn it is. */
    #advance() {
        for (const slot of this.#slots) {
            if (slot.identity !== undefined || slot.looking)
                continue;
            if (this.#resolving.get(slot.clientId) !== slot)
                continue;
            if (this.#lookups >= MAX_LOOKUPS)
                break;
            const identity = this.host.identity(slot.clientId);
            if (!(identity instanceof Promise)) {
                slot.identity = identity;
                continue;
            }
            slot.looking = true;
            this.#lookups++;
            void identity.then((viewer) => {
                slot.looking = false;
                this.#lookups--;
                slot.identity = viewer;
                this.#advance();
            });
        }
        // In the order they came: a request waits for the ones ahead of it.
        while (this.#slots.length > 0) {
            const head = this.#slots[0];
            const current = this.#resolving.get(head.clientId) === head && !this.#ended;
            if (current && head.identity === undefined)
                break;
            this.#slots.shift();
            if (current)
                this.#announce(head);
        }
    }
    #announce(slot) {
        this.#resolving.delete(slot.clientId);
        const viewer = slot.identity;
        if (this.host.isDenied(viewer))
            return;
        const request = new JoinRequestImpl(this, viewer, slot.message);
        this.#pending.set(slot.clientId, request);
        this.#emitter.emit("request", request);
    }
    /** The client left view: a request of its that nobody answered is forgotten, as the clid may be reused. */
    dropPending(clientId) {
        const slot = this.#resolving.get(clientId);
        if (slot !== undefined) {
            this.#resolving.delete(clientId);
            // One whose lookup is out stays until it answers, which counts it.
            if (!slot.looking)
                this.#slots.splice(this.#slots.indexOf(slot), 1);
            this.#advance();
        }
        this.#pending.get(clientId)?.close("withdrawn");
        this.#pending.delete(clientId);
    }
    /** A viewer is gone, by saying so or by disconnecting. */
    viewerGone(clientId) {
        this.dropPending(clientId);
        this.#peers.get(clientId)?.end({ cause: "left" });
    }
    /**
     * A signalling JSON from a viewer; false when this stream has no such
     * viewer. A viewer whose peer is over is answered true and ignored: the
     * server cannot remove a viewer, so it may keep sending.
     */
    signal(clientId, json) {
        const peer = this.#peers.get(clientId);
        if (peer === undefined)
            return this.#closedViewers.has(clientId);
        peer.deliver(json);
        return true;
    }
    /** The stream is over: close everything that hangs on it, once. */
    finish(ended) {
        if (this.#ended)
            return;
        this.#ended = true;
        this.#slots.length = 0;
        this.#resolving.clear();
        for (const request of this.#pending.values())
            request.close("ended");
        this.#pending.clear();
        const cause = ended.cause === "disconnected" || ended.cause === "disposed" ? ended.cause : "stopped";
        for (const peer of this.#peers.values()) {
            peer.end({ cause, ...(cause === "stopped" ? { reason: ended.reason } : {}) });
        }
        this.#emitter.emit("ended", ended);
    }
}
//# sourceMappingURL=published.js.map