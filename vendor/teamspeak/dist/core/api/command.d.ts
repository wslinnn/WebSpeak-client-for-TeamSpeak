/**
 * Typed command layer.
 *
 * Every command both the voice protocol and ServerQuery accept is one function
 * here, running on any CommandExecutor. Functions that only send a command
 * return `Promise<void>`; functions that read return a parsed type. Every one
 * takes a last, optional {@link CommandOptions} — a signal to abandon it and a
 * timeoutMs — which is passed to the executor as it is.
 *
 * Nothing here re-encodes ids or field names by hand at the call site: the
 * branded id types, the field tables below and the request encoder
 * turn parameters into wire form in one place.
 */
import type { CommandExecutor, CommandOptions, ParamValue } from "../command/request.js";
import type { ChannelID, ChannelUID, IconID } from "../command/ids.js";
import type { Permission } from "../permission.js";
/** Parameters in the order they are sent. */
export type Params = ReadonlyArray<readonly [string, ParamValue]>;
/**
 * Send a command that produces no data and wait for the server's answer.
 *
 * `passwords` names the parameters that carry a channel password. Naming them
 * here, rather than encoding them, leaves the encoding to the transport — the
 * voice protocol hashes them, ServerQuery does not — and keeps every call site
 * from having to remember, which is how a raw password once reached the server
 * and failed 781.
 */
declare function exec(client: CommandExecutor, command: string, params?: Params, options?: CommandOptions, passwords?: readonly string[]): Promise<void>;
/**
 * The signal and timeoutMs of a command's options, alone: a command's own
 * options extend CommandOptions, and the executor, and any middleware on it,
 * should see only what is theirs.
 */
declare function commandOptions(options: CommandOptions | undefined): CommandOptions | undefined;
/**
 * Send a command that takes a list and produces no data: `params` are the
 * parameters of the first row, and every entry of `rows` is one more row of
 * the list (`a=1 b=2|b=3`). With no rows, nothing is sent.
 */
declare function execRows(client: CommandExecutor, command: string, params: Params, rows: readonly Params[], options?: CommandOptions, passwords?: readonly string[]): Promise<void>;
/**
 * Send a list command that answers with rows, as {@link execRows} sends one.
 * With no rows nothing is sent, and the answer is empty.
 */
declare function queryRows(client: CommandExecutor, command: string, params: Params, rows: readonly Params[], options?: CommandOptions): Promise<Array<Record<string, string>>>;
/**
 * The `-continueonerror` switch, as a command's first parameter: the server
 * reads it from the first row only, so a switch written after the last row
 * does nothing.
 */
declare const continueOnErrorParams: (options: {
    readonly continueOnError?: boolean | undefined;
}) => Params;
/** Send a command and return its response rows. */
declare function query(client: CommandExecutor, command: string, params?: Params, options?: CommandOptions, passwords?: readonly string[]): Promise<Array<Record<string, string>>>;
/**
 * Send a command that lists or finds something and return its rows.
 *
 * The server reports an empty list as error 1281, "database empty result set",
 * rather than as no rows — `banlist` on a server with no bans, `messagelist`
 * with no messages — which made every list function throw where it should
 * have answered `[]`. A search may report finding nothing with an error of its
 * own, `how.noMatch`: `clientfind` answers 512 and `channelfind` 768, which for a
 * command naming no client or channel can mean nothing else. `how.passwords`
 * is as for {@link exec}.
 */
declare function list(client: CommandExecutor, command: string, params?: Params, options?: CommandOptions, how?: {
    readonly noMatch?: number;
    readonly passwords?: readonly string[];
}): Promise<Array<Record<string, string>>>;
/** How a paged command is walked, as by {@link iterateClientDatabase}. */
export interface PagingOptions extends CommandOptions {
    /**
     * How many rows to ask for per page; 100 by default. The server may cap a
     * page below this, which the walk allows for.
     */
    readonly pageSize?: number | undefined;
}
/**
 * Walk a command the server pages with `start` and `duration`, a page at a
 * time, as the caller asks for more.
 *
 * The walk ends when the server answers a `start` past the last row with error
 * 1281, "database empty result set", on an empty page, or on a page shorter
 * than an earlier one. A short *first* page does not end it: the server may cap
 * a page below what was asked, so the walk asks once more to find out. It also
 * ends when a page starts at or before the last row already seen
 * (`advanced` says), which is a server ignoring `start` — without that check
 * such a server would be asked for its first page forever.
 *
 * Any other error is thrown from the iteration. Rows added or removed during
 * the walk can be skipped or seen twice, since each page is a separate query.
 *
 * `options` reaches every page's command.
 */
