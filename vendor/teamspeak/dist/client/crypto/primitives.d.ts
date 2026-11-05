import { type KeyObject } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
/** Clamp a Curve25519 scalar in-place (required before scalar multiplication). */
export declare function clampScalar(key: Uint8Array): void;
/**
 * Generate an ephemeral Ed25519 key pair for the TS3 handshake.
 * Returns [publicKey (32 bytes, RFC-8032 encoded), privateKey (32 bytes)].
 */
export declare function generateTemporaryKey(): [Uint8Array, Uint8Array];
/**
 * Sign data with a P-256 private key (SHA-256 hash, ASN.1 DER encoded).
 */
export declare function sign(privateKey: KeyObject, data: Uint8Array): Uint8Array;
/**
 * Verify a P-256 ECDSA signature (SHA-256 hash, ASN.1 DER encoded).
 */
export declare function verifySign(publicKey: KeyObject, data: Uint8Array, sig: Uint8Array): boolean;
/**
 * TS3-specific shared secret derivation using Ed25519 point arithmetic.
 * Mirrors NaCl's ge_scalarmult_vartime:
 *   1. Negate the public point
 *   2. Scalar-multiply by clamped private key bytes (NOT reduced mod n)
 *   3. Flip sign bit of result
 *   4. SHA-512 the resulting point bytes
 *
 * The scalar must NOT be reduced mod n: Ed25519 has cofactor 8, so the server's
 * public key may have a small-order component, and P*s ≠ P*(s mod n) in that case.
 * We use scalarMultFull to handle scalars >= n without losing the cofactor term.
 */
export declare function getSharedSecret2(publicKeyBytes: Uint8Array, privateKeyBytes: Uint8Array): Uint8Array;
/**
 * Multiply an Ed25519 point by a scalar that may be >= curve order n.
 * Decomposes as: P*s = P*(s mod n) + (P*n)*q  where q = floor(s/n).
 * This preserves the small-order component (cofactor 8) that would be
 * lost by reducing mod n first.
 *
 * For a clamped 255-bit scalar, q is at most 7 (since maxScalar / n < 8),
 * so the second term is computed with at most one extra scalar multiplication.
 */
export declare function scalarMultFull(point: InstanceType<typeof ed25519.Point>, scalar: bigint): InstanceType<typeof ed25519.Point>;
/** Interpret a little-endian byte array as an unsigned BigInt. */
export declare function bytesToBigIntLE(bytes: Uint8Array): bigint;
//# sourceMappingURL=primitives.d.ts.map