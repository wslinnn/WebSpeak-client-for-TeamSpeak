/**
 * Bans, complaints, offline messages, text messages and the server log.
 *
 * All administrative: expect a permission error, not an empty list, when the
 * client lacks the rights.
 */
import type { BatchOptions } from "./command.js";
import type { CommandExecutor, CommandOptions } from "../command/request.js";
import type { BanID, ClientDBID, ClientID, MessageID, UID } from "../command/ids.js";
import type { LogLevel } from "../enums.js";
/** A ban, as `banlist` reports it. */
export interface BanEntry {
    /** The ban's id. */
    readonly id: BanID;
    /** The address pattern the ban matches, or "". */
    readonly ip: string;
    /** The nickname pattern the ban matches, or "". */
    readonly name: string;
    /** The unique identifier the ban matches, or "". */
    readonly uid: UID;
    /** The myTeamSpeak id the ban matches, or "" (`mytsid`); TS6 only, TS3 sends none. */
    readonly mytsid: string;
    /** The nickname of the last client the ban caught. */
    readonly lastNickname: string;
    /** When the ban was made. */
    readonly createdAt: Date | undefined;
    /**
     * How long the ban lasts from `createdAt`, in milliseconds; 0 is a
     * permanent ban. The server reports it in seconds.
     */
    readonly durationMs: number;
    /** Who made the ban. */
    readonly invokerDatabaseID: ClientDBID;
    /** Their nickname. */
    readonly invokerName: string;
    /** Their unique identifier. */
    readonly invokerUID: UID;
    /** The reason given. */
    readonly reason: string;
    /** How many times the ban has turned a client away. */
    readonly enforcements: number;
}
/** Which bans {@link listBans} reports. */
export interface BanListOptions extends CommandOptions {
    /** Skip this many bans (`start`). */
    readonly start?: number | undefined;
    /**
     * Report at most this many bans (`duration`). The server caps it at 200;
     * unset reports every ban.
     */
    readonly limit?: number | undefined;
}
/**
 * Every active ban, or a page of them with `start` and `limit`. A server with
 * none, or a `start` past the last, answers an empty list.
 *
 * `-count`, which adds the total number of bans to the first row, is not sent:
 * the function returns the bans, and the total would be a second result.
 */
export declare function listBans(client: CommandExecutor, options?: BanListOptions): Promise<BanEntry[]>;
/**
 * What {@link findBans} looks a ban up by. Set at least one; an empty string is
 * treated as unset, never sent.
 */
export interface BanCriteria {
    /** An address; matches the bans whose address pattern it fits (`ip`). */
    readonly ip?: string | undefined;
    /** A nickname; matches the bans whose nickname pattern it fits (`name`). */
    readonly name?: string | undefined;
    /** A unique identifier (`uid`). */
    readonly uid?: UID | undefined;
    /** A myTeamSpeak id (`mytsid`). */
    readonly mytsid?: string | undefined;
}
/**
 * The bans that would catch a client with this address, nickname, uid or
 * myTeamSpeak id. None is an empty list.
 *
 * TeamSpeak 6 only, over the voice protocol and SSH: TS3 has no `banfind`, and
 * TS6's WebQuery answers it as an unknown command (1538). Needs
 * `b_client_ban_list`. The server refuses a call with no criteria with error
 * 1542, so that is refused here first.
 */
export declare function findBans(client: CommandExecutor, criteria: BanCriteria, options?: CommandOptions): Promise<BanEntry[]>;
/**
 * What a ban matches, how long it lasts and why: the ban itself, never a
 * command's options. `ip` and `name` are regular expressions matched against
 * a client's address and nickname.
 *
 * Unset fields are omitted, and an empty string is treated as unset in every
 * field here, never sent: an empty pattern would match every client.
 */
