import { PacketType } from "./packet.js";
/** Which class a packet type is counted in: voice is speech, ping and pong are keepalive, the rest control. */
export function trafficClassOf(pType) {
    if (pType === PacketType.Voice || pType === PacketType.VoiceWhisper)
        return "speech";
    if (pType === PacketType.Ping || pType === PacketType.Pong)
        return "keepalive";
    return "control";
}
const WINDOW_SECONDS = 60;
const classes = ["speech", "keepalive", "control"];
/** One direction of one class: totals plus a ring of one-second byte buckets. */
class Counter {
    packets = 0;
    bytes = 0;
    buckets = new Float64Array(WINDOW_SECONDS);
    /** The second (whole) the newest bucket stands for. */
    second = 0;
    advance(second) {
        if (second <= this.second)
            return;
        const gap = Math.min(second - this.second, WINDOW_SECONDS);
        for (let i = 1; i <= gap; i++)
            this.buckets[(this.second + i) % WINDOW_SECONDS] = 0;
        this.second = second;
    }
}
/**
 * Counts the datagrams a connection sends and receives, by class, and the
 * bytes of the last second and the last minute. Time is passed in
 * (milliseconds, monotonic) so a test can drive it.
 */
export class TrafficMeter {
    #sent = new Map(classes.map((c) => [c, new Counter()]));
    #received = new Map(classes.map((c) => [c, new Counter()]));
    recordSent(pType, bytes, nowMs) {
        this.#add(this.#sent.get(trafficClassOf(pType)), bytes, nowMs);
    }
    recordReceived(pType, bytes, nowMs) {
        this.#add(this.#received.get(trafficClassOf(pType)), bytes, nowMs);
    }
    #add(counter, bytes, nowMs) {
        counter.advance(Math.floor(nowMs / 1000));
        counter.packets++;
        counter.bytes += bytes;
        counter.buckets[counter.second % WINDOW_SECONDS] += bytes;
    }
    snapshot(nowMs) {
        const read = (map) => {
            const out = {};
            for (const [name, counter] of map) {
                counter.advance(Math.floor(nowMs / 1000));
                // The second in progress is incomplete, so "the last second" is the
                // one before it, and the minute is the 59 before it plus that one.
                const previous = (counter.second - 1 + WINDOW_SECONDS) % WINDOW_SECONDS;
                let minute = 0;
                for (let i = 1; i <= WINDOW_SECONDS; i++) {
                    minute += counter.buckets[(counter.second - i + WINDOW_SECONDS * 2) % WINDOW_SECONDS];
                }
                out[name] = {
                    packets: counter.packets,
                    bytes: counter.bytes,
                    bytesLastSecond: counter.buckets[previous],
                    bytesPerSecondLastMinute: minute / WINDOW_SECONDS,
                };
            }
            return out;
        };
        return { sent: read(this.#sent), received: read(this.#received) };
    }
}
/** The round-trip time of the keepalive exchange: a mean and a deviation over recent samples. */
export class RoundTripEstimator {
    #samples = [];
    add(ms) {
        this.#samples.push(ms);
        if (this.#samples.length > 10)
            this.#samples.shift();
    }
    /** The mean and the standard deviation in milliseconds, or null before the first sample. */
    get() {
        const n = this.#samples.length;
        if (n === 0)
            return null;
        const mean = this.#samples.reduce((a, b) => a + b, 0) / n;
        const variance = this.#samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
        return { meanMs: mean, deviationMs: Math.sqrt(variance) };
    }
}
//# sourceMappingURL=traffic.js.map