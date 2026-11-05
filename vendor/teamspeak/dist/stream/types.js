// ---- Values -----------------------------------------------------------------
/** The values of the table below, before freezing. */
const streamSourceValues = {
    /** `0` on the wire: no source named. */
    None: "none",
    /** `1` on the wire: a camera. */
    Camera: "camera",
    /** `2` on the wire: a screen. */
    Screen: "screen",
    /** `3` on the wire: a window. */
    Window: "window",
    /** `4` on the wire. */
    Session: "session",
};
/**
 * What a stream shows. The server stores any number, so a stream from a client
 * that sends another value reports it as the number.
 */
export const StreamSource = 
/* @__PURE__ */ Object.freeze(streamSourceValues);
/** The values of the table below, before freezing. */
const streamAccessibilityValues = {
    /** `0` on the wire. */
    None: "none",
    /** `1` on the wire: anyone. What `publish` sends unless told otherwise. */
    Public: "public",
    /** `2` on the wire: the publisher's contacts. */
    Contacts: "contacts",
    /** `3` on the wire. */
    Private: "private",
};
/**
 * Who a stream says may watch it. Only the publisher enforces it: the server
 * relays every request. A value outside the four is reported as the number.
 */
export const StreamAccessibility = 
/* @__PURE__ */ Object.freeze(streamAccessibilityValues);
/** The values of the table below, before freezing. */
const streamTransportValues = {
    /** From the publisher to each viewer directly. */
    P2P: "p2p",
};
/**
 * How a stream's media travels: `"p2p"`, from the publisher to each viewer
 * directly, is the one mode this SDK publishes and watches. A server may
 * announce a stream in another mode; it is reported as the number, and
 * `watch` refuses it.
 */
export const StreamTransport = 
/* @__PURE__ */ Object.freeze(streamTransportValues);
// ---- Peers ------------------------------------------------------------------
/** The values of the table below, before freezing. */
const peerCloseCauseValues = {
    /** Its own `close()`. */
    Closed: "closed",
    /** The other end leaving. */
    Left: "left",
    /** The stream ending. */
    Stopped: "stopped",
    /** The client's connection ending. */
    Disconnected: "disconnected",
    /** `Streams.dispose()`. */
    Disposed: "disposed",
};
/**
 * Why a peer closed.
 */
export const PeerCloseCause = 
/* @__PURE__ */ Object.freeze(peerCloseCauseValues);
/** The values of the table below, before freezing. */
const peerEventNameValues = {
    /** A renegotiation offer from the publisher: an SDP. */
    Offer: "offer",
    /** The viewer's SDP answer. */
    Answer: "answer",
    /** An ICE candidate from the other end. */
    Candidate: "candidate",
    /** A signalling message that is none of the above. */
    Signal: "signal",
    /** The peer closing. */
    Closed: "closed",
};
/**
 * The names of the events `Peer.on()` takes, as constants.
 * `on(PeerEventName.Offer, ...)` and `on("offer", ...)` are the same call,
 * and both give the listener the same payload type.
 */
export const PeerEventName = 
/* @__PURE__ */ Object.freeze(peerEventNameValues);
// Each direction fails to compile when `PeerEvents` and `PeerEventName`
// drift: an event without a name, and a name that is not an event.
const peerEventNameCoverEvents = true;
const peerEventNameNamesAreEvents = true;
void peerEventNameCoverEvents;
void peerEventNameNamesAreEvents;
/** The values of the table below, before freezing. */
const joinRequestStateValues = {
    /** Not yet accepted or denied. */
    Pending: "pending",
    /** Accepted. */
    Accepted: "accepted",
    /** Denied. */
    Denied: "denied",
    /** The answer did not reach the server. */
    Failed: "failed",
    /** The viewer left first. */
    Withdrawn: "withdrawn",
    /** The stream stopped. */
    Ended: "ended",
};
/**
 * Where a join request stands.
 */
export const JoinRequestState = 
/* @__PURE__ */ Object.freeze(joinRequestStateValues);
/** The values of the table below, before freezing. */
const joinRequestCloseCauseValues = {
    /** The viewer took it back or left view. */
    Withdrawn: "withdrawn",
    /** The stream ended first. */
    Ended: "ended",
};
/**
 * Why a request stopped waiting for an answer.
 */
