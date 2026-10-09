import { type KeyObject } from "node:crypto";
export declare class Identity {
    readonly privateKey: KeyObject;
    offset: bigint;
    constructor(privateKey: KeyObject, offset: bigint);
    publicKeyBase64(): string;
    toString(): string;
    securityLevel(): number;
    upgradeToLevel(targetLevel: number, signal?: AbortSignal): Promise<void>;
}
export declare function identityFromString(s: string): Identity;
export declare function generateIdentity(targetLevel: number): Identity;
export declare function getUidFromPublicKey(publicKey: string): string;
export declare function hash512(data: Uint8Array): Uint8Array;
/** Import a TS3 public key (canonical or legacy ASN.1 DER) and return the
 *  uncompressed 65-byte point [0x04 || x || y]. */
export declare function importPublicKey(data: Uint8Array): KeyObject;
//# sourceMappingURL=identity.d.ts.map