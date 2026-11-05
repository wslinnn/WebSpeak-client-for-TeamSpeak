/**
 * Channel groups, the permission catalogue, and the privilege keys that grant groups.
 */
import { nonZero, uint, U32, firstRow, exec, execRows, continueOnErrorParams, query, queryRows, list, encodeFields, nonEmpty, parsePermission, permissionParam, recoveredGroupID, str, big, num, bool, date, } from "./command.js";
import { NoDataError } from "../errors.js";
import { asChannelGroupID, asChannelID, asClientDBID, asPermissionID, asServerGroupID, } from "../command/ids.js";
import { parseChannelGroup } from "./group-rows.js";
import { PermissionTarget, PrivilegeKeyType } from "../enums.js";
import { escape, unescape } from "../command/command.js";
/** Every channel group. */
export async function listChannelGroups(client, options) {
    return (await list(client, "channelgrouplist", [], options)).map(parseChannelGroup);
}
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
export async function createChannelGroup(client, name, type, options) {
    const rows = await query(client, "channelgroupadd", [
        ["name", name],
        ["type", type],
    ], options);
    return asChannelGroupID(await recoveredGroupID(rows, "cgid", name, type, "channelgroupadd", () => listChannelGroups(client, options)));
}
/** Delete a channel group. */
export async function deleteChannelGroup(client, cgid, options = {}) {
    await exec(client, "channelgroupdel", [
        ["cgid", cgid],
        ["force", options.force ?? false],
    ], options);
}
/** Rename a channel group. */
export async function renameChannelGroup(client, cgid, name, options) {
    await exec(client, "channelgrouprename", [
        ["cgid", cgid],
        ["name", name],
    ], options);
}
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
export async function copyChannelGroup(client, sourceGroupID, targetGroupID, name, type, options) {
    const rows = await query(client, "channelgroupcopy", [
        ["scgid", sourceGroupID],
        ["tcgid", targetGroupID],
        ["name", name],
        ["type", type],
    ], options);
    // Copying onto an existing group keeps that group's id.
    if (targetGroupID !== 0n)
        return targetGroupID;
    return asChannelGroupID(await recoveredGroupID(rows, "cgid", name, type, "channelgroupcopy", () => listChannelGroups(client, options)));
}
// A filter of 0 matches nothing in particular, so it is omitted, as unset is.
const membershipFilterNames = {
    channelID: ["cid", nonZero],
    databaseID: ["cldbid", nonZero],
    groupID: ["cgid", nonZero],
};
/**
 * Which channel group each client holds in which channel.
 *
 * Set at least one filter field to narrow it; called with none the server may
 * return nothing.
 */
export async function listChannelGroupClients(client, options = {}) {
    const rows = await list(client, "channelgroupclientlist", encodeFields(options, membershipFilterNames), options);
    return rows.map((row) => ({
        channelID: asChannelID(big(row, "cid")),
        databaseID: asClientDBID(big(row, "cldbid")),
        groupID: asChannelGroupID(big(row, "cgid")),
    }));
}
/** Permissions set on a channel group. */
export async function listChannelGroupPermissions(client, cgid, options) {
    return (await list(client, "channelgrouppermlist", [["cgid", cgid]], options)).map(parsePermission);
}
/** Set a permission on a channel group. */
export async function addChannelGroupPermission(client, cgid, permission, value, options) {
    await exec(client, "channelgroupaddperm", [["cgid", cgid], permissionParam(permission), ["permvalue", value]], options);
}
/**
 * Set several permissions on a channel group, in one command: each permission
 * is a row. With none, nothing is sent. The server's answer is as for
 * {@link addChannelPermissions}: an unknown permission or a value it cannot read
 * refuses the call with none set, with or without `continueOnError`, and a row
 * the caller lacks the power for ends it there, or is skipped with
 * `continueOnError`.
 */
