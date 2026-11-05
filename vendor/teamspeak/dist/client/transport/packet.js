export var PacketType;
(function (PacketType) {
    PacketType[PacketType["Voice"] = 0] = "Voice";
    PacketType[PacketType["VoiceWhisper"] = 1] = "VoiceWhisper";
    PacketType[PacketType["Command"] = 2] = "Command";
    PacketType[PacketType["CommandLow"] = 3] = "CommandLow";
    PacketType[PacketType["Ping"] = 4] = "Ping";
    PacketType[PacketType["Pong"] = 5] = "Pong";
    PacketType[PacketType["Ack"] = 6] = "Ack";
    PacketType[PacketType["AckLow"] = 7] = "AckLow";
    PacketType[PacketType["Init1"] = 8] = "Init1";
})(PacketType || (PacketType = {}));
export var PacketFlags;
(function (PacketFlags) {
    PacketFlags[PacketFlags["Fragmented"] = 16] = "Fragmented";
    PacketFlags[PacketFlags["NewProtocol"] = 32] = "NewProtocol";
    PacketFlags[PacketFlags["Compressed"] = 64] = "Compressed";
    PacketFlags[PacketFlags["Unencrypted"] = 128] = "Unencrypted";
})(PacketFlags || (PacketFlags = {}));
/**
 * The packet type in the low nibble of a type byte, as it came off the wire:
 * the nibble can also hold 9 to 15, which name no type.
 */
export function packetTypeOfByte(typeByte) {
    // oxlint-disable-next-line typescript/no-unsafe-enum-assignment -- read off the wire, where the nibble can be any value
    return typeByte & 0x0f;
}
export function packetType(p) {
    return packetTypeOfByte(p.typeFlagged);
}
export function packetFlags(p) {
    return p.typeFlagged & 0xf0;
}
export function isUnencrypted(p) {
    return (packetFlags(p) & PacketFlags.Unencrypted) !== 0;
}
/** Build the 5-byte client-to-server header: [packetID(2), clientID(2), typeFlagged(1)]. */
export function buildC2SHeader(p) {
    const header = new Uint8Array(5);
    const view = new DataView(header.buffer);
    view.setUint16(0, p.id, false);
    view.setUint16(2, p.clientID, false);
    header[4] = p.typeFlagged;
    return header;
}
/** Parse a 3-byte server-to-client header. */
export function parseS2CHeader(raw) {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    return {
        id: view.getUint16(0, false),
        typeFlagged: raw[2],
    };
}
/** Parse a 5-byte client-to-server header. */
export function parseC2SHeader(raw) {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    return {
        id: view.getUint16(0, false),
        clientID: view.getUint16(2, false),
        typeFlagged: raw[4],
    };
}
//# sourceMappingURL=packet.js.map