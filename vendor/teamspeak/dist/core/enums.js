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
const groupTypeValues = {
    /**
     * A template: the server copies it to create the groups of a new virtual
     * server, and no client can be a member.
     */
    Template: 0,
    /** An ordinary group that voice clients join. */
    Regular: 1,
    /** A group for ServerQuery clients. */
    Query: 2,
};
/** What kind of group a server or channel group is (`type`). */
export const GroupType = /* @__PURE__ */ Object.freeze(groupTypeValues);
/** The values of the table below, before freezing. */
const groupNameModeValues = {
    /** No group name is shown. */
    Hidden: 0,
    /** The group name is shown before the nickname. */
    Before: 1,
    /** The group name is shown after the nickname. */
    After: 2,
};
/** Where a group's name is shown beside a member's nickname (`namemode`). */
export const GroupNameMode = 
/* @__PURE__ */ Object.freeze(groupNameModeValues);
/** The values of the table below, before freezing. */
const hostMessageModeValues = {
    /** Show nothing. */
    None: 0,
    /** Show the message in the log. */
    Log: 1,
    /** Show the message in a modal dialog. */
    Modal: 2,
    /** Show the message in a modal dialog, then disconnect. */
    ModalQuit: 3,
};
/** How a server's host message is to be shown (`virtualserver_hostmessage_mode`). */
export const HostMessageMode = 
/* @__PURE__ */ Object.freeze(hostMessageModeValues);
/** The values of the table below, before freezing. */
const privilegeKeyTypeValues = {
    /** The key grants a server group. */
    ServerGroup: 0,
    /** The key grants a channel group in one channel. */
    ChannelGroup: 1,
};
/** Which kind of group a privilege key grants (`token_type`). */
export const PrivilegeKeyType = 
/* @__PURE__ */ Object.freeze(privilegeKeyTypeValues);
/** The values of the table below, before freezing. */
const apiKeyScopeValues = {
    /** Read-only access to the query API. */
    Read: "read",
    /** Read and change what a query client may change. */
    Write: "write",
    /** Everything the owner may do, including managing API keys. */
    Manage: "manage",
};
/** What an API key may do (`scope`). */
export const APIKeyScope = 
/* @__PURE__ */ Object.freeze(apiKeyScopeValues);
/** The values of the table below, before freezing. */
const groupAutoUpdateTypeValues = {
    /** The channel guest groups. */
    ChannelGuest: 10,
    /** The server guest groups. */
    ServerGuest: 15,
    /** The query guest groups. */
    QueryGuest: 20,
    /** The channel voice groups. */
    ChannelVoice: 25,
    /** The server normal groups. */
    ServerNormal: 30,
    /** The channel operator groups. */
    ChannelOperator: 35,
    /** The channel admin groups. */
    ChannelAdmin: 40,
    /** The server admin groups. */
    ServerAdmin: 45,
    /** The query admin groups. */
    QueryAdmin: 50,
};
/**
 * Which regular groups a permission change reaches on every virtual server:
 * the groups whose `i_group_auto_update_type` permission has this value
 * (`sgtype`).
 */
