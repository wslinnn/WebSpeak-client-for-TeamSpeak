<template>
  <div
    ref="root"
    class="network-performance"
    data-ws-part="voice.performance"
  >
    <button
      type="button"
      class="performance-trigger"
      :title="transport !== 'disconnected' ? t('voiceStatus') + ' · ' + transportLabel : t('voiceStatus')"
      :aria-label="t('voiceStatus')"
      :aria-expanded="performancePanelOpen"
      @click.stop="togglePerformancePanel"
      ><Icon
        name="activity"
        :size="16" /><span class="performance-trigger-label">{{ t("voiceStatus") }}</span
      ><small v-if="transport !== 'disconnected'">{{ transportLabel }}</small
      ><Icon
        name="chevron-down"
        :size="13"
    /></button>
    <section
      v-if="performancePanelOpen"
      class="performance-panel"
      data-ws-part="voice.performance.panel"
      role="dialog"
      :aria-label="t('voiceStatus')"
      @click.stop
    >
      <header
        ><div
          ><strong>{{ t("voiceStatus") }}</strong
          ><small>{{ t("voiceStatusHint") }}</small></div
        ><button
          type="button"
          class="performance-refresh"
          :title="t('measureNow')"
          :disabled="performanceRunning"
          @click="refreshPerformanceProbe"
          ><Icon
            name="refresh"
            :size="15" /></button
      ></header>
      <div
        class="voice-status-summary"
        :data-health="performanceStats.health"
        data-ws-part="voice.performance.route"
        ><i></i
        ><div
          ><strong>{{ voiceHealthLabel }}</strong
          ><small
            >{{ voiceTransportLabel
            }}<template v-if="performanceStats.connectionState">
              · {{ performanceStats.connectionState }}</template
            ></small
          ></div
        ></div
      >
      <div
        class="performance-metrics voice-audio-metrics"
        data-ws-part="voice.performance.metrics"
      >
        <article
          ><small>{{ t("voiceUplink") }}</small
          ><strong>{{
            performanceStats.uplinkFramesPerSecond == null
              ? "—"
              : `${performanceStats.uplinkFramesPerSecond} ${t("audioFramesPerSecondUnit")}`
          }}</strong
          ><span
            >{{ t("audioBitrate") }}
            {{
              performanceStats.uplinkBitrateKbps == null
                ? "—"
                : `${performanceStats.uplinkBitrateKbps} kbps`
            }}</span
          ><span v-if="performanceStats.transport === 'webrtc'"
            >{{ t("voicePacketLoss") }}
            {{
              performanceStats.uplinkLossPercent == null
                ? "—"
                : `${performanceStats.uplinkLossPercent.toFixed(2)}%`
            }}
            · {{ t("voiceRtt") }}
            {{
              performanceStats.uplinkRttMs == null
                ? "—"
                : `${Math.round(performanceStats.uplinkRttMs)} ms`
            }}</span
          ><span v-else>{{ t("voiceFallbackMetricHint") }}</span></article
        >
        <article
          ><small>{{ t("voiceDownlink") }}</small
          ><strong>{{
            performanceStats.downlinkFramesPerSecond == null
              ? "—"
              : `${performanceStats.downlinkFramesPerSecond} ${t("audioFramesPerSecondUnit")}`
          }}</strong
          ><span
            >{{ t("audioBitrate") }}
            {{
              performanceStats.downlinkBitrateKbps == null
                ? "—"
                : `${performanceStats.downlinkBitrateKbps} kbps`
            }}</span
          ><span v-if="performanceStats.transport === 'webrtc'"
            >{{ t("voicePacketLoss") }}
            {{
              performanceStats.downlinkLossPercent == null
                ? "—"
                : `${performanceStats.downlinkLossPercent.toFixed(2)}%`
            }}
            · {{ t("voiceJitter") }}
            {{
              performanceStats.downlinkJitterMs == null
                ? "—"
                : `${Math.round(performanceStats.downlinkJitterMs)} ms`
            }}</span
          ><span v-else>{{ t("voiceFallbackMetricHint") }}</span></article
        >
      </div>
      <div class="voice-audio-details"
        ><span>{{ t("microphone") }} · {{ voiceMicrophoneLabel }}</span
        ><span>{{ t("voicePlayback") }} · {{ voicePlaybackLabel }}</span
        ><span
          >{{ t("voiceSendErrors") }}
          {{ performanceStats.sendErrors == null ? "—" : performanceStats.sendErrors }} ·
          {{ t("voiceDroppedFrames") }}
          {{ performanceStats.droppedFrames == null ? "—" : performanceStats.droppedFrames }}</span
        ></div
      >
      <p
        class="performance-status"
        data-ws-part="voice.performance.status"
        >{{
          performanceRunning
            ? t("voiceStatusSampling")
            : performanceStats.ready
              ? t("voiceStatusLiveHint")
              : t("voiceStatusWaiting")
        }}</p
      >
      <section
        v-if="screenShareWebRtcStats.peers.length"
        class="webrtc-stats"
        data-ws-part="voice.performance.webrtc-stats"
        aria-live="polite"
      >
        <header
          ><div
            ><strong>{{ t("webrtcStats") }}</strong
            ><small>{{ t("webrtcStatsHint") }}</small></div
          ></header
        >
        <div
          v-if="screenShareWebRtcStats.capture"
          class="webrtc-stats-capture"
          ><span>{{ t("screenShareCapture") }}</span
          ><strong
            >{{ screenShareWebRtcStats.capture.width ?? "—" }} ×
            {{ screenShareWebRtcStats.capture.height ?? "—" }}</strong
          ><small>{{
            screenShareWebRtcStats.capture.frameRate == null
              ? "—"
              : `${screenShareWebRtcStats.capture.frameRate.toFixed(1)} FPS`
          }}</small></div
        >
        <div
          v-for="peer in screenShareWebRtcStats.peers"
          :key="peer.peerId"
          class="webrtc-stats-peer"
        >
          <div class="webrtc-stats-peer-heading"
            ><strong>{{
              peer.direction === "outbound" ? t("screenShareSending") : t("screenShareReceiving")
            }}</strong
            ><small>{{ peer.connectionState }} · {{ peer.candidateType ?? "—" }}</small></div
          >
          <div class="webrtc-stats-values"
            ><span>{{ peer.frameRate == null ? "—" : `${peer.frameRate.toFixed(1)} FPS` }}</span
            ><span>{{
              peer.bitrateKbps == null ? "—" : `${Math.round(peer.bitrateKbps)} kbps`
            }}</span
            ><span
              >{{ peer.lossPercent == null ? "—" : `${peer.lossPercent.toFixed(2)}%` }}
              {{ t("packetLoss") }}</span
            ><span
              >{{ peer.framesDropped == null ? "—" : peer.framesDropped }}
              {{ t("screenShareDroppedFrames") }}</span
            ><span
              >{{ peer.jitterMs == null ? "—" : `${Math.round(peer.jitterMs)} ms` }}
              {{ t("screenShareJitter") }}</span
            ><span
              >{{ peer.roundTripTimeMs == null ? "—" : `${Math.round(peer.roundTripTimeMs)} ms` }}
              {{ t("screenShareRtt") }}</span
            ></div
          >
          <small
            v-if="peer.codec || peer.qualityLimitationReason"
            class="webrtc-stats-detail"
            >{{ peer.codec ?? "—"
            }}<template v-if="peer.qualityLimitationReason">
              · {{ peer.qualityLimitationReason }}</template
            ></small
          >
        </div>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import Icon from "../Icon.vue";
