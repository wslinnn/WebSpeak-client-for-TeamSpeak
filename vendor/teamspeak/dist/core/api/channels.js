/**
 * Channel commands.
 *
 * Channel settings are a wide, mostly-optional set. The options objects name
 * them in camelCase without the `channel_` prefix (`codecQuality` for
 * `channel_codec_quality`), and each options type has a table naming every
 * field's wire parameter, so the mapping is written down once and a key the
 * table does not know is never sent.
 */
import { nonZero, firstRow, exec, execRows, continueOnErrorParams, query, list, parseChannel, parsePermission, permissionParam, encodeFields, inSeconds, big, str, } from "./command.js";
import { asChannelID } from "../command/ids.js";
import { NoDataError } from "../errors.js";
import { ErrorCode } from "../errorcode.js";
const settingNames = {
    topic: "channel_topic",
    description: "channel_description",
    password: "channel_password",
    hasPassword: "channel_flag_password",
    codec: "channel_codec",
    codecQuality: "channel_codec_quality",
    codecLatencyFactor: "channel_codec_latency_factor",
    isUnencrypted: "channel_codec_is_unencrypted",
    maxClients: "channel_maxclients",
    maxFamilyClients: "channel_maxfamilyclients",
    isMaxClientsUnlimited: "channel_flag_maxclients_unlimited",
    isMaxFamilyClientsUnlimited: "channel_flag_maxfamilyclients_unlimited",
    isMaxFamilyClientsInherited: "channel_flag_maxfamilyclients_inherited",
    order: "channel_order",
    neededTalkPower: "channel_needed_talk_power",
    isPermanent: "channel_flag_permanent",
    isSemiPermanent: "channel_flag_semi_permanent",
    isDefault: "channel_flag_default",
    deleteDelayMs: ["channel_delete_delay", inSeconds],
    namePhonetic: "channel_name_phonetic",
    bannerURL: "channel_banner_gfx_url",
    bannerMode: "channel_banner_mode",
};
const createNames = {
    name: "channel_name",
    parentID: ["cpid", nonZero],
    ...settingNames,
};
/**
 * Create a channel and return the id the server assigned.
 *
 * Over the voice protocol the server also moves the creator into the new
 * channel.
 *
 * TeamSpeak 6 6.0.0-beta13.1 over WebQuery answers a `channelcreate` without
 * its `cid`, in a share of the creates, while a Server Admin voice client is
 * connected: the server writes the id after its status, so the HTTP answer has
 * none. The channel exists then, and a retry would fail with a duplicate name.
 * When the answer lacks the `cid`, the channel is looked up by its exact name
 * under the same parent (`channellist`), which is exact, since the server
 * keeps names unique among siblings. The one gap is another client renaming or
 * deleting the channel between the create and the lookup. A NoDataError is
 * thrown only when none matches. See "Server behaviour the SDK works around"
 * in `docs/serverquery-responses.md`.
 *
 * `channel` is what to send; the command's `signal` and `timeoutMs` go in
 * `options`, a separate last argument — set among the fields, they are not
 * read.
 */
export async function createChannel(client, channel, options) {
    const rows = await query(client, "channelcreate", encodeFields(channel, createNames), options, [
        "channel_password",
    ]);
    if (rows[0]?.["cid"] !== undefined)
        return asChannelID(big(rows[0], "cid"));
    const parent = channel.parentID ?? asChannelID(0n);
    const found = (await listChannels(client, options)).find((c) => c.name === channel.name && c.parentID === parent);
    if (found === undefined) {
        throw new NoDataError("channelcreate", `the server did not report the new channel "${channel.name}"`);
    }
    return found.id;
}
const editNames = { name: "channel_name", ...settingNames };
/**
 * Change a channel's settings. Only the fields you set are sent.
 *
 * `settings` is what to send; the command's `signal` and `timeoutMs` go in
 * `options`, a separate last argument — set among the fields, they are not
 * read.
 */
export async function editChannel(client, cid, settings, options) {
    await exec(client, "channeledit", [["cid", cid], ...encodeFields(settings, editNames)], options, [
        "channel_password",
    ]);
}
/** Delete a channel. */
export async function deleteChannel(client, cid, options = {}) {
    await exec(client, "channeldelete", [
        ["cid", cid],
        ["force", options.force ?? false],
    ], options);
}
const listFlags = [
    ["-topic", true],
    ["-flags", true],
    ["-voice", true],
    ["-limits", true],
    ["-icon", true],
    ["-secondsempty", true],
    ["-banners", true],
];
/**
 * All channels on the server, in the server's own sort order.
 *
 * Always asks for the topic, flags, voice, limits, icon, seconds empty and
 * banners, which a bare `channellist` leaves out. `description`, `uid` and
 * `filePath` are not part of `channellist` and stay empty or undefined;
 * `getChannelInfo` has them.
 */
export async function listChannels(client, options) {
    return (await list(client, "channellist", listFlags, options)).map(parseChannel);
}
/**
 * One channel's full settings.
 *
 * `totalClients`, `totalFamilyClients` and `neededSubscribePower` are left
 * undefined: `channelinfo` does not carry them. `listChannels` does.
 *
 * `channelinfo` answers with `pid` and the settings but no `cid` — the channel
 * is whatever was asked for — so the id is taken from the argument rather than
 * read from the row, where it would come back 0.
 */
export async function getChannelInfo(client, cid, options) {
    const rows = await query(client, "channelinfo", [["cid", cid]], options);
    return { ...parseChannel(firstRow(rows, "channelinfo")), id: cid };
}
/**
 * Channels whose name contains `pattern`; none is an empty list. The server
 * reports finding none as error 768 (invalid channelID), which this answers
 * as `[]`.
 */
