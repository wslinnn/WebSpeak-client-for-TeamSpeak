export declare class GenerationWindow {
    #private;
    constructor(mod: number, windowSize: number);
    get generation(): number;
    advance(amount: number): void;
    advanceToExcluded(mappedValue: number): void;
    /**
     * Move the base to just past a packet that was just received. A stale packet,
     * including one from the generation before a wrap, does not move the base
     * backwards or treat the wait for the next generation as a full cycle.
     */
    advanceAfter(mappedValue: number): void;
    syncTo(mappedValue: number): void;
    isInWindow(mappedValue: number): boolean;
    /**
     * The offset from the window base: negative means stale, `receiveWindow` or
     * more too far ahead. An id up to `receiveWindow` behind the base across the
     * last wrap, which reads as a high number, is stale too.
     */
    mappedToIndex(mappedValue: number): number;
    /**
     * Whether the id is before the receive window: a packet whose acknowledgement
     * was lost is sent again after the window has moved past it, also when the
     * move wrapped the 16-bit id.
     */
    isOldPacket(mappedValue: number): boolean;
    isFuturePacket(mappedValue: number): boolean;
    /**
     * The generation the id belongs to: one past the current generation if the id
     * has already wrapped, one before it if the id is just behind the base across
     * the last wrap.
     */
    getGeneration(mappedValue: number): number;
    reset(): void;
}
//# sourceMappingURL=generation-window.d.ts.map