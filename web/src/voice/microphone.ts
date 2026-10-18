import { createMicrophoneTest } from "./microphone-test";
import { createMicrophoneCaptureFactory, type MicrophoneCapture } from "./microphone-capture";
import { createMicrophoneMeter, type MicrophoneMeter } from "./microphone-meter";
import { requestMediaBeforeAudioResume } from "../services/microphone-start";
import type { ClientCommandPayloads, ClientCommandType } from "@shared/client-commands";
import type { createWebRtcTransport } from "./webrtc-transport";
import type { AudioOutput, DeviceGenerations } from "./audio-output";
import type { AudioPreferences } from "./audio-preferences";
import type { ConnectionLifecycle } from "./connection-lifecycle";
import { CancelledMediaOperation, MAX_INPUT_VOLUME, type VoiceSessionView } from "./session-model";

type WebrtcTransport = ReturnType<typeof createWebRtcTransport>;

/** 上行采集簇（自 session-controller 平移）：麦克风采集图生命周期（getUserMedia
 *  → 处理图 → 预增益电平表）、VOX 门控、PCM 兼容上行分帧、广播门控与上行路由、
 *  麦克风测试、静音与输入增益/处理开关。设备枚举与切换事务见 audio-devices。 */

interface MicrophoneDeps {
  V(): VoiceSessionView;
  patch(partial: Partial<VoiceSessionView>): void;
  audioOutput: AudioOutput;
  audioPrefs: AudioPreferences;
  connection: ConnectionLifecycle;
  /** WebRTC 传输（audio-devices 装配，晚绑）。 */
  webrtc(): WebrtcTransport;
  deviceGenerations: DeviceGenerations;
  markSpeaking(clientId: number): void;
  clearSpeaking(clientId: number): void;
  sendCmd<K extends ClientCommandType>(type: K, payload: ClientCommandPayloads[K]): void;
  /** 设备枚举（audio-devices，晚绑）：ensure 与采集启动后刷新。 */
  refreshAudioDevices(): Promise<void>;
  /** 输入设备切换事务（audio-devices，晚绑）：处理开关复用同一事务。 */
  reconfigureMicrophone(): Promise<void>;
  /** 采集装备（audio-devices，晚绑）：麦克风测试先取真实采集。 */
  prepareInputDevices(): Promise<void>;
}

