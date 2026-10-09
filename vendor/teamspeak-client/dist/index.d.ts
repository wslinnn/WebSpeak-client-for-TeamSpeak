export { Client, ClientStatus } from "./client.js";
export type { ClientState } from "./client.js";
export type { TextMessage, ClientMovedEvent, ClientLeftViewEvent, ClientInfo, ClientUpdatedEvent, ChannelInfo, DirectoryClientInfo, DirectorySnapshot, PokeEvent, VoiceData, RawNotification, FileUploadInfo, FileDownloadInfo, FileTransferStatusInfo, EventMap, CommandMiddleware, EventMiddleware, Logger, AddrResolver, ClientOptions, ResolvedAddr, EscapedString, } from "./types.js";
export { noopLogger, consoleLogger } from "./types.js";
export { TeamspeakError, ServerError, CommandTimeoutError, AlreadyConnectedError, EAXTagMismatchError, FakeSignatureMismatchError, FileTransferError, FileTransferTimeoutError, CryptoInitError, InvalidIdentityError, } from "./errors.js";
export { sendTextMessage, clientMove, poke, getClientInfo, listChannels, listClients, fileTransferDeleteFile, } from "./api.js";
export { dialFileTransfer, uploadFileData, downloadFileData } from "./transfer.js";
export { Identity, identityFromString, generateIdentity, getUidFromPublicKey, } from "./crypto/index.js";
//# sourceMappingURL=index.d.ts.map