export async function findChannels(client, pattern, options) {
    const rows = await list(client, "channelfind", [["pattern", pattern]], options, {
        noMatch: ErrorCode.ChannelInvalidID,
    });
    return rows.map((row) => ({ id: asChannelID(big(row, "cid")), name: str(row, "channel_name") }));
}
/** Move a channel under a new parent. */
export async function moveChannel(client, cid, parentID, options = {}) {
    await exec(client, "channelmove", [
        ["cid", cid],
        ["cpid", parentID],
        ["order", options.order],
    ], options);
}
// ---- Channel permissions ----------------------------------------------------
/** Set a permission on a channel. */
export async function addChannelPermission(client, cid, permission, value, options) {
    await exec(client, "channeladdperm", [["cid", cid], permissionParam(permission), ["permvalue", value]], options);
}
/**
 * Set several permissions on a channel, in one command: each permission is a
 * row (`permsid=…  permvalue=…|permsid=…  permvalue=…`). With none, nothing is
 * sent.
 *
 * The server checks every row before it applies any: a permission it does not
 * know (2562) or a value it cannot read (1540) refuses the call, and none is
 * set, with or without `continueOnError`. Measured on TeamSpeak 3 3.13.8 and
 * TeamSpeak 6 beta13.1, over raw ServerQuery, SSH, WebQuery and the voice
 * protocol alike. Resolves to nothing: the server never reports an answer per
 * row.
 *
 * A permission the caller has too little modify power for (2570, or 2568 where
 * the group power is short) is another matter: the rows are applied in order.
 * Without `continueOnError` the first row that fails ends the call, so the rows
 * before it are set and the rows after it are not; with it the rows that fail
 * are skipped and the others set. The error is the failing row's, and which row
 * is not reported; with several failing rows which error comes back was not
 * measured. Measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 beta13.1, over raw
 * ServerQuery (TeamSpeak 3), SSH, WebQuery and the voice protocol, in both
 * orders of a free and a locked permission.
 */
export async function addChannelPermissions(client, cid, permissions, options = {}) {
    await execRows(client, "channeladdperm", [...continueOnErrorParams(options), ["cid", cid]], permissions.map((entry) => [permissionParam(entry.permission), ["permvalue", entry.value]]), options);
}
/**
 * Remove several permissions from a channel, in one command: each permission is
 * a row (`permsid=…|permsid=…`). With none, nothing is sent.
 *
 * The server checks every row first, and an unknown permission (2562) refuses
 * the call with none removed. Removing a permission the channel does not have
 * succeeds. A permission the caller has too little modify power for (2570) ends
 * the call at that row: the rows before it are removed and the rows after it
 * are not, measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 beta13.1 over every
 * query transport and the voice protocol. The server documents no
 * `-continueonerror` for this command, so none is offered, and sent anyway it
 * changed nothing.
 */
export async function deleteChannelPermissions(client, cid, permissions, options) {
    await execRows(client, "channeldelperm", [["cid", cid]], permissions.map((permission) => [permissionParam(permission)]), options);
}
/** Remove a permission from a channel. */
export async function deleteChannelPermission(client, cid, permission, options) {
    await exec(client, "channeldelperm", [["cid", cid], permissionParam(permission)], options);
}
/** Permissions set directly on a channel. */
export async function listChannelPermissions(client, cid, options) {
    return (await list(client, "channelpermlist", [["cid", cid]], options)).map(parsePermission);
}
/** Permissions granted to one client within one channel. */
export async function listChannelClientPermissions(client, cid, cldbid, options) {
    const rows = await list(client, "channelclientpermlist", [
        ["cid", cid],
        ["cldbid", cldbid],
    ], options);
    return rows.map(parsePermission);
}
/** Set a permission on one client within one channel. */
export async function addChannelClientPermission(client, cid, cldbid, permission, value, options) {
    await exec(client, "channelclientaddperm", [["cid", cid], ["cldbid", cldbid], permissionParam(permission), ["permvalue", value]], options);
}
/**
 * Set several permissions on one client within one channel, in one command:
 * each permission is a row. With none, nothing is sent. The server's answer
 * is as for {@link addChannelPermissions}: an unknown permission or a value it
 * cannot read refuses the call with none set, and a row the caller lacks the
 * power for ends it there, or is skipped with `continueOnError`.
 */
export async function addChannelClientPermissions(client, cid, cldbid, permissions, options = {}) {
    await execRows(client, "channelclientaddperm", [...continueOnErrorParams(options), ["cid", cid], ["cldbid", cldbid]], permissions.map((entry) => [permissionParam(entry.permission), ["permvalue", entry.value]]), options);
}
/**
 * Remove several permissions from one client within one channel, in one
 * command. With none, nothing is sent. The server's answer is as for
 * {@link deleteChannelPermissions}, and it documents no `-continueonerror` for
 * this command either.
 */
export async function deleteChannelClientPermissions(client, cid, cldbid, permissions, options) {
    await execRows(client, "channelclientdelperm", [
        ["cid", cid],
        ["cldbid", cldbid],
    ], permissions.map((permission) => [permissionParam(permission)]), options);
}
/** Remove a permission from one client within one channel. */
export async function deleteChannelClientPermission(client, cid, cldbid, permission, options) {
    await exec(client, "channelclientdelperm", [["cid", cid], ["cldbid", cldbid], permissionParam(permission)], options);
}
//# sourceMappingURL=channels.js.map