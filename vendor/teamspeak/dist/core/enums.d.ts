/**
 * Enumerations the server reports and accepts as small integers or fixed
 * strings.
 *
 * Each is an object of named values plus a type of the same name, the way
 * `Reason` is: the object names the values (`GroupType.Regular`), the type
 * restricts a parameter to them.
 *
 * Parameters take the type; parsed results carry a plain `number` or `string`,
 * since a server may send a value newer than this table — compare it against
 * the names (`group.type === GroupType.Query`).
 *
 * The values are the server's own, plain numbers and strings, so they are what
 * to store: one written to JSON or a database reads back unchanged. A value read
 * back is a `number` or `string` to TypeScript; {@link isValueOf} narrows it to
 * the table's type before it is passed as a parameter.
 *
 * Every table, and `ErrorCode` and `Reason` with them, may gain members in a
 * minor release: a `switch` over one needs a default case.
 */
/** The values of the table below, before freezing. */
declare const groupTypeValues: {
    /**
     * A template: the server copies it to create the groups of a new virtual
     * server, and no client can be a member.
     */
    readonly Template: 0;
    /** An ordinary group that voice clients join. */
    readonly Regular: 1;
    /** A group for ServerQuery clients. */
    readonly Query: 2;
};
/** What kind of group a server or channel group is (`type`). */
export declare const GroupType: typeof groupTypeValues;
/** A group type. */
export type GroupType = (typeof GroupType)[keyof typeof GroupType];
/** The values of the table below, before freezing. */
declare const groupNameModeValues: {
    /** No group name is shown. */
    readonly Hidden: 0;
    /** The group name is shown before the nickname. */
    readonly Before: 1;
    /** The group name is shown after the nickname. */
    readonly After: 2;
};
/** Where a group's name is shown beside a member's nickname (`namemode`). */
export declare const GroupNameMode: typeof groupNameModeValues;
/** A group name mode. */
export type GroupNameMode = (typeof GroupNameMode)[keyof typeof GroupNameMode];
/** The values of the table below, before freezing. */
declare const hostMessageModeValues: {
    /** Show nothing. */
    readonly None: 0;
    /** Show the message in the log. */
    readonly Log: 1;
    /** Show the message in a modal dialog. */
    readonly Modal: 2;
    /** Show the message in a modal dialog, then disconnect. */
    readonly ModalQuit: 3;
};
/** How a server's host message is to be shown (`virtualserver_hostmessage_mode`). */
export declare const HostMessageMode: typeof hostMessageModeValues;
/** A host message mode. */
export type HostMessageMode = (typeof HostMessageMode)[keyof typeof HostMessageMode];
/** The values of the table below, before freezing. */
declare const privilegeKeyTypeValues: {
    /** The key grants a server group. */
    readonly ServerGroup: 0;
    /** The key grants a channel group in one channel. */
    readonly ChannelGroup: 1;
};
/** Which kind of group a privilege key grants (`token_type`). */
export declare const PrivilegeKeyType: typeof privilegeKeyTypeValues;
/** A privilege key type. */
export type PrivilegeKeyType = (typeof PrivilegeKeyType)[keyof typeof PrivilegeKeyType];
/** The values of the table below, before freezing. */
declare const apiKeyScopeValues: {
    /** Read-only access to the query API. */
    readonly Read: "read";
    /** Read and change what a query client may change. */
    readonly Write: "write";
    /** Everything the owner may do, including managing API keys. */
    readonly Manage: "manage";
};
/** What an API key may do (`scope`). */
export declare const APIKeyScope: typeof apiKeyScopeValues;
/** An API key scope. */
export type APIKeyScope = (typeof APIKeyScope)[keyof typeof APIKeyScope];
/** The values of the table below, before freezing. */
declare const groupAutoUpdateTypeValues: {
    /** The channel guest groups. */
    readonly ChannelGuest: 10;
    /** The server guest groups. */
    readonly ServerGuest: 15;
    /** The query guest groups. */
    readonly QueryGuest: 20;
    /** The channel voice groups. */
    readonly ChannelVoice: 25;
    /** The server normal groups. */
    readonly ServerNormal: 30;
    /** The channel operator groups. */
    readonly ChannelOperator: 35;
    /** The channel admin groups. */
    readonly ChannelAdmin: 40;
    /** The server admin groups. */
    readonly ServerAdmin: 45;
    /** The query admin groups. */
    readonly QueryAdmin: 50;
};
/**
 * Which regular groups a permission change reaches on every virtual server:
 * the groups whose `i_group_auto_update_type` permission has this value
 * (`sgtype`).
 */
