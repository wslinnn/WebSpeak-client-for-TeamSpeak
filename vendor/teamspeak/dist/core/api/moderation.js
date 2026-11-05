/**
 * Bans, complaints, offline messages, text messages and the server log.
 *
 * All administrative: expect a permission error, not an empty list, when the
 * client lacks the rights.
 */
import { nonZero, firstRow, exec, query, queryRows, continueOnErrorParams, list, encodeFields, nonEmpty, toWireDuration, str, big, num, bool, date, durationMs, SECOND, } from "./command.js";
import { asBanID, asClientDBID, asMessageID, asUID } from "../command/ids.js";
import { TextMessageTarget } from "../enums.js";
const parseBan = (row) => ({
    id: asBanID(big(row, "banid")),
    ip: str(row, "ip"),
    name: str(row, "name"),
    uid: asUID(str(row, "uid")),
    mytsid: str(row, "mytsid"),
    lastNickname: str(row, "lastnickname"),
    createdAt: date(row, "created"),
    durationMs: durationMs(row, "duration", SECOND),
    invokerDatabaseID: asClientDBID(big(row, "invokercldbid")),
    invokerName: str(row, "invokername"),
    invokerUID: asUID(str(row, "invokeruid")),
    reason: str(row, "reason"),
    enforcements: num(row, "enforcements"),
});
const banListNames = { start: "start", limit: "duration" };
/**
 * Every active ban, or a page of them with `start` and `limit`. A server with
 * none, or a `start` past the last, answers an empty list.
 *
 * `-count`, which adds the total number of bans to the first row, is not sent:
 * the function returns the bans, and the total would be a second result.
 */
export async function listBans(client, options = {}) {
    return (await list(client, "banlist", encodeFields(options, banListNames), options)).map(parseBan);
}
const banCriteriaNames = {
    ip: ["ip", nonEmpty],
    name: ["name", nonEmpty],
    uid: ["uid", nonEmpty],
    mytsid: ["mytsid", nonEmpty],
};
/**
 * The bans that would catch a client with this address, nickname, uid or
 * myTeamSpeak id. None is an empty list.
 *
 * TeamSpeak 6 only, over the voice protocol and SSH: TS3 has no `banfind`, and
 * TS6's WebQuery answers it as an unknown command (1538). Needs
 * `b_client_ban_list`. The server refuses a call with no criteria with error
 * 1542, so that is refused here first.
 */
export async function findBans(client, criteria, options) {
    if (!criteria.ip && !criteria.name && !criteria.uid && !criteria.mytsid) {
        throw new TypeError("finding a ban needs an ip, a name, a uid or a mytsid");
    }
    return (await list(client, "banfind", encodeFields(criteria, banCriteriaNames), options)).map(parseBan);
}
/**
 * A ban's duration on the wire. A permanent ban (0) omits it: the server's
 * default is permanent, which is also what `time=0` means. A positive duration
 * never rounds down to 0, which would make it permanent.
 */
const banTime = (ms) => (ms === 0 ? undefined : toWireDuration(ms, SECOND));
const banNames = {
    ip: ["ip", nonEmpty],
    name: ["name", nonEmpty],
    uid: ["uid", nonEmpty],
    mytsid: ["mytsid", nonEmpty],
    lastNickname: ["lastnickname", nonEmpty],
    reason: ["banreason", nonEmpty],
    durationMs: ["time", banTime],
};
const banClientNames = {
    durationMs: ["time", banTime],
    reason: ["banreason", nonEmpty],
};
/**
 * Add a ban and return its id — over ServerQuery. The voice protocol reports
 * no id, so there this resolves to undefined.
 *
 * `ban` is what to ban; the command's `signal` and `timeoutMs` go in `options`,
 * a separate last argument — set among the fields, they are not read.
 */
