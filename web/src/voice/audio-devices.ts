import { createAccompaniment } from "./accompaniment";
import { createWebRtcTransport } from "./webrtc-transport";
import { safeClientErrorCode } from "./error-messages";
import type { ClientCommandPayloads, ClientCommandType } from "@shared/client-commands";
import type { AudioOutput, DeviceGenerations } from "./audio-output";
import type { AudioPreferences } from "./audio-preferences";
import type { ConnectionLifecycle } from "./connection-lifecycle";
import type { Microphone } from "./microphone";
import { CancelledMediaOperation, clamp, type VoiceSessionView } from "./session-model";

/** 设备与传输装配簇（自 session-controller 平移）：输入/输出设备枚举与切换
 *  事务（代际守卫）、伴奏捕获、WebRTC 传输装配与传输快照（header 徽标数据源）、
 *  vox 阈值与通知音量。采集图生命周期见 microphone。 */

interface AudioDevicesDeps {
  V(): VoiceSessionView;
  patch(partial: Partial<VoiceSessionView>): void;
  mic: Microphone;
  audioOutput: AudioOutput;
  audioPrefs: AudioPreferences;
  connection: ConnectionLifecycle;
  deviceGenerations: DeviceGenerations;
  markSpeaking(clientId: number): void;
  clearSpeaking(clientId: number): void;
  sendCmd<K extends ClientCommandType>(type: K, payload: ClientCommandPayloads[K]): void;
}

