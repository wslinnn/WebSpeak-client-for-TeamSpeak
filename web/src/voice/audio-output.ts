import { createRemotePlayback } from "./remote-playback";
import { createAudioSinkRouter } from "./audio-sink";
import { createAudioDiagnostics, type VoiceAudioStatusSample } from "./audio-diagnostics";
import { normalizeMicrophoneFailure } from "./microphone-failure";
import { safeClientErrorCode, safeClientErrorDetail } from "./error-messages";
import type { ChannelMember, VoiceAudioBridgeStats } from "@shared/voice-models";
import type { SinkAudioElement } from "./webrtc-playback";
import type { createWebRtcTransport } from "./webrtc-transport";
import type { AudioPreferences } from "./audio-preferences";
import { CancelledMediaOperation, type SinkAudioContext, type VoiceSessionView } from "./session-model";

type WebrtcTransport = ReturnType<typeof createWebRtcTransport>;

/** 播放侧音频簇（自 session-controller 平移）：共享 AudioContext 与输出汇点、
 *  兼容路径多轨回放、音频诊断、通知音、非致命音频通知（麦克风错误/横幅闭锁）、
 *  输出设备切换事务与输出音量。上行采集见 audio-capture。 */

/** 设备事务代际盒：input/output/deviceList 三计数器由门面持有（断线释放统一
 *  推进），设备切换事务按引用读写，isCurrent 守卫语义与平移前一致。 */
export interface DeviceGenerations {
  input: number;
  output: number;
  deviceList: number;
}

interface AudioOutputDeps {
  V(): VoiceSessionView;
  patch(partial: Partial<VoiceSessionView>): void;
  /** WebRTC 传输（门面装配，晚绑读取）。 */
  webrtc(): WebrtcTransport;
  /** 采集模块的实时麦克风流（诊断展示用）。 */
  microphoneStream(): MediaStream | null;
  socket(): WebSocket | null;
  connectionGeneration(): number;
  /** 下行活动说话标记（兼容路径帧驱动）。 */
  markSpeaking(clientId: number): void;
  audioPrefs: AudioPreferences;
  /** setVolume 查成员 uid。 */
  sessionMembers(): readonly ChannelMember[];
  deviceGenerations: DeviceGenerations;
}