export async function addBan(client, ban, options) {
    if (!ban.ip && !ban.name && !ban.uid && !ban.mytsid) {
        throw new TypeError("a ban needs an ip, a name, a uid or a mytsid to match");
    }
    const rows = await query(client, "banadd", encodeFields(ban, banNames), options);
    return rows[0]?.["banid"] === undefined ? undefined : asBanID(big(rows[0], "banid"));
}
/**
 * Ban a connected client by clid, and return the id of every ban that made.
 *
 * The server bans the client on several counts at once — its address, its
 * uid, and on TS6 its myTeamSpeak id — and over ServerQuery answers one
 * `banid` row for each; returning the first left the others to be found by
 * hand. The voice protocol reports no ids, so there this resolves to `[]`.
 *
 * Measured on TS3 3.13.8 and TS6 beta13.1: two bans, one for the uid and one
 * for the address. TS6 has also answered with no `banid` at all though both
 * bans were made (about once in a hundred calls over WebQuery), so an empty
 * result does not mean no ban, and no lookup of the ids is made: a ban has no
 * field that ties it to this call. Over SSH, TS6 may write the `banid` rows
 * after the `error` line; the ServerQuery client waits briefly for them, so
 * they are not lost to that. A caller that must undo the ban lists the
 * bans before and after and removes what is new: a ban on the address refuses
 * every later connection from it.
 */
export async function banClient(client, clid, options = {}) {
    const rows = await query(client, "banclient", [["clid", clid], ...encodeFields(options, banClientNames)], options);
    return rows.flatMap((row) => (str(row, "banid") === "" ? [] : [asBanID(big(row, "banid"))]));
}
/**
 * Ban several connected clients by clid, in one command, such as
 * `banclient time=60 clid=5|clid=6`, and return the id of every ban the server
 * reports. With no ids nothing is sent and the result is `[]`.
 *
 * Each client costs the bans {@link banClient} describes; clients that share an
 * address share one address ban, so two clients behind one address made three
 * ids. The voice protocol reports no ids, so there this resolves to `[]` even
 * when bans were made.
 *
 * The server reports one answer for the whole call, never one per client: the
 * ids of the bans made, then success, or one error. Measured on TeamSpeak 3
 * 3.13.8 and TeamSpeak 6 beta13.1, over raw ServerQuery, SSH, WebQuery and the
 * voice protocol alike:
 *
 * - Without `continueOnError`, the server first checks that every id names a
 *   client: one that does not (512) refuses the call and nothing is banned.
 *   Past that, clients are banned in the order given and a failure for one
 *   (insufficient permissions, 2568) stops the call: the clients before it are
 *   banned, the ones after it are not, and the error is that client's.
 * - With it (`-continueonerror`), a client that cannot be banned is skipped,
 *   the others are banned, the ids of the bans made are returned, and the
 *   answer is success even when none could be banned.
 *
 * A client that is banned is disconnected.
 */
export async function banClients(client, clientIDs, options = {}) {
    const rows = await queryRows(client, "banclient", [...continueOnErrorParams(options), ...encodeFields(options, banClientNames)], clientIDs.map((clid) => [["clid", clid]]), options);
    return rows.flatMap((row) => (str(row, "banid") === "" ? [] : [asBanID(big(row, "banid"))]));
}
/** Remove a ban. */
export async function deleteBan(client, banID, options) {
    await exec(client, "bandel", [["banid", banID]], options);
}
/** Remove every ban. */
export async function deleteAllBans(client, options) {
    await exec(client, "bandelall", [], options);
}
const parseComplaint = (row) => ({
    targetDatabaseID: asClientDBID(big(row, "tcldbid")),
    targetName: str(row, "tname"),
    fromDatabaseID: asClientDBID(big(row, "fcldbid")),
    fromName: str(row, "fname"),
    message: str(row, "message"),
    createdAt: date(row, "timestamp"),
});
/** Complaints, optionally only those against one client. */
export async function listComplaints(client, options = {}) {
    // 0 names no client, so it lists every complaint, as unset does.
    const target = options.targetDatabaseID;
    const params = [["tcldbid", target === undefined ? undefined : nonZero(target)]];
    return (await list(client, "complainlist", params, options)).map(parseComplaint);
}
/** File a complaint against a client. */
export async function addComplaint(client, targetDatabaseID, message, options) {
    await exec(client, "complainadd", [
        ["tcldbid", targetDatabaseID],
        ["message", message],
    ], options);
}
/** Withdraw one complaint. */
export async function deleteComplaint(client, targetDatabaseID, fromDatabaseID, options) {
    await exec(client, "complaindel", [
        ["tcldbid", targetDatabaseID],
        ["fcldbid", fromDatabaseID],
    ], options);
}
/** Withdraw every complaint against a client. */
export async function deleteAllComplaints(client, targetDatabaseID, options) {
    await exec(client, "complaindelall", [["tcldbid", targetDatabaseID]], options);
}
const parseMessage = (row) => ({
    id: asMessageID(big(row, "msgid")),
    uid: asUID(str(row, "cluid")),
    subject: str(row, "subject"),
    message: str(row, "message"),
    sentAt: date(row, "timestamp"),
    isRead: bool(row, "flag_read"),
});
/** Offline messages for this client. None is an empty list. */
export async function listMessages(client, options) {
    return (await list(client, "messagelist", [], options)).map(parseMessage);
}
/** One offline message, with its text. */
export async function getMessage(client, messageID, options) {
    const rows = await query(client, "messageget", [["msgid", messageID]], options);
    return { ...parseMessage(firstRow(rows, "messageget")), id: messageID };
}
/**
 * Leave an offline message for a client by its unique identifier, whether or
 * not it is online. It lands in the recipient's inbox, which `listMessages`
 * reads when connected as that client.
 *
 * Needs `b_client_offline_textmessage_send`, which the server's own command
 * reference does not list: a client without it gets error 2568. The server
 * refuses a uid it has no client record for with error 512 (invalid clientID);
 * it accepts an empty subject or message.
 * Works over the voice protocol and ServerQuery on TS3 and TS6.
 */