declare function pages<T>(client: CommandExecutor, command: string, parse: (row: Record<string, string>) => T, advanced: (previous: T, next: T) => boolean, options?: PagingOptions): AsyncGenerator<T, void, undefined>;
/**
 * The row a command is defined to answer with, which must hold `key` when one
 * is named. A server that acknowledged the command without it has not
 * answered, which is a NoDataError rather than a row of empty fields.
 */
declare function firstRow(rows: ReadonlyArray<Record<string, string>>, command: string, key?: string): Record<string, string>;
export { exec, execRows, query, queryRows, list, pages, commandOptions, continueOnErrorParams, firstRow, };
export type { ParamValue };
/**
 * How one option field goes on the wire: its parameter name, or its name and a
 * function from the field's value to the parameter's. An encoder may return
 * undefined to omit the parameter.
 */
export type WireField<V> = string | readonly [name: string, encode: (value: V) => ParamValue];
/**
 * A wire name for every field of an options type.
 *
 * Every key is required, so a field added to the options interface without a
 * wire name is a compile error rather than a field silently never sent; the
 * signal and timeoutMs every command's options carry are not parameters. A
 * field whose type is not already a parameter value — a duration in
 * milliseconds sent in seconds, say — must have an encoder.
 */
export type WireNames<T> = {
    readonly [K in Exclude<keyof T, keyof CommandOptions>]-?: Exclude<T[K], undefined> extends ParamValue ? WireField<Exclude<T[K], undefined>> : readonly [name: string, encode: (value: Exclude<T[K], undefined>) => ParamValue];
};
/**
 * Encode an options object through its field table.
 *
 * The table, not the object, decides what is sent: a key missing from the
 * table — a typo, or anything else a JavaScript caller put there — is ignored
 * rather than forwarded onto the wire. An unset field (undefined, or null from
 * JavaScript) is omitted; any other value is sent, so `""` is sent as an empty
 * parameter, which is how a setting such as a channel password is cleared.
 */
export declare function encodeFields<T extends object>(fields: T, names: WireNames<T>): Params;
/**
 * Raw wire properties, sent as given: a string as is, a number or bigint in
 * decimal, a boolean as 1 or 0. Any other value, undefined among them, is left
 * out.
 */
export declare const rawProperties: (settings: Readonly<Record<string, unknown>>) => Params;
/** An encoder that omits an empty string instead of sending it. */
export declare const nonEmpty: (value: string) => string | undefined;
/**
 * An encoder that omits an id of 0 instead of sending it: where a command
 * takes an id as a filter or a target, 0 names no channel, client or group,
 * so it can only mean "any" or "none".
 */
export declare const nonZero: (value: bigint) => bigint | undefined;
/** One second, in milliseconds: the unit most durations travel in. */
export declare const SECOND = 1000;
/** One millisecond: the unit `client_idle_time` and its like travel in. */
export declare const MILLISECOND = 1;
/**
 * A duration in milliseconds, as the count of `unitMs` the wire carries.
 *
 * Rounds to the nearest unit, except that a positive duration never becomes 0:
 * several fields read 0 as "forever" (a ban) or "never" (a temporary
 * password), so half a second sent as 0 seconds would turn a short ban into a
 * permanent one. A negative or non-finite duration is refused.
 */
export declare function toWireDuration(ms: number, unitMs: number): number;
/** An encoder for a millisecond field the wire carries in seconds. */
export declare const inSeconds: (ms: number) => number;
/**
 * Read a string field, tolerating absence.
 *
 * The parser has already unescaped it; unescaping again would turn a nickname
 * that really contains `\s` into one with a space.
 */
declare const str: (row: Record<string, string>, key: string) => string;
/**
 * Read an unsigned 64-bit field, tolerating absence. Garbage, and a value
 * outside 0 to 2^64-1, read as 0: every field read this way is an id or a
 * size, and reading one must not throw where the id constructors would.
 */
declare const big: (row: Record<string, string>, key: string) => bigint;
/**
 * Read an id no wider than `max`: an integer from 0 to `max`, or 0 for
 * anything else, so the id constructors never see a value they refuse.
 */