import type { useWebClientPerformance } from "../../composables/useWebClientPerformance.js";
import type { ScreenShareWebRtcStats } from "../../composables/useVoiceWebSocket.js";
const props = defineProps<{ model: ReturnType<typeof useWebClientPerformance>; transport: "webrtc" | "websocket" | "negotiating" | "disconnected"; screenShareWebRtcStats: ScreenShareWebRtcStats; t: (key: string) => string }>();
const { panelOpen: performancePanelOpen, running: performanceRunning, stats: performanceStats, togglePanel: togglePerformancePanel, refresh: refreshPerformanceProbe } = props.model;
const t = props.t;
const root = ref<HTMLElement | null>(null);

// The collapsed trigger mirrors the live transport straight from the voice
// connection — independent of the probe loop, which only runs while the
// panel is open.
const transportLabel = computed(() => t(({ webrtc: "voiceTransportWebRTC", websocket: "voiceTransportWebSocket", negotiating: "voiceTransportNegotiating", disconnected: "voiceTransportDisconnected" } as const)[props.transport]));
const voiceTransportLabel = computed(() => t(({ webrtc: "voiceTransportWebRTC", websocket: "voiceTransportWebSocket", negotiating: "voiceTransportNegotiating", disconnected: "voiceTransportDisconnected" } as const)[performanceStats.value.transport]));
const voiceHealthLabel = computed(() => t(({ disconnected: "voiceHealthDisconnected", sampling: "voiceHealthSampling", connecting: "voiceHealthConnecting", warning: "voiceHealthWarning", active: "voiceHealthActive", quiet: "voiceHealthQuiet" } as const)[performanceStats.value.health]));
const voicePlaybackLabel = computed(() => t(({ playing: "voicePlaybackReady", paused: "voicePlaybackPaused", unavailable: "voicePlaybackUnavailable" } as const)[performanceStats.value.playbackState ?? "unavailable"]));
const voiceMicrophoneLabel = computed(() => performanceStats.value.microphoneMuted
  ? t("voiceMicMuted")
  : performanceStats.value.microphoneReady
    ? t("voiceMicOpen")
    : performanceStats.value.microphonePermission === "denied" || performanceStats.value.microphonePermission === "granted"
      ? t("voiceMicUnavailable")
      : t("voiceMicWaiting"));

// Clicking anywhere outside the trigger/panel closes it (same interaction
// contract as the skin and language dropdowns).
function onDocumentPointerDown(event: PointerEvent): void {
  if (performancePanelOpen.value && root.value && !root.value.contains(event.target as Node)) {
    performancePanelOpen.value = false;
  }
}
onMounted(() => document.addEventListener("pointerdown", onDocumentPointerDown));
onUnmounted(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
</script>
