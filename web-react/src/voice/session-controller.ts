import { createStore } from "zustand/vanilla";
import { createRemotePlayback } from "./remote-playback";
import { createSpeakingState } from "./speaking-state";
import { createMicrophoneTest } from "./microphone-test";
import { normalizeMicrophoneFailure } from "./microphone-failure";
import { createMicrophoneCaptureFactory, type MicrophoneCapture, type MicrophoneProcessingSettings } from "./microphone-capture";
import { createAudioSinkRouter } from "./audio-sink";
import { createAccompaniment, type AccompanimentErrorCode } from "./accompaniment";
import { createWebRtcTransport } from "./webrtc-transport";
import { createVoiceConnection } from "./connection";
import { clearVoiceSessionIntent, readVoiceSessionIntent, writeVoiceSessionIntent } from "./session-intent";
import { createVoiceCommands } from "./commands";
import { createVoiceSessionState } from "./session-state";
import { createAudioDiagnostics, type AudioPermission, type VoiceAudioStatusSample } from "./audio-diagnostics";
import type { SinkAudioElement } from "./webrtc-playback";
import { createScreenShareController } from "./screen-share";
import { requestMediaBeforeAudioResume } from "../services/microphone-start";
import { parseServerMessage } from "@shared/server-messages";
import type { ChatMessage } from "@shared/voice-models";
import type { ClientCommandPayloads, ClientCommandType } from "@shared/client-commands";
import { loadLocalPreferences, saveLocalPreferences } from "../services/local-persistence";
import { closeErrorCode, closeReason, connectionFailureMessage, joinTicketReason, normalizedClientErrorCode, safeClientErrorCode, safeClientErrorDetail } from "./error-messages";

export type { MicrophoneProcessingSettings } from "./microphone-capture";
export type { AudioPermission, BrowserVoiceAudioStats, VoiceAudioStatusSample } from "./audio-diagnostics";
export type { ScreenShareOutputSettings, ScreenShareCaptureStats, ScreenSharePeerStats, ScreenShareWebRtcStats } from "./screen-share";
export type { ScreenShareStreamDescription as ScreenShareStream, ScreenShareViewerDescription as ScreenShareViewer, ScreenSharePeerSignal as ScreenShareSignal } from "@shared/screen-share";
export type { ChannelMember, ChannelInfo, ChatMessage, ServerEvent, VoiceAudioBridgeStats } from "@shared/voice-models";
export type { VoiceSessionSnapshot, PokeNotification } from "./session-state";

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
  /** serverinfo fields for the channel pane header and welcome card; both
   *  stay empty when the server restricts serverinfo. */
  serverName: string;
  serverWelcomeMessage: string;
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

/** The single framework-free view snapshot. Fields replace the former Vue
 *  refs/reactive/computed surface; consumers subscribe through the store. */