export interface BanFields {
    /** The address pattern to ban (`ip`). */
    readonly ip?: string | undefined;
    /** The nickname pattern to ban (`name`). */
    readonly name?: string | undefined;
    /** The unique identifier to ban (`uid`). */
    readonly uid?: UID | undefined;
    /** The myTeamSpeak id to ban (`mytsid`); TS6 only, and a 44-character base64 value (the server refuses others with 1538).
     *
     * The literal `empty` is accepted and stored as it is, and it bans every
     * client without a myTeamSpeak id: never send it to ban one client. */
    readonly mytsid?: string | undefined;
    /** The nickname to record as the last one the ban caught (`lastnickname`). */
    readonly lastNickname?: string | undefined;
    /** The reason, shown to the banned client (`banreason`). */
    readonly reason?: string | undefined;
    /**
     * How long the ban lasts, in milliseconds (`time`); unset or 0 is permanent.
     * Sent in whole seconds, and a positive duration under a second is sent as
     * one rather than rounded down to forever.
     */
    readonly durationMs?: number | undefined;
}
/**
 * A ban to add: {@link BanFields}, at least one of `ip`, `name`, `uid` or `mytsid` set; a
 * ban matching nothing is refused before anything is sent. It carries no
 * signal or timeoutMs: those are addBan's separate last argument.
 */
export type BanOptions = BanFields;
/**
 * How long {@link banClient}'s bans last and why — {@link BanFields}' duration
 * and reason — with the command's signal and timeoutMs, as the last argument.
 */
export interface BanClientOptions extends Pick<BanFields, "durationMs" | "reason">, CommandOptions {
}
/**
 * Add a ban and return its id — over ServerQuery. The voice protocol reports
 * no id, so there this resolves to undefined.
 *
 * `ban` is what to ban; the command's `signal` and `timeoutMs` go in `options`,
 * a separate last argument — set among the fields, they are not read.
 */
