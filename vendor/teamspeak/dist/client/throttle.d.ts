/**
 * Token-bucket limiter for outbound TS3 commands.
 * Mirrors Go's commandThrottle.
 *
 * Waiters are released in the order they arrived: each used to poll for a
 * token on its own timer, so a command that came later could take the turn of
 * one that had waited longer, and the commands went out of order.
 */
export declare class CommandThrottle {
    #private;
    static readonly TOKEN_RATE = 4;
    static readonly TOKEN_MAX = 8;
    /**
     * Wait for a token, behind every earlier waiter. Aborting `signal` rejects
     * with its reason and gives the place in line up; the abort listener is
     * removed however the wait ends.
     */
    wait(signal?: AbortSignal): Promise<void>;
    /**
     * Release nothing for `ms` milliseconds, then go on at the usual rate with no
     * burst saved up: the server refused a command as flooding and said when to
     * try again, and anything sent sooner is refused too and adds to the debt.
     */
    hold(ms: number): void;
    /**
     * Reject every waiter still in line with `reason`, so none of them is ever
     * released to send. Commands that ask afterwards wait as before.
     */
    rejectAll(reason: unknown): void;
}
//# sourceMappingURL=throttle.d.ts.map