export declare const enum PacketType {
    Voice = 0,
    VoiceWhisper = 1,
    Command = 2,
    CommandLow = 3,
    Ping = 4,
    Pong = 5,
    Ack = 6,
    AckLow = 7,
    Init1 = 8
}
export declare const enum PacketFlags {
    Fragmented = 16,
    NewProtocol = 32,
    Compressed = 64,
    Unencrypted = 128
}
export interface Packet {
    /** Type byte combined with flags (low nibble = type, high nibble = flags). */
    typeFlagged: number;
    id: number;
    clientID: number;
    generationID: number;
    data: Uint8Array;
    receivedAt: number;
}
export declare function packetType(p: Packet): PacketType;
export declare function packetFlags(p: Packet): number;
export declare function isUnencrypted(p: Packet): boolean;
/** Build the 5-byte client-to-server header: [packetID(2), clientID(2), typeFlagged(1)]. */
export declare function buildC2SHeader(p: Packet): Uint8Array;
/** Parse a 3-byte server-to-client header. */
export declare function parseS2CHeader(raw: Uint8Array): Pick<Packet, "id" | "typeFlagged">;
/** Parse a 5-byte client-to-server header. */
export declare function parseC2SHeader(raw: Uint8Array): Pick<Packet, "id" | "clientID" | "typeFlagged">;
//# sourceMappingURL=packet.d.ts.map