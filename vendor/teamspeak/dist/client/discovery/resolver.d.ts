import type { AddrResolver, ResolvedAddr } from "../types.js";
/**
 * The most a TSDNS server or the nickname service is read for. Either answers
 * with one short line; without a bound, one that kept sending would be held in
 * memory until the resolution budget ran out.
 */
export declare const MAX_DISCOVERY_RESPONSE: number;
/** An SRV record, as `resolveSrv` gives it. */
export interface SrvRecord {
    /** The target host; a trailing dot is allowed. */
    readonly name: string;
    /** The target's port. */
    readonly port: number;
    /** Lower is tried first. */
    readonly priority: number;
    /** Among records of one priority, the higher is tried first more often. */
    readonly weight: number;
}
/** How the default resolver resolves. */
export interface ResolverOptions {
    /** Look dot-less names up at named.myteamspeak.com; off by default. */
    readonly nicknameLookup?: boolean | undefined;
    /**
     * The nickname lookup endpoint, an http: or https: URL; the default is
     * `https://named.myteamspeak.com/lookup`. Used only with `nicknameLookup`:
     * setting it does not turn the lookup on. For a test double or a mirror of
     * the service. The name is sent as the `name` query parameter, and the first
     * line of the answer is the address. A URL that is not http: or https: throws
     * a TypeError.
     */
    readonly nicknameService?: string | URL | undefined;
    /**
     * Answers the SRV lookups, for DNS over HTTPS, another DNS server, or a
     * test; the default is the system's `resolveSrv`. It answers every SRV
     * lookup the resolver makes (`_ts3._udp.<host>` and `_tsdns._tcp.<domain>`),
     * called with the full name and the resolution's signal. A rejection or an
     * empty list means no record. One that ignores the signal cannot hold
     * resolution up. The host names in the answers, and the TSDNS servers'
     * names, are still looked up by the system.
     */
    readonly resolveSrv?: ((name: string, options: {
        readonly signal: AbortSignal;
    }) => Promise<readonly SrvRecord[]>) | undefined;
    /**
     * The `fetch` the nickname lookup uses, for a proxy or a test; the default
     * is the global `fetch`. Used only with `nicknameLookup`.
     */
    readonly fetch?: typeof globalThis.fetch | undefined;
}
/**
 * The resolver a Client uses unless it is given another. It resolves as the
 * TeamSpeak application does, so on its own it shows where an address leads:
 * `await new Resolver().resolve("ts.example.com")`. Answers are kept for ten
 * minutes.
 */
export declare class Resolver implements AddrResolver {
    #private;
    constructor(options?: ResolverOptions);
    /**
     * Resolve as the TeamSpeak application does: a server nickname (only with
     * `nicknameLookup`), then SRV, then TSDNS, then the address as given. The
     * whole resolution is bounded: past the budget, or when a step fails, the
     * address as given is the answer.
     */
    resolve(inputAddr: string, options?: {
        readonly signal?: AbortSignal | undefined;
    }): Promise<ResolvedAddr[]>;
}
/**
 * Ask a TSDNS server where `host` is. The answer is the server's targets in
 * its order and as it sent them: an entry may have no port, which TeamSpeak
 * takes as 9987, or the literal port `$PORT`, the port the user gave (9987 by
 * default). {@link Resolver} applies both. A name the server has no record for
 * gives an empty list.
 *
 * The answer ends at its first line break or when the server closes the
 * connection, whichever comes first. It rejects when the connection fails,
 * when no answer completes within three seconds or grows past 8 KiB, and with
 * the signal's reason when it aborts.
 *
 * @param server - The TSDNS server, `host` or `host:port`; the port defaults to 41144.
 * @param host - The name to look up; it is sent without a port.
 */
export declare function lookupTSDNS(server: string, host: string, options?: {
    readonly signal?: AbortSignal | undefined;
}): Promise<string[]>;
//# sourceMappingURL=resolver.d.ts.map