/**
 * AES-EAX AEAD implementation for TS3 (64-bit tag, AES-128).
 * Uses AES-CMAC for authentication and AES-CTR for encryption.
 */
export declare class EAX {
    #private;
    constructor(key: Uint8Array);
    encrypt(nonce: Uint8Array, header: Uint8Array, plaintext: Uint8Array): [ciphertext: Uint8Array, tag: Uint8Array];
    decrypt(nonce: Uint8Array, header: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array): Uint8Array;
}
export declare function aesCmac(key: Uint8Array, message: Uint8Array): Uint8Array;
//# sourceMappingURL=eax.d.ts.map