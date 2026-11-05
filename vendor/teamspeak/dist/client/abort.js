/** The reason an aborted signal gives, as an error. */
export function abortReason(signal) {
    return signal.reason ?? new DOMException("This operation was aborted", "AbortError");
}
/** Settle with `promise`, or reject as soon as `signal` aborts, whichever is first. */
export function abortable(promise, signal) {
    if (!signal)
        return promise;
    if (signal.aborted)
        return Promise.reject(abortReason(signal));
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(abortReason(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then((value) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
        }, (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
        });
    });
}
//# sourceMappingURL=abort.js.map