export const GroupAutoUpdateType = 
/* @__PURE__ */ Object.freeze(groupAutoUpdateTypeValues);
/** The values of the table below, before freezing. */
const clientTypeValues = {
    /** A voice client, such as the TeamSpeak application or this SDK's client. */
    Voice: 0,
    /** A ServerQuery client. */
    Query: 1,
};
/** What kind of connection a client is (`client_type`). */
export const ClientType = /* @__PURE__ */ Object.freeze(clientTypeValues);
/** The values of the table below, before freezing. */
const codecValues = {
    /** Speex at 8 kHz. Current clients no longer play it. */
    SpeexNarrowband: 0,
    /** Speex at 16 kHz. Current clients no longer play it. */
    SpeexWideband: 1,
    /** Speex at 32 kHz. Current clients no longer play it. */
    SpeexUltraWideband: 2,
    /** CELT at 48 kHz. Current clients no longer play it. */
    CELTMono: 3,
    /** Opus tuned for speech, mono. */
    OpusVoice: 4,
    /** Opus tuned for music, stereo. */
    OpusMusic: 5,
};
/** A voice codec: the one a channel uses (`channel_codec`). */
export const Codec = /* @__PURE__ */ Object.freeze(codecValues);
/** The values of the table below, before freezing. */
const permissionTargetValues = {
    /** A server group. */
    ServerGroup: 0,
    /** A client, server-wide. */
    Client: 1,
    /** A channel. */
    Channel: 2,
    /** A channel group, in one channel. */
    ChannelGroup: 3,
    /** A client within one channel. */
    ChannelClient: 4,
};
/** What a permission is set on, as `permfind` and `permoverview` report it (`t`). */
export const PermissionTarget = 
/* @__PURE__ */ Object.freeze(permissionTargetValues);
/** The values of the table below, before freezing. */
const textMessageTargetValues = {
    /** A private message to one client. */
    Client: 1,
    /** A message to the sender's current channel. */
    Channel: 2,
    /** A message to everyone on the virtual server. */
    Server: 3,
};
/** Where a text message goes (`targetmode`), as text message events report it. */
export const TextMessageTarget = 
/* @__PURE__ */ Object.freeze(textMessageTargetValues);
/** The values of the table below, before freezing. */
const logLevelValues = {
    /** An error. */
    Error: 1,
    /** A warning. */
    Warning: 2,
    /** Debugging detail. */
    Debug: 3,
    /** Routine information. */
    Info: 4,
};
/** A server log severity, matching the server's own levels (`loglevel`). */
export const LogLevel = /* @__PURE__ */ Object.freeze(logLevelValues);
/** The values of the table below, before freezing. */
const bannerModeValues = {
    /** Show the image at its own size. */
    NoAdjust: 0,
    /** Scale the image to fill its space, ignoring its aspect ratio. */
    AdjustIgnoreAspect: 1,
    /** Scale the image to fit its space, keeping its aspect ratio. */
    AdjustKeepAspect: 2,
};
/**
 * How a banner image is fitted to its space: a channel's (`channel_banner_mode`)
 * and the server's host banner (`virtualserver_hostbanner_mode`).
 */
export const BannerMode = /* @__PURE__ */ Object.freeze(bannerModeValues);
/** The values of the table below, before freezing. */
const codecEncryptionModeValues = {
    /** Each channel decides, by its `channel_codec_is_unencrypted`. */
    PerChannel: 0,
    /** Voice is never encrypted, whatever the channel says. */
    ForcedOff: 1,
    /** Voice is always encrypted, whatever the channel says. */
    ForcedOn: 2,
};
/** Whether the virtual server encrypts voice (`virtualserver_codec_encryption_mode`). */
export const CodecEncryptionMode = 
/* @__PURE__ */ Object.freeze(codecEncryptionModeValues);
/** The values of the table below, before freezing. */
const virtualServerStatusValues = {
    /** Running, and voice clients can connect. */
    Online: "online",
    /** Stopped. */
    Offline: "offline",
    /** Starting up. */
    BootingUp: "booting up",
    /** Stopping. */
    ShuttingDown: "shutting down",
    /**
     * Stopped, but selected by a ServerQuery client with `-virtual` so it can be
     * configured. Voice clients cannot connect, and it returns to offline when
     * the last query client deselects it.
     */
    OnlineVirtual: "online virtual",
};
/**
 * The state of a virtual server (`virtualserver_status`), as `serverlist` and
 * `whoami` report it.
 */
export const VirtualServerStatus = 
/* @__PURE__ */ Object.freeze(virtualServerStatusValues);
/** The values of the table below, before freezing. */
const bindingSubsystemValues = {
    /** The voice port. */
    Voice: "voice",
    /** The ServerQuery port. */
    Query: "query",
    /** The file transfer port. */
    FileTransfer: "filetransfer",
};
/**
 * What listens on an instance binding (`subsystem`), as `bindinglist` takes
 * and reports it.
 */
export const BindingSubsystem = 
/* @__PURE__ */ Object.freeze(bindingSubsystemValues);
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
export function isValueOf(table, value) {
    return Object.values(table).includes(value);
}
//# sourceMappingURL=enums.js.map