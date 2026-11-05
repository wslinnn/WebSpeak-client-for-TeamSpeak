/**
 * Record why a command of `connect()` failed, so that the default
 * `shouldRetry` can tell a refused `login` or `use` from any other failure.
 */
export declare function noteConnectFailure(command: string, error: unknown): void;
/**
 * Whether a failed connection attempt is worth another one.
 *
 * The voice client's `defaultShouldRetry` answers the same question for a
 * dropped voice session, where the failure to retry is a kick or a bad
 * password. ServerQuery has neither a session to be kicked from nor a
 * handshake to fail, so the rule is about the commands `connect()` runs: a
 * refused `login` or `use` is not retried, nor is an ssh account the server
 * will not authenticate, nor a host key that was not accepted, nor a missing
 * `ssh2`. Everything else — a refused
 * TCP connection, a dropped one, an HTTP failure, a server that stopped
 * answering — is.
 *
 * A custom `shouldRetry` replaces this; see `ReconnectOptions`.
 */
export declare function defaultShouldRetry(error: Error | undefined): boolean;
/**
 * Whether a command that failed during `connect()` is one to give up on: the
 * commands whose failure is a fact about the account or the target rather than
 * about the connection.
 *
 * `defaultShouldRetry` cannot see which command failed, and does not need to:
 * it is called with the error alone, as `ReconnectOptions` documents, and
 * covers the errors a wrong password arrives as. This covers the rest — a
 * `use` refused with a code that is not in the list above, such as 1542 for a
 * port no virtual server is on.
 */
export declare function isPermanentCommandError(command: string, error: unknown): boolean;
//# sourceMappingURL=reconnect.d.ts.map