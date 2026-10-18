import { createStore } from "zustand/vanilla";
import { createRemotePlayback } from "./remote-playback";
import { createSpeakingState } from "./speaking-state";
import { createMicrophoneTest } from "./microphone-test";
import { normalizeMicrophoneFailure } from "./microphone-failure";
import { createMicrophoneCaptureFactory, type MicrophoneCapture } from "./microphone-capture";
import { createAudioSinkRouter } from "./audio-sink";
import { createAccompaniment } from "./accompaniment";
import { createWebRtcTransport } from "./webrtc-transport";
import { createVoiceCommands } from "./commands";
import { createVoiceSessionState } from "./session-state";
import { createAudioDiagnostics, type VoiceAudioStatusSample } from "./audio-diagnostics";
import type { SinkAudioElement } from "./webrtc-playback";
import { createScreenShareController } from "./screen-share";
import { createMicrophoneMeter, type MicrophoneMeter } from "./microphone-meter";
import { requestMediaBeforeAudioResume } from "../services/microphone-start";
import { parseServerMessage } from "@shared/server-messages";
import type { ClientCommandPayloads, ClientCommandType } from "@shared/client-commands";
import { connectionFailureMessage, normalizedClientErrorCode, safeClientErrorCode, safeClientErrorDetail } from "./error-messages";
import { createAudioPreferences } from "./audio-preferences";
import { createChatSend } from "./chat-send";
import { createConnectionLifecycle } from "./connection-lifecycle";
import { CancelledMediaOperation, MAX_INPUT_VOLUME, clamp, type SinkAudioContext, type VoiceSessionView } from "./session-model";

export type { MicrophoneProcessingSettings } from "./microphone-capture";
export type { AudioPermission, BrowserVoiceAudioStats, VoiceAudioStatusSample } from "./audio-diagnostics";
export type { ScreenShareOutputSettings, ScreenShareCaptureStats, ScreenSharePeerStats, ScreenShareWebRtcStats } from "./screen-share";
export type { ScreenShareStreamDescription as ScreenShareStream, ScreenShareViewerDescription as ScreenShareViewer, ScreenSharePeerSignal as ScreenShareSignal } from "@shared/screen-share";
export type { ChannelMember, ChannelInfo, ChatMessage, ServerEvent, VoiceAudioBridgeStats } from "@shared/voice-models";
export type { VoiceSessionSnapshot, PokeNotification } from "./session-state";
export { MAX_INPUT_VOLUME } from "./session-model";
export type { AudioInputDevice, AudioOutputDevice, VoiceSessionView, VoiceState } from "./session-model";

/** Framework-free voice session orchestrator — the former useVoiceWebSocket
 *  composable with the Vue layer replaced by a zustand vanilla store. One
 *  instance per app; React binds through hooks that subscribe to `store`. */
