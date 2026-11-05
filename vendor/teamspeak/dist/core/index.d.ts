/**
 * What every TeamSpeak connection shares: the command language, ids, errors,
 * and the typed commands that run on any connection able to execute a command.
 *
 * The voice client is in `@honeybbq/teamspeak/client`.
 *
 * @module @honeybbq/teamspeak
 */
export { escape, unescape } from "./command/command.js";
export type { CommandExecutor, CommandOptions, CommandRequest, ParamValue, } from "./command/request.js";
export { asAPIKeyID, asBanID, asChannelID, asClientFileTransferID, asMessageID, asServerFileTransferID, asServerID, asChannelGroupID, asClientDBID, asClientID, asIconID, asPermissionID, asServerGroupID, asUID, asChannelUID, } from "./command/ids.js";
export type { APIKeyID, BanID, ClientFileTransferID, MessageID, ServerFileTransferID, ServerID, ChannelGroupID, ChannelID, ClientDBID, ClientID, IconID, PermissionID, ServerGroupID, UID, ChannelUID, } from "./command/ids.js";
export { TeamspeakError, ServerError, CommandTimeoutError, NotConnectedError, NoDataError, AlreadyConnectedError, } from "./errors.js";
export { ErrorCode } from "./errorcode.js";
export { Reason } from "./reason.js";
export { APIKeyScope, BannerMode, BindingSubsystem, ClientType, Codec, CodecEncryptionMode, isValueOf, GroupAutoUpdateType, GroupNameMode, GroupType, HostMessageMode, LogLevel, PermissionTarget, TextMessageTarget, PrivilegeKeyType, VirtualServerStatus, } from "./enums.js";
export { permissionByID, permissionByName } from "./permission.js";
export { PermissionName } from "./permission-name.js";
export { CommandName } from "./command-name.js";
export { NotificationName } from "./notification-name.js";
export { PropertyName } from "./property-name.js";
export type { Permission } from "./permission.js";
export { noopLogger, consoleLogger, ClientStatus, ServerFamily, serverFamilyForVersion, } from "./types.js";
export type { ClientVersion, Listener, Unsubscribe, CommandMiddleware, FileDownloadInfo, FileUploadInfo, Logger, } from "./types.js";
export type { TextMessageEvent, ClientMovedEvent, ClientLeaveEvent, KickedEvent, ClientEnterEvent, ChannelCreatedEvent, ChannelEditedEvent, ChannelMovedEvent, ChannelDeletedEvent, ChannelDescriptionChangedEvent, ChannelPasswordChangedEvent, ServerEditedEvent, ChannelSubscribedEvent, ChannelUnsubscribedEvent, PluginCommandEvent, ClientChatComposingEvent, ClientChatClosedEvent, ClientUpdatedEvent, ClientServerGroupEvent, ClientServerGroupAddedEvent, ClientServerGroupRemovedEvent, ClientChannelGroupChangedEvent, Invoked, PokeEvent, VoiceDataEvent, NotificationEvent, ConnectedEvent, DisconnectedEvent, ServerEventMap, SessionEventMap, } from "./events.js";
export { backoffDelay, defaultBackoffPolicy } from "./reconnect.js";
export type { BackoffPolicy, ReconnectOptions } from "./reconnect.js";
export * from "./api/channels.js";
export * from "./api/clients.js";
export * from "./api/server.js";
export * from "./api/groups.js";
export * from "./api/moderation.js";
export * from "./api/files.js";
export * from "./api/avatars.js";
export * from "./api/icons.js";
export * from "./api/credentials.js";
export * from "./api/instance.js";
export { applyChannelChanges } from "./api/command.js";
export type { BatchOptions, Channel, ChannelChanges, PagingOptions, PermissionEntry, PermissionValue, } from "./api/command.js";
export { ChannelTree } from "./channel-tree.js";
//# sourceMappingURL=index.d.ts.map