export function createAudioDevices(deps: AudioDevicesDeps) {
  const { V, patch } = deps;
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
      deps.mic.microphoneCapture()?.setAccompaniment(stream);
      deps.mic.applyUplinkRouting(stream !== null);
    },
  };

  // 削波提示：读伴奏分接的专属增益节点输出（0..1+ 浮点），样本贴满刻度
  // （峰值 ≥1）即判削波风险；提示滞留 2s 防抖、回到安全电平自动清除。
  // 轮询只消费分析节点，不产生音频副作用；无分接（R/G 直连、无伴奏）时
  // 读数为 null，恒不提示。onActive 开关保证停伴奏/被 ended 释放必停表。
  const ACCOMPANIMENT_CLIP_TICK_MS = 300;
  const ACCOMPANIMENT_CLIP_PEAK = 1;
  const ACCOMPANIMENT_CLIP_HOLD_MS = 2_000;
  let accompanimentClipTimer: ReturnType<typeof setInterval> | null = null;
  let accompanimentClipHotUntil = 0;
  function stopAccompanimentClipWatch(): void {
    if (accompanimentClipTimer) clearInterval(accompanimentClipTimer);
    accompanimentClipTimer = null;
    accompanimentClipHotUntil = 0;
    if (V().accompanimentClipping) patch({ accompanimentClipping: false });
  }
  function startAccompanimentClipWatch(): void {
    stopAccompanimentClipWatch();
    accompanimentClipTimer = setInterval(() => {
      const peak = deps.mic.accompanimentPeak();
      const now = Date.now();
      if (peak !== null && peak >= ACCOMPANIMENT_CLIP_PEAK) accompanimentClipHotUntil = now + ACCOMPANIMENT_CLIP_HOLD_MS;
      const clipping = now < accompanimentClipHotUntil;
      if (V().accompanimentClipping !== clipping) patch({ accompanimentClipping: clipping });
    }, ACCOMPANIMENT_CLIP_TICK_MS);
  }
  const accompaniment = createAccompaniment({
    isSupported: () => V().accompanimentSupported,
    // One stable target identity: the accompaniment module compares
    // getTarget() === target to tell its own capture apart from superseded
    // ones, so a fresh object per call would cancel every capture.
    getTarget: () => {
      const capture = deps.mic.microphoneCapture();
      if (!webrtc.active || !webrtc.peer || !deps.mic.microphoneStream() || !capture) return null;
      return accompanimentTarget;
    },
    onActive(active) {
      const changed = V().accompanimentActive !== active;
      if (changed) patch({ accompanimentActive: active });
      if (changed && webrtc.active) deps.sendCmd("setAccompanimentActive", { active });
      if (active) startAccompanimentClipWatch();
      else stopAccompanimentClipWatch();
    },
    onError: code => { patch({ accompanimentErrorCode: code }); },
  });

  const webrtc = createWebRtcTransport({
    stunServer: () => webRtcStunServer,
    onTransportChange(snapshot) {
      transportSnapshot = snapshot;
      syncVoiceTransport();
    },
    prepareMicrophone: () => deps.mic.prepareWebRtcMicrophone(),
    stopPcm: () => deps.mic.stopCaptureGraph(),
    muted: () => V().microphoneMuted,
    uplinkBypass: () => !V().noiseSuppressionEnabled && V().inputVolume === 1
      && !V().accompanimentActive && !V().microphoneTestActive,
    accompanimentActive: () => V().accompanimentActive,
    releaseAccompaniment: () => accompaniment.stop(),
    onLevel(rms, track) {
      // rms 只服务说话判定（语义=上行流正在传输）；显示电平归 inputMeter
      // （预门控抽头）——测试门控 gain=0 时上行 meter 恒零，不能喂显示。
      if (rms !== null && !V().microphoneMuted && track.enabled && rms >= V().voxThreshold) deps.markSpeaking(V().tsClientId);
      else if (V().tsClientId) deps.clearSpeaking(V().tsClientId);
    },
    onReady() {
      // A renegotiated peer starts with unbound slots; replay the last known
      // slot assignment so its streams are immediately correctly bound.
      webrtc.setSlotClients(webRtcVoiceRoutes);
    },
    async onFallback(reason, isCurrent) {
      if (!isCurrent()) return;
      webRtcVoiceRoutes = [];
      deps.audioOutput.setAudioNotice("WEBRTC_FALLBACK", `实时语音（WebRTC）不可用（错误代码：${safeClientErrorCode(reason) || "WEBRTC_UNAVAILABLE"}），已切换为兼容传输：延迟与音质可能下降`);
      try { await deps.mic.startMicrophone(); }
      catch (error) { if (isCurrent()) deps.audioOutput.setMicrophoneError(error); }
    },
    playback: {
      volume: deps.audioOutput.effectiveOutputVolume,
      speakerVolume: clientId => V().volumes[clientId] ?? 1,
      onEndpoint(output) {
        deps.audioOutput.clearAudioNotice("OUTPUT_DEVICE_PENDING_WEBRTC");
        // The slot pool routes its own elements (and any amplification
        // context) via setSinkDevice: elements are created per slot, so a
        // single-endpoint router cannot track them. Failures here surface
        // through the explicit setOutputDevice flow instead.
        webrtc.setSinkDevice(V().selectedOutputDeviceId).catch(() => undefined);
        void output;
      },
      onBlocked(blocked) {
        if (blocked) deps.audioOutput.setAudioNotice("PLAYBACK_BLOCKED", "浏览器阻止了音频自动播放，暂时听不到其他成员的声音：请点击页面任意位置，或在地址栏允许本站播放声音");
        else deps.audioOutput.clearAudioNotice("PLAYBACK_BLOCKED");
      },
      onPlaying: deps.audioOutput.syncAudioContextNotice,
      onSlotActivity(clientId, active) {
        // Downstream speaking detection is local now: the gateway forwards
        // payloads untouched and has no decoded signal to analyze.
        if (clientId <= 0) return;
        if (active) deps.markSpeaking(clientId);
        else deps.clearSpeaking(clientId);
      },
    },
  });

  function syncVoiceTransport(): void {
    const connected = V().connected;
    const derived: VoiceSessionView["voiceTransport"] = !connected
      ? "disconnected"
      : transportSnapshot.active ? "webrtc" : transportSnapshot.hasPeer ? "negotiating" : "websocket";
    if (V().voiceTransport !== derived) patch({ voiceTransport: derived });
  }

  function setStunServer(value: string): void {
    webRtcStunServer = value;
  }

  /** handleMessage 的 voiceRoute 分支：更新槽位表并重绑多轨播放。 */
  function setVoiceRoutes(slots: number[]): void {
    webRtcVoiceRoutes = [...slots];
    if (localStorage.getItem("webspeak:playback-debug") === "1") console.info("[playback-debug] voiceRoute received", [...slots]);
    webrtc.setSlotClients(slots);
  }

  async function startWebRtcTransport(sequence: number, current: WebSocket): Promise<void> {
    await webrtc.start({
      isCurrent: () => sequence === deps.connection.voiceConnection.generation && deps.connection.socket() === current
        && current.readyState === WebSocket.OPEN && V().connected,
      send: message => current.send(JSON.stringify(message)),
    });
  }

  async function refreshAudioDevices(): Promise<void> {
    const generation = ++deps.deviceGenerations.deviceList;
    const sequence = deps.connection.voiceConnection.generation;
    const isCurrent = () => generation === deps.deviceGenerations.deviceList && sequence === deps.connection.voiceConnection.generation;
    if (!navigator.mediaDevices?.enumerateDevices) {
      patch({ inputDevices: [], outputDevices: [] });
      deps.audioOutput.setAudioNotice("DEVICE_LIST_UNAVAILABLE", "无法读取音频设备列表，将使用浏览器默认音频设备：请在系统或浏览器隐私设置中允许读取设备信息");
      return;
    }
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
      if (!isCurrent()) return;
      deps.audioOutput.clearAudioNotice("DEVICE_LIST_UNAVAILABLE");
    } catch {
      if (!isCurrent()) return;
      // enumerateDevices rejects when the device list is blocked (for example in a
      // locked-down iframe). Use the browser defaults and explain the limitation.
      patch({ inputDevices: [], outputDevices: [] });
      deps.audioOutput.setAudioNotice("DEVICE_LIST_UNAVAILABLE", "无法读取音频设备列表，将使用浏览器默认音频设备：请在系统或浏览器隐私设置中允许读取设备信息");
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
    if (missingOutput) fallbackOperations.push(deps.audioOutput.setOutputDevice(""));
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

  async function prepareInputDevices(): Promise<void> {
    if (!deps.mic.microphoneStream()) await deps.mic.startMicrophone();
    const generation = deps.mic.generation();
    await refreshAudioDevices();
    if (generation !== deps.mic.generation() || !deps.mic.microphoneStream()) throw new CancelledMediaOperation();
  }

  async function setInputDevice(deviceId: string): Promise<void> {
    deps.audioPrefs.markTouched("inputDevice");
    patch({ selectedInputDeviceId: deviceId });
    await reconfigureMicrophone();
  }

  async function reconfigureMicrophone(): Promise<void> {
    const generation = ++deps.deviceGenerations.input;
    deps.deviceGenerations.deviceList++;
    const sequence = deps.connection.voiceConnection.generation;
    const current = deps.connection.socket();
    const isCurrent = () => generation === deps.deviceGenerations.input && sequence === deps.connection.voiceConnection.generation;
    const shouldRestartWebRtc = webrtc.active && Boolean(deps.connection.socket());
    try {
      // Keep the current peer alive until the replacement microphone is ready.
      if (deps.mic.microphoneStream()) await deps.mic.startMicrophone();
      if (!isCurrent()) return;
      if (shouldRestartWebRtc && current) await startWebRtcTransport(sequence, current);
      if (!isCurrent()) return;
      await refreshAudioDevices();
      if (!isCurrent()) return;
      deps.audioPrefs.setCommitted({
        selectedInputDeviceId: V().selectedInputDeviceId,
        noiseSuppressionEnabled: V().noiseSuppressionEnabled,
        echoCancellationEnabled: V().echoCancellationEnabled,
        autoGainControlEnabled: V().autoGainControlEnabled,
      });
      localStorage.setItem("webspeak:input-device", deps.audioPrefs.committed().selectedInputDeviceId);
      await deps.audioPrefs.save();
    } catch (error) {
      if (!isCurrent() || error instanceof CancelledMediaOperation) return;
      const committed = deps.audioPrefs.committed();
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

  async function startAccompaniment(): Promise<void> {
    await accompaniment.start();
  }

  async function stopAccompaniment(): Promise<void> {
    accompaniment.stop();
  }

  function setVoxThreshold(threshold: number): void {
    patch({ voxThreshold: clamp(threshold, 0.001, 0.08) });
    deps.audioPrefs.queueSave();
  }

  function setNotificationVolume(volume: number): void {
    patch({ notificationVolume: clamp(volume, 0, 1) });
    deps.audioPrefs.queueSave();
  }

  return {
    webrtc,
    syncVoiceTransport,
    setStunServer,
    setVoiceRoutes,
    startWebRtcTransport,
    refreshAudioDevices,
    watchMicrophonePermission,
    prepareInputDevices,
    setInputDevice,
    reconfigureMicrophone,
    startAccompaniment,
    stopAccompaniment,
    setVoxThreshold,
    setNotificationVolume,
  };
}

export type AudioDevices = ReturnType<typeof createAudioDevices>;
