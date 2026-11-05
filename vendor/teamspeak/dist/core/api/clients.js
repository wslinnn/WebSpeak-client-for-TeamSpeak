/**
 * Client commands.
 *
 * A "client" is someone connected right now, identified by `clid`; a "client
 * database entry" is the persistent record, identified by `cldbid`. Both exist
 * and both appear below, so the two are named apart in the types rather than
 * relying on the reader to tell `ClientID` from `ClientDBID`.
 */
import { uint, U16, firstRow, exec, execRows, continueOnErrorParams, query, list, pages, encodeFields, nonEmpty, parsePermission, permissionParam, str, big, num, optNum, date, } from "./command.js";
import { asChannelID, asChannelUID, asClientDBID, asClientID, asUID } from "../command/ids.js";
import { Reason } from "../reason.js";
import { ErrorCode } from "../errorcode.js";
import { parseClient } from "./parse.js";
/**
 * The client with `changes` applied, as a new object; `entry` is not touched.
 * Keys `changes` lacks keep their value, and a key holding `undefined` clears
 * the property: the notification carried it and it is now none, as for an
 * icon of 0 or a withdrawn talk request.
 */
export function applyClientChanges(entry, changes) {
    const next = { ...entry };
    for (const [key, value] of Object.entries(changes)) {
        if (value === undefined)
            delete next[key];
        else
            next[key] = value;
    }
    return next;
}
const listFlags = {
    uid: "-uid",
    away: "-away",
    voice: "-voice",
    groups: "-groups",
    times: "-times",
    info: "-info",
    country: "-country",
    ip: "-ip",
    badges: "-badges",
    icon: "-icon",
};
/** Every client currently connected. */
export async function listClients(client, options = {}) {
    const flags = encodeFields({ ...options, uid: options.uid !== false }, listFlags);
    return (await list(client, "clientlist", flags, options)).map(parseClient);
}
/**
 * One connected client's full detail, as the server sent it.
 *
 * Raw rather than parsed: `clientinfo` carries some eighty fields, which ones
 * appear depends on the server version and on the caller's permissions, and a
 * typed subset would drop the rest. Durations here are in the server's units —
 * `client_idle_time` and `connection_connected_time` in milliseconds. The keys
 * are named in `PropertyName`.
 */
export async function getClientProperties(client, clid, options) {
    const rows = await query(client, "clientinfo", [["clid", clid]], options);
    return firstRow(rows, "clientinfo");
}
/** The values of the table below, before freezing. */
const connectionTrafficClassValues = {
    /** Voice and whisper packets. */
    Speech: "speech",
    /** Ping and pong packets. */
    Keepalive: "keepalive",
    /** Every other packet: commands, acknowledgements and the handshake. */
    Control: "control",
};
/** The three classes of traffic the server counts. */
export const ConnectionTrafficClass = 
/* @__PURE__ */ Object.freeze(connectionTrafficClassValues);
const trafficClasses = ["speech", "keepalive", "control"];
function readTraffic(row, direction) {
    const out = {};
    for (const c of trafficClasses) {
        out[c] = {
            packets: num(row, `connection_packets_${direction}_${c}`),
            bytes: num(row, `connection_bytes_${direction}_${c}`),
            bandwidthLastSecond: num(row, `connection_bandwidth_${direction}_last_second_${c}`),
            bandwidthLastMinute: num(row, `connection_bandwidth_${direction}_last_minute_${c}`),
        };
    }
    return out;
}
function readLoss(row, way) {
    return {
        speech: num(row, `connection_${way}_packetloss_speech`),
        keepalive: num(row, `connection_${way}_packetloss_keepalive`),
        control: num(row, `connection_${way}_packetloss_control`),
        total: num(row, `connection_${way}_packetloss_total`),
    };
}
/**
 * Another client's connection statistics (`getconnectioninfo clid=`). The
 * server answers with `notifyconnectioninfo`, and asks that client to report
 * its figures meanwhile; what is returned is what the server holds, so a
 * client that never reported shows zeros. Not the same as
 * {@link getConnectionInfo}, which is about the virtual server. `ip` and `port` are
 * present on both servers for the account measured; whether a permission
 * governs them is unmeasured.
 *
 * On the voice protocol the row that names the client is the answer, whether
 * it comes before or after the command's `error`; if it has not come by then,
 * the call waits for it until `options` give up.
 */
