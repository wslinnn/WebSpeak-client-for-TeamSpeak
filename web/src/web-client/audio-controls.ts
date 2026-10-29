import { createStore } from "zustand";

export interface AudioControlsStore {
  /** 设置弹窗内异步操作的当次错误（代际纪律：过期请求不得发布）。 */
  settingsError: string;
  /** 耳语 PTT 是否按住（按钮 active 态）。 */
  whisperPttActive: boolean;
}

/** select/checkbox/range 事件的最小形态（测试桩可只给 target.value/checked）。 */
export interface ControlEventLike {
  target: { value: string };
}
export interface ControlCheckEventLike {
  target: { checked: boolean };
}

interface AudioControlsOptions {
  getSettingsOpen(): boolean;
  getMicrophoneMuted(): boolean;
  getMicLevel(): number;
  getMicrophoneTestActive(): boolean;
  getAccompanimentActive(): boolean;
  getAccompanimentErrorCode(): string;
  /** 耳语目标数（旧 whisperTargetIds.size）。 */
  getWhisperTargetCount(): number;
  prepareInputDevices(): Promise<void>;
  setInputVolume(value: number): void;
  setAccompanimentVolume(value: number): void;
  setNoiseSuppressionEnabled(enabled: boolean): Promise<void>;
  setEchoCancellationEnabled(enabled: boolean): Promise<void>;
  setAutoGainControlEnabled(enabled: boolean): Promise<void>;
  setOutputVolume(value: number): void;
  setVoxThreshold(value: number): void;
  setNotificationVolume(value: number): void;
  setInputDevice(deviceId: string): Promise<void>;
  setOutputDevice(deviceId: string): Promise<void>;
  setMicrophoneMuted(muted: boolean): void;
  startMicrophoneTest(): Promise<void>;
  stopMicrophoneTest(): void;
  setMicrophoneTestPlayback(active: boolean): void;
  startAccompaniment(): Promise<void>;
  stopAccompaniment(): Promise<void>;
  setWhisperActive(active: boolean): void;
  localizedMessage(message: string): string;
  showToast(message: string, tone?: "info" | "warn"): void;
  t(key: string): string;
}

const METER_BARS = 24;

/** 音频控制控制器（旧 useWebClientAudioControls 平价）：设置弹窗的请求代际
 *  （重开/切换/关闭即作废旧请求的错误发布）、麦克风错误映射、PTT 双路（pointer
 *  capture + 键盘空格/Enter）。视图期派生（micMeterBars/meterBarHeight）读 getter，
 *  由视图订阅 voice store 后的重渲染驱动。旧 watch(settingsOpen) 显式化为
 *  syncSettingsOpen(open) 由视图 effect 调用。 */
