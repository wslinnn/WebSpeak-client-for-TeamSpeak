/** The row a command's answer carries, and whether it carries several. */
export interface LateRows {
    /** The keys the row is known by. */
    readonly keys: readonly string[];
    /**
     * The answer has one row for each of several things it made, and all, some or
     * none of them may follow the `error` line, so it is held until the rows stop.
     */
    readonly several?: boolean;
    /** Any row is the answer: a read, which has no one key. */
    readonly any?: boolean;
}
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
export declare const LATE_ROWS: ReadonlyMap<string, LateRows>;
/** How long a successful answer without its row is held open for the row to arrive. */
export declare const LATE_ROW_GRACE_MS = 250;
/** For an answer with several rows: how long without a new one counts as its end. */
export declare const LATE_ROW_QUIET_MS = 25;
/** What is known of where a command's answer rows may fall, or `undefined` for none. */
export declare function lateRowsOf(command: string): LateRows | undefined;
/** Whether `rows` already hold what {@link lateRowsOf} says to wait for. */
export declare function hasLateRow(late: LateRows, rows: ReadonlyArray<Record<string, string>>): boolean;
//# sourceMappingURL=late-rows.d.ts.map