export async function getClientConnectionInfo(client, clid, options) {
    const row = firstRow(await query(client, "getconnectioninfo", [["clid", clid]], options), "getconnectioninfo");
    return {
        id: asClientID(uint(row, "clid", U16)),
        pingMs: num(row, "connection_ping"),
        pingDeviationMs: num(row, "connection_ping_deviation"),
        connectedTimeMs: num(row, "connection_connected_time"),
        idleTimeMs: num(row, "connection_idle_time"),
        ip: row["connection_client_ip"],
        port: row["connection_client_port"] === undefined ? undefined : num(row, "connection_client_port"),
        sent: readTraffic(row, "sent"),
        received: readTraffic(row, "received"),
        serverToClientLoss: readLoss(row, "server2client"),
        clientToServerLoss: readLoss(row, "client2server"),
        fileTransferBandwidthSent: num(row, "connection_filetransfer_bandwidth_sent"),
        fileTransferBandwidthReceived: num(row, "connection_filetransfer_bandwidth_received"),
    };
}
/** Move a client to another channel. */
export async function moveClient(client, clid, channelID, options = {}) {
    await exec(client, "clientmove", [
        ["clid", clid],
        ["cid", channelID],
        ["cpw", options.password],
    ], options, ["cpw"]);
}
/**
 * Move several clients to one channel, in one command, such as
 * `clientmove clid=5|clid=6 cid=3`. With no ids nothing is sent.
 *
 * The server reports one answer for the whole call, never one per client, so
 * this resolves to nothing and a failure says only what the server said.
 * Measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 beta13.1, over raw
 * ServerQuery, SSH, WebQuery and the voice protocol alike:
 *
 * - Without `continueOnError`, the server checks every client first: one id it
 *   cannot move (no such client, error 512; a client already in the channel,
 *   770) refuses the call, and no client is moved.
 * - With it (`-continueonerror`), a client that cannot be moved is skipped, the
 *   others are moved, and the answer is success, even when none could be moved.
 *   Read the channel back, as `listClients` reports it, to know who moved.
 *
 * A channel that does not exist fails the call either way (768).
 */
export async function moveClients(client, clientIDs, channelID, options = {}) {
    await execRows(client, "clientmove", [...continueOnErrorParams(options), ["cid", channelID], ["cpw", options.password]], clientIDs.map((clid) => [["clid", clid]]), options, ["cpw"]);
}
/**
 * Kick a client from its channel (`Reason.KickChannel`), which moves it to the
 * default channel, or from the server (`Reason.KickServer`), which disconnects
 * it. Any other reason is refused before anything is sent.
 */
export async function kickClient(client, clid, reason, options = {}) {
    if (reason !== Reason.KickChannel && reason !== Reason.KickServer) {
        throw new RangeError(`a kick's reason is Reason.KickChannel or Reason.KickServer, not ${String(reason)}`);
    }
    await exec(client, "clientkick", [
        ["clid", clid],
        ["reasonid", reason],
        ["reasonmsg", nonEmpty(options.reasonMessage ?? "")],
    ], options);
}
/**
 * Kick several clients for one reason, in one command, such as
 * `clientkick reasonid=4 clid=5|clid=6`. The reason is as for
 * {@link kickClient}; with no ids nothing is sent.
 *
 * The server reports one answer for the whole call, never one per client, so
 * this resolves to nothing and a failure says only what the server said.
 * Measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 beta13.1, over raw
 * ServerQuery, SSH, WebQuery and the voice protocol alike:
 *
 * - Without `continueOnError`, the clients are kicked in the order given and
 *   the call stops at the first one that fails (an id no client has, 512):
 *   the clients before it are kicked, the ones after it are not, and the
 *   error is that client's.
 * - With it (`-continueonerror`), every client is tried, a failing one is
 *   skipped, and the answer is success, even when none could be kicked. Read
 *   the clients back, as `listClients` reports them, to know who was kicked.
 */
