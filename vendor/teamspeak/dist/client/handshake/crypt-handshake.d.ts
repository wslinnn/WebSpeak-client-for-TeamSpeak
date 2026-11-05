import { type Crypt } from "../crypto/crypt.js";
export declare const INIT_VERSION = 1566914096;
/**
 * The RSA puzzle `crypt`'s attempt solved: the level the server demanded and
 * the milliseconds spent on it. Level 0 and no time when the server sent none.
 */
export declare function puzzleOf(crypt: Crypt): {
    readonly level: number;
    readonly durationMs: number;
};
/**
 * Handle the TS3INIT1 handshake steps.
 * Returns the response bytes to send, or null if nothing should be sent.
 * A step that cannot be answered is ignored (null); a puzzle out of range
 * throws a PuzzleTooHardError.
 *
 * The puzzle step is the only one that takes time, so a challenge not answered
 * before returns a promise of the response, which gives the event loop back
 * while it solves and rejects with `signal`'s reason once that aborts. Nothing
 * else the server sends is answered until it settles.
 */
export declare function processInit1(crypt: Crypt, data: null): Uint8Array;
export declare function processInit1(crypt: Crypt, data: Uint8Array | null, signal?: AbortSignal): Uint8Array | null | Promise<Uint8Array | null>;
//# sourceMappingURL=crypt-handshake.d.ts.map