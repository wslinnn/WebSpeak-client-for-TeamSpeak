export interface CommandResult {
    err: Error | null;
    data: Record<string, string>[];
}
/**
 * Tracks in-flight commands by return_code.
 *
 * The TS3/TS5 server sends a "welcome sequence" of unsolicited data immediately
 * after the connection handshake (channellist, channelclientlist, etc.). This
 * data arrives on the event loop AFTER we may have registered our first pending
 * RC, which would contaminate our command responses.
 *
 * Solution: gate all row buffering on a `#welcomeComplete` flag. The flag is
 * set when `notifycliententerview` for our own clid arrives — the last event
 * the TS3/TS5 server sends in its welcome sequence. Any data arriving before
 * that is silently discarded.
 */
export declare class CommandTracker {
    #private;
    register(): [rc: number, promise: Promise<CommandResult>];
    unregister(rc: number): void;
    /**
     * Called when `notifycliententerview` for our own clid arrives.
     * Marks the welcome sequence as complete and discards any accumulated data.
     */
    signalWelcomeComplete(): void;
    /**
     * Buffer a data row from the server. Rows arriving before the welcome
     * sequence is complete are silently discarded to prevent contamination.
     */
    buffer(params: Record<string, string>): void;
    resolve(rc: number, err: Error | null): void;
    discardBuffer(): void;
    reset(): void;
}
/**
 * Parse and handle an `error` command from the server.
 * Returns the error (or null on success) and the resolved return_code.
 */
export declare function parseServerError(params: Record<string, string>): {
    err: Error | null;
    rc: number | null;
};
/**
 * Append a return_code parameter to a command string if not already present.
 */
export declare function appendReturnCode(cmd: string, rc: number): string;
//# sourceMappingURL=commands.d.ts.map