export async function kickClients(client, clientIDs, reason, options = {}) {
    if (reason !== Reason.KickChannel && reason !== Reason.KickServer) {
        throw new RangeError(`a kick's reason is Reason.KickChannel or Reason.KickServer, not ${String(reason)}`);
    }
    await execRows(client, "clientkick", [
        ...continueOnErrorParams(options),
        ["reasonid", reason],
        ["reasonmsg", nonEmpty(options.reasonMessage ?? "")],
    ], clientIDs.map((clid) => [["clid", clid]]), options);
}
/** Send a poke to a client. */
export async function pokeClient(client, clid, message, options) {
    await exec(client, "clientpoke", [
        ["clid", clid],
        ["msg", message],
    ], options);
}
/** The `targetmode` of `plugincmd`, by what it addresses. */
const pluginTargetModes = { channel: 0, server: 1, client: 2 };
/**
 * Send a plugin command: a named payload that other clients' plugins agree on
 * and the server relays without reading. The receiving client gets it as the
 * `pluginCommand` event.
 *
 * Measured on TeamSpeak 3 and 6, who receives it:
 *
 * - `"channel"`: the clients in the sender's channel, and the sender. A client
 *   in another channel gets nothing, subscribed to this one or not.
 * - `"server"`: every client on the server, and the sender.
 * - `{ clientID }`: that client only; the sender receives it just when it
 *   names itself. An id no client has is refused with `ErrorCode.ClientInvalidID`.
 *
 * `data` may be empty, and is delivered empty. A ServerQuery connection cannot
 * send plugin commands: the server refuses with 516, invalid client type.
 * The server has a fourth mode, 3, which was seen to reach the same clients as
 * the whole server, so it is not offered.
 */
export async function sendPluginCommand(client, name, data, target, options) {
    const addressed = target === "channel"
        ? [["targetmode", pluginTargetModes.channel]]
        : target === "server"
            ? [["targetmode", pluginTargetModes.server]]
            : [
                ["targetmode", pluginTargetModes.client],
                ["target", target.clientID],
            ];
    await exec(client, "plugincmd", [["name", name], ["data", data], ...addressed], options);
}
/**
 * Tell a client that we are typing a private message to it, which it receives
 * as the `clientChatComposing` event. Only that client is told, whatever
 * channel it is in; naming ourselves tells ourselves. An id no client has is
 * refused with `ErrorCode.ClientInvalidID`. A ServerQuery connection cannot send
 * it: the server answers 256, command not found.
 */
export async function sendChatComposing(client, clid, options) {
    await exec(client, "clientchatcomposing", [["clid", clid]], options);
}
/**
 * Tell a client that we closed our private chat with it. It is only delivered
 * to a client we have sent a private message to; for any other the server
 * accepts the command and sends nothing. The client receives it as a
 * `notification` named `NotificationName.ClientChatClosed`, since it has no
 * typed event. A ServerQuery connection cannot send it.
 */
export async function closePrivateChat(client, clid, options) {
    await exec(client, "clientchatclosed", [["clid", clid]], options);
}
const updateNames = {
    nickname: "client_nickname",
    nicknamePhonetic: "client_nickname_phonetic",
    isInputMuted: "client_input_muted",
    isOutputMuted: "client_output_muted",
    hasInputHardware: "client_input_hardware",
    hasOutputHardware: "client_output_hardware",
    isAway: "client_away",
    awayMessage: "client_away_message",
    isChannelCommander: "client_is_channel_commander",
    isRecording: "client_is_recording",
    isRequestingTalk: "client_talk_request",
    talkRequestMessage: "client_talk_request_msg",
    avatar: "client_flag_avatar",
    badges: "client_badges",
    metaData: "client_meta_data",
};
/**
 * Change our own client state (nickname, mute, away, …). Only the fields you
 * set are sent.
 *
 * `clientupdate` addresses the calling client implicitly — there is no clid
 * parameter on the wire, which is why this takes no id.
 *
 * `update` is what to send; the command's `signal` and `timeoutMs` go in
 * `options`, a separate last argument — set among the fields, they are not
 * read.
 */
export async function updateClient(client, update, options) {
    await exec(client, "clientupdate", encodeFields(update, updateNames), options);
}
const editNames = {
    description: "client_description",
    isTalker: "client_is_talker",
};
/**
 * Change another client's editable attributes. Only the fields you set are
 * sent.
 *
 * `edit` is what to send; the command's `signal` and `timeoutMs` go in
 * `options`, a separate last argument — set among the fields, they are not
 * read.
 */
