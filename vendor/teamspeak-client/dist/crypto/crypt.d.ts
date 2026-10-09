import type { Identity } from "./identity.js";
export interface KeyNonce {
    key: Uint8Array;
    nonce: Uint8Array;
    gen: number;
}
export declare class Crypt {
    #private;
    readonly identity: Identity;
    ivStruct: Uint8Array;
    fakeSignature: Uint8Array;
    alphaTmp: Uint8Array;
    cryptoInitComplete: boolean;
    constructor(identity: Identity);
    solveRsaChallenge(data: Uint8Array, offset: number, level: number): Uint8Array;
    initCrypto(alpha: string, beta: string, omega: string): void;
    setSharedSecret(alpha: Uint8Array, beta: Uint8Array, sharedKey: Uint8Array): void;
    getKeyNonce(fromServer: boolean, packetID: number, generationID: number, packetType: number, dummy: boolean): [key: Uint8Array, nonce: Uint8Array];
    encrypt(packetType: number, packetID: number, generationID: number, header: Uint8Array, plaintext: Uint8Array, dummy: boolean, unencrypted: boolean): [ciphertext: Uint8Array, mac: Uint8Array];
    decrypt(packetType: number, packetID: number, generationID: number, header: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array, dummy: boolean, unencrypted: boolean): Uint8Array;
}
//# sourceMappingURL=crypt.d.ts.map