import type { Unsubscribe } from "@honeybbq/teamspeak";
/** How many events are kept for a first listener, per event. */
export declare const MAX_KEPT = 256;
/**
 * A small event emitter whose events can wait for their first listener.
 *
 * The events named in `keep` are held while nobody listens to them, before
 * the first listener and again after the last has unsubscribed, up to 256 per
 * event, and delivered, in order, to the next listener. Past that the oldest is
 * dropped, and `onDrop` hears of it. That is what bridges the time between
 * being handed an object and attaching to it, in which the server does not
 * wait.
 */
export declare class Emitter<M extends object> {
    #private;
    constructor(keep?: ReadonlyArray<keyof M>, onDrop?: (event: keyof M) => void);
    on<K extends keyof M>(event: K, listener: (payload: M[K]) => void): Unsubscribe;
    emit<K extends keyof M>(event: K, payload: M[K]): void;
}
//# sourceMappingURL=emitter.d.ts.map