export async function editClient(client, clid, edit, options) {
    await exec(client, "clientedit", [["clid", clid], ...encodeFields(edit, editNames)], options);
}
const findFlags = { channelID: "-cid", channelUID: "-chuid" };
/**
 * Clients whose nickname contains `pattern`; none is an empty list. The server
 * reports finding no one as error 512 (invalid clientID), which this answers
 * as `[]`.
 *
 * `channelID` and `channelUID` add where each client is. They report, they do
 * not filter: every match is returned either way. TS3 accepts the flags and
 * sends neither field, so on TS3 the fields stay undefined.
 */
export async function findClients(client, pattern, options = {}) {
    const rows = await list(client, "clientfind", [["pattern", pattern], ...encodeFields(options, findFlags)], options, { noMatch: ErrorCode.ClientInvalidID });
    return rows.map((row) => ({
        id: asClientID(uint(row, "clid", U16)),
        nickname: str(row, "client_nickname"),
        ...(row["cid"] === undefined ? {} : { channelID: asChannelID(big(row, "cid")) }),
        ...(row["chuid"] === undefined ? {} : { channelUID: asChannelUID(str(row, "chuid")) }),
    }));
}
/**
 * Every client currently using a given unique identifier, with the nickname
 * each uses; none is an empty list.
 */
export async function getClientIDs(client, uid, options) {
    const rows = await list(client, "clientgetids", [["cluid", uid]], options);
    return rows.map((row) => ({
        id: asClientID(uint(row, "clid", U16)),
        nickname: str(row, "name"),
    }));
}
/** The uid of a connected client. */
export async function getClientUIDByID(client, clid, options) {
    const rows = await query(client, "clientgetuidfromclid", [["clid", clid]], options);
    return asUID(str(firstRow(rows, "clientgetuidfromclid", "cluid"), "cluid"));
}
/**
 * The uid, nickname and myTeamSpeak id of a connected client.
 * {@link getClientUIDByID} is the same command, keeping only the uid.
 */
export async function getClientUIDInfoByID(client, clid, options) {
    const rows = await query(client, "clientgetuidfromclid", [["clid", clid]], options);
    const row = firstRow(rows, "clientgetuidfromclid", "cluid");
    return {
        clientID: asClientID(uint(row, "clid", U16)),
        uid: asUID(str(row, "cluid")),
        nickname: str(row, "nickname"),
        mytsid: str(row, "mytsid"),
    };
}
/** The persistent database id behind a uid. */
export async function getClientDBIDByUID(client, uid, options) {
    const rows = await query(client, "clientgetdbidfromuid", [["cluid", uid]], options);
    return asClientDBID(big(firstRow(rows, "clientgetdbidfromuid", "cldbid"), "cldbid"));
}
function parseDatabaseName(row) {
    return {
        databaseID: asClientDBID(big(row, "cldbid")),
        name: str(row, "name"),
        uid: asUID(str(row, "cluid")),
    };
}
/** The database id and nickname recorded for a database id. */
export async function getClientNameByDBID(client, cldbid, options) {
    const rows = await query(client, "clientgetnamefromdbid", [["cldbid", cldbid]], options);
    return parseDatabaseName(firstRow(rows, "clientgetnamefromdbid", "cldbid"));
}
/** The database id and nickname recorded for a uid. */
export async function getClientNameByUID(client, uid, options) {
    const rows = await query(client, "clientgetnamefromuid", [["cluid", uid]], options);
    return parseDatabaseName(firstRow(rows, "clientgetnamefromuid", "cldbid"));
}
/** Give a client a channel group in one channel. */
export async function setClientChannelGroup(client, cgid, cid, cldbid, options) {
    await exec(client, "setclientchannelgroup", [
        ["cgid", cgid],
        ["cid", cid],
        ["cldbid", cldbid],
    ], options);
}
const optStr = (row, key) => row[key];
const parseDatabaseEntry = (row) => ({
    databaseID: asClientDBID(big(row, "cldbid")),
    uid: asUID(str(row, "client_unique_identifier")),
    nickname: str(row, "client_nickname"),
    createdAt: date(row, "client_created"),
    lastConnectedAt: date(row, "client_lastconnected"),
    totalConnections: num(row, "client_totalconnections"),
    description: str(row, "client_description"),
    lastIP: str(row, "client_lastip"),
    loginName: optStr(row, "client_login_name"),
    avatarHash: optStr(row, "client_flag_avatar"),
    totalBytesUploaded: optNum(row, "client_total_bytes_uploaded"),
    totalBytesDownloaded: optNum(row, "client_total_bytes_downloaded"),
    monthBytesUploaded: optNum(row, "client_month_bytes_uploaded"),
    monthBytesDownloaded: optNum(row, "client_month_bytes_downloaded"),
});
const pageNames = { start: "start", limit: "duration" };
/**
 * One page of persistent client records.
 *
 * The database is paged, and the server caps a page; {@link iterateClientDatabase}
 * walks all of it. A `start` past the last record is an empty page.
 */