export function createAudioControls(options: AudioControlsOptions) {
  const store = createStore<AudioControlsStore>(() => ({ settingsError: "", whisperPttActive: false }));
  let settingsGeneration = 0;
  let settingsRequest = 0;
  let whisperPointer: { id: number; target: HTMLElement } | null = null;
  let whisperKey: string | null = null;

  function beginSettingsRequest(): () => boolean {
    store.setState({ settingsError: "" });
    const generation = settingsGeneration;
    const request = ++settingsRequest;
    return () => options.getSettingsOpen() && generation === settingsGeneration && request === settingsRequest;
  }

  function microphoneErrorMessage(error: unknown, fallback = "请检查浏览器权限"): string {
    const name = error instanceof DOMException ? error.name : "";
    const reasons: Record<string, string> = {
      NotAllowedError: "浏览器未授予麦克风权限",
      NotFoundError: "未找到可用的麦克风",
      NotReadableError: "麦克风可能正被其他程序占用",
      OverconstrainedError: "所选麦克风当前不可用",
      SecurityError: "浏览器阻止了麦克风访问",
    };
    return `麦克风访问失败：${reasons[name] ?? fallback}`;
  }

  function onInputVolume(event: ControlEventLike): void {
    options.setInputVolume(Number(event.target.value) / 100);
  }

  function onAccompanimentVolume(event: ControlEventLike): void {
    options.setAccompanimentVolume(Number(event.target.value) / 100);
  }

  function onNoiseSuppressionToggle(event: ControlCheckEventLike): void {
    void options.setNoiseSuppressionEnabled(event.target.checked);
  }

  function onEchoCancellationToggle(event: ControlCheckEventLike): void {
    void options.setEchoCancellationEnabled(event.target.checked);
  }

  function onAutoGainControlToggle(event: ControlCheckEventLike): void {
    void options.setAutoGainControlEnabled(event.target.checked);
  }

  function onOutputVolume(event: ControlEventLike): void {
    options.setOutputVolume(Number(event.target.value) / 100);
  }

  function onVoxThreshold(event: ControlEventLike): void {
    options.setVoxThreshold(Number(event.target.value) / 1000);
  }

  function onNotificationVolume(event: ControlEventLike): void {
    options.setNotificationVolume(Number(event.target.value) / 100);
  }

  async function onInputDeviceChange(event: ControlEventLike): Promise<void> {
    const isCurrent = beginSettingsRequest();
    try {
      await options.setInputDevice(event.target.value);
    } catch (error: unknown) {
      if (isCurrent()) store.setState({ settingsError: microphoneErrorMessage(error, "无法切换麦克风") });
    }
  }

  async function onOutputDeviceChange(event: ControlEventLike): Promise<void> {
    const isCurrent = beginSettingsRequest();
    try {
      await options.setOutputDevice(event.target.value);
    } catch (error: unknown) {
      if (isCurrent()) store.setState({ settingsError: options.localizedMessage(error instanceof Error ? error.message : "无法切换扬声器") });
    }
  }

  async function toggleMicTest(): Promise<void> {
    const isCurrent = beginSettingsRequest();
    try {
      if (options.getMicrophoneTestActive()) options.stopMicrophoneTest();
      else await options.startMicrophoneTest();
    } catch (error: unknown) {
      if (isCurrent()) store.setState({ settingsError: microphoneErrorMessage(error) });
    }
  }

  function meterBarHeight(index: number): number {
    if (!options.getMicrophoneTestActive()) return 5;
    const intensity = Math.max(0, options.getMicLevel() - (index / METER_BARS) * 0.65);
    return 5 + Math.round(intensity * 34);
  }

  function toggleMicrophone(): void {
    // toast 文案钉「切换后」状态：不依赖 setMicrophoneMuted 是否同步落 store
    //（Vue 版依赖 ref 同步赋值的时序，这里显式化同语义）。
    const next = !options.getMicrophoneMuted();
    options.setMicrophoneMuted(next);
    options.showToast(options.t(next ? "microphoneMuted" : "microphoneActive"));
  }

  async function toggleAccompaniment(): Promise<void> {
    try {
      if (options.getAccompanimentActive()) {
        await options.stopAccompaniment();
        options.showToast(options.t("accompanimentStopped"));
        return;
      }
      await options.startAccompaniment();
      if (options.getAccompanimentActive()) options.showToast(options.t("accompanimentStarted"));
    } catch {
      const messageKey = options.getAccompanimentErrorCode() === "needsWebRtc"
        ? "accompanimentNeedsWebRtc"
        : options.getAccompanimentErrorCode() === "noAudio"
          ? "accompanimentNoAudio"
          : options.getAccompanimentErrorCode() === "unsupported"
            ? "accompanimentUnsupported"
            : options.getAccompanimentErrorCode() === "audio"
              ? "accompanimentAudioFailed"
              : "accompanimentPermissionDenied";
      options.showToast(options.t(messageKey), "warn");
    }
  }

  function onWhisperPttDown(event: PointerEvent): void {
    if (!options.getWhisperTargetCount() || store.getState().whisperPttActive || event.button !== 0 || !event.isPrimary) return;
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    target.focus();
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    whisperPointer = { id: event.pointerId, target };
    store.setState({ whisperPttActive: true });
    options.setWhisperActive(true);
  }

  function onWhisperPttUp(event: PointerEvent): void {
    if (event.pointerId !== whisperPointer?.id) return;
    stopWhisperTalk();
  }

  function onWhisperPttKeyDown(event: KeyboardEvent): void {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !options.getWhisperTargetCount() || store.getState().whisperPttActive) return;
    whisperKey = event.key;
    store.setState({ whisperPttActive: true });
    options.setWhisperActive(true);
  }

  function onWhisperPttKeyUp(event: KeyboardEvent): void {
    if (event.key !== whisperKey) return;
    event.preventDefault();
    stopWhisperTalk();
  }

  function stopWhisperTalk(): void {
    const pointer = whisperPointer;
    whisperPointer = null;
    whisperKey = null;
    if (!store.getState().whisperPttActive) return;
    store.setState({ whisperPttActive: false });
    options.setWhisperActive(false);
    // 先清所有权再释放捕获：释放可能同步触发 lostpointercapture。
    if (pointer?.target.hasPointerCapture(pointer.id)) pointer.target.releasePointerCapture(pointer.id);
  }

  /** 旧 watch(settingsOpen, flush sync) 平价：开=作废旧请求并准备设备枚举；
   *  关=停麦克风测试。视图在 settingsOpen 变化的 effect 里调用。 */
  function syncSettingsOpen(open: boolean): void {
    settingsGeneration++;
    if (open) {
      const isCurrent = beginSettingsRequest();
      options.prepareInputDevices().catch((error: unknown) => {
        if (isCurrent()) store.setState({ settingsError: microphoneErrorMessage(error) });
      });
    } else {
      options.stopMicrophoneTest();
    }
  }

  function dispose(): void {
    settingsGeneration++;
    options.stopMicrophoneTest();
    stopWhisperTalk();
  }

  return {
    store,
    syncSettingsOpen,
    dispose,
    microphoneErrorMessage,
    meterBarHeight,
    meterBars: METER_BARS,
    onInputVolume,
    onAccompanimentVolume,
    onNoiseSuppressionToggle,
    onEchoCancellationToggle,
    onAutoGainControlToggle,
    onOutputVolume,
    onVoxThreshold,
    onNotificationVolume,
    onInputDeviceChange,
    onOutputDeviceChange,
    toggleMicTest,
    setMicTestPlayback: options.setMicrophoneTestPlayback,
    toggleMicrophone,
    toggleAccompaniment,
    onWhisperPttDown,
    onWhisperPttUp,
    onWhisperPttKeyDown,
    onWhisperPttKeyUp,
    stopWhisperTalk,
  };
}

export type AudioControls = ReturnType<typeof createAudioControls>;
