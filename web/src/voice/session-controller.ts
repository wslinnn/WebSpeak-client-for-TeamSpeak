import { createStore } from "zustand/vanilla";
import { createSpeakingState } from "./speaking-state";
import { createVoiceCommands } from "./commands";
import { createVoiceSessionState } from "./session-state";
import { createScreenShareController } from "./screen-share";
import { parseServerMessage } from "@shared/server-messages";
import type { ClientCommandPayloads, ClientCommandType } from "@shared/client-commands";
import { connectionFailureMessage, normalizedClientErrorCode, safeClientErrorCode, safeClientErrorDetail } from "./error-messages";
import { createAudioOutput } from "./audio-output";
import { createAudioPreferences } from "./audio-preferences";
import { createChatSend } from "./chat-send";
import { createConnectionLifecycle } from "./connection-lifecycle";
import { type VoiceSessionView } from "./session-model";
import { createMicrophone } from "./microphone";
import { createAudioDevices } from "./audio-devices";

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
      audioOutput.remotePlayback.clear(id);
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
    onAudio: (data) => audioOutput.handleAudioFrame(data),
    syncVoiceTransport: () => devices.syncVoiceTransport(),
    resetSessionState: () => sessionState.reset(),
    releaseSessionResources,
    clearMicrophoneError: () => audioOutput.clearMicrophoneError(),
    clearAudioNotice: () => audioOutput.clearAudioNotice(),
    playNotification: (kind) => audioOutput.playNotification(kind),
    audioPreferencesReady: () => audioPrefs.ready,
  });
  const commands = createVoiceCommands({ socket: connection.socket, generation: () => connection.voiceConnection.generation });

  // 偏好持久化簇（audio-preferences.ts）：装载 promise、防抖落盘、已提交镜像、
  // 按 uid 音量记忆。镜像的读写点在采集提交、设备/处理事务与断线释放。
  const audioPrefs = createAudioPreferences({
    V,
    patch,
    membersLive: () => sessionState.membersLive(),
  });

  const screenShare = createScreenShareController({
    isOpen: () => connection.socket()?.readyState === WebSocket.OPEN,
    send: message => connection.socket()?.send(JSON.stringify(message)),
  });
  const deviceGenerations = { input: 0, output: 0, deviceList: 0 };
  const { markSpeaking, clearSpeaking, clearSpeakingState } = speakingState;

  // 播放侧音频簇（audio-output.ts）：共享 AudioContext、输出汇点、兼容回放、
  // 音频诊断、通知音与非致命音频通知。webrtc 晚绑（门面在其后装配）。
  const audioOutput = createAudioOutput({
    V,
    patch,
    webrtc: () => devices.webrtc,
    microphoneStream: () => mic.microphoneStream(),
    socket: () => connection.socket(),
    connectionGeneration: () => connection.voiceConnection.generation,
    markSpeaking,
    audioPrefs,
    sessionMembers: () => sessionState.store.getState().members,
    deviceGenerations,
  });
  // 上行采集簇（microphone.ts）：采集图生命周期、VOX、上行门控/路由、麦克风测试。
  const mic = createMicrophone({
    V,
    patch,
    audioOutput,
    audioPrefs,
    connection,
    webrtc: () => devices.webrtc,
    deviceGenerations,
    markSpeaking,
    clearSpeaking,
    sendCmd,
    refreshAudioDevices: () => devices.refreshAudioDevices(),
    reconfigureMicrophone: () => devices.reconfigureMicrophone(),
    prepareInputDevices: () => devices.prepareInputDevices(),
  });
  // 设备与传输装配簇（audio-devices.ts）：设备枚举/切换事务、伴奏、WebRTC 传输
  // 装配与传输快照（header 徽标数据源）。
  const devices = createAudioDevices({
    V,
    patch,
    mic,
    audioOutput,
    audioPrefs,
    connection,
    deviceGenerations,
    markSpeaking,
    clearSpeaking,
    sendCmd,
  });

  const whisperTargetIds = new Set<number>();
  /**
   * Passive permission state for the settings dialog: a site-level "denied"
   * makes getUserMedia fail permanently without ever re-prompting, so the
   * dialog should show it before any capture attempt. Firefox rejects the
   * microphone permission name outright, which stays a silent no-op here.
   */
  function deleteVolume(clientId: number): void {
    if (!(clientId in V().volumes)) return;
    const next = { ...V().volumes };
    delete next[clientId];
    patch({ volumes: next });
  }

  /** All ways a session ends release the same owned media and pending work. */
  function releaseSessionResources(sendScreenStop = false): void {
    chatSend.advanceGeneration();
    deviceGenerations.input++;
    deviceGenerations.output++;
    deviceGenerations.deviceList++;
    patch(audioPrefs.committed());
    mic.disposeMicrophoneTest();
    audioOutput.resetDiagnostics();
    commands.clear(new Error("语音连接已关闭"));
    screenShare.stopTransport(sendScreenStop);
    devices.webrtc.stop();
    audioOutput.remotePlayback.clearAll();
    mic.stopMicrophone();
    clearSpeakingState();
    whisperTargetIds.clear();
    patch({ whisperActive: false, whisperTargetIds: new Set<number>() });
  }

  /** WebRTC is the primary voice path; a compatibility notice must not survive it. */
  function startWebRtcVoice(): Promise<void> {
    audioOutput.clearAudioNotice("WEBRTC_DISABLED");
    audioOutput.clearAudioNotice("WEBRTC_UNSUPPORTED");
    const current = connection.socket();
    return current ? devices.startWebRtcTransport(connection.voiceConnection.generation, current) : Promise.resolve();
  }

  /** The WebSocket fallback must never degrade silently: say why voice is on PCM. */
  function startCompatibilityVoice(): Promise<void> {
    if (typeof RTCPeerConnection === "undefined") {
      audioOutput.setAudioNotice("WEBRTC_UNSUPPORTED", "此浏览器不支持 WebRTC，语音使用兼容传输（WebSocket）：延迟与音质可能下降");
    } else {
      audioOutput.setAudioNotice("WEBRTC_DISABLED", "网关未启用 WebRTC，语音使用兼容传输（WebSocket）：延迟与音质可能下降，可在管理台开启");
    }
    return mic.ensureMicrophone();
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
        devices.syncVoiceTransport();
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
        devices.setStunServer(msg.webRtcStunServer ?? "");
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
          start.catch((error: unknown) => { audioOutput.setMicrophoneError(error); });
        } else if (msg.webrtcAvailable === true && typeof RTCPeerConnection !== "undefined" && connection.socket()) {
          void startWebRtcVoice().catch((error: unknown) => { audioOutput.setMicrophoneError(error); });
        } else {
          void startCompatibilityVoice().catch((error: unknown) => { audioOutput.setMicrophoneError(error); });
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
        audioOutput.receiveStats(sequence, msg.stats);
        break;
      }
      case "disconnected": {
        const reconnecting = msg.recoverable !== false;
        patch({ connected: false, connecting: false, reconnecting, reconnectFailed: false });
        devices.syncVoiceTransport();
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
        devices.syncVoiceTransport();
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
        devices.syncVoiceTransport();
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
        devices.syncVoiceTransport();
        releaseSessionResources();
        break;
      }
      case "whisperTargets":
        applyWhisperState(msg.targetIds, msg.active);
        break;
      case "webrtcAnswer":
        void devices.webrtc.applyAnswer(msg.payload?.sdp);
        break;
      case "webrtcError":
        if (connection.socket()) void devices.webrtc.fallback(safeClientErrorCode(msg.code) || "WEBRTC_NEGOTIATION_FAILED");
        break;
      case "audioError": {
        // The gateway could not encode our microphone audio (for example its Opus
        // encoder is unavailable): say it instead of dropping frames silently.
        const audioCode = safeClientErrorCode(msg.code) || "AUDIO_ERROR";
        audioOutput.setAudioNotice(audioCode, audioOutput.audioNoticeMessage(audioCode, msg.detail));
        break;
      }
      case "voiceRoute":
        devices.setVoiceRoutes(msg.slots);
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
    setVolume: audioOutput.setVolume,
    setInputVolume: mic.setInputVolume,
    setNoiseSuppressionEnabled: mic.setNoiseSuppressionEnabled,
    setEchoCancellationEnabled: mic.setEchoCancellationEnabled,
    setAutoGainControlEnabled: mic.setAutoGainControlEnabled,
    setOutputVolume: audioOutput.setOutputVolume,
    toggleOutputMute: audioOutput.toggleOutputMute,
    setVoxThreshold: devices.setVoxThreshold,
    setNotificationVolume: devices.setNotificationVolume,
    prepareInputDevices: devices.prepareInputDevices,
    refreshAudioDevices: devices.refreshAudioDevices,
    watchMicrophonePermission: devices.watchMicrophonePermission,
    setInputDevice: devices.setInputDevice,
    setOutputDevice: audioOutput.setOutputDevice,
    startMicrophoneTest: mic.startMicrophoneTest,
    stopMicrophoneTest: mic.stopMicrophoneTest,
    playNotification: audioOutput.playNotification,
    setMicrophoneTestPlayback: mic.setMicrophoneTestPlayback,
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
    setMicrophoneMuted: mic.setMicrophoneMuted,
    ensureMicrophone: mic.ensureMicrophone,
    startAccompaniment: devices.startAccompaniment,
    stopAccompaniment: devices.stopAccompaniment,
    checkSupport: audioOutput.checkSupport,
    checkBrowserWarning: audioOutput.checkBrowserWarning,
    clearMicrophoneError: audioOutput.clearMicrophoneError,
    clearAudioNotice: audioOutput.clearAudioNotice,
    clearError,
    measureVoiceAudioStatus: audioOutput.measureVoiceAudioStatus,
  };
}

export type VoiceSessionController = ReturnType<typeof createVoiceSessionController>;