export declare function addBan(client: CommandExecutor, ban: BanOptions, options?: CommandOptions): Promise<BanID | undefined>;
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
export declare function banClient(client: CommandExecutor, clid: ClientID, options?: BanClientOptions): Promise<BanID[]>;
/** How {@link banClients} bans, and whether it goes on past a failure. */
export interface BanClientsOptions extends BanClientOptions, BatchOptions {
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
export declare function banClients(client: CommandExecutor, clientIDs: readonly ClientID[], options?: BanClientsOptions): Promise<BanID[]>;
/** Remove a ban. */
export declare function deleteBan(client: CommandExecutor, banID: BanID, options?: CommandOptions): Promise<void>;
/** Remove every ban. */
export declare function deleteAllBans(client: CommandExecutor, options?: CommandOptions): Promise<void>;
/** A complaint one client filed against another. */
export interface Complaint {
    /** Who the complaint is about. */
    readonly targetDatabaseID: ClientDBID;
    /** Their nickname. */
    readonly targetName: string;
    /** Who filed it. */
    readonly fromDatabaseID: ClientDBID;
    /** Their nickname. */
    readonly fromName: string;
    /** The complaint. */
    readonly message: string;
    /** When it was filed. */
    readonly createdAt: Date | undefined;
}
/** Which complaints {@link listComplaints} reports. */
export interface ComplaintListOptions extends CommandOptions {
    /** Only those against this client; unset for all (`tcldbid`). */
    readonly targetDatabaseID?: ClientDBID | undefined;
}
/** Complaints, optionally only those against one client. */
export declare function listComplaints(client: CommandExecutor, options?: ComplaintListOptions): Promise<Complaint[]>;
/** File a complaint against a client. */
export declare function addComplaint(client: CommandExecutor, targetDatabaseID: ClientDBID, message: string, options?: CommandOptions): Promise<void>;
/** Withdraw one complaint. */
export declare function deleteComplaint(client: CommandExecutor, targetDatabaseID: ClientDBID, fromDatabaseID: ClientDBID, options?: CommandOptions): Promise<void>;
/** Withdraw every complaint against a client. */
export declare function deleteAllComplaints(client: CommandExecutor, targetDatabaseID: ClientDBID, options?: CommandOptions): Promise<void>;
/** A message left for a client while they were away. */
export interface OfflineMessage {
    /** The message's id. */
    readonly id: MessageID;
    /** The sender's unique identifier. */
    readonly uid: UID;
    /** The subject. */
    readonly subject: string;
    /** The message; `messagelist` leaves it out, `getMessage` has it. */
    readonly message: string;
    /** When it was sent. */
    readonly sentAt: Date | undefined;
    /** Whether it has been read. */
    readonly isRead: boolean;
}
/** Offline messages for this client. None is an empty list. */
export declare function listMessages(client: CommandExecutor, options?: CommandOptions): Promise<OfflineMessage[]>;
/** One offline message, with its text. */
export declare function getMessage(client: CommandExecutor, messageID: MessageID, options?: CommandOptions): Promise<OfflineMessage>;
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
export declare function sendOfflineMessage(client: CommandExecutor, uid: UID, subject: string, message: string, options?: CommandOptions): Promise<void>;
/** Delete an offline message. */
export declare function deleteMessage(client: CommandExecutor, messageID: MessageID, options?: CommandOptions): Promise<void>;
/** The flags of an offline message that can be changed. */
export interface MessageFlags {
    /** Whether the message is marked read (`flag`). */
    readonly read: boolean;
}
/** Mark a message read or unread. */
export declare function updateMessageFlag(client: CommandExecutor, messageID: MessageID, flags: MessageFlags, options?: CommandOptions): Promise<void>;
/** Send a text message to one client. */
export declare function sendPrivateMessage(client: CommandExecutor, clid: ClientID, message: string, options?: CommandOptions): Promise<void>;
/**
 * Send a text message to the channel this connection is in.
 *
 * It takes no channel because the server takes none: measured on TS3 and TS6,
 * a channel message naming another channel still arrives in the sender's own.
 * To write to another channel, move there first.
 */
export declare function sendChannelMessage(client: CommandExecutor, message: string, options?: CommandOptions): Promise<void>;
/** Send a text message to everyone on the virtual server. */
export declare function sendServerMessage(client: CommandExecutor, message: string, options?: CommandOptions): Promise<void>;
/** One read of the server log. */
export interface LogPage {
    /** The lines read, in the order the server sent them. */
    readonly lines: readonly string[];
    /**
     * The byte offset the read stopped at. Pass it as the next read's
     * `beginPosition` to continue from there.
     */
    readonly lastPosition: number;
    /** The log file's size in bytes. */
    readonly fileSize: number;
}
/**
 * Which part of the log {@link viewLog} reads. Unset fields are omitted, and
 * left to the server.
 *
 * The log is paged by byte offset rather than by row, and nothing says when
 * the walk is done, so there is no iterator as there is for the client
 * database: read a page, then pass its `lastPosition` as the next read's
 * `beginPosition`.
 */
export interface LogViewOptions extends CommandOptions {
    /** How many lines to read, at most 100; unset or 0 leaves it to the server (`lines`). */
    readonly lines?: number | undefined;
    /** Read backwards from `beginPosition`, newest line first; false by default (`reverse`, always sent). */
    readonly reverse?: boolean | undefined;
    /** Read the instance log rather than the virtual server's; false by default (`instance`, always sent). */
    readonly instance?: boolean | undefined;
    /**
     * The byte offset to read from; 0 is the start of the log, and unset leaves
     * where to start to the server (`begin_pos`).
     */
    readonly beginPosition?: number | undefined;
}
/** Read a page of the server log. */
export declare function viewLog(client: CommandExecutor, options?: LogViewOptions): Promise<LogPage>;
/** Write an entry to the server log. */
export declare function addLog(client: CommandExecutor, level: LogLevel, message: string, options?: CommandOptions): Promise<void>;
//# sourceMappingURL=moderation.d.ts.map