declare const uint: (row: Record<string, string>, key: string, max: number) => number;
/** The widths {@link uint} reads ids at. */
declare const U16 = 65535;
declare const U32 = 4294967295;
/** Read a number field, tolerating absence. Fractions are kept. */
declare const num: (row: Record<string, string>, key: string) => number;
/** Read a number field that may be absent: undefined when the key is missing, else as {@link num}. */
declare const optNum: (row: Record<string, string>, key: string) => number | undefined;
/** Read a boolean field: the protocol writes 0/1. */
declare const bool: (row: Record<string, string>, key: string) => boolean;
/** Read an icon id, signed or unsigned, as its unsigned value; 0 is no icon. */
declare const icon: (row: Record<string, string>, key: string) => IconID | undefined;
/**
 * Read a unix timestamp as a Date.
 *
 * 0, absence and garbage are `undefined`, not 1970: the server sends 0 for
 * "never" (a client that never connected, a key never used).
 */
declare const date: (row: Record<string, string>, key: string) => Date | undefined;
/** Read a duration sent as a count of `unitMs`, in milliseconds. */
declare const durationMs: (row: Record<string, string>, key: string, unitMs: number) => number;
export { str, big, num, optNum, uint, U16, U32, bool, icon, date, durationMs };
/**
 * How one record field is read from a row: the wire keys that carry it, in
 * the order they are tried, and how to read the one that is there. An `always`
 * field is read even from a row without it, as the default `read` gives; the
 * others are left out, so a field is `undefined` when the row lacked it.
 */
export interface FieldSpec<T> {
    /** The wire keys that name the field; the first one the row has is read. */
    readonly keys: readonly [string, ...string[]];
    /** Reads the field from the row, given the key that was found (or the first, for an absent `always` field). */
    readonly read: (row: Record<string, string>, key: string) => T;
    /** Whether a full record reads the field from a row that lacks it. */
    readonly always?: true;
}
/**
 * Read the fields of `table` from a row into a new object.
 *
 * With `onlyPresent`, a field is read only when the row carries one of its
 * keys, and kept even when its value reads as `undefined`: what comes back
 * holds exactly the keys the row named, which is what a change needs. A key
 * holding `undefined` says the row carried the field and it is now none (an
 * icon of 0, a `seconds_empty` of -1); merging it clears the field. Without
 * `onlyPresent`, the `always` fields are read whether or not the row has
 * them, and a field that reads as `undefined` is left out, as a full record
 * does.
 */
export declare function readFields(table: Readonly<Record<string, FieldSpec<unknown>>>, row: Record<string, string>, onlyPresent: boolean): Record<string, unknown>;
/**
 * The id of the group a create or copy just made.
 *
 * ServerQuery answers `servergroupadd` with the new id alone. The voice
 * protocol answers with the whole group list instead (`notifyservergrouplist`),
 * so taking the first row returned the first group on the server rather than
 * the new one. The new group is the one with the requested name — the newest,
 * should the name repeat across group types.
 *
 * The difference is a property of the answers, not a choice:
 * `notifychannelcreated` names the client that invoked it, so `channelcreate`
 * keeps only its own row, while the group commands answer with the whole list
 * and name no invoker — `notifyservergrouplist` for `servergroupadd` and
 * `servergroupcopy`, `notifychannelgrouplist` for `channelgroupadd` and
 * `channelgroupcopy` — leaving nothing but the name to match on. A group of
 * the same name created concurrently by another party is therefore
 * indistinguishable from ours, channel groups as much as server groups, and
 * the id returned may be theirs rather than the one we just made. That is a
 * limit of what the notification reports, not of this function.
 *
 * TeamSpeak 6's WebQuery can answer a create that succeeded with no row at all
 * (see "Server behaviour the SDK works around" in
 * `docs/serverquery-responses.md`). That case is not handled here: see
 * {@link recoveredGroupID}, which the four group-creating functions use, and
 * which looks the group up by name and type.
 */
export declare function createdGroupID(rows: ReadonlyArray<Record<string, string>>, idKey: "sgid" | "cgid", name: string, command: string): bigint;
/**
 * The id of the group a create or copy just made, as {@link createdGroupID}
 * finds it, or, when the answer carries no group row and no id, by listing the
 * groups and taking the one with the requested name and type.
 *
 * TeamSpeak 6's WebQuery answers a create without its id in some conditions
 * (see "Server behaviour the SDK works around" in
 * `docs/serverquery-responses.md`). A server refuses a duplicate name within
 * one type, so a group matching both is the one just created. The one gap is
 * another client renaming or deleting it before the lookup. A NoDataError is
 * thrown only when none matches.
 */
