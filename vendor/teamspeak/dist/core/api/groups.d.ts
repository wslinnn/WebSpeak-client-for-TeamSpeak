/**
 * Channel groups, the permission catalogue, and the privilege keys that grant groups.
 */
import type { BatchOptions, PermissionEntry, PermissionValue } from "./command.js";
import type { CommandExecutor, CommandOptions } from "../command/request.js";
import type { ChannelGroupID, ChannelID, ClientDBID, IconID, PermissionID, ServerGroupID } from "../command/ids.js";
import { PermissionTarget } from "../enums.js";
import type { GroupType } from "../enums.js";
import type { Permission } from "../permission.js";
import type { PermissionName } from "../permission-name.js";
import type { CustomProperty } from "./clients.js";
/** A channel group as `channelgrouplist` reports it. */
export interface ChannelGroup {
    /** The group's id. */
    readonly id: ChannelGroupID;
    /** The group's name. */
    readonly name: string;
    /** What kind of group this is, one of {@link GroupType}. */
    readonly type: number;
    /** The group's icon, or undefined for none. */
    readonly iconID: IconID | undefined;
    /** Whether membership is stored, rather than lost when the server restarts. */
    readonly savedInDatabase: boolean;
    /** Where the group sorts among the others; a 32-bit value. */
    readonly sortID: number;
    /** Where the group's name shows beside a member's nickname, one of {@link GroupNameMode}. */
    readonly nameMode: number;
    /** The power needed to modify the group. */
    readonly modifyPower: number;
    /** The power needed to add a member. */
    readonly memberAddPower: number;
    /** The power needed to remove a member. */
    readonly memberRemovePower: number;
}
/** Every channel group. */
export declare function listChannelGroups(client: CommandExecutor, options?: CommandOptions): Promise<ChannelGroup[]>;
/**
 * Create a channel group.
 *
 * `type` is required, and always sent: the server's own default is
 * `GroupType.Regular`, while the type's first value is `Template`, so leaving
 * it to a default on either side is a trap.
 *
 * TeamSpeak 6 6.0.0-beta13.1 over WebQuery answers a create without its id,
 * in a share of the creates, while a Server Admin voice client is connected:
 * the server writes the id after its status, so the HTTP answer has none. The
 * group exists then. When the answer lacks the id, the group is looked up by
 * name and type ({@link listChannelGroups}), which is exact, since the server keeps a
 * group's name and type unique. The one gap is another client renaming or
 * deleting the group between the create and the lookup. A NoDataError is
 * thrown only when none matches. See "Server behaviour the SDK works around"
 * in `docs/serverquery-responses.md`.
 */
export declare function createChannelGroup(client: CommandExecutor, name: string, type: GroupType, options?: CommandOptions): Promise<ChannelGroupID>;
/** How a group is deleted. */
export interface GroupDeleteOptions extends CommandOptions {
    /** Delete the group even while it has members; false by default (`force`, always sent). */
    readonly force?: boolean | undefined;
}
/** Delete a channel group. */
export declare function deleteChannelGroup(client: CommandExecutor, cgid: ChannelGroupID, options?: GroupDeleteOptions): Promise<void>;
/** Rename a channel group. */
export declare function renameChannelGroup(client: CommandExecutor, cgid: ChannelGroupID, name: string, options?: CommandOptions): Promise<void>;
/**
 * Copy a channel group's permissions onto another; a `targetGroupID` of 0
 * makes the server create a new group named `name`, of `type`.
 *
 * TeamSpeak 6 6.0.0-beta13.1 over WebQuery answers a create without its id,
 * in a share of the creates, while a Server Admin voice client is connected:
 * the server writes the id after its status, so the HTTP answer has none. The
 * group exists then. When the answer lacks the id, the group is looked up by
 * name and type ({@link listChannelGroups}), which is exact, since the server keeps a
 * group's name and type unique. The one gap is another client renaming or
 * deleting the group between the create and the lookup. A NoDataError is
 * thrown only when none matches. See "Server behaviour the SDK works around"
 * in `docs/serverquery-responses.md`.
 */
export declare function copyChannelGroup(client: CommandExecutor, sourceGroupID: ChannelGroupID, targetGroupID: ChannelGroupID, name: string, type: GroupType, options?: CommandOptions): Promise<ChannelGroupID>;
/**
 * Which channel group memberships {@link listChannelGroupClients} reports.
 * Unset fields do not narrow the list.
 */
