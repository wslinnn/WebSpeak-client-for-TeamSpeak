/**
 * An independent TeamSpeak client: it connects over the voice protocol, the way
 * the TeamSpeak application does.
 *
 * Only what belongs to the voice protocol is exported here. The typed commands,
 * ids and errors every client shares come from `@honeybbq/teamspeak`.
 *
 * @module @honeybbq/teamspeak/client
 */
export { Client } from "./client.js";
export { EventName, GroupWhisperType, GroupWhisperScope, ResolveSource } from "./types.js";
export { Resolver, lookupTSDNS } from "./discovery/resolver.js";
export type { ResolverOptions, SrvRecord } from "./discovery/resolver.js";
export { ViewStatus } from "./view.js";
export type { ServerView, ViewChangedEvent, ViewReadyEvent } from "./view.js";
export type { EventMap, EventMiddleware, ServerEvent, ServerEventName, VoiceOptions, WhisperTargets, GroupWhisperTarget, AddrResolver, ClientOptions, ResolvedAddr, DatagramSocket, EventIterator, RoundTripEstimate, SocketFactory, FileTransferSocketFactory, } from "./types.js";
export { FileTransferError, HandshakeError, PuzzleTooHardError, InvalidAddressError, InvalidIdentityError, RemovedError, ConnectionTimeoutError, ConnectionStalledError, } from "./errors.js";
export * from "./api/voice.js";
export * from "./api/avatars.js";
export * from "./api/files.js";
export { dialFileTransfer, uploadFileData, downloadFileData, FileTransferStage, } from "./transfer.js";
export type { FileTransferOptions, FileTransferTrace, FileTransferDialStartInfo, FileTransferDialDoneInfo, FileTransferProgressInfo, FileTransferDoneInfo, FileTransferFailedInfo, } from "./transfer.js";
export { ConnectPhase } from "./trace.js";
export type { ClientTrace, ResolveStartInfo, ResolveDoneInfo, ConnectStartInfo, ConnectDoneInfo, HandshakeDoneInfo, SessionStartInfo, WelcomeDoneInfo, AttemptFailedInfo, ReconnectScheduledInfo, DisconnectStartInfo, DisconnectDoneInfo, SessionEndInfo, ReconnectStoppedInfo, } from "./trace.js";
export { unknownServerCapabilities } from "./capabilities.js";
export type { ServerCapabilities } from "./capabilities.js";
export { commandChannel, incomingChannel } from "./diagnostics.js";
export type { CommandTrace, IncomingTrace } from "./diagnostics.js";
export { defaultShouldRetry } from "./reconnect.js";
export { Identity, parseIdentity, generateIdentity, generateIdentitySync, uidFromPublicKey, uidAlgorithmForVersion, MAX_SECURITY_LEVEL, } from "./crypto/index.js";
export { UIDAlgorithm } from "./crypto/index.js";
//# sourceMappingURL=index.d.ts.map