export async function listClientDatabase(client, options = {}) {
    return (await list(client, "clientdblist", encodeFields(options, pageNames), options)).map(parseDatabaseEntry);
}
/**
 * Every persistent client record, fetched a page at a time as the loop asks
 * for more:
 *
 * ```ts
 * for await (const entry of iterateClientDatabase(client, { signal })) { ... }
 * ```
 *
 * The walk ends when the server answers a page past the last record with
 * error 1281, or with a page shorter than an earlier one; any other error is
 * thrown from the loop. Each page is a separate `clientdblist`, given the
 * options' signal and timeoutMs, so records added or removed meanwhile can be
 * skipped or seen twice.
 */
export function iterateClientDatabase(client, options) {
    return pages(client, "clientdblist", parseDatabaseEntry, (previous, next) => next.databaseID > previous.databaseID, options);
}
/**
 * Database ids of the records whose nickname matches `pattern`, which may use
 * `%` as a wildcard. No match is an empty list.
 */
export async function findClientDatabase(client, pattern, options) {
    const rows = await list(client, "clientdbfind", [["pattern", pattern]], options);
    return rows.map((row) => asClientDBID(big(row, "cldbid")));
}
/**
 * Database ids of the records whose unique identifier matches `pattern`
 * (`clientdbfind -uid`). No match is an empty list.
 *
 * The match is SQL `LIKE` over the whole identifier, on TeamSpeak 3 and 6
 * alike: without a wildcard `pattern` must be the entire uid, `%` stands for
 * any run of characters and `_` for any one, and case is ignored. A fragment
 * of a uid with no `%` finds nothing, so append `%` to search by prefix. A server answers
 * at most 50 ids for one pattern.
 */
export async function findClientDatabaseByUID(client, pattern, options) {
    const rows = await list(client, "clientdbfind", [
        ["pattern", pattern],
        ["-uid", true],
    ], options);
    return rows.map((row) => asClientDBID(big(row, "cldbid")));
}
/** One database record. */
export async function getClientDatabaseInfo(client, cldbid, options) {
    const rows = await query(client, "clientdbinfo", [["cldbid", cldbid]], options);
    return { ...parseDatabaseEntry(firstRow(rows, "clientdbinfo")), databaseID: cldbid };
}
const databaseEditNames = {
    description: "client_description",
};
/**
 * Change a database record. Only the fields you set are sent.
 *
 * `edit` is what to send; the command's `signal` and `timeoutMs` go in
 * `options`, a separate last argument — set among the fields, they are not
 * read.
 */
