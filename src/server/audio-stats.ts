import type { VoiceAudioBridgeStats } from "../shared/voice-models.js";
import type { WebRtcAudioSession, WebRtcAudioStats } from "./webrtc-audio.js";

export interface AudioFlowStats extends WebRtcAudioStats {
  ingressFrames: number;
  ingressDroppedFrames: number;
  ingressFirstAt: number | null;
  ingressLastAt: number | null;
  ingressMaxGapMs: number;
  tsSendFrames: number;
  tsSendErrors: number;
  tsSendFirstAt: number | null;
  tsSendLastAt: number | null;
  tsSendMaxGapMs: number;
  tsEncodeMaxMs: number;
  tsReceiveFrames: number;
  tsReceiveFirstAt: number | null;
  tsReceiveLastAt: number | null;
  tsReceiveMaxGapMs: number;
  egressFrames: number;
  egressDroppedFrames: number;
  egressFirstAt: number | null;
  egressLastAt: number | null;
  egressMaxGapMs: number;
  egressSentFirstAt: number | null;
  egressSentLastAt: number | null;
  egressSentMaxGapMs: number;
  egressPeakBufferedBytes: number;
  egressFramesByClient: Record<string, number>;

}

export interface AudioStatsSource {
  audio: AudioFlowStats;
  webrtc: Pick<WebRtcAudioSession, "getStats"> | null;
}

export function createAudioFlowStats(): AudioFlowStats {
  return {
    ingressFrames: 0,
    ingressDroppedFrames: 0,
    ingressFirstAt: null,
    ingressLastAt: null,
    ingressMaxGapMs: 0,
    tsSendFrames: 0,
    tsSendErrors: 0,
    tsSendFirstAt: null,
    tsSendLastAt: null,
    tsSendMaxGapMs: 0,
    tsEncodeMaxMs: 0,
    tsReceiveFrames: 0,
    tsReceiveFirstAt: null,
    tsReceiveLastAt: null,
    tsReceiveMaxGapMs: 0,
    egressFrames: 0,
    egressDroppedFrames: 0,
    egressFirstAt: null,
    egressLastAt: null,
    egressMaxGapMs: 0,
    egressSentFirstAt: null,
    egressSentLastAt: null,
    egressSentMaxGapMs: 0,
    egressPeakBufferedBytes: 0,
    egressFramesByClient: {},
    webrtcIngressRtpFrames: 0,
    webrtcIngressRtpFirstAt: null,
    webrtcIngressRtpLastAt: null,
    webrtcIngressRtpMaxGapMs: 0,
    webrtcEgressRtpFrames: 0,
    webrtcEgressRtpFirstAt: null,
    webrtcEgressRtpLastAt: null,
    webrtcEgressRtpMaxGapMs: 0,
    webrtcDownlinkForwardedFrames: 0,
    webrtcDownlinkDroppedFrames: 0,
    webrtcActiveSpeakerSlots: 0,
  };
}

export function snapshotAudioStats(entry: AudioStatsSource): AudioFlowStats {
  const stats = { ...entry.audio, egressFramesByClient: { ...entry.audio.egressFramesByClient } };
  const webRtcStats: WebRtcAudioStats | undefined = entry.webrtc?.getStats();
  if (webRtcStats) Object.assign(stats, webRtcStats);
  return stats;
}

export function snapshotAudioStatus(entry: AudioStatsSource): VoiceAudioBridgeStats {
  const stats = snapshotAudioStats(entry);
  return {
    transport: entry.webrtc ? "webrtc" : "websocket",
    ingressFrames: stats.ingressFrames,
    ingressDroppedFrames: stats.ingressDroppedFrames,
    ingressMaxGapMs: stats.ingressMaxGapMs,
    tsSendFrames: stats.tsSendFrames,
    tsSendErrors: stats.tsSendErrors,
    tsSendMaxGapMs: stats.tsSendMaxGapMs,
    tsReceiveFrames: stats.tsReceiveFrames,
    tsReceiveMaxGapMs: stats.tsReceiveMaxGapMs,
    egressFrames: stats.egressFrames,
    egressDroppedFrames: stats.egressDroppedFrames,
    egressMaxGapMs: stats.egressMaxGapMs,
    webrtcIngressRtpFrames: stats.webrtcIngressRtpFrames,
    webrtcIngressRtpMaxGapMs: stats.webrtcIngressRtpMaxGapMs,
    webrtcEgressRtpFrames: stats.webrtcEgressRtpFrames,
    webrtcEgressRtpMaxGapMs: stats.webrtcEgressRtpMaxGapMs,
    webrtcDownlinkForwardedFrames: stats.webrtcDownlinkForwardedFrames,
    webrtcDownlinkDroppedFrames: stats.webrtcDownlinkDroppedFrames,
    webrtcActiveSpeakerSlots: stats.webrtcActiveSpeakerSlots,
  };
}

