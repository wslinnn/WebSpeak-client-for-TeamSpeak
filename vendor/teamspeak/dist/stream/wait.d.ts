/** A promise settled from outside. */
export interface Deferred<T> {
    readonly promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
}
export declare function defer<T>(): Deferred<T>;
/**
 * `promise`, or a rejection when `timeoutMs` passes or `signal` aborts first;
 * a signal that has aborted already rejects at once. However it ends, the
 * timer and the listener on `signal` are gone.
 */
export declare function within<T>(promise: Promise<T>, command: string, timeoutMs: number, signal: AbortSignal | undefined): Promise<T>;
//# sourceMappingURL=wait.d.ts.map