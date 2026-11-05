import type { TrafficSnapshot } from "./transport/traffic.js";
import type { RoundTripEstimate } from "./types.js";
/**
 * The `setconnectioninfo` line that answers a `notifyconnectioninforequest`,
 * from what the connection has measured: the keepalive round trip (left out
 * until a pong has come back), packets and bytes sent and received per class,
 * and the bandwidth of the last second and of the last minute per class, in
 * bytes per second. Packet loss and file transfer figures are not tracked, so
 * they are not sent.
 */
export declare function buildSetConnectionInfo(traffic: TrafficSnapshot, roundTrip: RoundTripEstimate | null): string;
//# sourceMappingURL=connection-info.d.ts.map