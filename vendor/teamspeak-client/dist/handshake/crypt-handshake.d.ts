import type { Crypt } from "../crypto/crypt.js";
export declare const INIT_VERSION = 1566914096;
/**
 * Handle the TS3INIT1 handshake steps.
 * Returns the response bytes to send, or null if nothing should be sent.
 */
export declare function processInit1(crypt: Crypt, data: Uint8Array | null): Uint8Array | null;
//# sourceMappingURL=crypt-handshake.d.ts.map