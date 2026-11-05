/**
 * Icons: the file name and id of an icon, and the commands that point a
 * channel, group, client or server at one.
 *
 * An icon is a file in channel 0's file area, uploaded as `/icon_<id>` and
 * kept in its `icons` directory; `uploadIcon` in the client entry point sends
 * it. Nothing references it until an id is set, and the id is not a property
 * of `channeledit` or `channelcreate`: both servers answer 1538 to
 * `channel_icon_id`, with the file present or not. A channel, a group or a
 * client takes its icon from the `i_icon_id` permission, and the server from
 * `virtualserver_icon_id`; the setters here send those.
 *
 * The server never checks that an id names an uploaded file: setting an id
 * with no file is accepted, and the icon is then missing.
 */
import type { ChannelGroupID, ChannelID, ClientDBID, IconID, ServerGroupID } from "../command/ids.js";
import type { CommandExecutor, CommandOptions } from "../command/request.js";
/**
 * The id an icon is known by: the CRC-32 of its bytes, the standard one (zlib's
 * `crc32`: polynomial 0xEDB88320, initial value and final XOR 0xFFFFFFFF), as
 * an unsigned number.
 *
 * The SDK names an icon this way so that the same image always gets the same
 * id, and uploading it twice reuses one file. The server accepts any number as
 * the id in `/icon_<id>` and does not check it against the bytes. The id set
 * on a channel, group, client or server (`i_icon_id`,
 * `virtualserver_icon_id`) is stored exactly as given and names the file
 * `/icon_<id>`, so an icon uploaded under another scheme works as long as the
 * id set matches its file name. Whether other clients use this CRC-32 as well
 * is not something the SDK can promise.
 */
export declare function iconIDOf(data: Uint8Array): IconID;
/**
 * The name an icon is uploaded and downloaded under in channel 0, with a
 * leading slash: `/icon_<id>`. Listing channel 0's `/icons` directory shows it
 * as `icon_<id>`.
 */
export declare function iconFileName(id: IconID): string;
/**
 * Delete an icon's file (`ftdeletefile cid=0 name=/icon_<id>`). Needs
 * `b_icon_manage`. A channel, group or client that still names the icon keeps
 * naming it.
 */
export declare function removeIcon(client: CommandExecutor, id: IconID, options?: CommandOptions): Promise<void>;
/**
 * Give a channel an icon, or take it away with `undefined`
 * (`channeladdperm` / `channeldelperm` with `i_icon_id`). Measured on
 * TeamSpeak 3 and 6: `channeledit` cannot do this, and the new id shows in
 * `channelinfo` and `channellist -icon` as `iconID`.
 */
export declare function setChannelIcon(client: CommandExecutor, cid: ChannelID, icon: IconID | undefined, options?: CommandOptions): Promise<void>;
/** Give a server group an icon, or take it away with `undefined` (`i_icon_id`). */
export declare function setServerGroupIcon(client: CommandExecutor, sgid: ServerGroupID, icon: IconID | undefined, options?: CommandOptions): Promise<void>;
/** Give a channel group an icon, or take it away with `undefined` (`i_icon_id`). */
export declare function setChannelGroupIcon(client: CommandExecutor, cgid: ChannelGroupID, icon: IconID | undefined, options?: CommandOptions): Promise<void>;
/**
 * Give a client an icon, or take it away with `undefined` (`i_icon_id` on the
 * client's database record). `clientedit` has a `client_icon_id` in its
 * documentation, but both servers answer it with 1538.
 */
export declare function setClientIcon(client: CommandExecutor, cldbid: ClientDBID, icon: IconID | undefined, options?: CommandOptions): Promise<void>;
/**
 * Give the virtual server an icon, or take it away with `undefined`
 * (`serveredit virtualserver_icon_id`). Needs `b_virtualserver_modify_icon_id`.
 */
export declare function setServerIcon(client: CommandExecutor, icon: IconID | undefined, options?: CommandOptions): Promise<void>;
//# sourceMappingURL=icons.d.ts.map