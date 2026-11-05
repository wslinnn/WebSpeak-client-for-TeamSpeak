/**
 * Commands only the voice protocol has.
 *
 * ServerQuery has no subscriptions — a query client hears every channel's
 * events once it registers for them — and no `channelgetdescription`, since its
 * `channelinfo` already carries the description. These run on the voice
 * client alone, which is why they take one rather than any CommandExecutor.
 */
import type { Client } from "../client.js";
import type { ChannelID, ClientID, CommandOptions } from "@honeybbq/teamspeak";
/**
 * The channel's description, which `listChannels` omits for bandwidth. The
 * server answers with a `notifychanneledited` that the client does not report as
 * a `channelEdited` event, since it is no edit. Rejects with a NoDataError if
 * the server sends no such answer.
 */
export declare function getChannelDescription(client: Client, cid: ChannelID, options?: CommandOptions): Promise<string>;
/**
 * The virtual server's properties as the server sends them on request, which
 * is a different set from `getServerInfo`'s: it has the settings, limits and
 * counters (clients online, uptime, traffic) and lacks the identity ones such as
 * the unique identifier. It is the whole row, counters included.
 *
 * The client's `view.server` takes every answer in, whoever asked, less the
 * counters, so this is also how to bring it up to date after an edit the
 * server did not spell out. The answer goes to the asker alone.
 *
 * @experimental New in 1.x and may change in a minor release.
 */
export declare function getServerVariables(client: Client, options?: CommandOptions): Promise<Readonly<Record<string, string>>>;
/**
 * Subscribe to a channel: see its clients and their changes without joining
 * it. It does not bring the channel's voice, which only reaches the clients
 * in it. The server answers with `channelSubscribed`.
 *
 * The channel this client joins, and every channel it moves into, is
 * subscribed without being asked and without a `channelSubscribed`, and
 * leaving a channel keeps the subscription. Measured on TeamSpeak 3 3.13.8 and
 * TeamSpeak 6 6.0.0-beta13.1.
 */
export declare function subscribeChannel(client: Client, cid: ChannelID, options?: CommandOptions): Promise<void>;
/**
 * Stop seeing a subscribed channel's clients: the server answers with
 * `channelUnsubscribed`, and sends no `clientLeftView` for them. The channel
 * this client is in cannot be unsubscribed from: the command succeeds and
 * changes nothing.
 */
export declare function unsubscribeChannel(client: Client, cid: ChannelID, options?: CommandOptions): Promise<void>;
/** Subscribe to every channel on the server; the server answers with a `channelSubscribed` per channel it subscribes. */
export declare function subscribeAllChannels(client: Client, options?: CommandOptions): Promise<void>;
/** Unsubscribe from every channel but the one this client is in: a `channelUnsubscribed` for each. */
export declare function unsubscribeAllChannels(client: Client, options?: CommandOptions): Promise<void>;
/**
 * Whether `password` is the server's password (`verifyserverpassword`),
 * without joining. The password is given in cleartext; the client hashes it
 * on the wire. The server answers a match with plain success and a mismatch
 * with error 1028 (`ErrorCode.ServerInvalidPassword`), which this turns into
 * `false`; any other error is thrown. Measured on TeamSpeak 3 and 6.
 */
export declare function verifyServerPassword(client: Client, password: string, options?: CommandOptions): Promise<boolean>;
/**
 * Whether `password` is channel `cid`'s password (`verifychannelpassword`),
 * without moving. The password is given in cleartext; the client hashes it
 * on the wire, as `moveClient` does. A mismatch is error 781
 * (`ErrorCode.ChannelInvalidPassword`) and answers `false`; a channel without
 * a password accepts any value and answers `true`; an unknown channel is
 * error 768, thrown. Measured on TeamSpeak 3 and 6.
 */
export declare function verifyChannelPassword(client: Client, cid: ChannelID, password: string, options?: CommandOptions): Promise<boolean>;
/**
 * Stop hearing the given clients (`clientmute`): the server no longer forwards
 * their voice to this client. It is per listener, so everyone else still hears
 * them, and it sends no notification and changes no client property. Several
 * clients go in one command. The server accepts this client's own id and ids
 * of clients that are not connected without an error. Undo it with
 * `unmuteClients`. Measured on TeamSpeak 3 and 6.
 */
export declare function muteClients(client: Client, clientIDs: readonly ClientID[], options?: CommandOptions): Promise<void>;
/**
 * Hear the given clients again (`clientunmute`): the server resumes forwarding
 * their voice to this client after `muteClients`. Measured on TeamSpeak 3 and 6.
 */
export declare function unmuteClients(client: Client, clientIDs: readonly ClientID[], options?: CommandOptions): Promise<void>;
//# sourceMappingURL=voice.d.ts.map