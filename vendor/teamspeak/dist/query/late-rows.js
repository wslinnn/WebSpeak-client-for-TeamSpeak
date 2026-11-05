/**
 * Commands whose answer carries the row that names what they made, and the key
 * that row is known by.
 *
 * TeamSpeak 6 over SSH has been measured (6.0.0-beta13.1) to write that row
 * after the command's `error` line, a fraction of a millisecond later, in a
 * share of the answers. A client that takes the `error` line for the end of the
 * answer loses the row and, worse, hands it to whichever command is sent next.
 * Holding the answer briefly is harmless on a server that writes the row first.
 * See "Server behaviour the SDK works around" in `docs/serverquery-responses.md`.
 */
export const LATE_ROWS = new Map([
    ["channelcreate", { keys: ["cid"] }],
    ["servergroupadd", { keys: ["sgid"] }],
    ["servergroupcopy", { keys: ["sgid"] }],
    ["channelgroupadd", { keys: ["cgid"] }],
    ["channelgroupcopy", { keys: ["cgid"] }],
    ["banadd", { keys: ["banid"] }],
    ["banclient", { keys: ["banid"], several: true }],
    ["privilegekeyadd", { keys: ["token"] }],
    ["tokenadd", { keys: ["token"] }],
    ["apikeyadd", { keys: ["apikey"] }],
    ["servercreate", { keys: ["sid"] }],
]);
/** How long a successful answer without its row is held open for the row to arrive. */
export const LATE_ROW_GRACE_MS = 250;
/** For an answer with several rows: how long without a new one counts as its end. */
export const LATE_ROW_QUIET_MS = 25;
/**
 * Commands that read something, by their names: a `list`, `info` or `find`, a
 * `get…`, `whoami`, `version`. A plain read has been measured to have its whole
 * answer after the `error` line too, much less often than a create (2 in 3000
 * `clientlist` calls, while clients were connecting), so one that is answered
 * with no row is held briefly as well. An empty success is rare for these: the
 * servers answer an empty list with error 1281.
 */
const READS = /(list|info|find|search)$|^(get\w+|whoami|version|permfind|permoverview|permget)$/;
/** What is known of where a command's answer rows may fall, or `undefined` for none. */
export function lateRowsOf(command) {
    const known = LATE_ROWS.get(command);
    if (known !== undefined)
        return known;
    return READS.test(command) ? { keys: [], any: true } : undefined;
}
/** Whether `rows` already hold what {@link lateRowsOf} says to wait for. */
export function hasLateRow(late, rows) {
    if (late.any === true)
        return rows.length > 0;
    return rows.some((row) => late.keys.some((k) => row[k] !== undefined));
}
//# sourceMappingURL=late-rows.js.map