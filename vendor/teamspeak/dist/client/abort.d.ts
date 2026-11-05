/** The reason an aborted signal gives, as an error. */
export declare function abortReason(signal: AbortSignal): unknown;
/** Settle with `promise`, or reject as soon as `signal` aborts, whichever is first. */
export declare function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T>;
//# sourceMappingURL=abort.d.ts.map