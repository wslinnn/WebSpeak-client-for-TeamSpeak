import { CommandTimeoutError } from "@honeybbq/teamspeak";
export function defer() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    // Whoever awaits it sees the failure; one that settles before anyone does is not unhandled.
    promise.catch(() => { });
    return { promise, resolve, reject };
}
/**
 * `promise`, or a rejection when `timeoutMs` passes or `signal` aborts first;
 * a signal that has aborted already rejects at once. However it ends, the
 * timer and the listener on `signal` are gone.
 */
export function within(promise, command, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted === true) {
            reject(signal.reason);
            return;
        }
        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new CommandTimeoutError(command));
        }, timeoutMs);
        signal?.addEventListener("abort", onAbort, { once: true });
        promise.then((value) => {
            cleanup();
            resolve(value);
        }, (error) => {
            cleanup();
            reject(error);
        });
    });
}
//# sourceMappingURL=wait.js.map