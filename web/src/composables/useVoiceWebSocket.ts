import { createRemotePlayback } from "../voice/remote-playback.js";
import { createSpeakingState } from "../voice/speaking-state.js";
import { createMicrophoneTest } from "../voice/microphone-test.js";
import { normalizeMicrophoneFailure } from "../voice/microphone-failure.js";
import { createMicrophoneCaptureFactory, type MicrophoneCapture, type MicrophoneProcessingSettings } from "../voice/microphone-capture.js";
export type { MicrophoneProcessingSettings } from "../voice/microphone-capture.js";
import { createAudioSinkRouter } from "../voice/audio-sink.js";
import { createAccompaniment, type AccompanimentErrorCode } from "../voice/accompaniment.js";
import { createWebRtcTransport } from "../voice/webrtc-transport.js";
import { createVoiceConnection } from "../voice/connection.js";
import { clearVoiceSessionIntent, readVoiceSessionIntent, writeVoiceSessionIntent } from "../voice/session-intent.js";
import { createVoiceCommands } from "../voice/commands.js";
import { createVoiceSessionState } from "../voice/session-state.js";
import { createAudioDiagnostics, type AudioPermission, type VoiceAudioStatusSample } from "../voice/audio-diagnostics.js";
export type { AudioPermission, BrowserVoiceAudioStats, VoiceAudioStatusSample } from "../voice/audio-diagnostics.js";
import type { SinkAudioElement } from "../voice/webrtc-playback.js";
import { createScreenShareController } from "../voice/screen-share.js";
import { requestMediaBeforeAudioResume } from "../services/microphone-start.js";
export type { ScreenShareOutputSettings, ScreenShareCaptureStats, ScreenSharePeerStats, ScreenShareWebRtcStats } from "../voice/screen-share.js";
import { parseServerMessage } from "../../../src/shared/server-messages.js";
import type { ChatMessage } from "../../../src/shared/voice-models.js";
import type { ClientCommandPayloads, ClientCommandType } from "../../../src/shared/client-commands.js";
export type { ScreenShareStreamDescription as ScreenShareStream, ScreenShareViewerDescription as ScreenShareViewer, ScreenSharePeerSignal as ScreenShareSignal } from "../../../src/shared/screen-share.js";
export type { ChannelMember, ChannelInfo, ChatMessage, ServerEvent, VoiceAudioBridgeStats } from "../../../src/shared/voice-models.js";
import { computed, getCurrentInstance, onUnmounted, reactive, ref, shallowRef } from "vue";
import { loadLocalPreferences, saveLocalPreferences } from "../services/local-persistence.js";
import { closeErrorCode, closeReason, connectionFailureMessage, joinTicketReason, normalizedClientErrorCode, safeClientErrorCode, safeClientErrorDetail } from "../voice/error-messages.js";

export interface VoiceState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectFailed: boolean;
  tsClientId: number;
  error: string;
  errorCode: string;
  /** Epoch ms until which the gateway told us to wait before retrying the password. */
  retryNotUntil: number;
  /**
   * Non-fatal audio diagnostics. Unlike error/errorCode these never take over
   * the connect form: they explain a degraded microphone or playback path while
   * the voice room itself stays joined and usable.
   */
  microphoneError: string;
  microphoneErrorCode: string;
  audioNotice: string;
  audioNoticeCode: string;
  channelSwitchedChannelId: string;
  /** Set when the TS server moves our own client; the UI syncs its channel
   *  selection from it. Not cleared on read: identical consecutive values are
   *  already reflected in the selection, so a suppressed duplicate is fine. */
  selfMovedChannelId: string;
  /** Mirror of errorCode fed only by connection-origin paths (ticket refusal,
   *  close frames, reconnect failure). Generic per-command error frames must
   *  not land here: the server-switch banner treats this field as "the join
   *  failed", and an unrelated audio/chat error would falsely fail it. */
  connectionFailureCode: string;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

class CancelledMediaOperation extends Error {
  constructor() { super("媒体操作已取消"); this.name = "AbortError"; }
}