export declare function recoveredGroupID(rows: ReadonlyArray<Record<string, string>>, idKey: "sgid" | "cgid", name: string, type: number, command: string, listGroups: () => Promise<ReadonlyArray<{
    id: bigint;
    name: string;
    type: number;
}>>): Promise<bigint>;
/**
 * Encode a permission as `permid` or `permsid`, whichever names it.
 *
 * A JavaScript caller can pass an object naming neither, and a command sent
 * with neither parameter fails on the server with a less helpful error, if it
 * fails at all — so that is refused here.
 */
export declare function permissionParam(permission: Permission): readonly [string, ParamValue];
/** A channel as returned by `channellist` or `channelinfo`. */
export interface Channel {
    /** The channel's id. */
    readonly id: ChannelID;
    /**
     * The channel this one sits under, or 0 at the top level.
     *
     * `channellist` names this `cpid` and `channelinfo` names it `pid` — the same
     * value under two keys, which is why both are read here.
     */
    readonly parentID: ChannelID;
    /** The channel's name. */
    readonly name: string;
    /** The topic shown under the name (`channel_topic`). */
    readonly topic: string;
    /**
     * The channel this one is sorted after among its siblings, or 0 for the
     * first: `channel_order` is a channel id, not a position.
     */
    readonly order: ChannelID;
    /** Whether joining needs a password. */
    readonly hasPassword: boolean;
    /** Whether new clients land here. */
    readonly isDefault: boolean;
    /** Whether the channel survives a server restart (`channel_flag_permanent`). */
    readonly isPermanent: boolean;
    /**
     * Whether the channel is kept until the last client leaves it, but not
     * across a restart (`channel_flag_semi_permanent`).
     */
    readonly isSemiPermanent: boolean;
    /** The voice codec, one of {@link Codec}. */
    readonly codec: number;
    /** The codec's quality, 0 to 10. */
    readonly codecQuality: number;
    /** How many clients may be in the channel (`channel_maxclients`); -1 for no limit. */
    readonly maxClients: number;
    /**
     * How many clients may be in the channel and its subchannels together
     * (`channel_maxfamilyclients`); -1 for no limit.
     */
    readonly maxFamilyClients: number;
    /**
     * How many clients are in the channel now (`total_clients`).
     * `listChannels` reports it; `getChannelInfo` leaves it undefined, because
     * `channelinfo` does not carry it.
     */
    readonly totalClients: number | undefined;
    /**
     * How many clients are in the channel and its subchannels now
     * (`total_clients_family`). `listChannels` reports it; `getChannelInfo`
     * leaves it undefined, because `channelinfo` does not carry it.
     */
    readonly totalFamilyClients: number | undefined;
    /**
     * The subscribe power a client needs to subscribe to the channel
     * (`channel_needed_subscribe_power`). `listChannels` reports it;
     * `getChannelInfo` leaves it undefined, because `channelinfo` does not
     * carry it.
     */
    readonly neededSubscribePower: number | undefined;
    /** The talk power a client needs to speak here. */
    readonly neededTalkPower: number;
    /** The channel's icon, or undefined for none. */
    readonly iconID: IconID | undefined;
    /**
     * The unique identifier the server gives the channel
     * (`channel_unique_identifier`): TS6 sends one, TS3 none, which reads as "".
     * `channellist` does not carry it, so `listChannels` leaves it empty.
     */
    readonly uid: ChannelUID;
    /**
     * The description (`channel_description`). Neither `channellist` nor a
     * channel notification carries it, so `listChannels` and the voice client's
     * view leave it undefined, and a channel's description changing is told by
     * `channelDescriptionChanged` without the text; `getChannelInfo` has it, and
     * so has the voice client's `getChannelDescription`.
     */
    readonly description?: string | undefined;
    /** How many packets of voice are sent at once, 1 to 10 (`channel_codec_latency_factor`). */
    readonly codecLatencyFactor?: number | undefined;
    /** Whether voice in the channel travels unencrypted (`channel_codec_is_unencrypted`). */
    readonly isUnencrypted?: boolean | undefined;
    /** Whether `maxClients` is ignored (`channel_flag_maxclients_unlimited`). */
    readonly isMaxClientsUnlimited?: boolean | undefined;
    /** Whether `maxFamilyClients` is ignored (`channel_flag_maxfamilyclients_unlimited`). */
    readonly isMaxFamilyClientsUnlimited?: boolean | undefined;
    /** Whether the family limit is taken from the parent (`channel_flag_maxfamilyclients_inherited`). */
    readonly isMaxFamilyClientsInherited?: boolean | undefined;
    /**
     * How long a temporary channel survives its last client leaving, in
     * milliseconds (`channel_delete_delay`, which the wire carries in seconds).
     */
    readonly deleteDelayMs?: number | undefined;
    /** How the name is pronounced, for text-to-speech (`channel_name_phonetic`). */
    readonly namePhonetic?: string | undefined;
    /** Whether only clients with talk power may speak (`channel_forced_silence`). */
    readonly isForcedSilence?: boolean | undefined;
    /** The URL of the channel's banner image (`channel_banner_gfx_url`). */
    readonly bannerURL?: string | undefined;
    /**
     * How the banner is fitted to the channel (`channel_banner_mode`); compare it
     * with `BannerMode`. A plain number, since a server may send a mode that
     * table does not name.
     */
    readonly bannerMode?: number | undefined;
    /**
     * How long the channel has had no client, in milliseconds (`seconds_empty`,
     * which the wire carries in seconds), as of the answer. Undefined for a
     * channel with a client in it: both TS3 3.13.8 and TS6 6.0.0-beta13.1 send
     * -1 for it, which is not a duration. `listChannels` and `getChannelInfo`
     * report it; a notification never does.
     */
    readonly emptyForMs?: number | undefined;
    /**
     * The channel's file storage quota (`channel_storage_quota`); TS6 only.
     * TS6 6.0.0-beta13.1 sent 4294967295 for a channel with none set.
     */
    readonly storageQuota?: number | undefined;
    /** The channel's directory on the server (`channel_filepath`); `getChannelInfo` only. */
    readonly filePath?: string | undefined;
}
/**
 * A change to a channel: only the properties a notification named, by the
 * names of {@link Channel}. A key is present exactly when the notification
 * carried it, and a property it did not carry is not "unknown" but, for a
 * created channel, the server's default. A key holding `undefined` says the
 * value was cleared: `iconID` is `undefined` when the icon was removed.
 */
