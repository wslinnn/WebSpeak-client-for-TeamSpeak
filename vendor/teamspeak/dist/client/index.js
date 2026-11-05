/**
 * An independent TeamSpeak client: it connects over the voice protocol, the way
 * the TeamSpeak application does.
 *
 * Only what belongs to the voice protocol is exported here. The typed commands,
 * ids and errors every client shares come from `@honeybbq/teamspeak`.
 *
 * @module @honeybbq/teamspeak/client
 */
// The client
export { Client } from "./client.js";
export { EventName, GroupWhisperType, GroupWhisperScope, ResolveSource } from "./types.js";
export { Resolver, lookupTSDNS } from "./discovery/resolver.js";
export { ViewStatus } from "./view.js";
export { FileTransferError, HandshakeError, PuzzleTooHardError, InvalidAddressError, InvalidIdentityError, RemovedError, ConnectionTimeoutError, ConnectionStalledError, } from "./errors.js";
// Commands only the voice protocol has.
export * from "./api/voice.js";
export * from "./api/avatars.js";
export * from "./api/files.js";
// File transfer data
export { dialFileTransfer, uploadFileData, downloadFileData, FileTransferStage, } from "./transfer.js";
// Tracing a connection attempt
export { ConnectPhase } from "./trace.js";
// Server capabilities, read from the handshake
export { unknownServerCapabilities } from "./capabilities.js";
// Tracing points for diagnostics_channel subscribers
export { commandChannel, incomingChannel } from "./diagnostics.js";
// Reconnection policy
export { defaultShouldRetry } from "./reconnect.js";
// Identity
export { Identity, parseIdentity, generateIdentity, generateIdentitySync, uidFromPublicKey, uidAlgorithmForVersion, MAX_SECURITY_LEVEL, } from "./crypto/index.js";
export { UIDAlgorithm } from "./crypto/index.js";
//# sourceMappingURL=index.js.map