export interface ChannelGroupClientListOptions extends CommandOptions {
    /** Only memberships in this channel (`cid`). */
    readonly channelID?: ChannelID | undefined;
    /** Only this client's memberships (`cldbid`). */
    readonly databaseID?: ClientDBID | undefined;
    /** Only memberships of this group (`cgid`). */
    readonly groupID?: ChannelGroupID | undefined;
}
/** One client holding one channel group in one channel. */
export interface ChannelGroupMembership {
    /** The channel. */
    readonly channelID: ChannelID;
    /** The client's database id. */
    readonly databaseID: ClientDBID;
    /** The channel group. */
    readonly groupID: ChannelGroupID;
}
/**
 * Which channel group each client holds in which channel.
 *
 * Set at least one filter field to narrow it; called with none the server may
 * return nothing.
 */
export declare function listChannelGroupClients(client: CommandExecutor, options?: ChannelGroupClientListOptions): Promise<ChannelGroupMembership[]>;
/** Permissions set on a channel group. */
export declare function listChannelGroupPermissions(client: CommandExecutor, cgid: ChannelGroupID, options?: CommandOptions): Promise<PermissionEntry[]>;
/** Set a permission on a channel group. */
export declare function addChannelGroupPermission(client: CommandExecutor, cgid: ChannelGroupID, permission: Permission, value: number, options?: CommandOptions): Promise<void>;
/**
 * Set several permissions on a channel group, in one command: each permission
 * is a row. With none, nothing is sent. The server's answer is as for
 * {@link addChannelPermissions}: an unknown permission or a value it cannot read
 * refuses the call with none set, with or without `continueOnError`, and a row
 * the caller lacks the power for ends it there, or is skipped with
 * `continueOnError`.
 */
export declare function addChannelGroupPermissions(client: CommandExecutor, cgid: ChannelGroupID, permissions: readonly PermissionValue[], options?: BatchOptions): Promise<void>;
/**
 * Remove several permissions from a channel group, in one command: each
 * permission is a row. With none, nothing is sent. An unknown permission (2562)
 * is found first and leaves none removed, with or without `continueOnError`.
 * Removing a permission the group does not have succeeds. A permission the
 * caller has too little modify power for (2570) ends the call at that row, so
 * the rows before it are removed and the rows after it are not; with
 * `continueOnError` that row is skipped and the others removed. Measured on
 * TeamSpeak 3 3.13.8 and TeamSpeak 6 beta13.1 over every query transport and
 * the voice protocol.
 */
export declare function deleteChannelGroupPermissions(client: CommandExecutor, cgid: ChannelGroupID, permissions: readonly Permission[], options?: BatchOptions): Promise<void>;
/** Remove a permission from a channel group. */
export declare function deleteChannelGroupPermission(client: CommandExecutor, cgid: ChannelGroupID, permission: Permission, options?: CommandOptions): Promise<void>;
/** One permission in the server's catalogue. */
export interface PermissionInfo {
    /** The permission's id on this server build (`permid`). */
    readonly id: PermissionID;
    /** The permission's name, such as "i_client_talk_power" (`permname`). */
    readonly name: string;
    /** What the permission controls (`permdesc`). */
    readonly description: string;
}
/**
 * The server's full permission catalogue.
 *
 * Rows that name no permission — the group markers some servers interleave —
 * are left out.
 *
 * ServerQuery sends each permission's id. The voice protocol sends none: there
 * a permission's id is its place in the list, counting from 1, which `id` is
 * set to.
 */
export declare function listPermissions(client: CommandExecutor, options?: CommandOptions): Promise<PermissionInfo[]>;
/**
 * Resolve a permission name to its numeric id.
 *
 * A name the server does not know is not an `undefined` result: both TS3 3.13.8
 * and TS6 beta13.1 refuse it with a ServerError 2562 (invalid permission ID),
 * which is thrown. `undefined` is only for a server that acknowledges the
 * command with no row, which neither measured server does.
 *
 * Needs an instance-level permission (`b_serverinstance_*`), which not even the
 * Server Admin group holds by default — expect error 2568 until it is granted.
 * Granted, it works over the voice protocol like any other query.
 */
