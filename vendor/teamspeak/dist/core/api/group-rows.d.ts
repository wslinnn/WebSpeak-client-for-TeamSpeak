/**
 * Group list rows, read. Apart from the two modules that list and edit the
 * groups, so the voice client can read the lists the server sends of itself
 * without these being public.
 */
import type { ChannelGroup } from "./groups.js";
import type { ServerGroup } from "./server.js";
/** Read a server group from a `servergrouplist` row. */
export declare const parseServerGroup: (row: Record<string, string>) => ServerGroup;
/** Read a channel group from a `channelgrouplist` row. */
export declare const parseChannelGroup: (row: Record<string, string>) => ChannelGroup;
//# sourceMappingURL=group-rows.d.ts.map