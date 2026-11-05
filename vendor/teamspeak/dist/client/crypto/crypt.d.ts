import type { Identity } from "./identity.js";
/**
 * The most squarings the Init1 puzzle may ask for. A server raises its puzzle
 * level while it is flooded with connections. Measured, TS3 3.13 and TS6 6.0
 * both ask for 10000 when calm, 100000 at protection level 1 and 1000000 at
 * level 2, the highest they reach; a level lasts about 75 seconds after the
 * burst that raised it. A squaring takes about 0.3 microseconds here, so those
 * take 3 ms, 30 ms and 300 ms. The cap is four times the highest level seen,
 * 1.2 s of work here. The solve gives the event loop back every
 * {@link SQUARINGS_PER_SLICE} squarings and stops when the connect is
 * cancelled, so a level near the cap costs the caller at most what the caller
 * allows the connect to take, and blocks nothing in the meantime; a level above
 * it is refused with a {@link PuzzleTooHardError}.
 */
export declare const MAX_RSA_CHALLENGE_LEVEL: number;
/**
 * How many squarings the solve does before it lets the event loop run: about
 * 15 ms of work, so a timer or another connection waits no longer than that.
 */
export declare const SQUARINGS_PER_SLICE = 50000;
export interface KeyNonce {
    key: Uint8Array;
    nonce: Uint8Array;
    gen: number;
}
/**
 * A connection's encryption state. The session material — the IV the keys
 * derive from — lives in private fields, so it shows in no `util.inspect()`
 * or `JSON.stringify()` of anything holding a Crypt.
 */
export declare class Crypt {
    #private;
    readonly identity: Identity;
    constructor(identity: Identity);
    /** Whether the session keys are set up; until then packets use the dummy key. */
    get cryptoInitComplete(): boolean;
    /** The signature unencrypted packets carry: zeros until crypto init completes. */
    get fakeSignature(): Uint8Array;
    /** The client's random contribution to the IV, sent in clientinitiv; empty before. */
    get alpha(): Uint8Array;
    /** Choose the client's random contribution to the IV, and return it. */
    newAlpha(): Uint8Array;
    /**
     * Answer the Init1 puzzle: square `x` modulo `n` `level` times, `x` and `n`
     * being the two 64-byte numbers at `offset` in `data`. Rejects with a
     * {@link PuzzleTooHardError} for a level above {@link MAX_RSA_CHALLENGE_LEVEL},
     * with a {@link HandshakeError} for a level or modulus that is no puzzle, and
     * with `signal`'s reason when it aborts, checked between slices of
     * {@link SQUARINGS_PER_SLICE} squarings.
     */
    solveRsaChallenge(data: Uint8Array, offset: number, level: number, signal?: AbortSignal): Promise<Uint8Array>;
    initCrypto(alpha: string, beta: string, omega: string): void;
    /**
     * Build the IV from `alpha` and `beta` XORed into `sharedKey` and complete
     * crypto init. The values come from the server, so a length that does not fit
     * is refused rather than padded: alpha must be 10 bytes, beta at least one,
     * and the key as long as the IV, 10 bytes plus beta.
     */
    setSharedSecret(alpha: Uint8Array, beta: Uint8Array, sharedKey: Uint8Array): void;
    getKeyNonce(fromServer: boolean, packetID: number, generationID: number, packetType: number, dummy: boolean): [key: Uint8Array, nonce: Uint8Array];
    encrypt(packetType: number, packetID: number, generationID: number, header: Uint8Array, plaintext: Uint8Array, dummy: boolean, unencrypted: boolean): [ciphertext: Uint8Array, mac: Uint8Array];
    decrypt(packetType: number, packetID: number, generationID: number, header: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array, dummy: boolean, unencrypted: boolean): Uint8Array;
}
//# sourceMappingURL=crypt.d.ts.map