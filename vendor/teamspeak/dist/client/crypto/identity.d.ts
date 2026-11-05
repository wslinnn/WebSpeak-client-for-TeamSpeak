import { type KeyObject } from "node:crypto";
import { type UID } from "@honeybbq/teamspeak";
/** The highest security level there is: the level counts zero bits of a SHA-1 digest, which has 160. */
export declare const MAX_SECURITY_LEVEL = 160;
/**
 * A TeamSpeak client identity: a P-256 key pair plus a counter, the offset,
 * whose hash with the public key sets the identity's security level.
 *
 * Immutable: raising the level returns a new identity. Opaque: the private
 * key is never exposed, and `toString()`, `toJSON()` and `util.inspect()`
 * describe the identity without it, so an identity that reaches a log or an
 * error message does not leak; `export()` is the one way to get the secret
 * form, for storing it. Make one with `generateIdentity()` or
 * `parseIdentity()`.
 */
export declare class Identity {
    #private;
    private constructor();
    /** The counter whose hash with the public key sets the security level. */
    get offset(): bigint;
    /** The public key in TeamSpeak's encoding: base64 of its DER form. */
    publicKey(): string;
    /**
     * The identity's unique identifier, hashed with `algorithm`: SHA-1 for a
     * TeamSpeak 3 server, SHA-256 for TeamSpeak 6. A connected client's `uid`
     * already uses the one its server does.
     */
    uid(algorithm: UIDAlgorithm): UID;
    /**
     * The identity in the form `parseIdentity()` reads, private key included.
     * Store it as you would a password.
     */
    export(): string;
    /** Describes the identity, by its SHA-1 unique identifier, without its private key. */
    toString(): string;
    /** The same as `toString()`, so serialising an identity cannot leak its key. */
    toJSON(): string;
    /** The security level: trailing zero bits in SHA-1 of the public key and offset. */
    securityLevel(): number;
    /**
     * The same key at an offset whose security level reaches `targetLevel`, as
     * a new identity; this one is unchanged, and returned as it is when it
     * already reaches the level.
     *
     * Each level doubles the expected work, so a high level can take a long
     * time; `signal` bounds it, and the event loop keeps running meanwhile. A
     * level above 160, the width of SHA-1, can never be reached and is refused
     * with a RangeError.
     */
    upgradeToLevel(targetLevel: number, options?: {
        readonly signal?: AbortSignal | undefined;
    }): Promise<Identity>;
}
/**
 * Read an identity from the form `Identity.export()` writes: the private key
 * as canonical base64 of at most 32 bytes, a colon, and the offset as a
 * decimal unsigned 64-bit integer. Anything else throws an
 * InvalidIdentityError, with the underlying failure as its cause.
 */
export declare function parseIdentity(s: string): Identity;
/**
 * Create an identity at the given security level, at most 160. Each level
 * doubles the expected work; `signal` bounds it, and the event loop keeps
 * running meanwhile.
 */
export declare function generateIdentity(targetLevel: number, options?: {
    readonly signal?: AbortSignal | undefined;
}): Promise<Identity>;
/**
 * Create an identity at the given security level, at most 160, blocking until
 * done. Fine for a low level; a high one can block the event loop for minutes,
 * so prefer `generateIdentity()` there.
 */
export declare function generateIdentitySync(targetLevel: number): Identity;
/** The values of the table below, before freezing. */
declare const uidAlgorithmValues: {
    /** SHA-1, 20 bytes: a TeamSpeak 3 server. */
    readonly SHA1: "sha1";
    /** SHA-256, 32 bytes: a TeamSpeak 6 server. */
    readonly SHA256: "sha256";
};
/**
 * The hash a server uses for `client_unique_identifier`, keyed by the server's
 * major version.
 *
 * TeamSpeak 3 hashes the canonical public key with SHA-1 (20 bytes); TeamSpeak
 * 6 switched to SHA-256 (32 bytes). The algorithm is not negotiable on the
 * wire, so a client that guesses wrong computes a UID that matches nothing the
 * server ever sends — self-identification by UID silently fails.
 */
export declare const UIDAlgorithm: typeof uidAlgorithmValues;
/**
 * One of {@link UIDAlgorithm}. May gain members in a minor release, should a
 * server generation change the hash again: a `switch` over it needs a default
 * case.
 */
export type UIDAlgorithm = (typeof UIDAlgorithm)[keyof typeof UIDAlgorithm];
/** Pick the UID hash from a `virtualserver_version` string, e.g. "6.0.0-beta13.1". */
export declare function uidAlgorithmForVersion(version: string): UIDAlgorithm;
/**
 * The unique identifier of a public key in TeamSpeak's encoding, hashed with
 * `algorithm`: SHA-1 for a TeamSpeak 3 server, SHA-256 for TeamSpeak 6.
 */
export declare function uidFromPublicKey(publicKey: string, algorithm: UIDAlgorithm): UID;
export declare function hash512(data: Uint8Array): Uint8Array;
/** Import a TS3 public key (canonical or legacy ASN.1 DER) and return the
 *  uncompressed 65-byte point [0x04 || x || y]. */
export declare function importPublicKey(data: Uint8Array): KeyObject;
export {};
//# sourceMappingURL=identity.d.ts.map