export type ChannelChanges = {
    readonly [K in Exclude<keyof Channel, "id">]?: Channel[K];
};
/**
 * The channel with `changes` applied, as a new object; `channel` is not
 * touched. Keys `changes` lacks keep their value, and a key holding
 * `undefined` clears the property: the notification carried it and it is now
 * none, as for an icon of 0.
 */
export declare function applyChannelChanges(channel: Channel, changes: ChannelChanges): Channel;
/** The wire key of every channel field but `id`, and how each is read; one table for rows and for changes. */
export declare const channelFields: {
    readonly [K in Exclude<keyof Channel, "id">]-?: FieldSpec<Channel[K]>;
};
declare function parseChannel(row: Record<string, string>): Channel;
/**
 * Read the properties a channel notification named, and only those. The
 * channel's id is not among them: a notification carries it as `cid`, which
 * the event holds as its own field.
 */
declare function parseChannelChanges(row: Record<string, string>): ChannelChanges;
export { parseChannel, parseChannelChanges };
/**
 * What a command that takes a list of options carries beside the usual signal
 * and timeout: whether the server keeps going past an item that fails.
 */
export interface BatchOptions extends CommandOptions {
    /**
     * Send `-continueonerror`, which the server documents for this command: it
     * processes every item and skips the ones that fail, instead of stopping at
     * the first. What it then answers differs by command, and each function says.
     * False by default.
     */
    readonly continueOnError?: boolean | undefined;
}
/** One permission to set, with its value: an entry of a batch that adds permissions. */
export interface PermissionValue {
    /** The permission to set. */
    readonly permission: Permission;
    /** Its value (`permvalue`). */
    readonly value: number;
}
/** One entry of a permission list. */
export interface PermissionEntry {
    /**
     * The permission the entry sets, named the way the server sent it — by id,
     * unless a row carries the name. It can be passed straight back to the
     * matching delete function.
     */
    readonly permission: Permission;
    /** The permission's value. */
    readonly value: number;
    /** Whether the value is negated, taking the lowest value instead of the highest. */
    readonly negated: boolean;
    /** Whether the permission skips channel and client overrides. */
    readonly skip: boolean;
}
/**
 * Parse one permission row.
 *
 * A permission is addressable by id or by name, and the server answers in
 * whichever form the request used, so a row carries one or the other.
 */
export declare function parsePermission(row: Record<string, string>): PermissionEntry;
//# sourceMappingURL=command.d.ts.map