export const JoinRequestCloseCause = 
/* @__PURE__ */ Object.freeze(joinRequestCloseCauseValues);
/** The values of the table below, before freezing. */
const joinRequestEventNameValues = {
    /**
     * A request nobody had answered closing: the viewer withdrew it or left
     * view, or the stream ended.
     */
    Closed: "closed",
};
/**
 * The names of the events `JoinRequest.on()` takes, as constants.
 * `on(JoinRequestEventName.Closed, ...)` and `on("closed", ...)` are the same call,
 * and both give the listener the same payload type.
 */
export const JoinRequestEventName = 
/* @__PURE__ */ Object.freeze(joinRequestEventNameValues);
// Each direction fails to compile when `JoinRequestEvents` and `JoinRequestEventName`
// drift: an event without a name, and a name that is not an event.
const joinRequestEventNameCoverEvents = true;
const joinRequestEventNameNamesAreEvents = true;
void joinRequestEventNameCoverEvents;
void joinRequestEventNameNamesAreEvents;
/** The values of the table below, before freezing. */
const streamEndCauseValues = {
    /** `stop()`. */
    Stopped: "stopped",
    /** The server's `notifystreamstopped`. */
    Server: "server",
    /**
     * The server said its publisher no longer streams (`client_is_streaming`
     * cleared) and no stop followed within two seconds.
     */
    Gone: "gone",
    /** The client's connection ending. */
    Disconnected: "disconnected",
    /** `Streams.dispose()`. */
    Disposed: "disposed",
};
/**
 * Why a published stream ended.
 */
export const StreamEndCause = 
/* @__PURE__ */ Object.freeze(streamEndCauseValues);
/** The values of the table below, before freezing. */
const publishedStreamEventNameValues = {
    /** A client asking to watch. */
    Request: "request",
    /** The stream ending. */
    Ended: "ended",
};
/**
 * The names of the events `PublishedStream.on()` takes, as constants.
 * `on(PublishedStreamEventName.Request, ...)` and `on("request", ...)` are the same call,
 * and both give the listener the same payload type.
 */
export const PublishedStreamEventName = 
/* @__PURE__ */ Object.freeze(publishedStreamEventNameValues);
// Each direction fails to compile when `PublishedStreamEvents` and `PublishedStreamEventName`
// drift: an event without a name, and a name that is not an event.
const publishedStreamEventNameCoverEvents = true;
const publishedStreamEventNameNamesAreEvents = true;
void publishedStreamEventNameCoverEvents;
void publishedStreamEventNameNamesAreEvents;
/** The values of the table below, before freezing. */
const streamWarningCodeValues = {
    /** An SDP offer with no `m=audio` section. */
    OfferWithoutAudio: "offer-without-audio",
};
/**
 * Why `Streams` warns.
 */
export const StreamWarningCode = 
/* @__PURE__ */ Object.freeze(streamWarningCodeValues);
/** The values of the table below, before freezing. */
const streamsEventNameValues = {
    /**
     * A stream becoming known: it started while this client could see it, or
     * discovery found it.
     */
    Started: "started",
    /** What is known of a stream changing. */
    Updated: "updated",
    /** A stream ending. */
    Stopped: "stopped",
    /** A viewer being accepted into a stream. */
    ViewerJoined: "viewerJoined",
    /** A viewer leaving a stream. */
    ViewerLeft: "viewerLeft",
    /** A failure nobody awaits, such as a discovery request the server refused. */
    Error: "error",
    /**
     * Something the SDK noticed and let through, such as an offer the
     * TeamSpeak 6 client will not answer.
     */
    Warning: "warning",
};
/**
 * The names of the events `Streams.on()` takes, as constants.
 * `on(StreamsEventName.Started, ...)` and `on("started", ...)` are the same call,
 * and both give the listener the same payload type.
 */
export const StreamsEventName = 
/* @__PURE__ */ Object.freeze(streamsEventNameValues);
// Each direction fails to compile when `StreamsEventMap` and `StreamsEventName`
// drift: an event without a name, and a name that is not an event.
const streamsEventNameCoverEvents = true;
const streamsEventNameNamesAreEvents = true;
void streamsEventNameCoverEvents;
void streamsEventNameNamesAreEvents;
//# sourceMappingURL=types.js.map