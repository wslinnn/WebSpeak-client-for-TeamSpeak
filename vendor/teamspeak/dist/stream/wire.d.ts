/**
 * How streams look on the wire: the value tables, the signalling messages, the
 * commands, and what the server's notifications carry.
 */
import type { ClientID, CommandRequest } from "@honeybbq/teamspeak";
import type { IceCandidate, RawSignal, StreamInfo } from "./types.js";
/**
 * The longest command line, in bytes, this SDK sends for a stream, before the
 * ` return_code=N` it appends (13 bytes and the digits, at most 23 in all).
 *
 * The server drops a longer line without an answer, whatever the command, and
 * the limit is on the whole line, return code included. Measured on TeamSpeak
 * 6 6.0.0-beta13.1 with a two-digit return code: a `setupstream` line of 9,203
 * bytes passed and one of 9,204 was dropped. A `sendtextmessage` of 9,500
 * characters is dropped without an answer as well. The constant is well under that, so a longer return code, or a
 * server that counts a little differently, does not turn a send into a silent
 * drop.
 */
export declare const MAX_COMMAND_LINE_BYTES = 9150;
/**
 * The extension a server names in `virtualserver_capability_extensions` when it
 * does peer to peer streams.
 */
export declare const STREAM_P2P = "STREAM_P2P";
/** The wire number of a source name; undefined for a name that is none. */
export declare function sourceToWire(source: string): number | undefined;
/** The wire number of an accessibility name; undefined for a name that is none. */
export declare function accessibilityToWire(accessibility: string): number | undefined;
/** `setupstream`: all seven parameters, because the server refuses a command without any. */
export declare function setupRequest(p: {
    name: string;
    source: number;
    bitrate: number;
    accessibility: number;
    viewerLimit: number;
    audio: boolean;
}): CommandRequest;
/** `joinstreamrequest`: ask to watch, or with `remove` stop watching. */
export declare function joinRequest(id: string, streamer: ClientID, message: string, remove: boolean): CommandRequest;
/** `respondjoinstreamrequest`; the offer is sent empty on a refusal, which the server insists on. */
export declare function respondRequest(id: string, viewer: ClientID, message: string, offer: string, accept: boolean): CommandRequest;
/** `streamsignaling`: relay a JSON text to the other end of a stream. */
export declare function signalRequest(id: string, peer: ClientID, json: string): CommandRequest;
/** `stopstream`. */
export declare function stopRequest(id: string, reason: number): CommandRequest;
/** `requeststreaminfo`. */
export declare function infoRequest(clid: ClientID): CommandRequest;
/**
 * Throws a StreamPayloadTooLargeError when the request's line is longer than
 * the server takes. The line is measured as it will be sent: escaped, in UTF-8.
 */
export declare function assertFits(request: CommandRequest): void;
/** The JSON text of a signalling message. */
export declare function encodeSignal(cmd: string, args: unknown): string;
/** The JSON of an SDP answer. */
export declare function answerJson(sdp: string): string;
/** The JSON of an SDP offer, sent to renegotiate. */
export declare function offerJson(sdp: string): string;
/** The JSON of an ICE candidate. */
export declare function candidateJson(c: IceCandidate): string;
/** A received signalling message, by what it is. */
export type Signal = {
    readonly kind: "offer";
    readonly sdp: string;
} | {
    readonly kind: "answer";
    readonly sdp: string;
} | {
    readonly kind: "candidate";
    readonly candidate: IceCandidate;
} | {
    readonly kind: "raw";
    readonly signal: RawSignal;
};
/**
 * Read a signalling message. A shape this does not know, or JSON that is none,
 * comes back as `raw`: a wrong shape is accepted by the server and dropped by
 * the receiver without an error, so nothing here guesses.
 */
export declare function parseSignal(json: string): Signal;
/**
 * The stream a `notifystreamstarted` or `notifystreaminfo` describes, merged
 * over what was known of it. Undefined for the empty `notifystreaminfo` the
 * server sends for a client that streams nothing.
 *
 * The two name the accessibility differently: `access` and `accessibility`.
 * Only the info carries `viewer`.
 */
export declare function streamInfoFrom(params: Readonly<Record<string, string>>, known: StreamInfo | undefined): StreamInfo | undefined;
/** Whether two descriptions of a stream say the same. */
export declare function sameInfo(a: StreamInfo, b: StreamInfo): boolean;
/** A client id the notification names under `key`; 0 when it names none. */
export declare function clientOf(params: Readonly<Record<string, string>>, key: string): ClientID;
/** The stop reason a notification carries; 0 when it carries none. */
export declare function reasonOf(params: Readonly<Record<string, string>>): number;
/** Whether an SDP has an audio media section. */
export declare function hasAudioSection(sdp: string): boolean;
//# sourceMappingURL=wire.d.ts.map