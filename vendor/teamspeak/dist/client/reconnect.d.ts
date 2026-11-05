/**
 * Whether a failure is worth another attempt.
 *
 * Transport failures are retried; so is a server that stopped, and a server
 * error other than the known refusals — a ban, flooding, a wrong server or
 * channel password, missing permissions — since some, such as 521 "too many
 * clones" right after a drop, clear by themselves. A kick or a ban is not:
 * someone removed the client on purpose. Nor is an AlreadyConnectedError: the
 * client was connected by other means; nor an InvalidAddressError.
 */
export declare function defaultShouldRetry(error: Error | undefined): boolean;
//# sourceMappingURL=reconnect.d.ts.map