export declare function getPermissionIDByName(client: CommandExecutor, name: PermissionName | (string & {}), options?: CommandOptions): Promise<PermissionID | undefined>;
/**
 * What a permission is set on, as `permfind` and `permoverview` report it:
 * discriminated on `target`, so each kind carries its own typed ids. The wire
 * sends them as `t`, `id1` and `id2`, whose meaning depends on `t`; a row with
 * a target this table does not name is passed through as the last kind, with
 * the number and the raw ids. Narrowing on `target` therefore leaves that
 * kind in the union: compare `target` with {@link PermissionTarget} and
 * handle the rest in a default case.
 */
export type PermissionLocation = {
    /** Set on a server group. */
    readonly target: typeof PermissionTarget.ServerGroup;
    /** The group (`id1`). */
    readonly serverGroupID: ServerGroupID;
    /** The permission (`p`). */
    readonly permission: PermissionID;
} | {
    /** Set on a client, server-wide. */
    readonly target: typeof PermissionTarget.Client;
    /** The client (`id1`). */
    readonly databaseID: ClientDBID;
    /** The permission (`p`). */
    readonly permission: PermissionID;
} | {
    /** Set on a channel. */
    readonly target: typeof PermissionTarget.Channel;
    /** The channel (`id1`). */
    readonly channelID: ChannelID;
    /** The permission (`p`). */
    readonly permission: PermissionID;
} | {
    /** Set on a channel group, in one channel. */
    readonly target: typeof PermissionTarget.ChannelGroup;
    /** The channel (`id1`). */
    readonly channelID: ChannelID;
    /** The group (`id2`). */
    readonly channelGroupID: ChannelGroupID;
    /** The permission (`p`). */
    readonly permission: PermissionID;
} | {
    /** Set on a client within one channel. */
    readonly target: typeof PermissionTarget.ChannelClient;
    /** The channel (`id1`). */
    readonly channelID: ChannelID;
    /** The client (`id2`). */
    readonly databaseID: ClientDBID;
    /** The permission (`p`). */
    readonly permission: PermissionID;
} | {
    /** Set on something this table does not name: the number the server sent (`t`). */
    readonly target: number;
    /** The first id as sent (`id1`); what it names depends on `target`. */
    readonly id1: bigint;
    /** The second id as sent (`id2`). */
    readonly id2: bigint;
    /** The permission (`p`). */
    readonly permission: PermissionID;
};
/** Every place a permission is set. */
export declare function findPermission(client: CommandExecutor, permission: Permission, options?: CommandOptions): Promise<PermissionLocation[]>;
/** One of this connection's own permissions, as `permget` reports it. */
export interface OwnPermission {
    /** The permission's numeric id (`permid`); it differs between server builds. */
    readonly id: PermissionID;
    /** The permission's name (`permsid`). */
    readonly name: string;
    /** The value this connection holds (`permvalue`). */
    readonly value: number;
}
/**
 * The value of one permission for this connection, with every group, channel
 * and client setting resolved: what a client can check before trying
 * something.
 *
 * Needs `b_client_permissionoverview_own`. A permission the server does not
 * know is refused with error 2562 (invalid permission ID). Over the voice
 * protocol TS3 answers with plain rows and TS6 with a notification, which the
 * client pairs with this command. TS6's `forauthenticationtoken` and `cid`
 * forms are not sent.
 */
export declare function getOwnPermission(client: CommandExecutor, permission: Permission, options?: CommandOptions): Promise<OwnPermission>;
/**
 * The values of several permissions for this connection, in one `permget`:
 * what {@link getOwnPermission} reads, for a list.
 *
 * The answer has one entry per permission asked, in the order asked: one
 * asked twice is answered twice, and one whose value is 0 is answered with 0,
 * not left out. A permission the server does not know refuses the whole
 * command with error 2562 (invalid permission ID) and returns nothing. Needs
 * `b_client_permissionoverview_own`. With none asked, nothing is sent and the
 * answer is `[]`.
 *
 * TS6's WebQuery answers a row that names a permission by name with the
 * permission of an earlier row that named one by id. So when the list mixes
 * ids and names, this sends two commands, one for the names and one for the
 * ids, and puts the entries back in the order asked; a list of one kind is
 * one command.
 */
