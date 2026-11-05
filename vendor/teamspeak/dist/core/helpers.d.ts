/**
 * Read an unsigned 64-bit decimal: digits only, 0 to 2^64-1. Anything else — a
 * sign, a hex or binary prefix, a fraction, a value that does not fit — reads as
 * 0, which names nothing, instead of throwing: the text comes off the network.
 * `BigInt()` alone takes all of those, in any width.
 */
export declare function parseUint64(s: string): bigint;
export declare function parseUint16(s: string): number;
export declare function parseInt10(s: string): number;
/**
 * Expand a pipe-separated multi-row TS3 command line into individual rows.
 *
 * A named line (`notifyclientleftview a=1|a=2`) keeps its name on every row; a
 * nameless response (`cldbid=1|cldbid=2`) stays nameless. Whether the first
 * token is a name is decided by the parser's own rule — deciding it here by
 * position is how a nameless batch with no space in it went through unsplit and
 * a one-field-per-row response came back as a single row. Tokens are split on
 * the space and on nothing else, as the parser splits them.
 *
 * TeamSpeak compresses a batch by leaving out of a row the fields whose value
 * is unchanged from the previous row: in a notifycliententerview batch, ctid is
 * often present only on the first row. A row is therefore the fields of the
 * previous row, as that row came out, that it does not name itself, followed by
 * its own. Tokens stay escaped so the command parser can still perform the
 * single unescape pass later.
 *
 * A row that names a field of its own each time makes every row carry all the
 * fields before it, so the rows would grow with the square of the line. The
 * rows of a real server's line are a little larger than their own parts and
 * never come near the limits that stop this: once the rows together would hold
 * more than the larger of four times the line and 64 KiB, the rows after that
 * carry only their own tokens. A name repeated on every row can grow them on its
 * own, so at twice that the rows stop, and the rest of the line is dropped.
 * Neither limit passes 64 times the line. Lengths are counted in characters.
 */
export declare function splitCommandRows(line: string): string[];
/**
 * Sleep, or wake early once `signal` aborts. Resolves either way, never
 * rejects. The timer keeps the process alive while it runs.
 */
export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;
//# sourceMappingURL=helpers.d.ts.map