export async function sendOfflineMessage(client, uid, subject, message, options) {
    await exec(client, "messageadd", [
        ["cluid", uid],
        ["subject", subject],
        ["message", message],
    ], options);
}
/** Delete an offline message. */
export async function deleteMessage(client, messageID, options) {
    await exec(client, "messagedel", [["msgid", messageID]], options);
}
/** Mark a message read or unread. */
export async function updateMessageFlag(client, messageID, flags, options) {
    await exec(client, "messageupdateflag", [
        ["msgid", messageID],
        ["flag", flags.read],
    ], options);
}
// ---- Text messages ----------------------------------------------------------
//
// Three functions rather than one taking a mode and an id, because the id meant
// a different thing in each mode — a clid, a cid, or nothing — and an untyped
// one let a channel id reach an unrelated client.
//
// Each waits for the server's answer, so a refusal — no permission to message
// that target — is thrown rather than lost.
/** Send a text message to one client. */
export async function sendPrivateMessage(client, clid, message, options) {
    await exec(client, "sendtextmessage", [
        ["targetmode", TextMessageTarget.Client],
        ["target", clid],
        ["msg", message],
    ], options);
}
/**
 * Send a text message to the channel this connection is in.
 *
 * It takes no channel because the server takes none: measured on TS3 and TS6,
 * a channel message naming another channel still arrives in the sender's own.
 * To write to another channel, move there first.
 */
export async function sendChannelMessage(client, message, options) {
    await exec(client, "sendtextmessage", [
        ["targetmode", TextMessageTarget.Channel],
        ["msg", message],
    ], options);
}
/** Send a text message to everyone on the virtual server. */
export async function sendServerMessage(client, message, options) {
    await exec(client, "sendtextmessage", [
        ["targetmode", TextMessageTarget.Server],
        ["msg", message],
    ], options);
}
const logViewNames = {
    lines: ["lines", (lines) => (lines === 0 ? undefined : lines)],
    reverse: "reverse",
    instance: "instance",
    beginPosition: "begin_pos",
};
/** Read a page of the server log. */
export async function viewLog(client, options = {}) {
    const fields = {
        ...options,
        reverse: options.reverse ?? false,
        instance: options.instance ?? false,
    };
    const rows = await query(client, "logview", encodeFields(fields, logViewNames), options);
    const first = firstRow(rows, "logview");
    // One line per row, under the key `l`. This used to read only a `log` field
    // from the first row, which the server does not send; it is still read,
    // should a server send the lines that way.
    const lines = rows.flatMap((row) => (row["l"] === undefined ? [] : [row["l"]]));
    const joined = str(first, "log");
    return {
        lines: lines.length === 0 && joined !== "" ? joined.split("\n") : lines,
        lastPosition: num(first, "last_pos"),
        fileSize: num(first, "file_size"),
    };
}
/** Write an entry to the server log. */
export async function addLog(client, level, message, options) {
    await exec(client, "logadd", [
        ["loglevel", level],
        ["logmsg", message],
    ], options);
}
//# sourceMappingURL=moderation.js.map