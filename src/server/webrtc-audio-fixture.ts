import type { RtpPacket } from "werift";
import { WebRtcAudioSession, type WebRtcAudioStats } from "./webrtc-audio.js";

/** Shared harness for the downstream slot tests: the real prototype methods
 *  operate on a plain state object, so a test can drive RTP framing without a
 *  live peer, sockets or native codecs. */

export interface FixtureSlot {
  track: { stop(): void; writeRtp(packet: RtpPacket): void };
  clientId: number;
  sequenceNumber: number;
  timestamp: number;
  markerPending: boolean;
  lastUsedAt: number;
  lastVid: number | null;
  vidWhisper: boolean;
  vidRejected: number;
}

export interface FixtureStats {
  webrtcDownlinkForwardedFrames: number;
  webrtcDownlinkDroppedFrames: number;
}

/** A 20 ms SILK WB mono frame (TOC 0x48: config 9, code 0), a 40 ms sibling
 *  and a 2.5 ms CELT frame exercise the timestamp table. */
export const VOICE_20MS = Buffer.concat([Buffer.from([0x48]), Buffer.alloc(33, 0x55)]);
export const VOICE_40MS = Buffer.concat([Buffer.from([0x50]), Buffer.alloc(60, 0x66)]);
export const VOICE_CELT_2_5MS = Buffer.concat([Buffer.from([0x80]), Buffer.alloc(12, 0x77)]);

export function fixture(overrides: Partial<{ slots: FixtureSlot[] }> = {}) {
  const released: string[] = [];
  const sent: RtpPacket[] = [];
  const makeTrack = (name: string) => ({
    stop(): void { released.push(name); },
    writeRtp(packet: RtpPacket): void { sent.push(packet); },
  });
  const resources = {
    closed: false, closePromise: null,
    onVoiceFrame: () => {},
    onVoiceRoutes: (() => {}) as (slots: readonly number[]) => void,
    slots: overrides.slots ?? [
      { track: makeTrack("slot-0"), clientId: 0, sequenceNumber: 100, timestamp: 5_000, markerPending: true, lastUsedAt: 0,
        lastVid: null, vidWhisper: false, vidRejected: 0 },
      { track: makeTrack("slot-1"), clientId: 0, sequenceNumber: 200, timestamp: 9_000, markerPending: true, lastUsedAt: 0,
        lastVid: null, vidWhisper: false, vidRejected: 0 },
    ] as FixtureSlot[],
    stats: {
      webrtcIngressRtpFrames: 0, webrtcIngressRtpFirstAt: null, webrtcIngressRtpLastAt: null, webrtcIngressRtpMaxGapMs: 0,
      webrtcEgressRtpFrames: 0, webrtcEgressRtpFirstAt: null, webrtcEgressRtpLastAt: null, webrtcEgressRtpMaxGapMs: 0,
      webrtcDownlinkForwardedFrames: 0, webrtcDownlinkDroppedFrames: 0, webrtcActiveSpeakerSlots: 0,
    } as WebRtcAudioStats & FixtureStats,
    peer: { async close() { released.push("peer"); } },
  };
  // Slot and stats state is private on the real class; tests reach it through
  // `resources` while the prototype methods operate on the same object.
  const session = Object.assign(Object.create(WebRtcAudioSession.prototype), resources) as WebRtcAudioSession;
  return { session, resources, released, sent };
}
