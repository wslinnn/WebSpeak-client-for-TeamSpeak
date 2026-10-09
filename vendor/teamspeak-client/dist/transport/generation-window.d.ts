export declare class GenerationWindow {
    #private;
    constructor(mod: number, windowSize: number);
    get generation(): number;
    advance(amount: number): void;
    advanceToExcluded(mappedValue: number): void;
    syncTo(mappedValue: number): void;
    isInWindow(mappedValue: number): boolean;
    mappedToIndex(mappedValue: number): number;
    isOldPacket(mappedValue: number): boolean;
    isFuturePacket(mappedValue: number): boolean;
    getGeneration(mappedValue: number): number;
    reset(): void;
}
//# sourceMappingURL=generation-window.d.ts.map