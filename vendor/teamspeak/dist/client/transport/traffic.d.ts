import { PacketType } from "./packet.js";
import type { RoundTripEstimate } from "../types.js";
/** The three classes TeamSpeak counts traffic in. */
export type TrafficClass = "speech" | "keepalive" | "control";
/** Which class a packet type is counted in: voice is speech, ping and pong are keepalive, the rest control. */
export declare function trafficClassOf(pType: PacketType): TrafficClass;
/** What one direction of one class has carried. */
export interface TrafficFigures {
    /** Datagrams, resent ones included. */
    readonly packets: number;
    /** Bytes of those datagrams, headers included. */
    readonly bytes: number;
    /** Bytes in the last second. */
    readonly bytesLastSecond: number;
    /** Bytes per second averaged over the last minute. */
    readonly bytesPerSecondLastMinute: number;
}
/** The traffic of a connection, per direction and class. */
export interface TrafficSnapshot {
    readonly sent: Readonly<Record<TrafficClass, TrafficFigures>>;
    readonly received: Readonly<Record<TrafficClass, TrafficFigures>>;
}
/**
 * Counts the datagrams a connection sends and receives, by class, and the
 * bytes of the last second and the last minute. Time is passed in
 * (milliseconds, monotonic) so a test can drive it.
 */
export declare class TrafficMeter {
    #private;
    recordSent(pType: PacketType, bytes: number, nowMs: number): void;
    recordReceived(pType: PacketType, bytes: number, nowMs: number): void;
    snapshot(nowMs: number): TrafficSnapshot;
}
/** The round-trip time of the keepalive exchange: a mean and a deviation over recent samples. */
export declare class RoundTripEstimator {
    #private;
    add(ms: number): void;
    /** The mean and the standard deviation in milliseconds, or null before the first sample. */
    get(): RoundTripEstimate | null;
}
//# sourceMappingURL=traffic.d.ts.map