export async function addChannelGroupPermissions(client, cgid, permissions, options = {}) {
    await execRows(client, "channelgroupaddperm", [...continueOnErrorParams(options), ["cgid", cgid]], permissions.map((entry) => [permissionParam(entry.permission), ["permvalue", entry.value]]), options);
}
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
export async function deleteChannelGroupPermissions(client, cgid, permissions, options = {}) {
    await execRows(client, "channelgroupdelperm", [...continueOnErrorParams(options), ["cgid", cgid]], permissions.map((permission) => [permissionParam(permission)]), options);
}
/** Remove a permission from a channel group. */
export async function deleteChannelGroupPermission(client, cgid, permission, options) {
    await exec(client, "channelgroupdelperm", [["cgid", cgid], permissionParam(permission)], options);
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
export async function listPermissions(client, options) {
    const rows = await list(client, "permissionlist", [], options);
    return rows
        .filter((row) => row["permname"] !== undefined)
        .map((row, index) => ({
        id: asPermissionID(row["permid"] === undefined ? index + 1 : uint(row, "permid", U32)),
        name: str(row, "permname"),
        description: str(row, "permdesc"),
    }));
}
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
export async function getPermissionIDByName(client, name, options) {
    const rows = await query(client, "permidgetbyname", [["permsid", name]], options);
    if (rows.length === 0)
        return undefined;
    return asPermissionID(uint(firstRow(rows, "permidgetbyname", "permid"), "permid", U32));
}
/** Read a location from a `permfind` or `permoverview` row. */
function parseLocation(row) {
    const permission = asPermissionID(uint(row, "p", U32));
    const id1 = big(row, "id1");
    const id2 = big(row, "id2");
    switch (num(row, "t")) {
        case PermissionTarget.ServerGroup:
            return {
                target: PermissionTarget.ServerGroup,
                serverGroupID: asServerGroupID(id1),
                permission,
            };
        case PermissionTarget.Client:
            return { target: PermissionTarget.Client, databaseID: asClientDBID(id1), permission };
        case PermissionTarget.Channel:
            return { target: PermissionTarget.Channel, channelID: asChannelID(id1), permission };
        case PermissionTarget.ChannelGroup:
            return {
                target: PermissionTarget.ChannelGroup,
                channelID: asChannelID(id1),
                channelGroupID: asChannelGroupID(id2),
                permission,
            };
        case PermissionTarget.ChannelClient:
            return {
                target: PermissionTarget.ChannelClient,
                channelID: asChannelID(id1),
                databaseID: asClientDBID(id2),
                permission,
            };
        default:
            return { target: num(row, "t"), id1, id2, permission };
    }
}
/** Every place a permission is set. */
export async function findPermission(client, permission, options) {
    const rows = await list(client, "permfind", [permissionParam(permission)], options);
    return rows.map(parseLocation);
}
/** The first row of a `permget` answer, read as an {@link OwnPermission}. */
function parseOwnPermission(rows) {
    const row = firstRow(rows, "permget", "permvalue");
    return {
        id: asPermissionID(uint(row, "permid", U32)),
        name: str(row, "permsid"),
        value: num(row, "permvalue"),
    };
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
export async function getOwnPermission(client, permission, options) {
    const rows = await query(client, "permget", [permissionParam(permission)], options);
    return parseOwnPermission(rows);
}
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
export async function getOwnPermissions(client, permissions, options) {
    const params = permissions.map(permissionParam);
    const byName = params.flatMap((param, index) => (param[0] === "permsid" ? [index] : []));
    const byID = params.flatMap((param, index) => (param[0] === "permid" ? [index] : []));
    const groups = [byName, byID].filter((indexes) => indexes.length > 0);
    const result = [];
    for (const indexes of groups) {
        const rows = await queryRows(client, "permget", [], indexes.map((index) => [params[index]]), options);
        // Matched by position: more rows than asked leave no telling which
        // answers which, so that is refused as much as fewer.
        if (rows.length !== indexes.length) {
            throw new NoDataError("permget", `the server answered ${rows.length} of ${indexes.length}`);
        }
        indexes.forEach((index, n) => {
            result[index] = parseOwnPermission([rows[n]]);
        });
    }
    return result;
}
/**
 * Every permission that applies to a client in a channel, from every source,
 * unfiltered.
 *
 * It always asks for all of them (`permid=0`): the server requires a
 * permission parameter — omitting it fails with 1539 — and treats 0 as "all".
 * Each entry names its permission, so one is easy to pick out.
 */
export async function getPermissionOverview(client, cid, cldbid, options) {
    const rows = await list(client, "permoverview", [
        ["cid", cid],
        ["cldbid", cldbid],
        ["permid", 0],
    ], options);
    return rows.map((row) => ({
        ...parseLocation(row),
        value: num(row, "v"),
        negated: bool(row, "n"),
        skip: bool(row, "s"),
    }));
}
/**
 * Wipe all permission overrides and restore the defaults.
 *
 * Destructive: every custom permission on the server goes. It also drops the
 * caller's own rights, because it resets the group they rely on.
 */
export async function resetPermissions(client, options) {
    await exec(client, "permreset", [], options);
}
/**
 * Read a key. The wire carries the group as `token_id1` and the channel as
 * `token_id2`, whichever kind of group it is; which typed field each belongs in
 * depends on the token type. A type this SDK does not name gets neither group
 * nor channel: what its ids mean is not known.
 */
const parseKey = (row) => {
    const type = num(row, "token_type");
    const channelGroup = type === PrivilegeKeyType.ChannelGroup;
    const serverGroup = type === PrivilegeKeyType.ServerGroup;
    return {
        token: str(row, "token"),
        type,
        serverGroupID: serverGroup ? asServerGroupID(big(row, "token_id1")) : undefined,
        channelGroupID: channelGroup ? asChannelGroupID(big(row, "token_id1")) : undefined,
        channelID: channelGroup ? asChannelID(big(row, "token_id2")) : undefined,
        description: str(row, "token_description"),
        createdAt: date(row, "token_created"),
        customSet: parseCustomSet(str(row, "token_customset")),
    };
};
/**
 * Read a key's custom set, `ident=a value=b|ident=c value=d`. The server stores
 * the text as it was given, so a value with a space in it is escaped inside it
 * (see {@link encodeCustomSet}) for it to be read back whole; a set made some
 * other way is read as well as it parses, and an entry that is not
 * `ident=… value=…` is skipped.
 */
function parseCustomSet(raw) {
    if (raw === "")
        return [];
    return raw.split("|").flatMap((entry) => {
        const match = /^ident=(.*?) value=(.*)$/s.exec(entry);
        return match === null ? [] : [{ ident: unescape(match[1]), value: unescape(match[2]) }];
    });
}
/**
 * Write a custom set for `tokencustomset`.
 *
 * The text is escaped twice: here, so each ident and value survives the
 * server splitting the set on spaces and pipes, and again as the parameter
 * goes on the wire. The server's own example escapes only once, which cuts a
 * value at its first space.
 */
function encodeCustomSet(set) {
    if (set.length === 0)
        return undefined;
    return set.map((p) => `ident=${escape(p.ident)} value=${escape(p.value)}`).join("|");
}
/** Every privilege key on the server. */
export async function listPrivilegeKeys(client, options) {
    return (await list(client, "privilegekeylist", [], options)).map(parseKey);
}
/**
 * Encode the group a key grants.
 *
 * The wire form is a type and two untyped ids whose meaning depends on it:
 * `tokenid1` is the group and `tokenid2` the channel. The options used to take
 * them as such, documented the other way round, so the typed fields are checked
 * here to describe exactly one kind of key.
 */
function keyParams(key) {
    const { serverGroupID, channelGroupID, channelID } = key;
    const isID = (v) => typeof v === "bigint" && v > 0n;
    const description = nonEmpty(key.description ?? "");
    const customSet = encodeCustomSet(key.customSet ?? []);
    if (isID(serverGroupID) && channelGroupID === undefined && channelID === undefined) {
        return [
            ["tokentype", PrivilegeKeyType.ServerGroup],
            ["tokenid1", serverGroupID],
            ["tokenid2", 0],
            ["tokendescription", description],
            ["tokencustomset", customSet],
        ];
    }
    if (serverGroupID === undefined && isID(channelGroupID) && isID(channelID)) {
        return [
            ["tokentype", PrivilegeKeyType.ChannelGroup],
            ["tokenid1", channelGroupID],
            ["tokenid2", channelID],
            ["tokendescription", description],
            ["tokencustomset", customSet],
        ];
    }
    throw new TypeError("a key grants a server group, or a channel group in a channel");
}
/**
 * Create a privilege key. Returns the key as the server generated it.
 *
 * A NoDataError from this means the command took effect: TS6 WebQuery answers
 * a successful create with no data while a Server Admin voice client is
 * connected (6.0.0-beta13.1). The key exists, and
 * cannot be told apart from an identical one, so it is not looked up: do not
 * retry blindly, or a second key is made. List the keys to find it.
 */
export async function addPrivilegeKey(client, key, options) {
    const rows = await query(client, "privilegekeyadd", keyParams(key), options);
    return str(firstRow(rows, "privilegekeyadd", "token"), "token");
}
/** Delete a privilege key. */
export async function deletePrivilegeKey(client, token, options) {
    await exec(client, "privilegekeydelete", [["token", token]], options);
}
/**
 * Redeem a privilege key.
 *
 * The key grants only if this connection has not already used one.
 */
export async function usePrivilegeKey(client, token, options) {
    await exec(client, "privilegekeyuse", [["token", token]], options);
}
//# sourceMappingURL=groups.js.map