export interface VoiceSessionView extends VoiceState {
  identityMaterial: string;
  microphoneMuted: boolean;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  autoGainControlEnabled: boolean;
  inputVolume: number;
  outputVolume: number;
  outputMuted: boolean;
  notificationVolume: number;
  voxThreshold: number;
  inputDevices: AudioInputDevice[];
  outputDevices: AudioOutputDevice[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  outputDeviceSupported: boolean;
  audioPermission: AudioPermission;
  microphoneProcessing: MicrophoneProcessingSettings;
  audioContextState: AudioContextState | "unknown";
  micLevel: number;
  microphoneTestActive: boolean;
  testAudioUrl: string;
  whisperTargetIds: Set<number>;
  whisperActive: boolean;
  volumes: Record<number, number>;
  accompanimentActive: boolean;
  accompanimentSupported: boolean;
  accompanimentErrorCode: AccompanimentErrorCode;
  /** Live transport for header chrome, derived at every write point from the
   *  transport snapshot and connection state. */
  voiceTransport: "webrtc" | "websocket" | "negotiating" | "disconnected";
}

type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

class CancelledMediaOperation extends Error {
  constructor() { super("媒体操作已取消"); this.name = "AbortError"; }
}

/** Framework-free voice session orchestrator — the former useVoiceWebSocket
 *  composable with the Vue layer replaced by a zustand vanilla store. One
 *  instance per app; React binds through hooks that subscribe to `store`. */
export function createVoiceSessionController() {
  let socket: WebSocket | null = null;
  const store = createStore<VoiceSessionView>(() => ({
    connected: false, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false,
    tsClientId: 0, error: "", errorCode: "", retryNotUntil: 0,
    microphoneError: "", microphoneErrorCode: "", audioNotice: "", audioNoticeCode: "",
    channelSwitchedChannelId: "", selfMovedChannelId: "", connectionFailureCode: "",
    serverName: "", serverWelcomeMessage: "",
    identityMaterial: "",
    microphoneMuted: false, noiseSuppressionEnabled: true, echoCancellationEnabled: false, autoGainControlEnabled: false,
    inputVolume: 1, outputVolume: 1, outputMuted: false, notificationVolume: 0.5, voxThreshold: 0.008,
    inputDevices: [], outputDevices: [],
    selectedInputDeviceId: typeof localStorage !== "undefined" ? localStorage.getItem("webspeak:input-device") ?? "" : "",
    selectedOutputDeviceId: typeof localStorage !== "undefined" ? localStorage.getItem("webspeak:output-device") ?? "" : "",
    outputDeviceSupported: false,
    audioPermission: "unknown",
    microphoneProcessing: { echoCancellation: null, noiseSuppression: null, autoGainControl: null, rnnoise: null },
    audioContextState: "unknown",
    micLevel: 0, microphoneTestActive: false, testAudioUrl: "",
    whisperTargetIds: new Set<number>(), whisperActive: false,
    volumes: {},
    accompanimentActive: false,
    accompanimentSupported: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia),
    accompanimentErrorCode: "",
    voiceTransport: "disconnected",
  }));
  const V = () => store.getState();
  const patch = (partial: Partial<VoiceSessionView>): void => { store.setState(partial); };
  const speakingState = createSpeakingState();
  const sessionState = createVoiceSessionState({
    selfId: () => V().tsClientId,
    onMemberRemoved(id) {
      deleteVolume(id);
      clearSpeaking(id);
      remotePlayback.clear(id);
      if (whisperTargetIds.delete(id)) patch({ whisperTargetIds: new Set(whisperTargetIds) });
      if (!whisperTargetIds.size) patch({ whisperActive: false });
    },
    onMembersChanged: syncKnownMemberVolumes,
    onSelfMoved(channelId) {
      patch({ selfMovedChannelId: channelId });
    },
  });
  let chatGeneration = 0;
  const voiceConnection = createVoiceConnection({
    onSocket: value => { socket = value; },
    onMessage: handleMessage,
    onAudio: handleAudioFrame,
    onClose(event) {
      releaseSessionResources();
      patch({ connected: false, connecting: false, reconnecting: false, tsClientId: 0 });
      syncVoiceTransport();
      if (!V().reconnectFailed) sessionState.reset();
      if (event.code !== 1000 && !V().reconnectFailed && !V().errorCode) {
        const code = closeErrorCode(event.code, event.reason);
        patch({ errorCode: code, connectionFailureCode: code, error: closeReason(event.code, event.reason) });
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
      if (!reconnectTicket || V().connected || V().reconnectFailed) return;
      // A retryable transport drop with a live ticket reconnects in place —
      // the reconnect banner replaces the kick back to the join form.
      browserReconnectActive = true;
      scheduleBrowserReconnect();
    },
    onFailure({ code, detail, cause, retryAfterMs }) {
      const errorCode = normalizedClientErrorCode(code, "REQUEST_FAILED");
      patch({
        connecting: false,
        errorCode,
        connectionFailureCode: errorCode,
        error: cause instanceof Error ? cause.message : joinTicketReason(errorCode, detail),
        ...(errorCode === "PASSWORD_RETRY_LATER" ? {
          retryNotUntil: Date.now() + (typeof retryAfterMs === "number" && retryAfterMs > 0 ? retryAfterMs : 60_000),
        } : {}),
      });
      if (!browserReconnectActive) return;
      if (V().errorCode === "RECONNECT_INVALID") {
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
  const commands = createVoiceCommands({ socket: () => socket, generation: () => voiceConnection.generation });
  // A pending browser-reconnect timer must not fire into a disposed page.
  // React hosts call dispose() from their teardown effect; tests may skip it.
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
  const storedVolumesByUid: Record<string, number> = {};
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
  const accompaniment = createAccompaniment({
    isSupported: () => V().accompanimentSupported,
    // One stable target identity: the accompaniment module compares
    // getTarget() === target to tell its own capture apart from superseded
    // ones, so a fresh object per call would cancel every capture.
    getTarget: () => {
      const capture = microphoneCapture;
      if (!webrtc.active || !webrtc.peer || !micStream || !capture) return null;
      return accompanimentTarget;
    },
    onActive(active) {
      const changed = V().accompanimentActive !== active;
      if (changed) patch({ accompanimentActive: active });
      if (changed && webrtc.active) sendCmd("setAccompanimentActive", { active });
    },
    onError: code => { patch({ accompanimentErrorCode: code }); },
  });
  const screenShare = createScreenShareController({
    isOpen: () => socket?.readyState === WebSocket.OPEN,
    send: message => socket?.send(JSON.stringify(message)),
  });
  let committedInputDeviceId = V().selectedInputDeviceId;
  let committedOutputDeviceId = V().selectedOutputDeviceId;
  let inputDeviceTouched = false;
  let outputDeviceTouched = false;
  let inputDeviceGeneration = 0;
  let outputDeviceGeneration = 0;
  let deviceListGeneration = 0;
  const audioSinkRouter = createAudioSinkRouter();
  const microphoneTest = createMicrophoneTest({
    prepare: async () => { await prepareInputDevices(); return micStream; },
    onActive: active => { patch({ microphoneTestActive: active }); applyUplinkGate(); applyUplinkRouting(); },
    onUrl: url => { patch({ testAudioUrl: url }); },
    onStopped: () => { if (!V().connected) stopMicrophone(); },
    onError: error => { setMicrophoneError(error); },
  });
  let noiseSuppressionTouched = false;
  let committedNoiseSuppressionEnabled = V().noiseSuppressionEnabled;
  // Latency-adding browser processing defaults off (2026-10-14 拍板): the
  // echo canceller alone costs tens of milliseconds; headset users rarely
  // need it. Both flip through the same track-constraint reconfiguration as
  // noise suppression.
  let echoCancellationTouched = false;
  let committedEchoCancellationEnabled = V().echoCancellationEnabled;
  let autoGainControlTouched = false;
  let committedAutoGainControlEnabled = V().autoGainControlEnabled;
  let voxAttack = 0;
  let voxRelease = 0;
  const VOX_HOLD = 15;
  const VOX_ATTACK_FRAMES = 1;
  let convBuf = new Int16Array(1024);
  let accumBuf = new Int16Array(2048);
  let accumLen = 0;

  const { markSpeaking, clearSpeaking, clearSpeakingState } = speakingState;
  const whisperTargetIds = new Set<number>();
  const AUDIO_FRAME_SAMPLES = 960;
  const AUDIO_FRAME_BYTES = AUDIO_FRAME_SAMPLES * 2;
  const MAX_AUDIO_BUFFERED_FRAMES = 10;
  const MAX_AUDIO_BUFFERED_BYTES = AUDIO_FRAME_BYTES * MAX_AUDIO_BUFFERED_FRAMES;
  const remotePlayback = createRemotePlayback({
    getContext: getAudioCtx,
    getVolume: clientId => (V().volumes[clientId] ?? 1) * effectiveOutputVolume(),
    onDecodeError: () => audioDiagnostics.count("decodeErrors"),
    onDrop: () => audioDiagnostics.count("framesDropped"),
  });
  let webRtcStunServer = "";
  // Mirror of the WebRTC transport's live state, pushed via onTransportChange.
  // The transport object itself exposes plain getters, which a store selector
  // cannot track — without this snapshot the header transport badge would
  // freeze on whatever the state was when it first rendered.
  let transportSnapshot: { active: boolean; hasPeer: boolean } = { active: false, hasPeer: false };
  // Slot index → TeamSpeak client id (0 = free slot), pushed by the gateway
  // whenever a downstream slot assignment changes. The multi-track playback
  // binds its per-slot streams through this table.
  let webRtcVoiceRoutes: number[] = [];
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
      transportSnapshot = snapshot;
      syncVoiceTransport();
    },
    prepareMicrophone: async () => {
      await ensureMicrophone();
      const capture = microphoneCapture;
      return micStream && capture ? { context: getAudioCtx(), stream: micStream,
        processedStream: capture.processedStream, capture } : null;
    },
    stopPcm: stopCaptureGraph,
    muted: () => V().microphoneMuted,
    uplinkBypass: () => !V().noiseSuppressionEnabled && V().inputVolume === 1
      && !V().accompanimentActive && !V().microphoneTestActive,
    accompanimentActive: () => V().accompanimentActive,
    releaseAccompaniment: () => accompaniment.stop(),
    onLevel(rms, track) {
      patch({ micLevel: rms === null ? 0 : Math.min(1, rms * 6) });
      if (rms !== null && !V().microphoneMuted && track.enabled && rms >= V().voxThreshold) markSpeaking(V().tsClientId);
      else if (V().tsClientId) clearSpeaking(V().tsClientId);
    },
    onReady() {
      // A renegotiated peer starts with unbound slots; replay the last known
      // slot assignment so its streams are immediately correctly bound.
      webrtc.setSlotClients(webRtcVoiceRoutes);
    },
    async onFallback(reason, isCurrent) {
      if (!isCurrent()) return;
      webRtcVoiceRoutes = [];
      setAudioNotice("WEBRTC_FALLBACK", `实时语音（WebRTC）不可用（错误代码：${safeClientErrorCode(reason) || "WEBRTC_UNAVAILABLE"}），已切换为兼容传输：延迟与音质可能下降`);
      try { await startMicrophone(); }
      catch (error) { if (isCurrent()) setMicrophoneError(error); }
    },
    playback: {
      volume: effectiveOutputVolume,
      speakerVolume: clientId => V().volumes[clientId] ?? 1,
      onEndpoint(output) {
        clearAudioNotice("OUTPUT_DEVICE_PENDING_WEBRTC");
        // The slot pool routes its own elements (and any amplification
        // context) via setSinkDevice: elements are created per slot, so a
        // single-endpoint router cannot track them. Failures here surface
        // through the explicit setOutputDevice flow instead.
        webrtc.setSinkDevice(V().selectedOutputDeviceId).catch(() => undefined);
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
      const current = socket;
      if (!current || current.readyState !== WebSocket.OPEN || !V().connected) return null;
      const peer = webrtc.peer;
      return { socket: current, connection: voiceConnection.generation, transportGeneration: webrtc.generation, peer,
        transport: webrtc.active ? "webrtc" : peer ? "negotiating" : "websocket" };
    },
    presentation({ peer }) {
      return {
        microphoneMuted: V().microphoneMuted,
        microphoneReady: Boolean(micStream?.getAudioTracks().some(track => track.readyState === "live")),
        microphonePermission: V().audioPermission,
        playbackState: peer
          ? webrtc.output ? webrtc.output.paused ? "paused" : "playing" : "unavailable"
          : audioCtx ? audioCtx.state === "running" ? "playing" : "paused" : null,
      };
    },
    send: (source, sequence) => source.socket.send(JSON.stringify({ type: "audioStatsProbe", payload: { sequence } })),
  });

  function syncVoiceTransport(): void {
    const connected = V().connected;
    const derived: VoiceSessionView["voiceTransport"] = !connected
      ? "disconnected"
      : transportSnapshot.active ? "webrtc" : transportSnapshot.hasPeer ? "negotiating" : "websocket";
    if (V().voiceTransport !== derived) patch({ voiceTransport: derived });
  }

  async function saveAudioPreferences(): Promise<void> {
    await saveLocalPreferences({
      schemaVersion: 1,
      preferredInputDeviceId: committedInputDeviceId,
      inputDeviceId: committedInputDeviceId,
      microphoneMuted: V().microphoneMuted,
      noiseSuppressionEnabled: committedNoiseSuppressionEnabled,
      echoCancellationEnabled: committedEchoCancellationEnabled,
      autoGainControlEnabled: committedAutoGainControlEnabled,
      voxThreshold: V().voxThreshold,
      inputGain: V().inputVolume,
      outputVolume: V().outputVolume,
      notificationVolume: V().notificationVolume,
      preferredOutputDeviceId: committedOutputDeviceId,
      volumesByUid: { ...storedVolumesByUid },
    });
  }

  function syncKnownMemberVolumes(): void {
    const updates: Record<number, number> = {};
    let changed = false;
    for (const member of sessionState.membersLive()) {
      if (!member.uid) continue;
      const saved = storedVolumesByUid[member.uid];
      if (saved !== undefined && (V().volumes[member.id] ?? 1) !== Math.max(0, Math.min(4, saved))) {
        updates[member.id] = Math.max(0, Math.min(4, saved));
        changed = true;
      }
    }
    if (changed) patch({ volumes: { ...V().volumes, ...updates } });
  }

  const audioPreferencesReady = loadLocalPreferences().then((preferences) => {
    const next: Partial<VoiceSessionView> = {};
    if (!inputDeviceTouched) {
      if (!V().selectedInputDeviceId) next.selectedInputDeviceId = preferences.preferredInputDeviceId ?? preferences.inputDeviceId ?? "";
      committedInputDeviceId = next.selectedInputDeviceId ?? V().selectedInputDeviceId;
    }
    if (typeof preferences.microphoneMuted === "boolean") next.microphoneMuted = preferences.microphoneMuted;
    if (!noiseSuppressionTouched && typeof preferences.noiseSuppressionEnabled === "boolean") {
      next.noiseSuppressionEnabled = preferences.noiseSuppressionEnabled;
      committedNoiseSuppressionEnabled = preferences.noiseSuppressionEnabled;
    }
    if (!echoCancellationTouched && typeof preferences.echoCancellationEnabled === "boolean") {
      next.echoCancellationEnabled = preferences.echoCancellationEnabled;
      committedEchoCancellationEnabled = preferences.echoCancellationEnabled;
    }
    if (!autoGainControlTouched && typeof preferences.autoGainControlEnabled === "boolean") {
      next.autoGainControlEnabled = preferences.autoGainControlEnabled;
      committedAutoGainControlEnabled = preferences.autoGainControlEnabled;
    }
    if (typeof preferences.voxThreshold === "number") next.voxThreshold = clamp(preferences.voxThreshold, 0.001, 0.08);
    if (typeof preferences.inputGain === "number") next.inputVolume = Math.max(0, Math.min(1, preferences.inputGain));
    if (typeof preferences.outputVolume === "number") next.outputVolume = Math.max(0, Math.min(1, preferences.outputVolume));
    if (!outputDeviceTouched) {
      if (!V().selectedOutputDeviceId) next.selectedOutputDeviceId = preferences.preferredOutputDeviceId ?? "";
      committedOutputDeviceId = next.selectedOutputDeviceId ?? V().selectedOutputDeviceId;
    }
    if (typeof preferences.notificationVolume === "number") next.notificationVolume = clamp(preferences.notificationVolume, 0, 1);
    if (Object.keys(next).length) patch(next);
    Object.assign(storedVolumesByUid, preferences.volumesByUid ?? {});
    syncKnownMemberVolumes();
  });

  function effectiveOutputVolume(): number {
    return V().outputMuted ? 0 : V().outputVolume;
  }

  function applyOutputVolume(): void {
    const level = effectiveOutputVolume();
    remotePlayback.updateVolumes();
    webrtc.setOutputVolume(level);
  }

  function getAudioCtx(): SinkAudioContext {
    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: 48000 }) as SinkAudioContext;
      patch({ audioContextState: audioCtx.state });
      // A suspended context silently starves the uplink graph and playback;
      // keep the shared context alive across lifecycle events (same failure
      // class Newt-Desktop documents for its destination-node uplink).
      const resumeAudioCtx = (): void => {
        if (audioCtx && audioCtx.state === "suspended") void audioCtx.resume().catch(() => undefined);
      };
      audioCtx.addEventListener("statechange", () => {
        if (audioCtx) patch({ audioContextState: audioCtx.state });
        resumeAudioCtx();
      });
      document.addEventListener("visibilitychange", resumeAudioCtx);
      const supported = typeof audioCtx.setSinkId === "function"
        || typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
      patch({ outputDeviceSupported: supported });
      if (V().selectedOutputDeviceId && supported) {
        void setAudioSink(audioCtx, V().selectedOutputDeviceId).catch(() => undefined);
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
    patch({ microphoneErrorCode: failure.code, microphoneError: failure.message });
    return failure.message;
  }

  function clearMicrophoneError(): void {
    patch({ microphoneError: "", microphoneErrorCode: "" });
  }

  /** Non-fatal audio notice (WebRTC fallback, blocked autoplay, device list failure...). */
  function setAudioNotice(code: string, message: string): void {
    patch({ audioNoticeCode: safeClientErrorCode(code) || "AUDIO_NOTICE", audioNotice: message });
  }

  function clearAudioNotice(code?: string): void {
    if (code && V().audioNoticeCode !== safeClientErrorCode(code)) return;
    patch({ audioNotice: "", audioNoticeCode: "" });
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
      && V().selectedOutputDeviceId === deviceId;
    const mediaSinkSupported = typeof (HTMLMediaElement.prototype as SinkAudioElement).setSinkId === "function";
    if (!ctx.setSinkId && !mediaSinkSupported) {
      patch({ outputDeviceSupported: false });
      if (deviceId) throw new Error("当前浏览器不支持扬声器设备选择，将使用默认输出设备");
      return;
    }
    patch({ outputDeviceSupported: true });
    let routed = false;
    if (ctx.setSinkId) {
      await audioSinkRouter.set(ctx, deviceId, isCurrent);
      routed = true;
    }
    // The WebRTC slot pool routes its own elements and amplification context;
    // a failure must propagate so the committed choice rolls back.
    if (V().connected && webrtc.active) {
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
      echoCancellation: V().echoCancellationEnabled,
      noiseSuppression: V().noiseSuppressionEnabled,
      // Off by default on purpose: browser AGC pumps volume as background
      // noise changes, and the manual input gain is the loudness control.
      autoGainControl: V().autoGainControlEnabled,
    };
    if (V().selectedInputDeviceId) constraints.deviceId = { exact: V().selectedInputDeviceId };
    return constraints;
  }

  async function refreshAudioDevices(): Promise<void> {
    const generation = ++deviceListGeneration;
    const sequence = voiceConnection.generation;
    const isCurrent = () => generation === deviceListGeneration && sequence === voiceConnection.generation;
    if (!navigator.mediaDevices?.enumerateDevices) {
      patch({ inputDevices: [], outputDevices: [] });
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
      patch({ inputDevices: [], outputDevices: [] });
      setAudioNotice("DEVICE_LIST_UNAVAILABLE", "无法读取音频设备列表，将使用浏览器默认音频设备：请在系统或浏览器隐私设置中允许读取设备信息");
      return;
    }
    const microphones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    const speakers = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label, groupId: device.groupId }));
    patch({ inputDevices: microphones, outputDevices: speakers });
    const missingInput = V().selectedInputDeviceId && !microphones.some(device => device.deviceId === V().selectedInputDeviceId);
    const missingOutput = V().selectedOutputDeviceId && !speakers.some(device => device.deviceId === V().selectedOutputDeviceId);
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
        if (status.state === "granted" || status.state === "denied") patch({ audioPermission: status.state });
      };
      apply();
      status.addEventListener("change", apply);
    } catch { /* permission name unsupported in this browser */ }
  }

  function setMicLevel(level: number): void {
    if (V().micLevel !== level) patch({ micLevel: level });
  }

  function handleCaptureChunk(input: Float32Array, rms?: number): void {
    if (!input.length) return;
    setMicLevel(Math.min(1, (rms ?? Math.sqrt(input.reduce((sum, sample) => sum + sample * sample, 0) / input.length)) * 6));
    const current = socket;
    const shouldSend = !V().microphoneMuted
      && !V().microphoneTestActive
      && !webrtc.active
      && current?.readyState === WebSocket.OPEN
      && voxGate(input);
    if (!shouldSend) {
      accumLen = 0;
      if (V().microphoneMuted) {
        voxAttack = 0;
        voxRelease = 0;
      }
      return;
    }
    if (!current) {
      accumLen = 0;
      return;
    }
    const bufferedBytes = current.bufferedAmount;
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
    while (offset + AUDIO_FRAME_SAMPLES <= accumLen && current.readyState === WebSocket.OPEN && current.bufferedAmount <= MAX_AUDIO_BUFFERED_BYTES) {
      current.send(accumBuf.slice(offset, offset + AUDIO_FRAME_SAMPLES).buffer);
      offset += AUDIO_FRAME_SAMPLES;
    }
    if (offset > 0) markSpeaking(V().tsClientId);
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
        if (!staleDeviceId || !V().selectedInputDeviceId || controller.signal.aborted) throw error;
        patch({ selectedInputDeviceId: "" });
        try { localStorage.setItem("webspeak:input-device", ""); } catch { /* storage optional */ }
        nextStream = await requestMediaBeforeAudioResume(
          () => navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() }),
          resumeSuspendedContext,
        );
      }
      assertCurrent();
      patch({ audioPermission: "granted" });
      factoryOwnsStream = true;
      nextCapture = await microphoneCaptureFactory.prepare({
        context: ctx, stream: nextStream, signal: controller.signal, assertCurrent,
        noiseSuppression: V().noiseSuppressionEnabled, volume: V().inputVolume, onSamples: handleCaptureChunk,
      });
      assertCurrent();
      // Commit only a complete graph. Permission and node failures leave the
      // previous stream, PCM route and WebRTC peer untouched.
      stopMicrophone(false);
      micStream = nextStream;
      microphoneCapture = nextCapture;
      patch({ microphoneProcessing: { ...nextCapture.processing } });
      applyUplinkGate();
      nextCapture.activate();
      // The fallback for a later failed change is this actual live graph, even
      // if device enumeration or WebRTC negotiation is still in progress.
      committedInputDeviceId = V().selectedInputDeviceId;
      committedNoiseSuppressionEnabled = V().noiseSuppressionEnabled;
      watchMicrophoneTrack(nextStream);
      clearMicrophoneError();
    } catch (error) {
      nextCapture?.dispose();
      if (!factoryOwnsStream) nextStream?.getTracks().forEach(track => track.stop());
      if (generation === microphoneGeneration && !(error instanceof CancelledMediaOperation)) {
        if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) patch({ audioPermission: "denied" });
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

  // 导出给会话壳：开麦前先 await 此函数完成真实采集，避免出现“假成功”
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
    for (let i = 0; i < count; i++) sum += samples[i]! * samples[i]!;
    const rms = Math.sqrt(sum / count);
    if (rms >= V().voxThreshold) {
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

  async function startWebRtcTransport(sequence: number, current: WebSocket): Promise<void> {
    await webrtc.start({
      isCurrent: () => sequence === voiceConnection.generation && socket === current
        && current.readyState === WebSocket.OPEN && V().connected,
      send: message => current.send(JSON.stringify(message)),
    });
  }

  function stopCaptureGraph(): void {
    accumLen = 0;
    voxAttack = 0;
    voxRelease = 0;
    setMicLevel(0);
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
    patch({ selectedInputDeviceId: deviceId });
    await reconfigureMicrophone();
  }

  async function reconfigureMicrophone(): Promise<void> {
    const generation = ++inputDeviceGeneration;
    deviceListGeneration++;
    const sequence = voiceConnection.generation;
    const current = socket;
    const isCurrent = () => generation === inputDeviceGeneration && sequence === voiceConnection.generation;
    const shouldRestartWebRtc = webrtc.active && Boolean(socket);
    try {
      // Keep the current peer alive until the replacement microphone is ready.
      if (micStream) await startMicrophone();
      if (!isCurrent()) return;
      if (shouldRestartWebRtc && current) await startWebRtcTransport(sequence, current);
      if (!isCurrent()) return;
      await refreshAudioDevices();
      if (!isCurrent()) return;
      committedInputDeviceId = V().selectedInputDeviceId;
      committedNoiseSuppressionEnabled = V().noiseSuppressionEnabled;
      committedEchoCancellationEnabled = V().echoCancellationEnabled;
      committedAutoGainControlEnabled = V().autoGainControlEnabled;
      localStorage.setItem("webspeak:input-device", committedInputDeviceId);
      await saveAudioPreferences();
    } catch (error) {
      if (!isCurrent() || error instanceof CancelledMediaOperation) return;
      patch({
        selectedInputDeviceId: committedInputDeviceId,
        noiseSuppressionEnabled: committedNoiseSuppressionEnabled,
        echoCancellationEnabled: committedEchoCancellationEnabled,
        autoGainControlEnabled: committedAutoGainControlEnabled,
      });
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
    if (!V().connected) stopMicrophone();
  }

  async function setOutputDevice(deviceId: string): Promise<void> {
    if (deviceId && !V().outputDevices.some((device) => device.deviceId === deviceId)) {
      throw new Error("所选扬声器当前不可用");
    }
    outputDeviceTouched = true;
    const generation = ++outputDeviceGeneration;
    deviceListGeneration++;
    const sequence = voiceConnection.generation;
    const isCurrent = () => generation === outputDeviceGeneration && sequence === voiceConnection.generation;
    const previousDeviceId = committedOutputDeviceId;
    patch({ selectedOutputDeviceId: deviceId });
    try {
      if (audioCtx || deviceId) await setAudioSink(audioCtx ?? getAudioCtx(), deviceId);
      if (!isCurrent()) return;
      committedOutputDeviceId = deviceId;
      localStorage.setItem("webspeak:output-device", deviceId);
      clearAudioNotice("OUTPUT_DEVICE_UNAVAILABLE");
      await saveAudioPreferences();
    } catch (error) {
      if (!isCurrent()) return;
      patch({ selectedOutputDeviceId: previousDeviceId });
      localStorage.setItem("webspeak:output-device", previousDeviceId);
      // One endpoint may have changed before the other rejected the request.
      if (audioCtx) await setAudioSink(audioCtx, previousDeviceId).catch(() => undefined);
      if (!isCurrent()) return;
      setAudioNotice("OUTPUT_DEVICE_UNAVAILABLE", "无法切换到所选音频输出设备，请检查设备连接或选择其他扬声器");
      throw error;
    }
  }

  function playNotification(kind: "connected" | "disconnected" | "poke" | "private" | "reconnectFailed"): void {
    if (V().notificationVolume <= 0 || V().outputMuted || effectiveOutputVolume() <= 0 || typeof window === "undefined") return;
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
      oscillator.frequency.setValueAtTime(frequencies[kind][0]!, now);
      oscillator.frequency.setValueAtTime(frequencies[kind][1]!, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, V().notificationVolume * effectiveOutputVolume() * 0.12), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch {
      // Notification sounds are best effort and must never affect the session.
    }
  }

  function deleteVolume(clientId: number): void {
    if (!(clientId in V().volumes)) return;
    const next = { ...V().volumes };
    delete next[clientId];
    patch({ volumes: next });
  }

  function connect(target: string, channel: string, nickname: string, serverPassword = "", identity = "", rememberIdentity = false): void {
    disconnect(true);
    lastConnection = { target, channel, nickname, serverPassword, ...(identity ? { identity } : {}), rememberIdentity };
    patch({
      identityMaterial: identity,
      error: "",
      errorCode: "",
      retryNotUntil: 0,
      // Audio diagnostics belong to the previous session, never to the new one.
      connecting: true,
      reconnecting: false,
      reconnectAttempt: 0,
      reconnectFailed: false,
    });
    clearMicrophoneError();
    clearAudioNotice();
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
    patch({
      connected: false, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false,
      tsClientId: 0, errorCode: "", connectionFailureCode: "", channelSwitchedChannelId: "",
      ...(keepRememberedIdentity ? {} : { identityMaterial: "" }),
    });
    syncVoiceTransport();
    sessionState.reset();
    patch({ volumes: {} });
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
    if (!reconnectTicket || V().connected || V().reconnectFailed) {
      browserReconnectActive = false;
      return;
    }
    if (browserReconnectTimer !== null) return;
    patch({ reconnecting: true, connecting: false, reconnectAttempt: V().reconnectAttempt + 1 });
    if (V().reconnectAttempt > BROWSER_RECONNECT_DELAYS_MS.length) {
      abandonBrowserReconnect();
      return;
    }
    const delay = BROWSER_RECONNECT_DELAYS_MS[V().reconnectAttempt - 1]!;
    browserReconnectTimer = setTimeout(() => {
      browserReconnectTimer = null;
      attemptBrowserReconnect();
    }, delay);
  }

  function attemptBrowserReconnect(): void {
    if (!reconnectTicket || V().connected) {
      browserReconnectActive = false;
      patch({ reconnecting: false });
      return;
    }
    browserReconnectActive = true;
    patch({ connecting: true });
    voiceConnection.start(JSON.stringify({ reconnect: reconnectTicket }), audioPreferencesReady);
  }

  /** Budget exhausted or the gateway forgot the session. A page that never
   *  connected this load (reload resume with a stale token) falls back to the
   *  join form silently; an established session shows the failure banner. */
  function abandonBrowserReconnect(): void {
    cancelBrowserReconnect();
    dropReconnectTicket();
    if (!connectedThisLoad) {
      patch({ connecting: false, reconnecting: false, reconnectAttempt: 0, error: "", errorCode: "" });
      return;
    }
    const code = "GATEWAY_NETWORK_LOST";
    patch({
      connecting: false,
      reconnecting: false,
      reconnectFailed: true,
      errorCode: code,
      connectionFailureCode: code,
      error: connectionFailureMessage(code),
    });
    playNotification("reconnectFailed");
  }

  /** Page-load recovery: exchange the stored reconnect token for a fresh join
   *  ticket and rebuild the session. Returns false when there is nothing to
   *  resume, leaving the normal join form untouched. */
  function tryResumeVoiceSession(): boolean {
    if (V().connected || V().connecting || V().reconnecting) return false;
    const intent = readVoiceSessionIntent();
    if (!intent) return false;
    reconnectTicket = intent.reconnectToken;
    patch({
      error: "", errorCode: "", retryNotUntil: 0, reconnectFailed: false, reconnectAttempt: 0, reconnecting: true,
    });
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
    patch({
      selectedInputDeviceId: committedInputDeviceId,
      selectedOutputDeviceId: committedOutputDeviceId,
      noiseSuppressionEnabled: committedNoiseSuppressionEnabled,
      echoCancellationEnabled: committedEchoCancellationEnabled,
      autoGainControlEnabled: committedAutoGainControlEnabled,
    });
    microphoneTest.dispose();
    audioDiagnostics.reset();
    commands.clear(new Error("语音连接已关闭"));
    screenShare.stopTransport(sendScreenStop);
    webrtc.stop();
    remotePlayback.clearAll();
    stopMicrophone();
    clearSpeakingState();
    whisperTargetIds.clear();
    patch({ whisperActive: false, whisperTargetIds: new Set<number>() });
  }

  /** WebRTC is the primary voice path; a compatibility notice must not survive it. */
  function startWebRtcVoice(): Promise<void> {
    clearAudioNotice("WEBRTC_DISABLED");
    clearAudioNotice("WEBRTC_UNSUPPORTED");
    const current = socket;
    return current ? startWebRtcTransport(voiceConnection.generation, current) : Promise.resolve();
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
      case "connected": {
        const wasReconnecting = V().reconnecting;
        patch({
          connected: true, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false,
          error: "", errorCode: "", connectionFailureCode: "", channelSwitchedChannelId: "",
          tsClientId: Number(msg.tsClientId) || 0,
        });
        syncVoiceTransport();
        browserReconnectActive = false;
        connectedThisLoad = true;
        // Fresh ticket per connection: it is what a reload or the next drop
        // will exchange, so it must replace the consumed previous one.
        if (typeof msg.reconnectTicket === "string" && msg.reconnectTicket) storeReconnectTicket(msg.reconnectTicket);
        // The mute preference is local to the browser, while TeamSpeak shows
        // the gateway's own client_input_muted flag to other clients. Send it
        // as soon as the session is ready so a muted reconnect is visible to
        // native TeamSpeak users even before WebRTC negotiation completes.
        sendCmd("setMicrophoneMuted", { muted: V().microphoneMuted });
        screenShare.setIceServers(msg.screenShareIceServers);
        webRtcStunServer = msg.webRtcStunServer ?? "";
        sessionState.connected(msg);
        applyWhisperState(msg.whisperTargetIds, msg.whisperActive);
        if (typeof msg.identity === "string" && msg.identity.length <= 8192) {
          patch({ identityMaterial: msg.identity });
          if (lastConnection) lastConnection.identity = msg.identity;
        }
        if (wasReconnecting) {
          const start = msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined"
            ? startWebRtcVoice()
            : startCompatibilityVoice();
          // A failed microphone must not look like a failed connection: record it
          // as an audio diagnostic so the room stays visible with a clear reason.
          start.catch((error: unknown) => { setMicrophoneError(error); });
        } else if (msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined" && socket) {
          void startWebRtcVoice().catch((error: unknown) => { setMicrophoneError(error); });
        } else {
          void startCompatibilityVoice().catch((error: unknown) => { setMicrophoneError(error); });
        }
        screenShare.refreshStreams();
        break;
      }
      case "channelSwitched":
        patch({
          channelSwitchedChannelId: typeof msg.channelId === "string" || typeof msg.channelId === "number" ? String(msg.channelId) : "",
          error: "",
          errorCode: "",
        });
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
      case "serverInfo":
        patch({
          serverName: typeof msg.name === "string" ? msg.name : "",
          serverWelcomeMessage: typeof msg.welcomeMessage === "string" ? msg.welcomeMessage : "",
        });
        break;
      case "disconnected": {
        const reconnecting = msg.recoverable !== false;
        patch({ connected: false, connecting: false, reconnecting, reconnectFailed: false });
        syncVoiceTransport();
        if (!reconnecting) {
          patch({ error: "TeamSpeak 连接已断开" });
          // A non-recoverable TeamSpeak disconnect tore the session down for
          // good; a resume would only rebuild the same dead end.
          dropReconnectTicket();
        }
        releaseSessionResources();
        break;
      }
      case "reconnecting":
        patch({
          connected: false, connecting: false, reconnecting: true, reconnectFailed: false,
          reconnectAttempt: Number(msg.attempt) || V().reconnectAttempt + 1,
        });
        syncVoiceTransport();
        releaseSessionResources();
        break;
      case "reconnected":
        patch({ reconnecting: false, reconnectFailed: false });
        break;
      case "reconnectFailed": {
        const code = normalizedClientErrorCode(msg.code);
        patch({
          connected: false, connecting: false, reconnecting: false, reconnectFailed: true,
          errorCode: code, connectionFailureCode: code, error: connectionFailureMessage(code, msg.detail),
        });
        syncVoiceTransport();
        releaseSessionResources();
        // Deterministic refusals (ban, changed password, identity conflict)
        // can only repeat: drop the resume intent so a reload stops at the
        // join form instead of re-hitting the same rejection.
        if (TERMINAL_RECONNECT_FAILURE_CODES.has(V().errorCode)) dropReconnectTicket();
        break;
      }
      case "connectionFailed": {
        const code = normalizedClientErrorCode(msg.code);
        // This is the first connection attempt, not a failed reconnect. Keep
        // the user on the welcome form instead of showing an empty voice room.
        patch({
          connected: false, connecting: false, reconnecting: false, reconnectFailed: false,
          errorCode: code, connectionFailureCode: code, error: connectionFailureMessage(code, msg.detail),
        });
        syncVoiceTransport();
        releaseSessionResources();
        break;
      }
      case "whisperTargets":
        applyWhisperState(msg.targetIds, msg.active);
        break;
      case "webrtcAnswer":
        void webrtc.applyAnswer(msg.payload?.sdp);
        break;
      case "webrtcError":
        if (socket) void webrtc.fallback(safeClientErrorCode(msg.code) || "WEBRTC_NEGOTIATION_FAILED");
        break;
      case "audioError": {
        // The gateway could not encode our microphone audio (for example its Opus
        // encoder is unavailable): say it instead of dropping frames silently.
        const audioCode = safeClientErrorCode(msg.code) || "AUDIO_ERROR";
        setAudioNotice(audioCode, audioNoticeMessage(audioCode, msg.detail));
        break;
      }
      case "voiceRoute":
        webRtcVoiceRoutes = [...msg.slots];
        if (localStorage.getItem("webspeak:playback-debug") === "1") console.info("[playback-debug] voiceRoute received", [...msg.slots]);
        webrtc.setSlotClients(msg.slots);
        break;
      case "commandCompleted": {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        commands.settle(requestId);
        break;
      }
      case "error": {
        const code = normalizedClientErrorCode(msg.error?.code, "OPERATION_FAILED");
        const message = protocolErrorMessage(code, String(msg.error?.message || msg.message || "操作失败"));
        patch({ errorCode: code, error: message });
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        const error = Object.assign(new Error(message), { code });
        commands.settle(requestId, error);
        break;
      }
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
    const clientId = (data[1]! << 8) | data[2]!;
    if (clientId === V().tsClientId) return;
    audioDiagnostics.count("framesReceived");
    markSpeaking(clientId);
    // The leading byte carries the TeamSpeak codec (4 mono / 5 stereo); the
    // playback decoder needs it to decode stereo accompaniment correctly.
    remotePlayback.play(clientId, data.slice(3), data[0]!);
  }

  function sendCmd<K extends ClientCommandType>(type: K, payload: ClientCommandPayloads[K]): void {
    commands.send(type, payload);
  }

  function sendCommandAndWait<K extends ClientCommandType>(type: K, payload: ClientCommandPayloads[K], timeoutMs = 8_000): Promise<void> {
    return commands.sendAndWait(type, payload, timeoutMs);
  }

  function switchChannel(channelId: string, password = ""): Promise<void> {
    patch({ error: "", errorCode: "", channelSwitchedChannelId: "" });
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
    if (!V().connected || socket?.readyState !== WebSocket.OPEN) {
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
    const senderId = V().tsClientId;
    await sendCommandAndWait(type, payload);
    if (generation !== chatGeneration || !V().connected) throw new Error("语音连接已关闭");
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
    const member = sessionState.store.getState().members.find(candidate => candidate.id === clientId);
    const key = sessionState.memberConversationKey(clientId);
    if (!member || clientId === V().tsClientId || (expectedKey !== undefined && key !== expectedKey)) {
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

  function syncWhisperState(active: boolean): void {
    patch({ whisperTargetIds: new Set(whisperTargetIds), whisperActive: active && whisperTargetIds.size > 0 });
  }

  function setWhisperTargets(clientIds: number[]): void {
    const targets = [...new Set(clientIds)].filter((clientId) => Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== V().tsClientId).slice(0, 8);
    whisperTargetIds.clear();
    for (const clientId of targets) whisperTargetIds.add(clientId);
    syncWhisperState(V().whisperActive);
    if (!targets.length) patch({ whisperActive: false });
    sendCmd("setWhisperTargets", { targetIds: targets });
  }

  function setWhisperActive(active: boolean): void {
    if (active && !whisperTargetIds.size) return;
    syncWhisperState(active);
    sendCmd("setWhisperActive", { active });
  }

  function applyWhisperState(targetIds: unknown, active: unknown): void {
    whisperTargetIds.clear();
    if (Array.isArray(targetIds)) {
      for (const clientId of targetIds) {
        if (typeof clientId === "number" && Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== V().tsClientId) whisperTargetIds.add(clientId);
      }
    }
    syncWhisperState(active === true);
  }

  function reconnectNow(): void {
    if (V().connecting) return;
    if (reconnectTicket) {
      // Prefer the ticket: it restores the exact session payload, unlike a
      // manual form reconnect.
      cancelBrowserReconnect();
      patch({
        reconnectFailed: false, reconnectAttempt: 0, reconnecting: true, error: "", errorCode: "",
      });
      attemptBrowserReconnect();
      return;
    }
    if (!lastConnection) return;
    connect(lastConnection.target, lastConnection.channel, lastConnection.nickname, lastConnection.serverPassword, lastConnection.rememberIdentity ? V().identityMaterial || lastConnection.identity : "", lastConnection.rememberIdentity);
  }

  /** True when nothing needs the WebAudio uplink graph and the raw capture
   *  track can feed the sender directly. The mic test always forces the
   *  graph: its broadcast gate works by gain, which the bypass skips. */
  function uplinkBypassActive(): boolean {
    return !V().noiseSuppressionEnabled && V().inputVolume === 1
      && !V().accompanimentActive && !V().microphoneTestActive;
  }

  /** Applies the broadcast gate (user mute, or the mic test which must not
   *  reach the room). The gate works by capture gain so the mic test's
   *  recorder — which taps the raw stream — keeps hearing real audio; only
   *  the user mute may disable the track itself. */
  function applyUplinkGate(): void {
    const silent = V().microphoneMuted || V().microphoneTestActive;
    microphoneCapture?.setVolume(silent ? 0 : V().inputVolume);
    micStream?.getAudioTracks().forEach((track) => { track.enabled = !V().microphoneMuted; });
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
    patch({ microphoneMuted: muted });
    voxAttack = 0;
    voxRelease = 0;
    accumLen = 0;
    applyUplinkGate();
    sendCmd("setMicrophoneMuted", { muted });
    if (muted && V().tsClientId) clearSpeaking(V().tsClientId);
    void saveAudioPreferences();
  }

  function clearError(): void {
    patch({ error: "", errorCode: "" });
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
    if (messages[normalized]) return messages[normalized]!;
    const safeCode = safeClientErrorCode(normalized);
    const safeFallback = safeClientErrorDetail(fallback);
    return `操作失败（错误代码：${safeCode}）${safeFallback ? `：${safeFallback}` : ""}`;
  }

  const volumeSyncTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const VOLUME_SYNC_DELAY_MS = 150;

  function setVolume(clientId: number, volume: number): void {
    const normalized = Math.max(0, Math.min(4, volume));
    patch({ volumes: { ...V().volumes, [clientId]: normalized } });
    if (localStorage.getItem("webspeak:playback-debug") === "1") console.info("[playback-debug] setVolume", clientId, normalized);
    const member = sessionState.store.getState().members.find((candidate) => candidate.id === clientId);
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
    patch({ inputVolume: Math.max(0, Math.min(1, volume)) });
    applyUplinkGate();
    applyUplinkRouting();
    void saveAudioPreferences();
  }

  async function setNoiseSuppressionEnabled(enabled: boolean): Promise<void> {
    if (V().noiseSuppressionEnabled === enabled) return;
    noiseSuppressionTouched = true;
    patch({ noiseSuppressionEnabled: enabled });
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  async function setEchoCancellationEnabled(enabled: boolean): Promise<void> {
    if (V().echoCancellationEnabled === enabled) return;
    echoCancellationTouched = true;
    patch({ echoCancellationEnabled: enabled });
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  async function setAutoGainControlEnabled(enabled: boolean): Promise<void> {
    if (V().autoGainControlEnabled === enabled) return;
    autoGainControlTouched = true;
    patch({ autoGainControlEnabled: enabled });
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  function setOutputVolume(volume: number): void {
    patch({ outputVolume: Math.max(0, Math.min(1, volume)) });
    applyOutputVolume();
    void saveAudioPreferences();
  }

  function toggleOutputMute(): void {
    patch({ outputMuted: !V().outputMuted });
    applyOutputVolume();
  }

  function setVoxThreshold(threshold: number): void {
    patch({ voxThreshold: clamp(threshold, 0.001, 0.08) });
    void saveAudioPreferences();
  }

  function setNotificationVolume(volume: number): void {
    patch({ notificationVolume: clamp(volume, 0, 1) });
    void saveAudioPreferences();
  }

  /** Releases reconnect timers; React hosts call this from their teardown. */
  function dispose(): void {
    cancelBrowserReconnect();
  }

  return {
    /** Main view store: VoiceSessionView snapshot, subscribe with selectors. */
    store,
    view: V,
    /** Per-session directory/chat/event store (see session-state.ts). */
    session: sessionState,
    /** Speaking-badge store (see speaking-state.ts). */
    speakingStore: speakingState.store,
    screenShare,
    ws: () => socket,
    dispose,
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
    clearAudioNotice,
    clearError,
    measureVoiceAudioStatus,
  };
}

export type VoiceSessionController = ReturnType<typeof createVoiceSessionController>;
