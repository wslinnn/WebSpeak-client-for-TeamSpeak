import { type Socket as UdpSocket } from "node:dgram";
import type { Crypt } from "../crypto/crypt.js";
import type { Logger } from "../types.js";
import { type Packet, PacketType } from "./packet.js";
export declare class PacketHandler {
    #private;
    onPacket: ((p: Packet) => void) | null;
    onClosed: ((err: Error | null) => void) | null;
    constructor(crypt: Crypt, logger?: Logger);
    setClientID(id: number): void;
    connect(addr: string): Promise<void>;
    start(conn: UdpSocket): void;
    receivedFinalInitAck(): void;
    sendPacket(pType: PacketType, data: Uint8Array, flags: number): void;
    sendVoicePacket(data: Uint8Array, codec: number): void;
    /** Send an unencrypted TeamSpeak voice whisper packet to up to 32 clients. */
    sendWhisperPacket(data: Uint8Array, targetClientIds: number[], codec: number): void;
    close(): void;
}
//# sourceMappingURL=handler.d.ts.map