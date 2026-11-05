/**
 * Reconnection policy.
 *
 * A dropped connection is normal on a UDP voice session, so a bot that cannot
 * recover is not usable unattended. Reconnecting is opt-in rather than
 * automatic: a silent reconnect makes a dropped session look like a healthy
 * one, and a caller that wanted to know about the drop never finds out.
 *
 * Backoff is not a nicety here. TeamSpeak bans an IP that opens several
 * connections in quick succession — measured at roughly three, after which the
 * server answers `error id=3329` and refuses everything. A reconnect loop
 * without a delay therefore bans itself, and the ban outlasts the outage it was
 * recovering from.
 */
/** How long to wait before each attempt. */
export interface BackoffPolicy {
    /** Delay before the first retry, in milliseconds; above 0. */
    readonly initialDelayMs: number;
    /** Ceiling for the delay; it never grows past this. Above 0, and not below `initialDelayMs`. */
    readonly maxDelayMs: number;
    /** Multiplier applied after each failed attempt; 1 or more. */
    readonly factor: number;
    /**
     * Fraction of the delay to randomise, up to 1; 0 or below turns it off.
     *
     * A fleet of bots that drop together would otherwise retry in lockstep and
     * hit the server in a burst. Jitter spreads them out.
     */
    readonly jitter: number;
    /** Give up after this many consecutive failures. 0 means never give up; a whole number. */
    readonly maxAttempts: number;
}
/** One second, doubling, capped at a minute, with 20% jitter, never giving up. */
export declare const defaultBackoffPolicy: Readonly<BackoffPolicy>;
/**
 * How a client reconnects after its connection drops. Supplying it, even as
 * `{}`, turns reconnecting on; a deliberate `disconnect()` never reconnects.
 */
export interface ReconnectOptions {
    /** Tuning for the retry delays; unset fields keep {@link defaultBackoffPolicy}'s. */
    readonly backoff?: {
        readonly [K in keyof BackoffPolicy]?: BackoffPolicy[K] | undefined;
    } | undefined;
    /**
     * Decide whether a given failure is worth retrying. Returning false stops the
     * loop. Each client provides its own default; the voice client's is
     * `defaultShouldRetry` in `@honeybbq/teamspeak/client`.
     */
    readonly shouldRetry?: ((error: Error | undefined, attempt: number) => boolean) | undefined;
}
/**
 * Compute the delay before an attempt.
 *
 * `attempt` is 1-based: the delay before the first retry is `initialDelayMs`,
 * give or take the jitter, and the delay never grows past `maxDelayMs`.
 */
export declare function backoffDelay(policy: Readonly<BackoffPolicy>, attempt: number): number;
/**
 * The policy `options` asks for, with the defaults filled in. A value the
 * caller gave that cannot work is a RangeError, thrown when the client is made
 * rather than when the loop first runs: a delay of 0 or a NaN factor would
 * retry in a tight loop, and the flood ban that follows outlasts the outage.
 *
 * Accepted: delays above 0 (an unset `maxDelayMs` is raised to `initialDelayMs`
 * when that is larger than the default; one given below `initialDelayMs` is
 * refused), a factor of at least 1, a jitter of at most 1 (0 or below turns it
 * off), and a whole `maxAttempts` of 0 or more.
 */
export declare function resolveBackoffPolicy(options: ReconnectOptions): BackoffPolicy;
//# sourceMappingURL=reconnect.d.ts.map