export function createVoiceSessionController() {
  const store = createStore<VoiceSessionView>(() => ({
    connected: false, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false,
    tsClientId: 0, error: "", errorCode: "", retryNotUntil: 0,
    microphoneError: "", microphoneErrorCode: "", audioNotice: "", audioNoticeCode: "",
    channelSwitchedChannelId: "", selfMovedChannelId: "", connectionFailureCode: "",
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
    micLevel: 0, microphoneTestActive: false, microphoneTestPlaybackActive: false, testAudioUrl: "",
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
    onMembersChanged: () => audioPrefs.syncKnownMemberVolumes(),
    onSelfMoved(channelId) {
      patch({ selfMovedChannelId: channelId });
    },
  });
  // 聊天发送簇（chat-send.ts）：乐观上屏/撤回与会话代际；代际随断线释放推进。
  const chatSend = createChatSend({
    V,
    socket: () => connection.socket(),
    session: () => sessionState,
    sendCommandAndWait,
  });
  // 连接生命周期簇（connection-lifecycle.ts）：socket 所有权、join/断开、
  // 浏览器级重连预算与 ticket；消息/音频帧仍由门面分发。
  const connection = createConnectionLifecycle({
    V,
    patch,
    onMessage: handleMessage,
    onAudio: handleAudioFrame,
    syncVoiceTransport,
    resetSessionState: () => sessionState.reset(),
    releaseSessionResources,
    clearMicrophoneError,
    clearAudioNotice,
    playNotification,
    audioPreferencesReady: () => audioPrefs.ready,
  });
  const commands = createVoiceCommands({ socket: connection.socket, generation: () => connection.voiceConnection.generation });
  let microphoneStartPromise: Promise<void> | null = null;
  let microphoneGeneration = 0;

  // 偏好持久化簇（audio-preferences.ts）：装载 promise、防抖落盘、已提交镜像、
  // 按 uid 音量记忆。镜像的读写点在采集提交、设备/处理事务与断线释放。
  const audioPrefs = createAudioPreferences({
    V,
    patch,
    membersLive: () => sessionState.membersLive(),
  });

  // WebRTC carries audio when the gateway advertises it. The bounded PCM
  // WebSocket path remains the compatibility fallback for older browsers and
  // for deployments where the gateway's built-in UDP media range is unavailable.
  let audioCtx: SinkAudioContext | null = null;
  // document 级 visibilitychange 恢复句柄：随 context 创建、随 close 摘除——
  // 不摘会在每次断开→重连循环里累积一个监听器。
  let resumeAudioCtx: (() => void) | null = null;
  let micStream: MediaStream | null = null;
  let inputMeter: MicrophoneMeter | null = null;
  let lastRoutedBypass: boolean | null = null;
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
    isOpen: () => connection.socket()?.readyState === WebSocket.OPEN,
    send: message => connection.socket()?.send(JSON.stringify(message)),
  });
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
      // rms 只服务说话判定（语义=上行流正在传输）；显示电平归 inputMeter
      // （预门控抽头）——测试门控 gain=0 时上行 meter 恒零，不能喂显示。
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
      const current = connection.socket();
      if (!current || current.readyState !== WebSocket.OPEN || !V().connected) return null;
      const peer = webrtc.peer;
      return { socket: current, connection: connection.voiceConnection.generation, transportGeneration: webrtc.generation, peer,
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
      resumeAudioCtx = (): void => {
        if (audioCtx && audioCtx.state === "suspended") void audioCtx.resume().catch(() => undefined);
      };
      audioCtx.addEventListener("statechange", () => {
        if (audioCtx) patch({ audioContextState: audioCtx.state });
        resumeAudioCtx?.();
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
  /** 用户点 x 的闭锁：同一代码的条件仍成立时，重同步会立刻把横幅设回来，
   *  观感即「关不掉」。闭锁在条件解除（带 code 的清除）时复位，同代码复发
   *  （新条件）仍会提醒。 */
  let dismissedAudioNoticeCode = "";
  function setAudioNotice(code: string, message: string): void {
    const normalized = safeClientErrorCode(code) || "AUDIO_NOTICE";
    if (dismissedAudioNoticeCode === normalized) return;
    patch({ audioNoticeCode: normalized, audioNotice: message });
  }

  function clearAudioNotice(code?: string): void {
    if (code && V().audioNoticeCode !== safeClientErrorCode(code)) return;
    dismissedAudioNoticeCode = code ? safeClientErrorCode(code) : "";
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
    const sequence = connection.voiceConnection.generation;
    const isCurrent = () => generation === deviceListGeneration && sequence === connection.voiceConnection.generation;
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

  function handleCaptureChunk(input: Float32Array, _rms?: number): void {
    if (!input.length) return;
    // 电平显示改由预增益抽头（inputMeter）供给：本 tap 在广播门控（gain 0）
    // 之后，测试/静音期 rms 恒零，声波条会被错误地按满门限清零（2026-10-18）。
    const current = connection.socket();
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
      // 新捕获图必然需要重挂上行流，忽略旁路状态缓存。
      lastRoutedBypass = null;
      // 预增益电平表：直接取原始轨（analyser），不受广播门控（gain 0）与
      // 轨道门控之外的任何处理影响——测试期与测试回放期声波条照常跳动。
      // 电平表可选：创建失败不阻塞麦克风启动（仅丢显示）。
      inputMeter?.dispose();
      try {
        inputMeter = createMicrophoneMeter(ctx, nextStream, (rms) => {
          // null = meter 停止/失败，清显示（残值会挂在最后一次读数上）。
          setMicLevel(rms === null ? 0 : Math.min(1, rms * 6));
        });
      } catch {
        inputMeter = null;
      }
      patch({ microphoneProcessing: { ...nextCapture.processing } });
      applyUplinkGate();
      nextCapture.activate();
      // The fallback for a later failed change is this actual live graph, even
      // if device enumeration or WebRTC negotiation is still in progress.
      audioPrefs.setCommitted({
        selectedInputDeviceId: V().selectedInputDeviceId,
        noiseSuppressionEnabled: V().noiseSuppressionEnabled,
      });
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
      isCurrent: () => sequence === connection.voiceConnection.generation && connection.socket() === current
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
    inputMeter?.dispose();
    inputMeter = null;
    microphoneCapture?.dispose();
    microphoneCapture = null;
    webrtc.releaseInput();
    micStream = null;
    if (closeContext) {
      if (resumeAudioCtx) document.removeEventListener("visibilitychange", resumeAudioCtx);
      resumeAudioCtx = null;
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
    audioPrefs.markTouched("inputDevice");
    patch({ selectedInputDeviceId: deviceId });
    await reconfigureMicrophone();
  }

  async function reconfigureMicrophone(): Promise<void> {
    const generation = ++inputDeviceGeneration;
    deviceListGeneration++;
    const sequence = connection.voiceConnection.generation;
    const current = connection.socket();
    const isCurrent = () => generation === inputDeviceGeneration && sequence === connection.voiceConnection.generation;
    const shouldRestartWebRtc = webrtc.active && Boolean(connection.socket());
    try {
      // Keep the current peer alive until the replacement microphone is ready.
      if (micStream) await startMicrophone();
      if (!isCurrent()) return;
      if (shouldRestartWebRtc && current) await startWebRtcTransport(sequence, current);
      if (!isCurrent()) return;
      await refreshAudioDevices();
      if (!isCurrent()) return;
      audioPrefs.setCommitted({
        selectedInputDeviceId: V().selectedInputDeviceId,
        noiseSuppressionEnabled: V().noiseSuppressionEnabled,
        echoCancellationEnabled: V().echoCancellationEnabled,
        autoGainControlEnabled: V().autoGainControlEnabled,
      });
      localStorage.setItem("webspeak:input-device", audioPrefs.committed().selectedInputDeviceId);
      await audioPrefs.save();
    } catch (error) {
      if (!isCurrent() || error instanceof CancelledMediaOperation) return;
      const committed = audioPrefs.committed();
      patch({
        selectedInputDeviceId: committed.selectedInputDeviceId,
        noiseSuppressionEnabled: committed.noiseSuppressionEnabled,
        echoCancellationEnabled: committed.echoCancellationEnabled,
        autoGainControlEnabled: committed.autoGainControlEnabled,
      });
      localStorage.setItem("webspeak:input-device", committed.selectedInputDeviceId);
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
    audioPrefs.markTouched("outputDevice");
    const generation = ++outputDeviceGeneration;
    deviceListGeneration++;
    const sequence = connection.voiceConnection.generation;
    const isCurrent = () => generation === outputDeviceGeneration && sequence === connection.voiceConnection.generation;
    const previousDeviceId = audioPrefs.committed().selectedOutputDeviceId;
    patch({ selectedOutputDeviceId: deviceId });
    try {
      if (audioCtx || deviceId) await setAudioSink(audioCtx ?? getAudioCtx(), deviceId);
      if (!isCurrent()) return;
      audioPrefs.setCommitted({ selectedOutputDeviceId: deviceId });
      localStorage.setItem("webspeak:output-device", deviceId);
      clearAudioNotice("OUTPUT_DEVICE_UNAVAILABLE");
      await audioPrefs.save();
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

  /** All ways a session ends release the same owned media and pending work. */
  function releaseSessionResources(sendScreenStop = false): void {
    chatSend.advanceGeneration();
    inputDeviceGeneration++;
    outputDeviceGeneration++;
    deviceListGeneration++;
    patch(audioPrefs.committed());
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
    const current = connection.socket();
    return current ? startWebRtcTransport(connection.voiceConnection.generation, current) : Promise.resolve();
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
        connection.notifyConnected();
        // Fresh ticket per connection: it is what a reload or the next drop
        // will exchange, so it must replace the consumed previous one.
        if (typeof msg.reconnectTicket === "string" && msg.reconnectTicket) connection.storeReconnectTicket(msg.reconnectTicket);
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
          const last = connection.lastConnection();
          if (last) last.identity = msg.identity;
        }
        if (wasReconnecting) {
          const start = msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined"
            ? startWebRtcVoice()
            : startCompatibilityVoice();
          // A failed microphone must not look like a failed connection: record it
          // as an audio diagnostic so the room stays visible with a clear reason.
          start.catch((error: unknown) => { setMicrophoneError(error); });
        } else if (msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined" && connection.socket()) {
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
      case "disconnected": {
        const reconnecting = msg.recoverable !== false;
        patch({ connected: false, connecting: false, reconnecting, reconnectFailed: false });
        syncVoiceTransport();
        if (!reconnecting) {
          patch({ error: "TeamSpeak 连接已断开" });
          // A non-recoverable TeamSpeak disconnect tore the session down for
          // good; a resume would only rebuild the same dead end.
          connection.dropReconnectTicket();
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
        if (connection.isTerminalReconnectFailure(V().errorCode)) connection.dropReconnectTicket();
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
        if (connection.socket()) void webrtc.fallback(safeClientErrorCode(msg.code) || "WEBRTC_NEGOTIATION_FAILED");
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

  function sendPoke(clientId: number, message = ""): Promise<void> {
    // 应答式（家规：状态变更命令一律 sendCommandAndWait）：fire-and-forget 发出去的
    // poke 没有 requestId，网关错误帧（权限拒绝/成员已离线）会被静默丢弃——
    // 发送端看到「已发送」但对端毫无动静。失败现在会走到调用方的 catch。
    return sendCommandAndWait("poke", { clientId, message: message.trim().slice(0, 200) });
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

  /** True when nothing needs the WebAudio uplink graph and the raw capture
   *  track can feed the sender directly. The mic test and its playback always
   *  force the graph: their broadcast gate works by gain, which the bypass
   *  skips. */
  function uplinkBypassActive(): boolean {
    return !V().noiseSuppressionEnabled && V().inputVolume === 1
      && !V().accompanimentActive && !V().microphoneTestActive && !V().microphoneTestPlaybackActive;
  }

  /** Applies the broadcast gate (user mute, the mic test or its playback —
   *  none of which must reach the room). The gate works by capture gain so
   *  the mic test's recorder — which taps the raw stream — keeps hearing real
   *  audio; the track itself stays enabled while the test records (else the
   *  recorder and the level meter would read silence), and only the user
   *  mute may disable it once the test is over. */
  function applyUplinkGate(): void {
    const silent = V().microphoneMuted || V().microphoneTestActive || V().microphoneTestPlaybackActive;
    microphoneCapture?.setVolume(silent ? 0 : V().inputVolume);
    micStream?.getAudioTracks().forEach((track) => { track.enabled = !V().microphoneMuted || V().microphoneTestActive; });
  }

  /** Gates the uplink while a mic-test recording is being played back: the
   *  open microphone would otherwise pick the loudspeaker audio right back up
   *  and broadcast it into the room (acoustic echo — reported 2026-10-18). */
  function setMicrophoneTestPlayback(active: boolean): void {
    if (V().microphoneTestPlaybackActive === active) return;
    patch({ microphoneTestPlaybackActive: active });
    applyUplinkGate();
    applyUplinkRouting();
  }

  /** Re-picks the uplink track after any processing state change: raw direct
   *  when nothing needs the graph, the processed mix otherwise. */
  function applyUplinkRouting(forceGraph = false): void {
    if (!webrtc.active || !micStream) return;
    const bypass = !forceGraph && uplinkBypassActive();
    // 滑条每个 tick 都会走到这里：路由目标不随音量变化，只有旁路状态翻转
    // （跨 100%、测试/伴奏开关）才需要重挂上行流。forceGraph 与捕获图更换
    // 时置空缓存强制重挂（startMicrophone 提交处）。
    if (!forceGraph && bypass === lastRoutedBypass) return;
    lastRoutedBypass = bypass;
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
    void audioPrefs.save();
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

  function setVolume(clientId: number, volume: number): void {
    const normalized = Math.max(0, Math.min(4, volume));
    patch({ volumes: { ...V().volumes, [clientId]: normalized } });
    if (localStorage.getItem("webspeak:playback-debug") === "1") console.info("[playback-debug] setVolume", clientId, normalized);
    const member = sessionState.store.getState().members.find((candidate) => candidate.id === clientId);
    if (member?.uid) audioPrefs.stashUidVolume(member.uid, normalized);
    // Per-speaker volume is applied locally on the playback graph (both the
    // compatibility decoder and the WebRTC multi-track streams), so only
    // persistence trails the thumb — one drag used to emit dozens of commands.
    remotePlayback.updateVolume(clientId);
    webrtc.refreshSpeakerVolume(clientId);
    audioPrefs.queueVolumeSave(clientId);
  }

  function setInputVolume(volume: number): void {
    patch({ inputVolume: Math.max(0, Math.min(MAX_INPUT_VOLUME, volume)) });
    applyUplinkGate();
    applyUplinkRouting();
    audioPrefs.queueSave();
  }

  async function setNoiseSuppressionEnabled(enabled: boolean): Promise<void> {
    if (V().noiseSuppressionEnabled === enabled) return;
    audioPrefs.markTouched("noiseSuppression");
    patch({ noiseSuppressionEnabled: enabled });
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  async function setEchoCancellationEnabled(enabled: boolean): Promise<void> {
    if (V().echoCancellationEnabled === enabled) return;
    audioPrefs.markTouched("echoCancellation");
    patch({ echoCancellationEnabled: enabled });
    try {
      await reconfigureMicrophone();
    } catch (error) {
      setMicrophoneError(error);
    }
  }

  async function setAutoGainControlEnabled(enabled: boolean): Promise<void> {
    if (V().autoGainControlEnabled === enabled) return;
    audioPrefs.markTouched("autoGainControl");
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
    audioPrefs.queueSave();
  }

  function toggleOutputMute(): void {
    patch({ outputMuted: !V().outputMuted });
    applyOutputVolume();
  }

  function setVoxThreshold(threshold: number): void {
    patch({ voxThreshold: clamp(threshold, 0.001, 0.08) });
    audioPrefs.queueSave();
  }

  function setNotificationVolume(volume: number): void {
    patch({ notificationVolume: clamp(volume, 0, 1) });
    audioPrefs.queueSave();
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
    ws: connection.socket,
    dispose: connection.dispose,
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
    setMicrophoneTestPlayback,
    connect: connection.connect,
    reconnectNow: connection.reconnectNow,
    tryResumeVoiceSession: connection.tryResumeVoiceSession,
    disconnect: connection.disconnect,
    switchChannel,
    moveClient,
    sendTextMessage: chatSend.sendTextMessage,
    sendServerMessage: chatSend.sendServerMessage,
    sendPrivateMessage: chatSend.sendPrivateMessage,
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
