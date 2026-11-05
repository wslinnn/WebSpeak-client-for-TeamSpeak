import { buildCommandOrdered } from "../core/internal.js";
/** The classes in the order the server lists them. */
const CLASSES = ["speech", "keepalive", "control"];
/**
 * The `setconnectioninfo` line that answers a `notifyconnectioninforequest`,
 * from what the connection has measured: the keepalive round trip (left out
 * until a pong has come back), packets and bytes sent and received per class,
 * and the bandwidth of the last second and of the last minute per class, in
 * bytes per second. Packet loss and file transfer figures are not tracked, so
 * they are not sent.
 */
export function buildSetConnectionInfo(traffic, roundTrip) {
    const fields = [];
    if (roundTrip !== null) {
        fields.push(["connection_ping", roundTrip.meanMs.toFixed(4)]);
        fields.push(["connection_ping_deviation", roundTrip.deviationMs.toFixed(4)]);
    }
    const whole = (n) => String(Math.round(n));
    for (const [direction, figures] of [
        ["sent", traffic.sent],
        ["received", traffic.received],
    ]) {
        for (const c of CLASSES)
            fields.push([`connection_packets_${direction}_${c}`, whole(figures[c].packets)]);
        for (const c of CLASSES)
            fields.push([`connection_bytes_${direction}_${c}`, whole(figures[c].bytes)]);
    }
    for (const [direction, figures] of [
        ["sent", traffic.sent],
        ["received", traffic.received],
    ]) {
        for (const c of CLASSES) {
            fields.push([
                `connection_bandwidth_${direction}_last_second_${c}`,
                whole(figures[c].bytesLastSecond),
            ]);
        }
        for (const c of CLASSES) {
            fields.push([
                `connection_bandwidth_${direction}_last_minute_${c}`,
                whole(figures[c].bytesPerSecondLastMinute),
            ]);
        }
    }
    return buildCommandOrdered("setconnectioninfo", fields);
}
//# sourceMappingURL=connection-info.js.map