/**
 * Row parsers shared with the client and query modules, kept out of the public index:
 * they read wire rows, which is plumbing, not API. They reach them through
 * `./internal`.
 */
import type { FieldSpec } from "./command.js";
import type { ServerGroupID } from "../command/ids.js";
import type { ClientChanges, ClientEntry } from "./clients.js";
/** A comma-separated list of server group ids; anything that is not one is skipped. */
export declare function parseServerGroups(raw: string): ServerGroupID[];
/**
 * The wire key of every client field but `id`, and how each is read: the one
 * table `parseClient` and `parseClientChanges` share, so a row, a listing and
 * a change cannot disagree about a name. `always` marks the fields every
 * source carries, which read as a default from a row without them; every
 * other field is left out when the row lacks it.
 */
export declare const clientFields: {
    readonly [K in Exclude<keyof ClientEntry, "id">]-?: FieldSpec<ClientEntry[K]>;
};
/**
 * Read a client from a `clientlist` row, or from a `notifycliententerview`,
 * which names its channel `ctid` where the list says `cid`. Reached by the
 * client module through `./internal`.
 *
 * The fields every source carries read as a default from a row without
 * them; the others are `undefined` instead.
 */
export declare function parseClient(row: Record<string, string>): ClientEntry;
/**
 * Read the properties a `notifyclientupdated` row named, and only those: the
 * result holds exactly the keys the row carried, and one the row cleared (an
 * icon of 0) holds `undefined`. The client's id is not among them; the row's `clid` is.
 */
export declare function parseClientChanges(row: Record<string, string>): ClientChanges;
//# sourceMappingURL=parse.d.ts.map