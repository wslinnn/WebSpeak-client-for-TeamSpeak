/**
 * The largest decompressed command accepted. A command is reassembled from at
 * most a receive window of fragments, and the largest real answers (a full
 * permission list, the welcome channel list of a big server) are a few
 * hundred kilobytes; a header declaring more is refused before anything is
 * allocated.
 */
export declare const MAX_DECOMPRESSED_SIZE: number;
/** A QuickLZ block that cannot be decompressed: truncated, oversized or inconsistent. */
export declare class QuickLZError extends Error {
    constructor(message: string);
}
/**
 * QuickLZ level 1 decompression, as the server compresses large commands.
 *
 * The input comes from the network, so every read and every back-reference is
 * checked, and malformed input throws a QuickLZError rather than reading out
 * of range or producing a partly filled buffer.
 */
export declare class Qlz {
    #private;
    decompress(data: Uint8Array): Uint8Array;
}
//# sourceMappingURL=quicklz.d.ts.map