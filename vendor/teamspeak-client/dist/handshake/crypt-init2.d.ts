import type { Crypt } from "../crypto/crypt.js";
/**
 * CryptoInit2 performs the second stage of crypto initialization (Ed25519 ECDH).
 * Mirrors Go's handshake.CryptoInit2.
 */
export declare function cryptoInit2(crypt: Crypt, license: string, omega: string, proof: string, beta: string, privateKey: Uint8Array): void;
//# sourceMappingURL=crypt-init2.d.ts.map