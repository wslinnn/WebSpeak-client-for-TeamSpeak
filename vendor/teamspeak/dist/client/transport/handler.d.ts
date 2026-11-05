import type { Crypt } from "../crypto/crypt.js";
import type { DatagramSocket, RoundTripEstimate, SocketFactory } from "../types.js";
import type { Logger } from "@honeybbq/teamspeak";
import { type Packet, PacketType } from "./packet.js";
import { type TrafficSnapshot } from "./traffic.js";
/**
 * The largest datagram taken. TeamSpeak's packets are at most 500 bytes; a
 * larger one is no packet of the protocol's, and is dropped before anything
 * is decrypted or held.
 */
export declare const MAX_DATAGRAM_SIZE: number;
/**
 * The most command bytes held, across both receive queues, waiting for the
 * packets before them. A server's in-order traffic drains at once and a full
 * window of real packets is under a megabyte; past this, a packet is dropped
 * unacknowledged, so the server sends it again once there is room.
 */
export declare const MAX_QUEUED_BYTES: number;
export declare class PacketHandler {
    #private;
    onPacket: ((p: Packet) => void) | null;
    onClosed: ((err: Error | null) => void) | null;
    /**
     * A received datagram could not be handled: it was malformed, or handling it
     * threw. The datagram is dropped either way; the owner decides whether that
     * ends the connection. Without an owner the error is logged.
     */
    onReceiveError: ((error: unknown) => void) | null;
    /** Called with the socket once it is open, before the handshake's first packet is sent. */
    onOpen: ((socket: DatagramSocket) => void) | null;
    constructor(crypt: Crypt, logger?: Logger, socketFactory?: SocketFactory);
    setClientID(id: number): void;
    /**
     * Resolve `addr`, open a socket to it and start the handshake.
     *
     * Aborting `signal`, or closing the handler, while this runs abandons it: the
     * lookup's answer is ignored, and a socket that finishes connecting
     * afterwards is closed rather than started, so no handshake begins after
     * the connection was given up.
     */
    connect(addr: string, signal?: AbortSignal): Promise<void>;
    /** Take over a connected socket and start the handshake on it. A closed handler closes it instead. */
    start(conn: DatagramSocket): void;
    /**
     * Stop resending the last Init1 packet the client sent. Until this is called,
     * the latest step stays pending whatever the server sends in between: a step
     * the client does not answer, an unknown one or a second RSA challenge, must
     * not stop the resending of its own. The server's `initivexpand2` command
     * acknowledges the last step, not an Init1 reply.
     */
    receivedFinalInitAck(): void;
    sendPacket(pType: PacketType, data: Uint8Array, flags: number): void;
    sendVoicePacket(data: Uint8Array, codec: number): void;
    /**
     * Send an unencrypted voice whisper packet in its direct form (the
     * new-protocol flag unset): up to 255 channel ids and up to 32 client ids,
     * at least one of the two.
     */
    sendWhisperPacket(data: Uint8Array, targetClientIds: readonly number[], codec: number, targetChannelIds?: readonly bigint[]): void;
    /**
     * Send an unencrypted voice whisper packet in its group form (the
     * new-protocol flag set): a group type, a target scope and one u64 id, which
     * is 0 where the type has none.
     */
    sendGroupWhisperPacket(data: Uint8Array, groupType: number, scope: number, id: bigint, codec: number): void;
    /** What this connection has carried so far, per direction and class. */
    trafficSnapshot(): TrafficSnapshot;
    /** The keepalive round-trip time, or null before the first pong. */
    get roundTrip(): RoundTripEstimate | null;
    /** How many packets have been sent again for want of an acknowledgement. */
    /** Whether clientek, sent under the dummy key, has not been acknowledged yet. */
    get clientEkPending(): boolean;
    get resends(): number;
    /** Whether there is a live socket to send on. */
    get isOpen(): boolean;
    close(): void;
}
//# sourceMappingURL=handler.d.ts.map