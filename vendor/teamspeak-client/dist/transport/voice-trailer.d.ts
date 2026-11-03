/** Sliding-window RTT statistics feeding the voice trailer byte. The official
 *  client tracks ping/pong round-trip deviation over the last <=20 samples
 *  (36 号 R15) and reports floor(3 * deviation) on the first five voice
 *  packets of a connection. */
export declare class RttStats {
    #private;
    add(rttMs: number): void;
    /** Population standard deviation in milliseconds, or null without samples. */
    deviationMs(): number | null;
}
/** 0x40 on a voice/whisper packet means "trailer byte present" (on commands the
 *  same bit is Compressed; the flag byte is reinterpreted per packet type). */
export declare const VOICE_TRAILER_FLAG = 64;
/**
 * First-five-packets voice trailer. The official client increments its counter
 * for every voice packet (voice and whisper share it), consumes the gate even
 * when no RTT sample exists, and omits the byte afterwards (0xFF semantics).
 */
export declare class VoiceTrailer {
    #private;
    private readonly stats;
    constructor(stats: RttStats);
    /** Returns this packet's trailer byte, or null when it must be omitted. */
    next(): number | null;
}
//# sourceMappingURL=voice-trailer.d.ts.map