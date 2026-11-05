declare const enum LicenseBlockType {
    Intermediate = 0,
    Server = 2,
    Ts5Server = 8,
    Ephemeral = 32
}
interface LicenseBlock {
    readonly key: Uint8Array;
    readonly hash: Uint8Array;
    properties: Uint8Array[];
    issuer: string;
    notValidBefore: Date;
    notValidAfter: Date;
    blockType: LicenseBlockType;
    serverType: number;
}
export declare class LicenseChain {
    readonly blocks: LicenseBlock[];
    constructor(blocks: LicenseBlock[]);
    /**
     * Derive the session key by chaining Ed25519 point arithmetic starting from
     * the root key through each license block.
     */
    deriveKey(): Uint8Array<ArrayBuffer>;
}
/**
 * The most blocks a license chain may have. Real chains have two or three —
 * root-issued intermediate, server, ephemeral — and every block costs a
 * point multiplication to derive, so a server's chain of thousands would hold
 * the event loop for seconds.
 */
export declare const MAX_LICENSE_BLOCKS = 8;
export declare function parseLicenses(data: Uint8Array): LicenseChain;
export {};
//# sourceMappingURL=license.d.ts.map