export function useVoiceWebSocket() {
  const ws = shallowRef<WebSocket | null>(null);
  const state = reactive<VoiceState>({ connected: false, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false, tsClientId: 0, error: "", errorCode: "", retryNotUntil: 0, microphoneError: "", microphoneErrorCode: "", audioNotice: "", audioNoticeCode: "", channelSwitchedChannelId: "", selfMovedChannelId: "", connectionFailureCode: "" });
  const sessionState = createVoiceSessionState({
    selfId: () => state.tsClientId,
    onMemberRemoved(id) {
      clearSpeaking(id);
      remotePlayback.clear(id);
      delete volumes[id];
      whisperTargetIds.delete(id);
      if (!whisperTargetIds.size) whisperActive.value = false;
    },
    onMembersChanged: syncKnownMemberVolumes,
    onSelfMoved(channelId) {
      state.selfMovedChannelId = channelId;
    },
  });
  const { members, channels, chatMessages, serverEvents, pokeNotifications } = sessionState;
  let chatGeneration = 0;
  const voiceConnection = createVoiceConnection({
    onSocket: socket => { ws.value = socket; },
    onMessage: handleMessage,
    onAudio: handleAudioFrame,
    onClose(event) {
      releaseSessionResources();
      state.connected = false;
      state.connecting = false;
      state.reconnecting = false;
      state.tsClientId = 0;
      if (!state.reconnectFailed) sessionState.reset();
      if (event.code !== 1000 && !state.reconnectFailed && !state.errorCode) {
        state.errorCode = closeErrorCode(event.code, event.reason);
        state.connectionFailureCode = state.errorCode;
        state.error = closeReason(event.code, event.reason);
      }
      clearMicrophoneError();
      clearAudioNotice();
      const retryableDrop = BROWSER_RECONNECTABLE_CLOSE_CODES.has(event.code);
      if (!retryableDrop) {
        // Terminal gateway codes (bad ticket, bad target, identity conflicts)
        // would repeat after a resume: drop the ticket and stop any loop.
        browserReconnectActive = false;
        if (BROWSER_TERMINAL_CLOSE_CODES.has(event.code)) dropReconnectTicket();
        return;
      }
      if (!reconnectTicket || state.connected || state.reconnectFailed) return;
      // A retryable transport drop with a live ticket reconnects in place —
      // the reconnect banner replaces the kick back to the join form.
      browserReconnectActive = true;
      scheduleBrowserReconnect();
    },
    onFailure({ code, detail, cause, retryAfterMs }) {
      state.connecting = false;
      state.errorCode = normalizedClientErrorCode(code, "REQUEST_FAILED");
      state.connectionFailureCode = state.errorCode;
      state.error = cause instanceof Error ? cause.message : joinTicketReason(state.errorCode, detail);
      if (state.errorCode === "PASSWORD_RETRY_LATER") {
        state.retryNotUntil = Date.now() + (typeof retryAfterMs === "number" && retryAfterMs > 0 ? retryAfterMs : 60_000);
      }
      if (!browserReconnectActive) return;
      if (state.errorCode === "RECONNECT_INVALID") {
        // The gateway no longer knows this session (TTL passed, server
        // restarted): give up quietly unless the room is on screen.
        abandonBrowserReconnect();
        return;
      }
      // Transient exchange failures (offline, rate limit, timeout) get the
      // next slot in the reconnect budget.
      scheduleBrowserReconnect();
    },
  });
  const commands = createVoiceCommands({ socket: () => ws.value, generation: () => voiceConnection.generation });
  // A pending browser-reconnect timer must not fire into a disposed page.
  // The composable is also exercised outside a component (tests bind no
  // instance); a bare lifecycle registration would only produce a warning.
  if (getCurrentInstance()) onUnmounted(() => cancelBrowserReconnect());
  let lastConnection: { target: string; channel: string; nickname: string; serverPassword: string; identity?: string; rememberIdentity: boolean } | null = null;
  // Browser-level reconnect: when the gateway WebSocket itself drops (network
  // loss, proxy timeout, server restart) the reconnect ticket restores the
  // whole session. Delays mirror the gateway's
  // own TeamSpeak-reconnect pacing; after the budget the user retries manually.
  const BROWSER_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
  const BROWSER_RECONNECTABLE_CLOSE_CODES = new Set([1006, 1011, 4004]);
  const BROWSER_TERMINAL_CLOSE_CODES = new Set([4001, 4002, 4003, 4005]);
  // reconnectFailed codes that cannot succeed unchanged: automatic resume must
  // stop offering the session after these and leave the next move to the user.
  const TERMINAL_RECONNECT_FAILURE_CODES = new Set([
    "BANNED", "KICKED", "INVALID_TARGET", "INVALID_NICKNAME", "NICKNAME_IN_USE",
    "INVALID_SERVER_PASSWORD", "SERVER_PASSWORD_REQUIRED", "IDENTITY_REJECTED",
    "IDENTITY_IN_USE", "IDENTITY_SECURITY_LEVEL_TOO_LOW", "IDENTITY_LIMIT_REACHED",
    "CLIENT_VERSION_OUTDATED",
  ]);
  let reconnectTicket = "";
  let browserReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let browserReconnectActive = false;
  let connectedThisLoad = false;
  const identityMaterial = ref("");
  const storedVolumesByUid = reactive<Record<string, number>>({});
  let microphoneStartPromise: Promise<void> | null = null;
  let microphoneGeneration = 0;

  // WebRTC carries audio when the gateway advertises it. The bounded PCM
  // WebSocket path remains the compatibility fallback for older browsers and
  // for deployments where the gateway's built-in UDP media range is unavailable.
  let audioCtx: SinkAudioContext | null = null;
  let micStream: MediaStream | null = null;
  const microphoneCaptureFactory = createMicrophoneCaptureFactory();
  let microphoneCapture: MicrophoneCapture | null = null;
  let pendingMicrophoneCapture: AbortController | null = null;
  const accompanimentActive = ref(false);
  const accompanimentSupported = ref(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia));
  const accompanimentErrorCode = ref<AccompanimentErrorCode>("");
  const accompaniment = createAccompaniment({
    isSupported: () => accompanimentSupported.value,
    // One stable target identity: the accompaniment module compares
    // getTarget() === target to tell its own capture apart from superseded
    // ones, so a fresh object per call would cancel every capture.
    getTarget: () => {
      const capture = microphoneCapture;
      if (!webrtc.active || !webrtc.peer || !micStream || !capture) return null;
      return accompanimentTarget;
    },
    onActive(active) {
      const changed = accompanimentActive.value !== active;
      accompanimentActive.value = active;
      if (changed && webrtc.active) sendCmd("setAccompanimentActive", { active });
    },
    onError: code => { accompanimentErrorCode.value = code; },
  });
  const screenShare = createScreenShareController({
    isOpen: () => ws.value?.readyState === WebSocket.OPEN,
    send: message => ws.value?.send(JSON.stringify(message)),
  });
  const inputDevices = reactive<AudioInputDevice[]>([]);
  const outputDevices = reactive<AudioOutputDevice[]>([]);
  const selectedInputDeviceId = ref(typeof localStorage !== "undefined" ? localStorage.getItem("webspeak:input-device") ?? "" : "");
  const selectedOutputDeviceId = ref(typeof localStorage !== "undefined" ? localStorage.getItem("webspeak:output-device") ?? "" : "");
  let committedInputDeviceId = selectedInputDeviceId.value;
  let committedOutputDeviceId = selectedOutputDeviceId.value;
  let inputDeviceTouched = false;
  let outputDeviceTouched = false;
  let inputDeviceGeneration = 0;
  let outputDeviceGeneration = 0;
  let deviceListGeneration = 0;
  const audioSinkRouter = createAudioSinkRouter();
  const outputDeviceSupported = ref(false);
  const audioPermission = ref<AudioPermission>("unknown");
  const microphoneProcessing = reactive<MicrophoneProcessingSettings>({
    echoCancellation: null,
    noiseSuppression: null,
    autoGainControl: null,
    rnnoise: null,
  });
  const audioContextState = ref<AudioContextState | "unknown">("unknown");
  const micLevel = ref(0);
  const microphoneTestActive = ref(false);
  const testAudioUrl = ref("");
  const microphoneTest = createMicrophoneTest({
    prepare: async () => { await prepareInputDevices(); return micStream; },
    onActive: active => { microphoneTestActive.value = active; applyUplinkGate(); applyUplinkRouting(); },
    onUrl: url => { testAudioUrl.value = url; },
    onStopped: () => { if (!state.connected) stopMicrophone(); },
    onError: error => { setMicrophoneError(error); },
  });
  const microphoneMuted = ref(false);
  const noiseSuppressionEnabled = ref(true);
  let noiseSuppressionTouched = false;
  let committedNoiseSuppressionEnabled = noiseSuppressionEnabled.value;
  // Latency-adding browser processing defaults off (2026-10-14 拍板): the
  // echo canceller alone costs tens of milliseconds; headset users rarely
  // need it. Both flip through the same track-constraint reconfiguration as
  // noise suppression.
  const echoCancellationEnabled = ref(false);
  let echoCancellationTouched = false;
  let committedEchoCancellationEnabled = echoCancellationEnabled.value;
  const autoGainControlEnabled = ref(false);
  let autoGainControlTouched = false;
  let committedAutoGainControlEnabled = autoGainControlEnabled.value;
  const inputVolume = ref(1);
  const outputVolume = ref(1);
  const outputMuted = ref(false);
  const notificationVolume = ref(0.5);
  const voxThreshold = ref(0.008);
  let voxAttack = 0;
  let voxRelease = 0;
  const VOX_HOLD = 15;
  const VOX_ATTACK_FRAMES = 1;
  let convBuf = new Int16Array(1024);
  let accumBuf = new Int16Array(2048);
  let accumLen = 0;

  const volumes = reactive<Record<number, number>>({});
  const { speakingIds, markSpeaking, clearSpeaking, clearSpeakingState } = createSpeakingState();
  const whisperTargetIds = reactive(new Set<number>());
  const whisperActive = ref(false);
  const AUDIO_FRAME_SAMPLES = 960;
  const AUDIO_FRAME_BYTES = AUDIO_FRAME_SAMPLES * 2;
  const MAX_AUDIO_BUFFERED_FRAMES = 10;
  const MAX_AUDIO_BUFFERED_BYTES = AUDIO_FRAME_BYTES * MAX_AUDIO_BUFFERED_FRAMES;
  const remotePlayback = createRemotePlayback({
    getContext: getAudioCtx,
    getVolume: clientId => (volumes[clientId] ?? 1) * effectiveOutputVolume(),
    onDecodeError: () => audioDiagnostics.count("decodeErrors"),
    onDrop: () => audioDiagnostics.count("framesDropped"),
  });
  let webRtcStunServer = "";
  // Mirror of the WebRTC transport's live state, pushed via onTransportChange.
  // The transport object itself exposes plain getters, which a computed cannot
  // track — without this snapshot the header transport badge would freeze on
  // whatever the state was when it first rendered.
  const webrtcTransportSnapshot = ref({ active: false, hasPeer: false });
  // Slot index → TeamSpeak client id (0 = free slot), pushed by the gateway
  // whenever a downstream slot assignment changes. The multi-track playback
  // binds its per-slot streams through this table.
  const webRtcVoiceRoutes = ref<number[]>([]);
  // One stable accompaniment target for the whole voice instance: the
  // accompaniment module compares getTarget() === target to tell its own
  // capture apart from superseded ones, so a fresh object per call would
  // cancel every capture. Null-checks stay in getTarget.
  const accompanimentTarget = {
    setAccompaniment: (stream: MediaStream | null) => {
      microphoneCapture?.setAccompaniment(stream);
      applyUplinkRouting(stream !== null);
    },
  };

  const webrtc = createWebRtcTransport({
    stunServer: () => webRtcStunServer,
    onTransportChange(snapshot) {
      webrtcTransportSnapshot.value = snapshot;
    },
    prepareMicrophone: async () => {
      await ensureMicrophone();
      const capture = microphoneCapture;
      return micStream && capture ? { context: getAudioCtx(), stream: micStream,
        processedStream: capture.processedStream, capture } : null;
    },
    stopPcm: stopCaptureGraph,
    muted: () => microphoneMuted.value,
    uplinkBypass: () => !noiseSuppressionEnabled.value && inputVolume.value === 1
      && !accompanimentActive.value && !microphoneTestActive.value,
    accompanimentActive: () => accompanimentActive.value,
    releaseAccompaniment: () => accompaniment.stop(),
    onLevel(rms, track) {
      micLevel.value = rms === null ? 0 : Math.min(1, rms * 6);
      if (rms !== null && !microphoneMuted.value && track.enabled && rms >= voxThreshold.value) markSpeaking(state.tsClientId);
      else if (state.tsClientId) clearSpeaking(state.tsClientId);
    },
    onReady() {
      // A renegotiated peer starts with unbound slots; replay the last known
      // slot assignment so its streams are immediately correctly bound.
      webrtc.setSlotClients(webRtcVoiceRoutes.value);
    },
    async onFallback(reason, isCurrent) {
      if (!isCurrent()) return;
      webRtcVoiceRoutes.value = [];
      setAudioNotice("WEBRTC_FALLBACK", `实时语音（WebRTC）不可用（错误代码：${safeClientErrorCode(reason) || "WEBRTC_UNAVAILABLE"}），已切换为兼容传输：延迟与音质可能下降`);
      try { await startMicrophone(); }
      catch (error) { if (isCurrent()) setMicrophoneError(error); }
    },
    playback: {
      volume: effectiveOutputVolume,
      speakerVolume: clientId => volumes[clientId] ?? 1,
      onEndpoint(output) {
        clearAudioNotice("OUTPUT_DEVICE_PENDING_WEBRTC");
        // The slot pool routes its own elements (and any amplification
        // context) via setSinkDevice: elements are created per slot, so a
        // single-endpoint router cannot track them. Failures here surface
        // through the explicit setOutputDevice flow instead.
        webrtc.setSinkDevice(selectedOutputDeviceId.value).catch(() => undefined);
        void output;
      },
      onBlocked(blocked) {
        if (blocked) setAudioNotice("PLAYBACK_BLOCKED", "浏览器阻止了音频自动播放，暂时听不到其他成员的声音：请点击页面任意位置，或在地址栏允许本站播放声音");
        else clearAudioNotice("PLAYBACK_BLOCKED");
      },
      onPlaying: syncAudioContextNotice,
      onSlotActivity(clientId, active) {
        // Downstream speaking detection is local now: the gateway forwards
        // payloads untouched and has no decoded signal to analyze.
        if (clientId <= 0) return;
        if (active) markSpeaking(clientId);
        else clearSpeaking(clientId);
      },
    },
  });
  const audioDiagnostics = createAudioDiagnostics({
    source() {
      const socket = ws.value;
      if (!socket || socket.readyState !== WebSocket.OPEN || !state.connected) return null;
      const peer = webrtc.peer;
      return { socket, connection: voiceConnection.generation, transportGeneration: webrtc.generation, peer,
        transport: webrtc.active ? "webrtc" : peer ? "negotiating" : "websocket" };
    },
    presentation({ peer }) {
      return {
        microphoneMuted: microphoneMuted.value,
        microphoneReady: Boolean(micStream?.getAudioTracks().some(track => track.readyState === "live")),
        microphonePermission: audioPermission.value,
        playbackState: peer
          ? webrtc.output ? webrtc.output.paused ? "paused" : "playing" : "unavailable"
          : audioCtx ? audioCtx.state === "running" ? "playing" : "paused" : null,
      };
    },
    send: (source, sequence) => source.socket.send(JSON.stringify({ type: "audioStatsProbe", payload: { sequence } })),
  });

  async function saveAudioPreferences(): Promise<void> {
    await saveLocalPreferences({
      schemaVersion: 1,
      preferredInputDeviceId: committedInputDeviceId,
      inputDeviceId: committedInputDeviceId,
      microphoneMuted: microphoneMuted.value,
      noiseSuppressionEnabled: committedNoiseSuppressionEnabled,
      echoCancellationEnabled: committedEchoCancellationEnabled,
      autoGainControlEnabled: committedAutoGainControlEnabled,
      voxThreshold: voxThreshold.value,
      inputGain: inputVolume.value,
      outputVolume: outputVolume.value,
      notificationVolume: notificationVolume.value,
      preferredOutputDeviceId: committedOutputDeviceId,
      volumesByUid: { ...storedVolumesByUid },
    });
  }

  function syncKnownMemberVolumes(): void {
    for (const member of members) {
      if (!member.uid) continue;
      const saved = storedVolumesByUid[member.uid];
      if (saved !== undefined) volumes[member.id] = Math.max(0, Math.min(4, saved));
    }
  }

  const audioPreferencesReady = loadLocalPreferences().then((preferences) => {
    if (!inputDeviceTouched) {
      if (!selectedInputDeviceId.value) selectedInputDeviceId.value = preferences.preferredInputDeviceId ?? preferences.inputDeviceId ?? "";
      committedInputDeviceId = selectedInputDeviceId.value;
    }
    if (typeof preferences.microphoneMuted === "boolean") microphoneMuted.value = preferences.microphoneMuted;
    if (!noiseSuppressionTouched && typeof preferences.noiseSuppressionEnabled === "boolean") {
      noiseSuppressionEnabled.value = preferences.noiseSuppressionEnabled;
      committedNoiseSuppressionEnabled = preferences.noiseSuppressionEnabled;
    }
    if (!echoCancellationTouched && typeof preferences.echoCancellationEnabled === "boolean") {
      echoCancellationEnabled.value = preferences.echoCancellationEnabled;
      committedEchoCancellationEnabled = preferences.echoCancellationEnabled;
    }
    if (!autoGainControlTouched && typeof preferences.autoGainControlEnabled === "boolean") {
      autoGainControlEnabled.value = preferences.autoGainControlEnabled;
      committedAutoGainControlEnabled = preferences.autoGainControlEnabled;
    }
    if (typeof preferences.voxThreshold === "number") voxThreshold.value = clamp(preferences.voxThreshold, 0.001, 0.08);
    if (typeof preferences.inputGain === "number") inputVolume.value = Math.max(0, Math.min(1, preferences.inputGain));
    if (typeof preferences.outputVolume === "number") outputVolume.value = Math.max(0, Math.min(1, preferences.outputVolume));
    if (!outputDeviceTouched) {
      if (!selectedOutputDeviceId.value) selectedOutputDeviceId.value = preferences.preferredOutputDeviceId ?? "";
      committedOutputDeviceId = selectedOutputDeviceId.value;
    }
    if (typeof preferences.notificationVolume === "number") notificationVolume.value = clamp(preferences.notificationVolume, 0, 1);
    Object.assign(storedVolumesByUid, preferences.volumesByUid ?? {});
    syncKnownMemberVolumes();
  });

  function effectiveOutputVolume(): number {
    return outputMuted.value ? 0 : outputVolume.value;
  }

  function applyOutputVolume(): void {
    const level = effectiveOutputVolume();
    remotePlayback.updateVolumes();
    webrtc.setOutputVolume(level);
  }

  function getAudioCtx(): SinkAudioContext {
    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: 48000 }) as SinkAudioContext;
      audioContextState.value = audioCtx.state;
      // A suspended context silently starves the uplink graph and playback;
      // keep the shared context alive across lifecycle events (same failure
      // class Newt-Desktop documents for its destination-node uplink).
      const resumeAudioCtx = (): void => {
        if (audioCtx && audioCtx.state === "suspended") void audioCtx.resume().catch(() => undefined);
      };
      audioCtx.addEventListener("statechange", () => {
        if (audioCtx) audioContextState.value = audioCtx.state;
        resumeAudioCtx();
      });
      document.addEventListener("visibilitychange", resumeAudioCtx);
      outputDeviceSupported.value = typeof audioCtx.setSinkId === "function"
        || typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
      if (selectedOutputDeviceId.value && outputDeviceSupported.value) {
        void setAudioSink(audioCtx, selectedOutputDeviceId.value).catch(() => undefined);
      }
    }
    return audioCtx;
  }

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  /**
   * Microphone failures are a degraded state, not a connection failure: the room
   * stays joined, so they get their own slot instead of taking over `error`.
   */
  function setMicrophoneError(error: unknown): string {
    if (error instanceof CancelledMediaOperation) return "";
    const failure = normalizeMicrophoneFailure(error);
    state.microphoneErrorCode = failure.code;
    state.microphoneError = failure.message;
    return failure.message;
  }

  function clearMicrophoneError(): void {
    state.microphoneError = "";
    state.microphoneErrorCode = "";
  }

  /** Non-fatal audio notice (WebRTC fallback, blocked autoplay, device list failure...). */
  function setAudioNotice(code: string, message: string): void {
    state.audioNoticeCode = safeClientErrorCode(code) || "AUDIO_NOTICE";
    state.audioNotice = message;
  }

  function clearAudioNotice(code?: string): void {
    if (code && state.audioNoticeCode !== safeClientErrorCode(code)) return;
    state.audioNotice = "";
    state.audioNoticeCode = "";
  }

  /** A suspended AudioContext silently swallows capture: say so instead of pretending. */
  function syncAudioContextNotice(): void {
    if (audioCtx && audioCtx.state === "suspended") {
      setAudioNotice("AUDIO_CONTEXT_SUSPENDED", "浏览器的音频处理被暂停（需要一次页面交互），麦克风与扬声器可能无声：请点击页面任意位置后重试");
    } else {
      clearAudioNotice("AUDIO_CONTEXT_SUSPENDED");
    }
  }

  function audioNoticeMessage(code: string, detail?: unknown): string {
    const detailText = safeClientErrorDetail(detail);
    if (code === "AUDIO_ENCODER_UNAVAILABLE") {
      return `麦克风声音未能发送：语音网关的音频编码器不可用（错误代码：${code}）${detailText ? `：${detailText}` : ""}，请联系管理员`;
    }
    return `音频链路异常（错误代码：${code}）${detailText ? `：${detailText}` : ""}，麦克风声音可能没有发送给其他成员`;
  }

  async function setAudioSink(ctx: SinkAudioContext, deviceId: string): Promise<void> {
    const generation = outputDeviceGeneration;
    const isCurrent = () => generation === outputDeviceGeneration && audioCtx === ctx
      && selectedOutputDeviceId.value === deviceId;
    const mediaSinkSupported = typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
    if (!ctx.setSinkId && !mediaSinkSupported) {
      outputDeviceSupported.value = false;
      if (deviceId) throw new Error("当前浏览器不支持扬声器设备选择，将使用默认输出设备");
      return;
    }
    outputDeviceSupported.value = true;
    let routed = false;
    if (ctx.setSinkId) {
      await audioSinkRouter.set(ctx, deviceId, isCurrent);
      routed = true;
    }
    // The WebRTC slot pool routes its own elements and amplification context;
    // a failure must propagate so the committed choice rolls back.
    if (state.connected && webrtc.active) {
      await webrtc.setSinkDevice(deviceId);
      routed = true;
    }
    if (!routed) {
      // element-only sink browsers (e.g. Firefox) before the WebRTC endpoint
      // exists: the choice is stored but nothing can follow it yet — say so
      // instead of reporting a success the ears cannot confirm.
      setAudioNotice("OUTPUT_DEVICE_PENDING_WEBRTC", "输出设备将在语音通道建立后生效，当前连接尚未建立音频输出");
      return;
    }
    clearAudioNotice("OUTPUT_DEVICE_PENDING_WEBRTC");
  }

  /**
   * Fatal environment problems: the page can never provide a microphone, so
   * the join button stays disabled and the answer doubles as fix guidance.
   * Missing AudioDecoder is deliberately NOT fatal — WebRTC voice works
   * without it — see checkBrowserWarning.
   */
  function checkSupport(): string | null {
    if (typeof window === "undefined") return null;
    if (!window.isSecureContext) return "语音功能需要 HTTPS 安全连接：浏览器仅在 https:// 或 localhost 页面开放麦克风，请改用安全地址访问";
    if (!navigator.mediaDevices?.getUserMedia) return "当前浏览器不支持麦克风访问，请更换最新版 Chrome 或 Edge";
    if (typeof AudioContext === "undefined") return "当前浏览器不支持 Web Audio 音频处理，请更换最新版 Chrome 或 Edge";
    return null;
  }

  /** Degraded but usable: only the compatibility transport needs a decoder. */
  function checkBrowserWarning(): string | null {
    if (typeof window === "undefined") return null;
    if (typeof AudioDecoder === "undefined") return "当前浏览器不支持音频解码，兼容传输模式下可能听不到声音，请使用最新版 Chrome 或 Edge";
    return null;
  }

  function microphoneConstraints(): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
      echoCancellation: echoCancellationEnabled.value,
      noiseSuppression: noiseSuppressionEnabled.value,
      // Off by default on purpose: browser AGC pumps volume as background
      // noise changes, and the manual input gain is the loudness control.
      autoGainControl: autoGainControlEnabled.value,
    };
    if (selectedInputDeviceId.value) constraints.deviceId = { exact: selectedInputDeviceId.value };
    return constraints;
  }

  async function refreshAudioDevices(): Promise<void> {
    const generation = ++deviceListGeneration;
    const sequence = voiceConnection.generation;
    const isCurrent = () => generation === deviceListGeneration && sequence === voiceConnection.generation;
    if (!navigator.mediaDevices?.enumerateDevices) {
      inputDevices.length = 0;
      outputDevices.length = 0;
      setAudioNotice("DEVICE_LIST_UNAVAILABLE", "无法读取音频设备列表，将使用浏览器默认音频设备：请在系统或浏览器隐私设置中允许读取设备信息");
      return;
    }
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
      if (!isCurrent()) return;
      clearAudioNotice("DEVICE_LIST_UNAVAILABLE");
    } catch {
      if (!isCurrent()) return;
      // enumerateDevices rejects when the device list is blocked (for example in a
      // locked-down iframe). Use the browser defaults and explain the limitation.
      inputDevices.length = 0;
      outputDevices.length = 0;
      setAudioNotice("DEVICE_LIST_UNAVAILABLE", "无法读取音频设备列表，将使用浏览器默认音频设备：请在系统或浏览器隐私设置中允许读取设备信息");
      return;
    }
    const microphones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    const speakers = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    inputDevices.splice(0, inputDevices.length, ...microphones);
    outputDevices.splice(0, outputDevices.length, ...speakers);
    const missingInput = selectedInputDeviceId.value && !microphones.some(device => device.deviceId === selectedInputDeviceId.value);
    const missingOutput = selectedOutputDeviceId.value && !speakers.some(device => device.deviceId === selectedOutputDeviceId.value);
    // Use the normal configuration transactions: a replacement input must also
    // restart WebRTC, and rejected fallbacks must not be saved as successful.
    const fallbackOperations: Promise<void>[] = [];
    if (missingInput) fallbackOperations.push(setInputDevice(""));
    if (missingOutput) fallbackOperations.push(setOutputDevice(""));
    await Promise.allSettled(fallbackOperations);
  }

  /**
   * Passive permission state for the settings dialog: a site-level "denied"
   * makes getUserMedia fail permanently without ever re-prompting, so the
   * dialog should show it before any capture attempt. Firefox rejects the
   * microphone permission name outright, which stays a silent no-op here.
   */
  async function watchMicrophonePermission(): Promise<void> {
    if (!navigator.permissions?.query) return;
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      const apply = (): void => {
        if (status.state === "granted" || status.state === "denied") audioPermission.value = status.state;
      };
      apply();
      status.addEventListener("change", apply);
    } catch { /* permission name unsupported in this browser */ }
  }

  function handleCaptureChunk(input: Float32Array, rms?: number): void {
    if (!input.length) return;
    micLevel.value = Math.min(1, (rms ?? Math.sqrt(input.reduce((sum, sample) => sum + sample * sample, 0) / input.length)) * 6);
    const socket = ws.value;
    const shouldSend = !microphoneMuted.value
      && !microphoneTestActive.value
      && !webrtc.active
      && socket?.readyState === WebSocket.OPEN
      && voxGate(input);
    if (!shouldSend) {
      accumLen = 0;
      if (microphoneMuted.value) {
        voxAttack = 0;
        voxRelease = 0;
      }
      return;
    }
    if (!socket) {
      accumLen = 0;
      return;
    }
    const bufferedBytes = socket.bufferedAmount;
    if (bufferedBytes > MAX_AUDIO_BUFFERED_BYTES) {
      accumLen = 0;
      return;
    }

    if (convBuf.length < input.length) convBuf = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const sample = Math.max(-1, Math.min(1, input[i]!));
      convBuf[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    const need = accumLen + input.length;
    if (accumBuf.length < need) accumBuf = new Int16Array(Math.max(need, accumBuf.length * 2));
    accumBuf.set(convBuf.subarray(0, input.length), accumLen);
    accumLen = need;

    let offset = 0;
    while (offset + AUDIO_FRAME_SAMPLES <= accumLen && socket.readyState === WebSocket.OPEN && socket.bufferedAmount <= MAX_AUDIO_BUFFERED_BYTES) {
      socket.send(accumBuf.slice(offset, offset + AUDIO_FRAME_SAMPLES).buffer);
      offset += AUDIO_FRAME_SAMPLES;
    }
    if (offset > 0) markSpeaking(state.tsClientId);
    accumLen -= offset;
    if (offset > 0) accumBuf.set(accumBuf.subarray(offset, offset + accumLen), 0);
  }

  async function startMicrophone(): Promise<void> {
    const generation = ++microphoneGeneration;
    pendingMicrophoneCapture?.abort();
    const controller = new AbortController();
    pendingMicrophoneCapture = controller;
    const ctx = getAudioCtx();
    const assertCurrent = (): void => {
      if (generation !== microphoneGeneration || audioCtx !== ctx || controller.signal.aborted) throw new CancelledMediaOperation();
    };
    let nextStream: MediaStream | null = null;
    let nextCapture: MicrophoneCapture | null = null;
    let factoryOwnsStream = false;
    const resumeSuspendedContext = (): Promise<void> => ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
    try {
      try {
        nextStream = await requestMediaBeforeAudioResume(
          () => navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() }),
          resumeSuspendedContext,
        );
      } catch (error) {
        // A persisted deviceId outlives its device (unplugged headset, rotated
        // Safari ids). Fall back to the default input once before failing: the
        // dead id must not wedge the microphone for the whole page session.
        const staleDeviceId = error instanceof DOMException
          && (error.name === "OverconstrainedError" || error.name === "NotFoundError");
        if (!staleDeviceId || !selectedInputDeviceId.value || controller.signal.aborted) throw error;
        selectedInputDeviceId.value = "";
        try { localStorage.setItem("webspeak:input-device", ""); } catch { /* storage optional */ }
        nextStream = await requestMediaBeforeAudioResume(
          () => navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() }),
          resumeSuspendedContext,
        );
      }
      assertCurrent();
      audioPermission.value = "granted";
      factoryOwnsStream = true;
      nextCapture = await microphoneCaptureFactory.prepare({
        context: ctx, stream: nextStream, signal: controller.signal, assertCurrent,
        noiseSuppression: noiseSuppressionEnabled.value, volume: inputVolume.value, onSamples: handleCaptureChunk,
      });
      assertCurrent();
      // Commit only a complete graph. Permission and node failures leave the
      // previous stream, PCM route and WebRTC peer untouched.
      stopMicrophone(false);
      micStream = nextStream;
      microphoneCapture = nextCapture;
      Object.assign(microphoneProcessing, nextCapture.processing);
      applyUplinkGate();
      nextCapture.activate();
      // The fallback for a later failed change is this actual live graph, even
      // if device enumeration or WebRTC negotiation is still in progress.
      committedInputDeviceId = selectedInputDeviceId.value;
      committedNoiseSuppressionEnabled = noiseSuppressionEnabled.value;
      watchMicrophoneTrack(nextStream);
      clearMicrophoneError();
    } catch (error) {
      nextCapture?.dispose();
      if (!factoryOwnsStream) nextStream?.getTracks().forEach(track => track.stop());
      if (generation === microphoneGeneration && !(error instanceof CancelledMediaOperation)) {
        if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) audioPermission.value = "denied";
        setMicrophoneError(error);
      }
      throw error;
    } finally {
      if (pendingMicrophoneCapture === controller) pendingMicrophoneCapture = null;
    }
    syncAudioContextNotice();
  }

  /**
   * A revoked permission or unplugged device kills the track silently. Surface
   * it: the capture graph keeps "working" with no audio and no error anywhere.
   * Stale handlers no-op via the stream identity check after a reconfiguration.
   */
  function watchMicrophoneTrack(stream: MediaStream): void {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.addEventListener("ended", () => {
      if (micStream !== stream) return;
      setAudioNotice("MIC_TRACK_LOST", "麦克风设备已断开或权限被回收，采集已停止：请在音频设置中重新选择设备或重新授权");
    });
    track.addEventListener("mute", () => {
      if (micStream !== stream) return;
      setAudioNotice("MIC_TRACK_MUTED", "麦克风被系统或浏览器静音，其他成员暂时听不到你");
    });
    track.addEventListener("unmute", () => {
      if (micStream !== stream) return;
      clearAudioNotice("MIC_TRACK_MUTED");
    });
  }

  // 导出给 WebClient：开麦前先 await 此函数完成真实采集，避免出现“假成功”
  async function ensureMicrophone(): Promise<void> {
    if (microphoneStartPromise) return microphoneStartPromise;
    if (micStream) return;
    if (!microphoneStartPromise) {
      const generation = microphoneGeneration + 1;
      const pending = startMicrophone().then(async () => {
        await refreshAudioDevices();
        if (generation !== microphoneGeneration || !micStream) throw new CancelledMediaOperation();
      }).finally(() => {
        if (microphoneStartPromise === pending) microphoneStartPromise = null;
      });
      microphoneStartPromise = pending;
    }
    await microphoneStartPromise;
  }

  function voxGate(samples: Float32Array): boolean {
    let sum = 0;
    const count = Math.min(256, samples.length);
    for (let i = 0; i < count; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / count);
    if (rms >= voxThreshold.value) {
      voxAttack = Math.min(VOX_ATTACK_FRAMES, voxAttack + 1);
      voxRelease = VOX_HOLD;
      return voxAttack >= VOX_ATTACK_FRAMES;
    }
    voxAttack = 0;
    if (voxRelease > 0) {
      voxRelease--;
      return true;
    }
    return false;
  }

  async function startAccompaniment(): Promise<void> {
    await accompaniment.start();
  }

  async function stopAccompaniment(): Promise<void> {
    accompaniment.stop();
  }

  async function startWebRtcTransport(sequence: number, socket: WebSocket): Promise<void> {
    await webrtc.start({
      isCurrent: () => sequence === voiceConnection.generation && ws.value === socket
        && socket.readyState === WebSocket.OPEN && state.connected,
      send: message => socket.send(JSON.stringify(message)),
    });
  }

  function stopCaptureGraph(): void {
    accumLen = 0;
    voxAttack = 0;
    voxRelease = 0;
    micLevel.value = 0;
    microphoneCapture?.stopCapture();
  }

  function stopMicrophone(closeContext = true): void {
    if (closeContext) {
      microphoneGeneration++;
      microphoneStartPromise = null;
      pendingMicrophoneCapture?.abort();
      pendingMicrophoneCapture = null;
    }
    stopCaptureGraph();
    microphoneCapture?.dispose();
    microphoneCapture = null;
    webrtc.releaseInput();
    micStream = null;
    if (closeContext) {
      void audioCtx?.close().catch(() => undefined);
      audioCtx = null;
    }
  }

  async function prepareInputDevices(): Promise<void> {
    if (!micStream) await startMicrophone();
    const generation = microphoneGeneration;
    await refreshAudioDevices();
    if (generation !== microphoneGeneration || !micStream) throw new CancelledMediaOperation();
  }

  async function setInputDevice(deviceId: string): Promise<void> {
    inputDeviceTouched = true;
    selectedInputDeviceId.value = deviceId;
    await reconfigureMicrophone();
  }

  async function reconfigureMicrophone(): Promise<void> {
    const generation = ++inputDeviceGeneration;
    deviceListGeneration++;
    const sequence = voiceConnection.generation;
    const socket = ws.value;
    const isCurrent = () => generation === inputDeviceGeneration && sequence === voiceConnection.generation;
    const shouldRestartWebRtc = webrtc.active && Boolean(ws.value);
    try {
      // Keep the current peer alive until the replacement microphone is ready.
      if (micStream) await startMicrophone();
      if (!isCurrent()) return;
      if (shouldRestartWebRtc && socket) await startWebRtcTransport(sequence, socket);
      if (!isCurrent()) return;
      await refreshAudioDevices();
      if (!isCurrent()) return;
      committedInputDeviceId = selectedInputDeviceId.value;
      committedNoiseSuppressionEnabled = noiseSuppressionEnabled.value;
      committedEchoCancellationEnabled = echoCancellationEnabled.value;
      committedAutoGainControlEnabled = autoGainControlEnabled.value;
      localStorage.setItem("webspeak:input-device", committedInputDeviceId);
      await saveAudioPreferences();
    } catch (error) {
      if (!isCurrent() || error instanceof CancelledMediaOperation) return;
      selectedInputDeviceId.value = committedInputDeviceId;
      noiseSuppressionEnabled.value = committedNoiseSuppressionEnabled;
      echoCancellationEnabled.value = committedEchoCancellationEnabled;
      autoGainControlEnabled.value = committedAutoGainControlEnabled;
      localStorage.setItem("webspeak:input-device", committedInputDeviceId);
      throw error;
    }
  }

  async function startMicrophoneTest(): Promise<void> {
    await microphoneTest.start();
  }

  function stopMicrophoneTest(): void {
    microphoneTest.stop();
    // Closing settings also releases device-preview capture when no recorder
    // was started. Room capture remains owned by the connected session.
    if (!state.connected) stopMicrophone();
  }

  async function setOutputDevice(deviceId: string): Promise<void> {
    if (deviceId && !outputDevices.some((device) => device.deviceId === deviceId)) {
      throw new Error("所选扬声器当前不可用");
    }
    outputDeviceTouched = true;
    const generation = ++outputDeviceGeneration;
    deviceListGeneration++;
    const sequence = voiceConnection.generation;
    const isCurrent = () => generation === outputDeviceGeneration && sequence === voiceConnection.generation;
    const previousDeviceId = committedOutputDeviceId;
    selectedOutputDeviceId.value = deviceId;
    try {
      if (audioCtx || deviceId) await setAudioSink(audioCtx ?? getAudioCtx(), deviceId);
      if (!isCurrent()) return;
      committedOutputDeviceId = deviceId;
      localStorage.setItem("webspeak:output-device", deviceId);
      clearAudioNotice("OUTPUT_DEVICE_UNAVAILABLE");
      await saveAudioPreferences();
    } catch (error) {
      if (!isCurrent()) return;
      selectedOutputDeviceId.value = previousDeviceId;
      localStorage.setItem("webspeak:output-device", previousDeviceId);
      // One endpoint may have changed before the other rejected the request.
      if (audioCtx) await setAudioSink(audioCtx, previousDeviceId).catch(() => undefined);
      if (!isCurrent()) return;
      setAudioNotice("OUTPUT_DEVICE_UNAVAILABLE", "无法切换到所选音频输出设备，请检查设备连接或选择其他扬声器");
      throw error;
    }
  }

  function playNotification(kind: "connected" | "disconnected" | "poke" | "private" | "reconnectFailed"): void {
    if (notificationVolume.value <= 0 || outputMuted.value || effectiveOutputVolume() <= 0 || typeof window === "undefined") return;
    try {
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") return;
      const frequencies: Record<typeof kind, number[]> = {
        connected: [660, 880],
        disconnected: [440, 330],
        poke: [740, 980],
        private: [600, 760],
        reconnectFailed: [300, 220],
      };
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      oscillator.frequency.setValueAtTime(frequencies[kind][0], now);
      oscillator.frequency.setValueAtTime(frequencies[kind][1], now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, notificationVolume.value * effectiveOutputVolume() * 0.12), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch {
      // Notification sounds are best effort and must never affect the session.
    }
  }

  function connect(target: string, channel: string, nickname: string, serverPassword = "", identity = "", rememberIdentity = false): void {
    disconnect(true);
    lastConnection = { target, channel, nickname, serverPassword, ...(identity ? { identity } : {}), rememberIdentity };
    identityMaterial.value = identity;
    state.error = "";
    state.errorCode = "";
    state.retryNotUntil = 0;
    // Audio diagnostics belong to the previous session, never to the new one.
    clearMicrophoneError();
    clearAudioNotice();
    state.connecting = true;
    state.reconnecting = false;
    state.reconnectAttempt = 0;
    state.reconnectFailed = false;
    voiceConnection.start(JSON.stringify({
      target, nickname, channel, serverPassword,
      ...(rememberIdentity && identity ? { identity } : {}),
      ...(rememberIdentity ? { rememberIdentity: true } : {}),
    }), audioPreferencesReady);
  }


  function disconnect(preserveConnection = false): void {
    const keepRememberedIdentity = lastConnection?.rememberIdentity === true;
    if (!preserveConnection) lastConnection = null;
    cancelBrowserReconnect();
    dropReconnectTicket();
    voiceConnection.stop(() => releaseSessionResources(!preserveConnection));
    clearMicrophoneError();
    clearAudioNotice();
    state.connected = false;
    state.connecting = false;
    state.reconnecting = false;
    state.reconnectAttempt = 0;
    state.reconnectFailed = false;
    state.tsClientId = 0;
    state.errorCode = "";
    state.connectionFailureCode = "";
    state.channelSwitchedChannelId = "";
    if (!keepRememberedIdentity) identityMaterial.value = "";
    sessionState.reset();
    for (const key of Object.keys(volumes)) delete volumes[Number(key)];
  }

  // --- Browser-level reconnect machinery ---------------------------------
  function storeReconnectTicket(token: string): void {
    reconnectTicket = token;
    writeVoiceSessionIntent({ reconnectToken: token, savedAt: Date.now() });
  }

  function dropReconnectTicket(): void {
    reconnectTicket = "";
    clearVoiceSessionIntent();
  }

  function cancelBrowserReconnect(): void {
    if (browserReconnectTimer !== null) {
      clearTimeout(browserReconnectTimer);
      browserReconnectTimer = null;
    }
    browserReconnectActive = false;
  }

  function scheduleBrowserReconnect(): void {
    if (!reconnectTicket || state.connected || state.reconnectFailed) {
      browserReconnectActive = false;
      return;
    }
    if (browserReconnectTimer !== null) return;
    state.reconnecting = true;
    state.connecting = false;
    state.reconnectAttempt += 1;
    if (state.reconnectAttempt > BROWSER_RECONNECT_DELAYS_MS.length) {
      abandonBrowserReconnect();
      return;
    }
    const delay = BROWSER_RECONNECT_DELAYS_MS[state.reconnectAttempt - 1];
    browserReconnectTimer = setTimeout(() => {
      browserReconnectTimer = null;
      attemptBrowserReconnect();
    }, delay);
  }

  function attemptBrowserReconnect(): void {
    if (!reconnectTicket || state.connected) {
      browserReconnectActive = false;
      state.reconnecting = false;
      return;
    }
    browserReconnectActive = true;
    state.connecting = true;
    voiceConnection.start(JSON.stringify({ reconnect: reconnectTicket }), audioPreferencesReady);
  }

  /** Budget exhausted or the gateway forgot the session. A page that never
   *  connected this load (reload resume with a stale token) falls back to the
   *  join form silently; an established session shows the failure banner. */
  function abandonBrowserReconnect(): void {
    cancelBrowserReconnect();
    dropReconnectTicket();
    state.connecting = false;
    state.reconnecting = false;
    if (!connectedThisLoad) {
      state.reconnectAttempt = 0;
      state.error = "";
      state.errorCode = "";
      return;
    }
    state.reconnectFailed = true;
    state.errorCode = "GATEWAY_NETWORK_LOST";
    state.connectionFailureCode = state.errorCode;
    state.error = connectionFailureMessage("GATEWAY_NETWORK_LOST");
    playNotification("reconnectFailed");
  }

  /** Page-load recovery: exchange the stored reconnect token for a fresh join
   *  ticket and rebuild the session. Returns false when there is nothing to
   *  resume, leaving the normal join form untouched. */
  function tryResumeVoiceSession(): boolean {
    if (state.connected || state.connecting || state.reconnecting) return false;
    const intent = readVoiceSessionIntent();
    if (!intent) return false;
    reconnectTicket = intent.reconnectToken;
    state.error = "";
    state.errorCode = "";
    state.retryNotUntil = 0;
    state.reconnectFailed = false;
    state.reconnectAttempt = 0;
    state.reconnecting = true;
    clearMicrophoneError();
    clearAudioNotice();
    attemptBrowserReconnect();
    return true;
  }

  /** All ways a session ends release the same owned media and pending work. */
  function releaseSessionResources(sendScreenStop = false): void {
    chatGeneration++;
    inputDeviceGeneration++;
    outputDeviceGeneration++;
    deviceListGeneration++;
    selectedInputDeviceId.value = committedInputDeviceId;
    selectedOutputDeviceId.value = committedOutputDeviceId;
    noiseSuppressionEnabled.value = committedNoiseSuppressionEnabled;
    echoCancellationEnabled.value = committedEchoCancellationEnabled;
    autoGainControlEnabled.value = committedAutoGainControlEnabled;
    microphoneTest.dispose();
    audioDiagnostics.reset();
    commands.clear(new Error("语音连接已关闭"));
    screenShare.stopTransport(sendScreenStop);
    webrtc.stop();
    remotePlayback.clearAll();
    stopMicrophone();
    clearSpeakingState();
    whisperTargetIds.clear();
    whisperActive.value = false;
  }

  /** WebRTC is the primary voice path; a compatibility notice must not survive it. */
  function startWebRtcVoice(): Promise<void> {
    clearAudioNotice("WEBRTC_DISABLED");
    clearAudioNotice("WEBRTC_UNSUPPORTED");
    const socket = ws.value;
    return socket ? startWebRtcTransport(voiceConnection.generation, socket) : Promise.resolve();
  }

  /** The WebSocket fallback must never degrade silently: say why voice is on PCM. */
  function startCompatibilityVoice(): Promise<void> {
    if (typeof RTCPeerConnection === "undefined") {
      setAudioNotice("WEBRTC_UNSUPPORTED", "此浏览器不支持 WebRTC，语音使用兼容传输（WebSocket）：延迟与音质可能下降");
    } else {
      setAudioNotice("WEBRTC_DISABLED", "网关未启用 WebRTC，语音使用兼容传输（WebSocket）：延迟与音质可能下降，可在管理台开启");
    }
    return ensureMicrophone();
  }

  function handleMessage(raw: unknown): void {
    const msg = parseServerMessage(raw);
    if (!msg || screenShare.handleMessage(msg) || sessionState.receive(msg)) return;
    switch (msg.type) {
      case "connected":
        const wasReconnecting = state.reconnecting;
        state.connected = true;
        state.connecting = false;
        state.reconnecting = false;
        state.reconnectAttempt = 0;
        state.reconnectFailed = false;
        state.error = "";
        state.errorCode = "";
        state.connectionFailureCode = "";
        state.channelSwitchedChannelId = "";
        state.tsClientId = Number(msg.tsClientId) || 0;
        browserReconnectActive = false;
        connectedThisLoad = true;
        // Fresh ticket per connection: it is what a reload or the next drop
        // will exchange, so it must replace the consumed previous one.
        if (typeof msg.reconnectTicket === "string" && msg.reconnectTicket) storeReconnectTicket(msg.reconnectTicket);
        // The mute preference is local to the browser, while TeamSpeak shows
        // the gateway's own client_input_muted flag to other clients. Send it
        // as soon as the session is ready so a muted reconnect is visible to
        // native TeamSpeak users even before WebRTC negotiation completes.
        sendCmd("setMicrophoneMuted", { muted: microphoneMuted.value });
        screenShare.setIceServers(msg.screenShareIceServers);
        webRtcStunServer = msg.webRtcStunServer ?? "";
        sessionState.connected(msg);
        applyWhisperState(msg.whisperTargetIds, msg.whisperActive);
        if (typeof msg.identity === "string" && msg.identity.length <= 8192) {
          identityMaterial.value = msg.identity;
          if (lastConnection) lastConnection.identity = msg.identity;
        }
        if (wasReconnecting) {
          const start = msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined"
            ? startWebRtcVoice()
            : startCompatibilityVoice();
          // A failed microphone must not look like a failed connection: record it
          // as an audio diagnostic so the room stays visible with a clear reason.
          start.catch((error: unknown) => { setMicrophoneError(error); });
        } else if (msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined" && ws.value) {
          void startWebRtcVoice().catch((error: unknown) => { setMicrophoneError(error); });
        } else {
          void startCompatibilityVoice().catch((error: unknown) => { setMicrophoneError(error); });
        }
        screenShare.refreshStreams();
        break;
      case "channelSwitched":
        state.channelSwitchedChannelId = typeof msg.channelId === "string" || typeof msg.channelId === "number" ? String(msg.channelId) : "";
        state.error = "";
        state.errorCode = "";
        // The gateway answers switchChannel with this message instead of the
        // generic commandCompleted; without settling here the pending command
        // rides out its 8s timeout and rolls back a switch that already
        // happened on TeamSpeak.
        commands.settle(typeof msg.requestId === "string" ? msg.requestId : "");
        break;
      case "audioStats": {
        const sequence = typeof msg.sequence === "string" ? msg.sequence : "";
        audioDiagnostics.receive(sequence, msg.stats);
        break;
      }
      case "disconnected":
        state.connected = false;
        state.connecting = false;
        state.reconnecting = Boolean(msg.recoverable !== false);
        state.reconnectFailed = false;
        if (!state.reconnecting) {
          state.error = "TeamSpeak 连接已断开";
          // A non-recoverable TeamSpeak disconnect tore the session down for
          // good; a resume would only rebuild the same dead end.
          dropReconnectTicket();
        }
        releaseSessionResources();
        break;
      case "reconnecting":
        state.connected = false;
        state.connecting = false;
        state.reconnecting = true;
        state.reconnectFailed = false;
        state.reconnectAttempt = Number(msg.attempt) || state.reconnectAttempt + 1;
        releaseSessionResources();
        break;
      case "reconnected":
        state.reconnecting = false;
        state.reconnectFailed = false;
        break;
      case "reconnectFailed":
        state.connected = false;
        state.connecting = false;
        state.reconnecting = false;
        state.reconnectFailed = true;
        state.errorCode = normalizedClientErrorCode(msg.code);
        state.connectionFailureCode = state.errorCode;
        state.error = connectionFailureMessage(state.errorCode, msg.detail);
        releaseSessionResources();
        // Deterministic refusals (ban, changed password, identity conflict)
        // can only repeat: drop the resume intent so a reload stops at the
        // join form instead of re-hitting the same rejection.
        if (TERMINAL_RECONNECT_FAILURE_CODES.has(state.errorCode)) dropReconnectTicket();
        break;
      case "connectionFailed":
        state.connected = false;
        state.connecting = false;
        state.reconnecting = false;
        // This is the first connection attempt, not a failed reconnect. Keep
        // the user on the welcome form instead of showing an empty voice room.
        state.reconnectFailed = false;
        state.errorCode = normalizedClientErrorCode(msg.code);
        state.connectionFailureCode = state.errorCode;
        state.error = connectionFailureMessage(state.errorCode, msg.detail);
        releaseSessionResources();
        break;
      case "whisperTargets":
        applyWhisperState(msg.targetIds, msg.active);
        break;
      case "webrtcAnswer":
        void webrtc.applyAnswer(msg.payload?.sdp);
        break;
      case "webrtcError":
        if (ws.value) void webrtc.fallback(safeClientErrorCode(msg.code) || "WEBRTC_NEGOTIATION_FAILED");
        break;
      case "audioError": {
        // The gateway could not encode our microphone audio (for example its Opus
        // encoder is unavailable): say it instead of dropping frames silently.
        const audioCode = safeClientErrorCode(msg.code) || "AUDIO_ERROR";
        setAudioNotice(audioCode, audioNoticeMessage(audioCode, msg.detail));
        break;
      }
      case "voiceRoute":
        webRtcVoiceRoutes.value = [...msg.slots];
        if (localStorage.getItem("webspeak:playback-debug") === "1") console.info("[playback-debug] voiceRoute received", [...msg.slots]);
        webrtc.setSlotClients(msg.slots);
        break;
      case "commandCompleted": {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        commands.settle(requestId);
        break;
      }
      case "error":
        state.errorCode = normalizedClientErrorCode(msg.error?.code, "OPERATION_FAILED");
        state.error = protocolErrorMessage(state.errorCode, String(msg.error?.message || msg.message || "操作失败"));
        {
          const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
          const error = Object.assign(new Error(state.error), { code: state.errorCode });
          commands.settle(requestId, error);
        }
        break;
    }
  }

  function handleAudioFrame(data: Uint8Array): void {
    // WebRTC carries the realtime downlink after negotiation. Ignore any
    // in-flight fallback WebSocket packets so a transport switch cannot
    // produce duplicate or delayed playback.
    if (webrtc.active) return;
    if (data.length < 4) {
      audioDiagnostics.count("framesDropped");
      return;
    }
    const clientId = (data[1] << 8) | data[2];
    if (clientId === state.tsClientId) return;
    audioDiagnostics.count("framesReceived");
    markSpeaking(clientId);
    // The leading byte carries the TeamSpeak codec (4 mono / 5 stereo); the
    // playback decoder needs it to decode stereo accompaniment correctly.
    remotePlayback.play(clientId, data.slice(3), data[0]);
  }

  function sendCmd<K extends ClientCommandType>(type: K, payload: ClientCommandPayloads[K]): void {
    commands.send(type, payload);
  }

  function sendCommandAndWait<K extends ClientCommandType>(type: K, payload: ClientCommandPayloads[K], timeoutMs = 8_000): Promise<void> {
    return commands.sendAndWait(type, payload, timeoutMs);
  }

  function switchChannel(channelId: string, password = ""): Promise<void> {
    state.error = "";
    state.errorCode = "";
    state.channelSwitchedChannelId = "";
    // Await the gateway so a refused switch (full, no permission) becomes a
    // catchable rejection — the UI rolls back instead of drifting to a channel
    // it never entered. Send-and-pray stays for genuinely fire-and-forget cmds.
    return sendCommandAndWait("switchChannel", { channelId, ...(password ? { password } : {}) });
  }

  function moveClient(clientId: number, channelId: string, password = ""): Promise<void> {
    return sendCommandAndWait("moveClient", { clientId, channelId, ...(password ? { password } : {}) });
  }

  function measureVoiceAudioStatus(timeoutMs = 1_800): Promise<VoiceAudioStatusSample | null> {
    return audioDiagnostics.measure(timeoutMs);
  }

  function chatText(message: string): string {
    if (!state.connected || ws.value?.readyState !== WebSocket.OPEN) {
      throw Object.assign(new Error("TeamSpeak 会话尚未就绪"), { code: "SESSION_NOT_READY" });
    }
    const text = message.trim();
    if (!text || text.length > 500) throw Object.assign(new Error("文字消息无效"), { code: "INVALID_TEXT_MESSAGE" });
    return text;
  }

  async function sendChat<K extends "sendTextMessage" | "sendServerMessage" | "sendPrivateMessage">(
    type: K, payload: ClientCommandPayloads[K], local: Pick<ChatMessage, "scope" | "targetId" | "conversationId" | "conversationKey" | "conversationName">,
  ): Promise<void> {
    const generation = chatGeneration;
    const senderId = state.tsClientId;
    await sendCommandAndWait(type, payload);
    if (generation !== chatGeneration || !state.connected) throw new Error("语音连接已关闭");
    sessionState.appendLocal({ ...local, senderId, invokerName: "你", message: payload.message });
  }

  async function sendTextMessage(message: string, targetId = ""): Promise<void> {
    const text = chatText(message);
    await sendChat("sendTextMessage", { message: text, ...(targetId ? { channelId: targetId } : {}) },
      { scope: "channel", ...(targetId ? { targetId } : {}) });
  }

  async function sendServerMessage(message: string): Promise<void> {
    await sendChat("sendServerMessage", { message: chatText(message) }, { scope: "server" });
  }

  async function sendPrivateMessage(clientId: number, message: string, targetId = "", expectedKey?: string): Promise<void> {
    const text = chatText(message);
    const member = members.find(candidate => candidate.id === clientId);
    const key = sessionState.memberConversationKey(clientId);
    if (!member || clientId === state.tsClientId || (expectedKey !== undefined && key !== expectedKey)) {
      throw Object.assign(new Error("成员已离线或当前不可见"), { code: "CLIENT_NOT_FOUND" });
    }
    await sendChat("sendPrivateMessage", { clientId, message: text, ...(member.uid ? { clientUid: member.uid } : {}) },
      { scope: "private", targetId, conversationId: String(clientId), conversationKey: key, conversationName: member.nickname });
  }

  function sendPoke(clientId: number, message = ""): void {
    sendCmd("poke", { clientId, message: message.trim().slice(0, 200) });
  }

  function setAway(away: boolean, message = ""): void {
    sendCmd("setAway", { away, message: message.trim().slice(0, 200) });
  }

  function setWhisperTargets(clientIds: number[]): void {
    const targets = [...new Set(clientIds)].filter((clientId) => Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== state.tsClientId).slice(0, 8);
    whisperTargetIds.clear();
    for (const clientId of targets) whisperTargetIds.add(clientId);
    if (!targets.length) whisperActive.value = false;
    sendCmd("setWhisperTargets", { targetIds: targets });
  }

  function setWhisperActive(active: boolean): void {
    if (active && !whisperTargetIds.size) return;
    whisperActive.value = active;
    sendCmd("setWhisperActive", { active });
  }

  function applyWhisperState(targetIds: unknown, active: unknown): void {
    whisperTargetIds.clear();
    if (Array.isArray(targetIds)) {
      for (const clientId of targetIds) {
        if (typeof clientId === "number" && Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== state.tsClientId) whisperTargetIds.add(clientId);
      }
    }
    whisperActive.value = active === true && whisperTargetIds.size > 0;
  }

  function reconnectNow(): void {
    if (state.connecting) return;
    if (reconnectTicket) {
      // Prefer the ticket: it restores the exact session payload, unlike a
      // manual form reconnect.
      cancelBrowserReconnect();
      state.reconnectFailed = false;
      state.reconnectAttempt = 0;
      state.reconnecting = true;
      state.error = "";
      state.errorCode = "";
      attemptBrowserReconnect();
      return;
    }
    if (!lastConnection) return;
    connect(lastConnection.target, lastConnection.channel, lastConnection.nickname, lastConnection.serverPassword, lastConnection.rememberIdentity ? identityMaterial.value || lastConnection.identity : "", lastConnection.rememberIdentity);
  }

  /** True when nothing needs the WebAudio uplink graph and the raw capture
   *  track can feed the sender directly. The mic test always forces the
   *  graph: its broadcast gate works by gain, which the bypass skips. */
  function uplinkBypassActive(): boolean {
    return !noiseSuppressionEnabled.value && inputVolume.value === 1
      && !accompanimentActive.value && !microphoneTestActive.value;
  }

  /** Applies the broadcast gate (user mute, or the mic test which must not
   *  reach the room). The gate works by capture gain so the mic test's
   *  recorder — which taps the raw stream — keeps hearing real audio; only
   *  the user mute may disable the track itself. */
  function applyUplinkGate(): void {
    const silent = microphoneMuted.value || microphoneTestActive.value;
    microphoneCapture?.setVolume(silent ? 0 : inputVolume.value);
    micStream?.getAudioTracks().forEach((track) => { track.enabled = !microphoneMuted.value; });
  }

  /** Re-picks the uplink track after any processing state change: raw direct
   *  when nothing needs the graph, the processed mix otherwise. */
  function applyUplinkRouting(forceGraph = false): void {
    if (!webrtc.active || !micStream) return;
    const bypass = !forceGraph && uplinkBypassActive();
    const capture = microphoneCapture;
    webrtc.setUplinkStream(bypass || !capture ? micStream : capture.processedStream);
  }

  function setMicrophoneMuted(muted: boolean): void {
    microphoneMuted.value = muted;
    voxAttack = 0;
    voxRelease = 0;
    accumLen = 0;
    applyUplinkGate();
    sendCmd("setMicrophoneMuted", { muted });
    if (muted && state.tsClientId) clearSpeaking(state.tsClientId);
    void saveAudioPreferences();
  }

  function clearError(): void {
    state.error = "";
    state.errorCode = "";
  }

  function protocolErrorMessage(code: string, fallback: string): string {
    const messages: Record<string, string> = {
      INVALID_JSON: "消息格式无效",
      INVALID_MESSAGE: "消息格式无效",
      INVALID_REQUEST_ID: "请求标识无效",
      UNKNOWN_MESSAGE_TYPE: "不支持的操作",
      INVALID_PAYLOAD: "操作参数无效",
      INVALID_CHANNEL_ID: "频道标识无效",
      INVALID_CHANNEL_PASSWORD: "频道密码无效",
      INVALID_CLIENT_ID: "成员标识无效",
      INVALID_TEXT_MESSAGE: "文字消息无效",
      INVALID_POKE_MESSAGE: "戳一戳消息无效",
      INVALID_AWAY_STATUS: "离开状态无效",
      INVALID_AUDIO_FRAME: "音频帧格式无效",
      INVALID_MEMBER_VOLUME: "成员音量无效",
      INVALID_WHISPER_TARGETS: "私语目标无效",
      INVALID_WHISPER_STATE: "私语状态无效",
      INVALID_MICROPHONE_STATE: "麦克风状态无效",
      INVALID_ACCOMPANIMENT_STATE: "伴奏状态无效",
      NO_WHISPER_TARGETS: "请先选择私语目标",
      SESSION_NOT_READY: "TeamSpeak 会话尚未就绪",
      RATE_LIMITED: "操作过于频繁，请稍后重试",
      CHANNEL_SWITCH_FAILED: "频道切换失败",
      CHANNEL_PASSWORD_REQUIRED: "该频道需要密码",
      CHANNEL_FULL: "该频道已满",
      CANNOT_MOVE_SELF: "不能移动自己的客户端",
      CHANNEL_NOT_FOUND: "目标频道不可用",
      NICKNAME_IN_USE: "该昵称已被占用，请更换昵称",
      CLIENT_VERSION_OUTDATED: "客户端版本过旧，服务器拒绝了该操作",
      FLOOD_PROTECTION: "操作过于频繁，请稍后重试",
      BANNED: "你已被该服务器封禁",
      KICKED: "你已被服务器移出",
      PERMISSION_DENIED: "你没有执行此操作的权限",
      CLIENT_NOT_FOUND: "成员已离线",
      OPERATION_FAILED: "操作失败",
    };
    const normalized = normalizedClientErrorCode(code, "OPERATION_FAILED");
    if (messages[normalized]) return messages[normalized];
    const safeCode = safeClientErrorCode(normalized);
    const safeFallback = safeClientErrorDetail(fallback);
    return `操作失败（错误代码：${safeCode}）${safeFallback ? `：${safeFallback}` : ""}`;
  }

  const volumeSyncTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const VOLUME_SYNC_DELAY_MS = 150;

  function setVolume(clientId: number, volume: number): void {
    const normalized = Math.max(0, Math.min(4, volume));
    volumes[clientId] = normalized;
    if (localStorage.getItem("webspeak:playback-debug") === "1") console.info("[playback-debug] setVolume", clientId, normalized);
    const member = members.find((candidate) => candidate.id === clientId);
    if (member?.uid) storedVolumesByUid[member.uid] = normalized;
    // Per-speaker volume is applied locally on the playback graph (both the
    // compatibility decoder and the WebRTC multi-track streams), so only
    // persistence trails the thumb — one drag used to emit dozens of commands.
    remotePlayback.updateVolume(clientId);
    webrtc.refreshSpeakerVolume(clientId);
    const pending = volumeSyncTimers.get(clientId);
    if (pending !== undefined) clearTimeout(pending);
    volumeSyncTimers.set(clientId, setTimeout(() => {
      volumeSyncTimers.delete(clientId);
      void saveAudioPreferences();
    }, VOLUME_SYNC_DELAY_MS));
  }

  function setInputVolume(volume: number): void {
    inputVolume.value = Math.max(0, Math.min(1, volume));
    applyUplinkGate();
    applyUplinkRouting();
    void saveAudioPreferences();
  }

  async function setNoiseSuppressionEnabled(enabled: boolean): Promise<void> {
    if (noiseSuppressionEnabled.value === enabled) return;
    noiseSuppressionTouched = true;
    noiseSuppressionEnabled.value = enabled;
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  async function setEchoCancellationEnabled(enabled: boolean): Promise<void> {
    if (echoCancellationEnabled.value === enabled) return;
    echoCancellationTouched = true;
    echoCancellationEnabled.value = enabled;
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  async function setAutoGainControlEnabled(enabled: boolean): Promise<void> {
    if (autoGainControlEnabled.value === enabled) return;
    autoGainControlTouched = true;
    autoGainControlEnabled.value = enabled;
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  function setOutputVolume(volume: number): void {
    outputVolume.value = Math.max(0, Math.min(1, volume));
    applyOutputVolume();
    void saveAudioPreferences();
  }

  function toggleOutputMute(): void {
    outputMuted.value = !outputMuted.value;
    applyOutputVolume();
  }

  function setVoxThreshold(threshold: number): void {
    voxThreshold.value = clamp(threshold, 0.001, 0.08);
    void saveAudioPreferences();
  }

  function setNotificationVolume(volume: number): void {
    notificationVolume.value = clamp(volume, 0, 1);
    void saveAudioPreferences();
  }

  // Live transport for header chrome (the collapsed voice-status trigger):
  // derived from the transport change feed so it updates without the
  // panel-owned probe loop running.
  const voiceTransport = computed<"webrtc" | "websocket" | "negotiating" | "disconnected">(() => {
    if (!state.connected) return "disconnected";
    const snapshot = webrtcTransportSnapshot.value;
    return snapshot.active ? "webrtc" : snapshot.hasPeer ? "negotiating" : "websocket";
  });

  return {
    ...screenShare.api,
    ws,
    state,
    voiceTransport,
    sessionEpoch: sessionState.epoch,
    memberConversationKey: sessionState.memberConversationKey,
    members,
    channels,
    chatMessages,
    serverEvents,
    pokeNotifications,
    microphoneMuted,
    noiseSuppressionEnabled,
    echoCancellationEnabled,
    autoGainControlEnabled,
    inputVolume,
    outputVolume,
    outputMuted,
    notificationVolume,
    voxThreshold,
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    outputDeviceSupported,
    audioPermission,
    microphoneProcessing,
    audioContextState,
    identityMaterial,
    micLevel,
    microphoneTestActive,
    testAudioUrl,
    speakingIds,
    clearAudioNotice,
    whisperTargetIds,
    whisperActive,
    volumes,
    accompanimentActive,
    accompanimentSupported,
    accompanimentErrorCode,
    setVolume,
    setInputVolume,
    setNoiseSuppressionEnabled,
    setEchoCancellationEnabled,
    setAutoGainControlEnabled,
    setOutputVolume,
    toggleOutputMute,
    setVoxThreshold,
    setNotificationVolume,
    prepareInputDevices,
    refreshAudioDevices,
    watchMicrophonePermission,
    setInputDevice,
    setOutputDevice,
    startMicrophoneTest,
    stopMicrophoneTest,
    playNotification,
    connect,
    reconnectNow,
    tryResumeVoiceSession,
    disconnect,
    switchChannel,
    moveClient,
    sendTextMessage,
    sendServerMessage,
    sendPrivateMessage,
    sendPoke,
    setAway,
    setWhisperTargets,
    setWhisperActive,
    setMicrophoneMuted,
    ensureMicrophone,
    startAccompaniment,
    stopAccompaniment,
    checkSupport,
    checkBrowserWarning,
    clearMicrophoneError,
    clearError,
    measureVoiceAudioStatus,
  };
}
