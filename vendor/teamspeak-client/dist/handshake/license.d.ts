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
export declare function parseLicenses(data: Uint8Array): LicenseChain;
export {};
//# sourceMappingURL=license.d.ts.map