export function createMicrophone(deps: MicrophoneDeps) {
  const { V, patch } = deps;
  let micStream: MediaStream | null = null;
  let inputMeter: MicrophoneMeter | null = null;
  let lastRoutedBypass: boolean | null = null;
  const microphoneCaptureFactory = createMicrophoneCaptureFactory();
  let microphoneCapture: MicrophoneCapture | null = null;
  let pendingMicrophoneCapture: AbortController | null = null;
  let microphoneStartPromise: Promise<void> | null = null;
  let microphoneGeneration = 0;
  let voxAttack = 0;
  let voxRelease = 0;
  const VOX_HOLD = 15;
  const VOX_ATTACK_FRAMES = 1;
  let convBuf = new Int16Array(1024);
  let accumBuf = new Int16Array(2048);
  let accumLen = 0;
  const AUDIO_FRAME_SAMPLES = 960;
  const AUDIO_FRAME_BYTES = AUDIO_FRAME_SAMPLES * 2;
  const MAX_AUDIO_BUFFERED_FRAMES = 10;
  const MAX_AUDIO_BUFFERED_BYTES = AUDIO_FRAME_BYTES * MAX_AUDIO_BUFFERED_FRAMES;

  const microphoneTest = createMicrophoneTest({
    prepare: async () => { await deps.prepareInputDevices(); return micStream; },
    onActive: active => { patch({ microphoneTestActive: active }); applyUplinkGate(); applyUplinkRouting(); },
    onUrl: url => { patch({ testAudioUrl: url }); },
    onStopped: () => { if (!V().connected) stopMicrophone(); },
    onError: error => { deps.audioOutput.setMicrophoneError(error); },
  });

  function microphoneStream(): MediaStream | null {
    return micStream;
  }

  function microphoneCaptureView(): MicrophoneCapture | null {
    return microphoneCapture;
  }

  function generation(): number {
    return microphoneGeneration;
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

  function setMicLevel(level: number): void {
    if (V().micLevel !== level) patch({ micLevel: level });
  }

  function handleCaptureChunk(input: Float32Array, _rms?: number): void {
    if (!input.length) return;
    // 电平显示改由预增益抽头（inputMeter）供给：本 tap 在广播门控（gain 0）
    // 之后，测试/静音期 rms 恒零，声波条会被错误地按满门限清零（2026-10-18）。
    const current = deps.connection.socket();
    const shouldSend = !V().microphoneMuted
      && !V().microphoneTestActive
      && !deps.webrtc().active
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
    if (offset > 0) deps.markSpeaking(V().tsClientId);
    accumLen -= offset;
    if (offset > 0) accumBuf.set(accumBuf.subarray(offset, offset + accumLen), 0);
  }

  async function startMicrophone(): Promise<void> {
    const generation = ++microphoneGeneration;
    pendingMicrophoneCapture?.abort();
    const controller = new AbortController();
    pendingMicrophoneCapture = controller;
    const ctx = deps.audioOutput.getAudioCtx();
    const assertCurrent = (): void => {
      if (generation !== microphoneGeneration || deps.audioOutput.audioContext() !== ctx || controller.signal.aborted) throw new CancelledMediaOperation();
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
      deps.audioPrefs.setCommitted({
        selectedInputDeviceId: V().selectedInputDeviceId,
        noiseSuppressionEnabled: V().noiseSuppressionEnabled,
      });
      watchMicrophoneTrack(nextStream);
      deps.audioOutput.clearMicrophoneError();
    } catch (error) {
      nextCapture?.dispose();
      if (!factoryOwnsStream) nextStream?.getTracks().forEach(track => track.stop());
      if (generation === microphoneGeneration && !(error instanceof CancelledMediaOperation)) {
        if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) patch({ audioPermission: "denied" });
        deps.audioOutput.setMicrophoneError(error);
      }
      throw error;
    } finally {
      if (pendingMicrophoneCapture === controller) pendingMicrophoneCapture = null;
    }
    deps.audioOutput.syncAudioContextNotice();
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
      deps.audioOutput.setAudioNotice("MIC_TRACK_LOST", "麦克风设备已断开或权限被回收，采集已停止：请在音频设置中重新选择设备或重新授权");
    });
    track.addEventListener("mute", () => {
      if (micStream !== stream) return;
      deps.audioOutput.setAudioNotice("MIC_TRACK_MUTED", "麦克风被系统或浏览器静音，其他成员暂时听不到你");
    });
    track.addEventListener("unmute", () => {
      if (micStream !== stream) return;
      deps.audioOutput.clearAudioNotice("MIC_TRACK_MUTED");
    });
  }

  // 导出给会话壳：开麦前先 await 此函数完成真实采集，避免出现“假成功”
  async function ensureMicrophone(): Promise<void> {
    if (microphoneStartPromise) return microphoneStartPromise;
    if (micStream) return;
    if (!microphoneStartPromise) {
      const generation = microphoneGeneration + 1;
      const pending = startMicrophone().then(async () => {
        await deps.refreshAudioDevices();
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
    deps.webrtc().releaseInput();
    micStream = null;
    if (closeContext) {
      deps.audioOutput.releaseAudioContext();
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
    if (!deps.webrtc().active || !micStream) return;
    const bypass = !forceGraph && uplinkBypassActive();
    // 滑条每个 tick 都会走到这里：路由目标不随音量变化，只有旁路状态翻转
    // （跨 100%、测试/伴奏开关）才需要重挂上行流。forceGraph 与捕获图更换
    // 时置空缓存强制重挂（startMicrophone 提交处）。
    if (!forceGraph && bypass === lastRoutedBypass) return;
    lastRoutedBypass = bypass;
    const capture = microphoneCapture;
    deps.webrtc().setUplinkStream(bypass || !capture ? micStream : capture.processedStream);
  }

  /** WebRTC 上行的采集准备（webrtc 选项 prepareMicrophone 调用）。 */
  async function prepareWebRtcMicrophone(): Promise<{ context: AudioContext; stream: MediaStream;
    processedStream: MediaStream; capture: MicrophoneCapture } | null> {
    await ensureMicrophone();
    const capture = microphoneCapture;
    return micStream && capture ? { context: deps.audioOutput.getAudioCtx(), stream: micStream,
      processedStream: capture.processedStream, capture } : null;
  }

  function setMicrophoneMuted(muted: boolean): void {
    patch({ microphoneMuted: muted });
    voxAttack = 0;
    voxRelease = 0;
    accumLen = 0;
    applyUplinkGate();
    deps.sendCmd("setMicrophoneMuted", { muted });
    if (muted && V().tsClientId) deps.clearSpeaking(V().tsClientId);
    void deps.audioPrefs.save();
  }

  function setInputVolume(volume: number): void {
    patch({ inputVolume: Math.max(0, Math.min(MAX_INPUT_VOLUME, volume)) });
    applyUplinkGate();
    applyUplinkRouting();
    deps.audioPrefs.queueSave();
  }

  async function setNoiseSuppressionEnabled(enabled: boolean): Promise<void> {
    if (V().noiseSuppressionEnabled === enabled) return;
    deps.audioPrefs.markTouched("noiseSuppression");
    patch({ noiseSuppressionEnabled: enabled });
    try {
      await deps.reconfigureMicrophone();
    } catch (error) {
      deps.audioOutput.setMicrophoneError(error);
    }
  }

  async function setEchoCancellationEnabled(enabled: boolean): Promise<void> {
    if (V().echoCancellationEnabled === enabled) return;
    deps.audioPrefs.markTouched("echoCancellation");
    patch({ echoCancellationEnabled: enabled });
    try {
      await deps.reconfigureMicrophone();
    } catch (error) {
      deps.audioOutput.setMicrophoneError(error);
    }
  }

  async function setAutoGainControlEnabled(enabled: boolean): Promise<void> {
    if (V().autoGainControlEnabled === enabled) return;
    deps.audioPrefs.markTouched("autoGainControl");
    patch({ autoGainControlEnabled: enabled });
    try {
      await deps.reconfigureMicrophone();
    } catch (error) {
      deps.audioOutput.setMicrophoneError(error);
    }
  }

  return {
    microphoneStream,
    microphoneCapture: microphoneCaptureView,
    generation,
    startMicrophone,
    stopMicrophone,
    stopCaptureGraph,
    ensureMicrophone,
    startMicrophoneTest,
    stopMicrophoneTest,
    disposeMicrophoneTest: () => microphoneTest.dispose(),
    setMicrophoneTestPlayback,
    setMicrophoneMuted,
    setInputVolume,
    setNoiseSuppressionEnabled,
    setEchoCancellationEnabled,
    setAutoGainControlEnabled,
    applyUplinkRouting,
    prepareWebRtcMicrophone,
  };
}

export type Microphone = ReturnType<typeof createMicrophone>;