export declare function getOwnPermissions(client: CommandExecutor, permissions: readonly Permission[], options?: CommandOptions): Promise<OwnPermission[]>;
/** How a permission applies, in a {@link PermissionOverviewEntry}. */
export interface PermissionOverviewValue {
    /** The permission's value there (`v`). */
    readonly value: number;
    /** Whether the value is negated (`n`). */
    readonly negated: boolean;
    /** Whether it skips channel and client overrides (`s`). */
    readonly skip: boolean;
}
/** One permission applying to a client in a channel, as `permoverview` reports it. */
export type PermissionOverviewEntry = PermissionLocation & PermissionOverviewValue;
/**
 * Every permission that applies to a client in a channel, from every source,
 * unfiltered.
 *
 * It always asks for all of them (`permid=0`): the server requires a
 * permission parameter — omitting it fails with 1539 — and treats 0 as "all".
 * Each entry names its permission, so one is easy to pick out.
 */
export declare function getPermissionOverview(client: CommandExecutor, cid: ChannelID, cldbid: ClientDBID, options?: CommandOptions): Promise<PermissionOverviewEntry[]>;
/**
 * Wipe all permission overrides and restore the defaults.
 *
 * Destructive: every custom permission on the server goes. It also drops the
 * caller's own rights, because it resets the group they rely on.
 */
export declare function resetPermissions(client: CommandExecutor, options?: CommandOptions): Promise<void>;
/**
 * A privilege key, which grants a group when redeemed. The server also
 * accepts the older `token…` commands for the same keys; these functions use
 * the `privilegekey…` ones.
 */
export interface PrivilegeKey {
    /** The key itself. */
    readonly token: string;
    /** Which kind of group the key grants, one of {@link PrivilegeKeyType}. */
    readonly type: number;
    /**
     * The server group a `PrivilegeKeyType.ServerGroup` key grants; undefined
     * for any other type, including one this SDK does not name.
     */
    readonly serverGroupID: ServerGroupID | undefined;
    /** The channel group a `PrivilegeKeyType.ChannelGroup` key grants; undefined otherwise. */
    readonly channelGroupID: ChannelGroupID | undefined;
    /** The channel a `PrivilegeKeyType.ChannelGroup` key grants its group in; undefined otherwise. */
    readonly channelID: ChannelID | undefined;
    /** The key's description. */
    readonly description: string;
    /** When the key was created. */
    readonly createdAt: Date | undefined;
    /**
     * The custom client properties a client gets by using the key
     * (`token_customset`); empty for a key with none.
     */
    readonly customSet: readonly CustomProperty[];
}
/** Every privilege key on the server. */
export declare function listPrivilegeKeys(client: CommandExecutor, options?: CommandOptions): Promise<PrivilegeKey[]>;
/**
 * A privilege key to create: one that grants a server group, or one that
 * grants a channel group in one channel.
 */
export type PrivilegeKeyOptions = {
    /** The server group the key grants. */
    readonly serverGroupID: ServerGroupID;
    readonly channelGroupID?: never;
    readonly channelID?: never;
    /** Shown in the key list; unset or "" sends none. */
    readonly description?: string | undefined;
    /**
     * Custom client properties to set on whoever uses the key, such as an
     * account id from another system; unset or empty sends none
     * (`tokencustomset`).
     */
    readonly customSet?: readonly CustomProperty[] | undefined;
} | {
    readonly serverGroupID?: never;
    /** The channel group the key grants. */
    readonly channelGroupID: ChannelGroupID;
    /** The channel it grants the group in. */
    readonly channelID: ChannelID;
    /** Shown in the key list; unset or "" sends none. */
    readonly description?: string | undefined;
    /**
     * Custom client properties to set on whoever uses the key; unset or
     * empty sends none (`tokencustomset`).
     */
    readonly customSet?: readonly CustomProperty[] | undefined;
};
/**
 * Create a privilege key. Returns the key as the server generated it.
 *
 * A NoDataError from this means the command took effect: TS6 WebQuery answers
 * a successful create with no data while a Server Admin voice client is
 * connected (6.0.0-beta13.1). The key exists, and
 * cannot be told apart from an identical one, so it is not looked up: do not
 * retry blindly, or a second key is made. List the keys to find it.
 */
export declare function addPrivilegeKey(client: CommandExecutor, key: PrivilegeKeyOptions, options?: CommandOptions): Promise<string>;
/** Delete a privilege key. */
export declare function deletePrivilegeKey(client: CommandExecutor, token: string, options?: CommandOptions): Promise<void>;
/**
 * Redeem a privilege key.
 *
 * The key grants only if this connection has not already used one.
 */
export declare function usePrivilegeKey(client: CommandExecutor, token: string, options?: CommandOptions): Promise<void>;
//# sourceMappingURL=groups.d.ts.map