export async function editClientDatabase(client, cldbid, edit, options) {
    await exec(client, "clientdbedit", [["cldbid", cldbid], ...encodeFields(edit, databaseEditNames)], options);
}
/** Delete a client from the database entirely. */
export async function deleteClientDatabase(client, cldbid, options) {
    await exec(client, "clientdbdelete", [["cldbid", cldbid]], options);
}
// ---- Client permissions -----------------------------------------------------
/** Permissions set on a client, server-wide. */
export async function listClientPermissions(client, cldbid, options) {
    return (await list(client, "clientpermlist", [["cldbid", cldbid]], options)).map(parsePermission);
}
/** Set a permission on a client, server-wide. */
export async function addClientPermission(client, cldbid, permission, value, options = {}) {
    await exec(client, "clientaddperm", [
        ["cldbid", cldbid],
        permissionParam(permission),
        ["permvalue", value],
        ["permskip", options.skip ?? false],
    ], options);
}
/**
 * Set several permissions on a client, server-wide, in one command: each
 * permission is a row (`permsid=…  permvalue=…  permskip=0|…`). With none,
 * nothing is sent.
 *
 * The server checks every row before it applies any: a permission it does not
 * know (2562) or a value it cannot read (1540) refuses the call, and none is
 * set, with or without `continueOnError`. Measured on TeamSpeak 3 3.13.8 and
 * TeamSpeak 6 beta13.1, over raw ServerQuery, SSH, WebQuery and the voice
 * protocol alike. Resolves to nothing: the server never reports one answer
 * per row.
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
export async function addClientPermissions(client, cldbid, permissions, options = {}) {
    await execRows(client, "clientaddperm", [...continueOnErrorParams(options), ["cldbid", cldbid]], permissions.map((entry) => [
        permissionParam(entry.permission),
        ["permvalue", entry.value],
        ["permskip", entry.skip ?? false],
    ]), options);
}
/** Remove a permission from a client. */
export async function deleteClientPermission(client, cldbid, permission, options) {
    await exec(client, "clientdelperm", [["cldbid", cldbid], permissionParam(permission)], options);
}
/**
 * Remove several permissions from a client, in one command: each permission is
 * a row (`permsid=…|permsid=…`). With none, nothing is sent.
 *
 * The server checks every row before it removes any: one permission it does
 * not know (2562) refuses the call and none is removed. Removing a permission
 * the client does not have succeeds. A permission the caller has too little
 * modify power for (2570) ends the call at that row: the rows before it are
 * removed and the rows after it are not, measured on TeamSpeak 3 3.13.8 and
 * TeamSpeak 6 beta13.1 over every query transport and the voice protocol. The
 * server documents no `-continueonerror` for this command, so none is offered,
 * and sent anyway it changed nothing.
 */
export async function deleteClientPermissions(client, cldbid, permissions, options) {
    await execRows(client, "clientdelperm", [["cldbid", cldbid]], permissions.map((permission) => [permissionParam(permission)]), options);
}
/**
 * Set a custom property on a client, creating or replacing it. The server does
 * not check that the client exists.
 *
 * Needs `b_client_modify_dbproperties`. Works over the voice protocol and
 * ServerQuery on TS3 and TS6.
 */
export async function setCustomProperty(client, cldbid, ident, value, options) {
    await exec(client, "customset", [
        ["cldbid", cldbid],
        ["ident", ident],
        ["value", value],
    ], options);
}
/**
 * Remove a custom property from a client. Removing one it does not have is not
 * an error.
 *
 * Needs `b_client_delete_dbproperties`.
 */
export async function deleteCustomProperty(client, cldbid, ident, options) {
    await exec(client, "customdelete", [
        ["cldbid", cldbid],
        ["ident", ident],
    ], options);
}
/**
 * A client's custom properties. None is an empty list.
 *
 * The server reports a client with no properties as error 512 (invalid
 * clientID), the same as a client that does not exist, so both answer `[]`
 * here; `getClientDatabaseInfo` tells them apart.
 */
export async function listCustomProperties(client, cldbid, options) {
    const rows = await list(client, "custominfo", [["cldbid", cldbid]], options, {
        noMatch: ErrorCode.ClientInvalidID,
    });
    return rows.map((row) => ({ ident: str(row, "ident"), value: str(row, "value") }));
}
/**
 * Every client with a custom property `ident` whose value matches `pattern`,
 * which may hold the SQL wildcard `%`. None is an empty list.
 */
export async function findCustomProperty(client, ident, pattern, options) {
    const rows = await list(client, "customsearch", [
        ["ident", ident],
        ["pattern", pattern],
    ], options);
    return rows.map((row) => ({
        databaseID: asClientDBID(big(row, "cldbid")),
        ident: str(row, "ident"),
        value: str(row, "value"),
    }));
}
//# sourceMappingURL=clients.js.map