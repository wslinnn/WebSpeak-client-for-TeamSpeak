/**
 * Token-bucket limiter for outbound TS3 commands.
 * Mirrors Go's commandThrottle.
 */
export declare class CommandThrottle {
    #private;
    static readonly TOKEN_RATE = 4;
    static readonly TOKEN_MAX = 8;
    wait(signal?: AbortSignal): Promise<void>;
}
//# sourceMappingURL=throttle.d.ts.map