export declare const GroupAutoUpdateType: typeof groupAutoUpdateTypeValues;
/** A group auto update type. */
export type GroupAutoUpdateType = (typeof GroupAutoUpdateType)[keyof typeof GroupAutoUpdateType];
/** The values of the table below, before freezing. */
declare const clientTypeValues: {
    /** A voice client, such as the TeamSpeak application or this SDK's client. */
    readonly Voice: 0;
    /** A ServerQuery client. */
    readonly Query: 1;
};
/** What kind of connection a client is (`client_type`). */
export declare const ClientType: typeof clientTypeValues;
/** A client type. */
export type ClientType = (typeof ClientType)[keyof typeof ClientType];
/** The values of the table below, before freezing. */
declare const codecValues: {
    /** Speex at 8 kHz. Current clients no longer play it. */
    readonly SpeexNarrowband: 0;
    /** Speex at 16 kHz. Current clients no longer play it. */
    readonly SpeexWideband: 1;
    /** Speex at 32 kHz. Current clients no longer play it. */
    readonly SpeexUltraWideband: 2;
    /** CELT at 48 kHz. Current clients no longer play it. */
    readonly CELTMono: 3;
    /** Opus tuned for speech, mono. */
    readonly OpusVoice: 4;
    /** Opus tuned for music, stereo. */
    readonly OpusMusic: 5;
};
/** A voice codec: the one a channel uses (`channel_codec`). */
export declare const Codec: typeof codecValues;
/** A voice codec. */
export type Codec = (typeof Codec)[keyof typeof Codec];
/** The values of the table below, before freezing. */
declare const permissionTargetValues: {
    /** A server group. */
    readonly ServerGroup: 0;
    /** A client, server-wide. */
    readonly Client: 1;
    /** A channel. */
    readonly Channel: 2;
    /** A channel group, in one channel. */
    readonly ChannelGroup: 3;
    /** A client within one channel. */
    readonly ChannelClient: 4;
};
/** What a permission is set on, as `permfind` and `permoverview` report it (`t`). */
export declare const PermissionTarget: typeof permissionTargetValues;
/** A permission target. */
export type PermissionTarget = (typeof PermissionTarget)[keyof typeof PermissionTarget];
/** The values of the table below, before freezing. */
declare const textMessageTargetValues: {
    /** A private message to one client. */
    readonly Client: 1;
    /** A message to the sender's current channel. */
    readonly Channel: 2;
    /** A message to everyone on the virtual server. */
    readonly Server: 3;
};
/** Where a text message goes (`targetmode`), as text message events report it. */
export declare const TextMessageTarget: typeof textMessageTargetValues;
/** A text message target. */
export type TextMessageTarget = (typeof TextMessageTarget)[keyof typeof TextMessageTarget];
/** The values of the table below, before freezing. */
declare const logLevelValues: {
    /** An error. */
    readonly Error: 1;
    /** A warning. */
    readonly Warning: 2;
    /** Debugging detail. */
    readonly Debug: 3;
    /** Routine information. */
    readonly Info: 4;
};
/** A server log severity, matching the server's own levels (`loglevel`). */
export declare const LogLevel: typeof logLevelValues;
/** A log level. */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
/** The values of the table below, before freezing. */
declare const bannerModeValues: {
    /** Show the image at its own size. */
    readonly NoAdjust: 0;
    /** Scale the image to fill its space, ignoring its aspect ratio. */
    readonly AdjustIgnoreAspect: 1;
    /** Scale the image to fit its space, keeping its aspect ratio. */
    readonly AdjustKeepAspect: 2;
};
/**
 * How a banner image is fitted to its space: a channel's (`channel_banner_mode`)
 * and the server's host banner (`virtualserver_hostbanner_mode`).
 */
export declare const BannerMode: typeof bannerModeValues;
/** A banner mode. */
export type BannerMode = (typeof BannerMode)[keyof typeof BannerMode];
/** The values of the table below, before freezing. */
declare const codecEncryptionModeValues: {
    /** Each channel decides, by its `channel_codec_is_unencrypted`. */
    readonly PerChannel: 0;
    /** Voice is never encrypted, whatever the channel says. */
    readonly ForcedOff: 1;
    /** Voice is always encrypted, whatever the channel says. */
    readonly ForcedOn: 2;
};
/** Whether the virtual server encrypts voice (`virtualserver_codec_encryption_mode`). */
export declare const CodecEncryptionMode: typeof codecEncryptionModeValues;
/** A codec encryption mode. */
export type CodecEncryptionMode = (typeof CodecEncryptionMode)[keyof typeof CodecEncryptionMode];
/** The values of the table below, before freezing. */
declare const virtualServerStatusValues: {
    /** Running, and voice clients can connect. */
    readonly Online: "online";
    /** Stopped. */
    readonly Offline: "offline";
    /** Starting up. */
    readonly BootingUp: "booting up";
    /** Stopping. */
    readonly ShuttingDown: "shutting down";
    /**
     * Stopped, but selected by a ServerQuery client with `-virtual` so it can be
     * configured. Voice clients cannot connect, and it returns to offline when
     * the last query client deselects it.
     */
    readonly OnlineVirtual: "online virtual";
};
/**
 * The state of a virtual server (`virtualserver_status`), as `serverlist` and
 * `whoami` report it.
 */
export declare const VirtualServerStatus: typeof virtualServerStatusValues;
/** A virtual server status. */
export type VirtualServerStatus = (typeof VirtualServerStatus)[keyof typeof VirtualServerStatus];
/** The values of the table below, before freezing. */
declare const bindingSubsystemValues: {
    /** The voice port. */
    readonly Voice: "voice";
    /** The ServerQuery port. */
    readonly Query: "query";
    /** The file transfer port. */
    readonly FileTransfer: "filetransfer";
};
/**
 * What listens on an instance binding (`subsystem`), as `bindinglist` takes
 * and reports it.
 */
export declare const BindingSubsystem: typeof bindingSubsystemValues;
/** A binding subsystem. */
export type BindingSubsystem = (typeof BindingSubsystem)[keyof typeof BindingSubsystem];
/**
 * Whether `value` is one of `table`'s values, narrowing it to the table's type.
 * For a value from outside the program, such as one read back from storage or
 * a configuration file, before it is passed where the table's type is taken:
 *
 * ```ts
 * if (!isValueOf(BannerMode, row.bannerMode)) throw new Error(`bad banner mode ${row.bannerMode}`);
 * await editChannel(client, cid, { bannerMode: row.bannerMode });
 * ```
 *
 * It takes any of the SDK's tables, of any entry point, and compares with
 * `===`: a number kept as text, `"2"`, is not the number `2`, so a value stored
 * in another form is converted first.
 */
export declare function isValueOf<T extends Readonly<Record<string, string | number>>>(table: T, value: unknown): value is T[keyof T];
export {};
//# sourceMappingURL=enums.d.ts.map