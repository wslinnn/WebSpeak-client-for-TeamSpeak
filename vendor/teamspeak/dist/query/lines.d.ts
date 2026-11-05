/**
 * The longest line a connection reads, in bytes: 256 MiB. A line is a whole
 * answer, and a client database listing is about 240 bytes a client, so this
 * holds about a million of them; the permission list, the longest answer
 * measured on TeamSpeak 3 and 6, is under 50 KiB. See {@link LineTooLongError}.
 */
export declare const MAX_LINE_BYTES: number;
/**
 * Splits a byte stream into the lines ServerQuery speaks.
 *
 * A line ends at `\n`. The server writes `\n\r`, so the `\r` belongs to the
 * start of the next line rather than the end of this one; both ends are
 * trimmed. Bytes are decoded as UTF-8 only once a whole line is in, so a
 * character split across two chunks arrives whole.
 *
 * Each byte is looked at once, however many chunks a line arrives in. A line
 * past the limit throws {@link LineTooLongError}.
 */
export declare class LineReader {
    #private;
    constructor(limit?: number);
    /** Add a chunk and return the lines it completed, without their terminators. */
    push(chunk: Uint8Array): string[];
}
//# sourceMappingURL=lines.d.ts.map