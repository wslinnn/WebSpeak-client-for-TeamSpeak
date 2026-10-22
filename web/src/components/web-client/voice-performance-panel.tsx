import { useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { Icon } from "./icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useVoiceView } from "@/hooks/useVoiceSession";
import type { VoiceSessionController } from "@/voice/session-controller";
import { computeVoiceStats, type PerformanceMonitor, type VoiceAudioStats } from "@/web-client/performance-monitor";
import { Button } from "@/components/ui/button";

const TRANSPORT_KEYS = {
  webrtc: "voiceTransportWebRTC",
  websocket: "voiceTransportWebSocket",
  negotiating: "voiceTransportNegotiating",
  disconnected: "voiceTransportDisconnected",
} as const;

const HEALTH_KEYS = {
  disconnected: "voiceHealthDisconnected",
  sampling: "voiceHealthSampling",
  connecting: "voiceHealthConnecting",
  warning: "voiceHealthWarning",
  active: "voiceHealthActive",
  quiet: "voiceHealthQuiet",
} as const;

const PLAYBACK_KEYS = {
  playing: "voicePlaybackReady",
  paused: "voicePlaybackPaused",
  unavailable: "voicePlaybackUnavailable",
} as const;

interface VoicePerformancePanelProps {
  monitor: PerformanceMonitor;
  voice: VoiceSessionController;
  t(key: string): string;
}

/** 语音状态面板（旧 VoicePerformancePanel.vue 平价）：折叠触发器镜像实时
 *  transport（不依赖探针循环），探针只在面板打开时采样。屏幕共享 WebRTC 统计
 *  区从 voice.screenShare store 读，数据随 P4-6 填充。 */
export function VoicePerformancePanel({ monitor, voice, t }: VoicePerformancePanelProps) {
  const monitorState = useStore(monitor.store);
  const voiceView = useVoiceView(useShallow((view) => ({ connected: view.connected, voiceTransport: view.voiceTransport })));
  const screenShareStats = useStore(voice.screenShare.statsStore);
  const stats = useMemo<VoiceAudioStats>(
    () => computeVoiceStats(monitorState.latest, monitorState.previous, voiceView.connected),
    [monitorState, voiceView.connected],
  );
  const open = monitorState.panelOpen;

  const transportLabel = t(TRANSPORT_KEYS[voiceView.voiceTransport]);
  const voiceTransportLabel = t(TRANSPORT_KEYS[stats.transport]);
  const voiceHealthLabel = t(HEALTH_KEYS[stats.health]);
  const voicePlaybackLabel = t(PLAYBACK_KEYS[stats.playbackState ?? "unavailable"]);
  const voiceMicrophoneLabel = stats.microphoneMuted
    ? t("voiceMicMuted")
    : stats.microphoneReady
      ? t("voiceMicOpen")
      : stats.microphonePermission === "denied" || stats.microphonePermission === "granted"
        ? t("voiceMicUnavailable")
        : t("voiceMicWaiting");

  return (
    <Popover open={open} onOpenChange={(next) => monitor.setPanelOpen(next)}>
      <div className="network-performance" data-ws-part="voice.performance">
        <PopoverTrigger asChild>
          <Button variant="ghost"
            type="button"
            className="performance-trigger"
            title={voiceView.voiceTransport !== "disconnected" ? `${t("voiceStatus")} · ${transportLabel}` : t("voiceStatus")}
            aria-label={t("voiceStatus")}
            onClick={(event) => event.stopPropagation()}
          ><Icon name="activity" size={16} /><span className="performance-trigger-label">{t("voiceStatus")}</span
      ><small>{voiceView.voiceTransport !== "disconnected" ? transportLabel : null}</small
      ><Icon name="chevron-down" size={13} /></Button>
        </PopoverTrigger>
      </div>
      <PopoverContent
          side="top"
          align="end"
          sideOffset={10}
          className="performance-panel w-auto"
          data-ws-part="voice.performance.panel"
          role="dialog"
          aria-label={t("voiceStatus")}
          onClick={(event) => event.stopPropagation()}
        >
          <header
            ><div
              ><strong>{t("voiceStatus")}</strong
              ><small>{t("voiceStatusHint")}</small></div
            ><Button variant="ghost"
              type="button"
              className="performance-refresh"
              title={t("measureNow")}
              disabled={monitorState.running}
              onClick={() => monitor.refresh()}
            ><Icon name="refresh" size={15} /></Button
          ></header>
          <div
            className="voice-status-summary"
            data-health={stats.health}
            data-ws-part="voice.performance.route"
            ><i></i
            ><div
              ><strong>{voiceHealthLabel}</strong
              ><small
                >{voiceTransportLabel
                }{stats.connectionState ? ` · ${stats.connectionState}` : null}</small
              ></div
            ></div
          >
          <div
            className="performance-metrics voice-audio-metrics"
            data-ws-part="voice.performance.metrics"
          >
            <article
              ><small>{t("voiceUplink")}</small
              ><strong
                >{stats.uplinkFramesPerSecond == null ? "—" : `${stats.uplinkFramesPerSecond} ${t("audioFramesPerSecondUnit")}`}</strong
              ><span
                >{t("audioBitrate")}{" "}
                {stats.uplinkBitrateKbps == null ? "—" : `${stats.uplinkBitrateKbps} kbps`}</span
              >{stats.transport === "webrtc" ? (
                <span
                  >{t("voicePacketLoss")}{" "}
                  {stats.uplinkLossPercent == null ? "—" : `${stats.uplinkLossPercent.toFixed(2)}%`}
                  {" · "}{t("voiceRtt")}{" "}
                  {stats.uplinkRttMs == null ? "—" : `${Math.round(stats.uplinkRttMs)} ms`}</span>
              ) : (
                <span>{t("voiceFallbackMetricHint")}</span>
              )}</article
            >
            <article
              ><small>{t("voiceDownlink")}</small
              ><strong
                >{stats.downlinkFramesPerSecond == null ? "—" : `${stats.downlinkFramesPerSecond} ${t("audioFramesPerSecondUnit")}`}</strong
              ><span
                >{t("audioBitrate")}{" "}
                {stats.downlinkBitrateKbps == null ? "—" : `${stats.downlinkBitrateKbps} kbps`}</span
              >{stats.transport === "webrtc" ? (
                <span
                  >{t("voicePacketLoss")}{" "}
                  {stats.downlinkLossPercent == null ? "—" : `${stats.downlinkLossPercent.toFixed(2)}%`}
                  {" · "}{t("voiceJitter")}{" "}
                  {stats.downlinkJitterMs == null ? "—" : `${Math.round(stats.downlinkJitterMs)} ms`}</span>
              ) : (
                <span>{t("voiceFallbackMetricHint")}</span>
              )}</article
            >
          </div>
          <div className="voice-audio-details"
            ><span>{t("microphone")} · {voiceMicrophoneLabel}</span
            ><span>{t("voicePlayback")} · {voicePlaybackLabel}</span
            ><span
              >{t("voiceSendErrors")}{" "}
              {stats.sendErrors == null ? "—" : stats.sendErrors} ·{" "}
              {t("voiceDroppedFrames")}{" "}
              {stats.droppedFrames == null ? "—" : stats.droppedFrames}</span
            ></div
          >
          <p
            className="performance-status"
            data-ws-part="voice.performance.status"
            >{monitorState.running
              ? t("voiceStatusSampling")
              : stats.ready
                ? t("voiceStatusLiveHint")
                : t("voiceStatusWaiting")}</p
          >
          {screenShareStats.peers.length > 0 && (
            <section
              className="webrtc-stats"
              data-ws-part="voice.performance.webrtc-stats"
              aria-live="polite"
            >
              <header
                ><div
                  ><strong>{t("webrtcStats")}</strong
                  ><small>{t("webrtcStatsHint")}</small></div
                ></header
              >
              {screenShareStats.capture && (
                <div className="webrtc-stats-capture"
                  ><span>{t("screenShareCapture")}</span
                  ><strong
                    >{screenShareStats.capture.width ?? "—"} ×
                    {screenShareStats.capture.height ?? "—"}</strong
                  ><small
                    >{screenShareStats.capture.frameRate == null ? "—" : `${screenShareStats.capture.frameRate.toFixed(1)} FPS`}</small></div
                >
              )}
              {screenShareStats.peers.map((peer) => (
                <div key={peer.peerId} className="webrtc-stats-peer">
                  <div className="webrtc-stats-peer-heading"
                    ><strong>{peer.direction === "outbound" ? t("screenShareSending") : t("screenShareReceiving")}</strong
                    ><small>{peer.connectionState} · {peer.candidateType ?? "—"}</small></div
                  >
                  <div className="webrtc-stats-values"
                    ><span>{peer.frameRate == null ? "—" : `${peer.frameRate.toFixed(1)} FPS`}</span
                    ><span>{peer.bitrateKbps == null ? "—" : `${Math.round(peer.bitrateKbps)} kbps`}</span
                    ><span
                      >{peer.lossPercent == null ? "—" : `${peer.lossPercent.toFixed(2)}%`} {t("packetLoss")}</span
                    ><span
                      >{peer.framesDropped == null ? "—" : peer.framesDropped} {t("screenShareDroppedFrames")}</span
                    ><span
                      >{peer.jitterMs == null ? "—" : `${Math.round(peer.jitterMs)} ms`} {t("screenShareJitter")}</span
                    ><span
                      >{peer.roundTripTimeMs == null ? "—" : `${Math.round(peer.roundTripTimeMs)} ms`} {t("screenShareRtt")}</span
                    ></div
                  >
                  {(peer.codec || peer.qualityLimitationReason) && (
                    <small className="webrtc-stats-detail"
                      >{peer.codec ?? "—"
                      }{peer.qualityLimitationReason ? ` · ${peer.qualityLimitationReason}` : null}</small
                    >
                  )}
                </div>
              ))}
            </section>
          )}
      </PopoverContent>
    </Popover>
  );
}