export function createAudioOutput(deps: AudioOutputDeps) {
  const { V, patch } = deps;
  // WebRTC carries audio when the gateway advertises it. The bounded PCM
  // WebSocket path remains the compatibility fallback for older browsers and
  // for deployments where the gateway's built-in UDP media range is unavailable.
  let audioCtx: SinkAudioContext | null = null;
  // document 级 visibilitychange 恢复句柄：随 context 创建、随 close 摘除——
  // 不摘会在每次断开→重连循环里累积一个监听器。
  let resumeAudioCtx: (() => void) | null = null;
  const audioSinkRouter = createAudioSinkRouter();

  const remotePlayback = createRemotePlayback({
    getContext: getAudioCtx,
    getVolume: clientId => (V().volumes[clientId] ?? 1) * effectiveOutputVolume(),
    onDecodeError: () => audioDiagnostics.count("decodeErrors"),
    onDrop: () => audioDiagnostics.count("framesDropped"),
  });
  const audioDiagnostics = createAudioDiagnostics({
    source() {
      const current = deps.socket();
      if (!current || current.readyState !== WebSocket.OPEN || !V().connected) return null;
      const peer = deps.webrtc().peer;
      return { socket: current, connection: deps.connectionGeneration(), transportGeneration: deps.webrtc().generation, peer,
        transport: deps.webrtc().active ? "webrtc" : peer ? "negotiating" : "websocket" };
    },
    presentation({ peer }) {
      const transport = deps.webrtc();
      return {
        microphoneMuted: V().microphoneMuted,
        microphoneReady: Boolean(deps.microphoneStream()?.getAudioTracks().some(track => track.readyState === "live")),
        microphonePermission: V().audioPermission,
        playbackState: peer
          ? transport.output ? transport.output.paused ? "paused" : "playing" : "unavailable"
          : audioCtx ? audioCtx.state === "running" ? "playing" : "paused" : null,
      };
    },
    send: (source, sequence) => source.socket.send(JSON.stringify({ type: "audioStatsProbe", payload: { sequence } })),
  });

  function effectiveOutputVolume(): number {
    return V().outputMuted ? 0 : V().outputVolume;
  }

  function applyOutputVolume(): void {
    const level = effectiveOutputVolume();
    remotePlayback.updateVolumes();
    deps.webrtc().setOutputVolume(level);
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

  /** 采集图停机（stopMicrophone）时同毁共享上下文；语句与原顺序一致。 */
  function audioContext(): SinkAudioContext | null {
    return audioCtx;
  }

  function releaseAudioContext(): void {
    if (resumeAudioCtx) document.removeEventListener("visibilitychange", resumeAudioCtx);
    resumeAudioCtx = null;
    void audioCtx?.close().catch(() => undefined);
    audioCtx = null;
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

  /** × 关闭：只对当前展示的代码生效，落闭锁压制同代码重同步顶回。 */
  function dismissAudioNotice(code: string): void {
    const normalized = safeClientErrorCode(code);
    if (!normalized || V().audioNoticeCode !== normalized) return;
    dismissedAudioNoticeCode = normalized;
    patch({ audioNotice: "", audioNoticeCode: "" });
  }

  /** 条件解除（带 code）：闭锁复位、展示按代码精确清空——不误伤其它代码的
   *  在展横幅；无参：生命周期边界整体复位（展示与闭锁一并清）。 */
  function clearAudioNotice(code?: string): void {
    if (code) {
      const normalized = safeClientErrorCode(code);
      if (dismissedAudioNoticeCode === normalized) dismissedAudioNoticeCode = "";
      if (V().audioNoticeCode !== normalized) return;
      patch({ audioNotice: "", audioNoticeCode: "" });
      return;
    }
    dismissedAudioNoticeCode = "";
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
    const generation = deps.deviceGenerations.output;
    const isCurrent = () => generation === deps.deviceGenerations.output && audioCtx === ctx
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
    if (V().connected && deps.webrtc().active) {
      await deps.webrtc().setSinkDevice(deviceId);
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

  function setVolume(clientId: number, volume: number): void {
    const normalized = Math.max(0, Math.min(4, volume));
    patch({ volumes: { ...V().volumes, [clientId]: normalized } });
    if (localStorage.getItem("webspeak:playback-debug") === "1") console.info("[playback-debug] setVolume", clientId, normalized);
    const member = deps.sessionMembers().find((candidate) => candidate.id === clientId);
    if (member?.uid) deps.audioPrefs.stashUidVolume(member.uid, normalized);
    // Per-speaker volume is applied locally on the playback graph (both the
    // compatibility decoder and the WebRTC multi-track streams), so only
    // persistence trails the thumb — one drag used to emit dozens of commands.
    remotePlayback.updateVolume(clientId);
    deps.webrtc().refreshSpeakerVolume(clientId);
    deps.audioPrefs.queueVolumeSave(clientId);
  }

  /** 偏好回填后的同路应用（不含落库与 uid 记账）：成员先出声时播放流已按旧
   *  音量建立，只改状态会让保存的音量等用户再拖一次滑条才生效。 */
  function refreshMemberVolumes(clientIds: readonly number[]): void {
    for (const clientId of clientIds) {
      remotePlayback.updateVolume(clientId);
      deps.webrtc().refreshSpeakerVolume(clientId);
    }
  }

  function setOutputVolume(volume: number): void {
    patch({ outputVolume: Math.max(0, Math.min(1, volume)) });
    applyOutputVolume();
    deps.audioPrefs.queueSave();
  }

  function toggleOutputMute(): void {
    patch({ outputMuted: !V().outputMuted });
    applyOutputVolume();
  }

  async function setOutputDevice(deviceId: string): Promise<void> {
    if (deviceId && !V().outputDevices.some((device) => device.deviceId === deviceId)) {
      throw new Error("所选扬声器当前不可用");
    }
    deps.audioPrefs.markTouched("outputDevice");
    const generation = ++deps.deviceGenerations.output;
    deps.deviceGenerations.deviceList++;
    const sequence = deps.connectionGeneration();
    const isCurrent = () => generation === deps.deviceGenerations.output && sequence === deps.connectionGeneration();
    const previousDeviceId = deps.audioPrefs.committed().selectedOutputDeviceId;
    patch({ selectedOutputDeviceId: deviceId });
    try {
      if (audioCtx || deviceId) await setAudioSink(audioCtx ?? getAudioCtx(), deviceId);
      if (!isCurrent()) return;
      deps.audioPrefs.setCommitted({ selectedOutputDeviceId: deviceId });
      localStorage.setItem("webspeak:output-device", deviceId);
      clearAudioNotice("OUTPUT_DEVICE_UNAVAILABLE");
      await deps.audioPrefs.save();
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

  /** WebRTC 在传时忽略在途兼容帧，避免切换期重复/延迟播放。 */
  function handleAudioFrame(data: Uint8Array): void {
    if (deps.webrtc().active) return;
    if (data.length < 4) {
      audioDiagnostics.count("framesDropped");
      return;
    }
    const clientId = (data[1]! << 8) | data[2]!;
    if (clientId === V().tsClientId) return;
    audioDiagnostics.count("framesReceived");
    deps.markSpeaking(clientId);
    // The leading byte carries the TeamSpeak codec (4 mono / 5 stereo); the
    // playback decoder needs it to decode stereo accompaniment correctly.
    remotePlayback.play(clientId, data.slice(3), data[0]!);
  }

  function measureVoiceAudioStatus(timeoutMs = 1_800): Promise<VoiceAudioStatusSample | null> {
    return audioDiagnostics.measure(timeoutMs);
  }

  return {
    remotePlayback,
    effectiveOutputVolume,
    applyOutputVolume,
    getAudioCtx,
    audioContext,
    releaseAudioContext,
    setMicrophoneError,
    clearMicrophoneError,
    setAudioNotice,
    dismissAudioNotice,
    clearAudioNotice,
    syncAudioContextNotice,
    audioNoticeMessage,
    checkSupport,
    checkBrowserWarning,
    playNotification,
    setVolume,
    refreshMemberVolumes,
    setOutputVolume,
    toggleOutputMute,
    setOutputDevice,
    handleAudioFrame,
    measureVoiceAudioStatus,
    receiveStats: (sequence: string, stats: VoiceAudioBridgeStats) => audioDiagnostics.receive(sequence, stats),
    resetDiagnostics: () => audioDiagnostics.reset(),
  };
}

export type AudioOutput = ReturnType<typeof createAudioOutput>;
