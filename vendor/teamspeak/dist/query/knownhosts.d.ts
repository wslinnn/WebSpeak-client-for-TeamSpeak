/**
 * What a host key check needs to know about the key a server presented. A
 * structural type, so this module reads no further than it uses.
 */
export interface PresentedHostKey {
    /** The host that was dialled, as the caller wrote it. */
    readonly host: string;
    /** The port that was dialled. */
    readonly port: number;
    /** The key's wire encoding: the blob a `known_hosts` line carries in base64. */
    readonly key: Uint8Array;
    /** The key's algorithm, as its own encoding names it. */
    readonly keyType: string;
    /** The key's `SHA256:` fingerprint, as `ssh-keygen -lf` prints it. */
    readonly fingerprint: string;
}
/**
 * The OpenSSH fingerprint of a key: `SHA256:` and the unpadded base64 of the
 * SHA-256 of its wire encoding, which is what `ssh-keygen -lf` prints.
 */
export declare function fingerprintOf(key: Uint8Array): string;
/**
 * The algorithm a key's wire encoding names, such as `ssh-ed25519`: the first
 * field of the encoding, a length-prefixed string.
 *
 * Throws on an encoding that is too short to hold one, so that a key which
 * cannot be read is refused rather than described as nothing.
 */
export declare function keyTypeOf(key: Uint8Array): string;
/**
 * An OpenSSH `known_hosts` file, read for the one question a client asks of it:
 * is this the key the host is recorded with.
 *
 * Follows what `ssh` does with `StrictHostKeyChecking=yes`: a host the file
 * does not mention is refused, so is one whose recorded keys do not include the
 * key it presented, and so is any key a `@revoked` line names, whatever host
 * presents it. Nothing is ever added to the file.
 *
 * `@cert-authority` lines are read and then ignored. They name a key that signs
 * host certificates, and a presented plain key is not one, so they can neither
 * accept nor refuse it.
 */
export declare class KnownHosts {
    #private;
    private constructor();
    /**
     * Read the text of a `known_hosts` file. `source` names it in messages.
     *
     * Throws on a line it cannot read, naming the file and line, rather than
     * skipping it: a skipped `@revoked` line would let the key it revokes
     * through.
     */
    static parse(text: string, source: string): KnownHosts;
    /**
     * Accept the key by returning, or refuse it by throwing an `Error` that says
     * why: revoked, a host the file does not know, or a key that differs from the
     * recorded one.
     */
    verify(presented: PresentedHostKey): void;
}
//# sourceMappingURL=knownhosts.d.ts.map