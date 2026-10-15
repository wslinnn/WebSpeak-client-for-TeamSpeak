import { describe, expect, it } from "vitest";

import { createAudioControls, type AudioControls } from "./audio-controls";

function deferred<T>(): { promise: Promise<T>; reject: (error: unknown) => void; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

interface HarnessOptions {
  settingsOpen: boolean;
  stops: string[];
}

function mount(extra: Record<string, unknown> = {}): { controls: AudioControls; open(): void; close(): void; setSettingsOpen(value: boolean): void; stops: string[] } & Record<string, unknown> {
  const state: HarnessOptions = { settingsOpen: false, stops: [] };
  const base = {
    getSettingsOpen: () => state.settingsOpen,
    getMicrophoneMuted: () => false,
    getMicLevel: () => 0,
    getMicrophoneTestActive: () => false,
    getAccompanimentActive: () => false,
    getAccompanimentErrorCode: () => "",
    getWhisperTargetCount: () => 0,
    prepareInputDevices: async () => {},
    setInputVolume: () => {},
    setNoiseSuppressionEnabled: async () => {},
    setEchoCancellationEnabled: async () => {},
    setAutoGainControlEnabled: async () => {},
    setOutputVolume: () => {},
    setVoxThreshold: () => {},
    setNotificationVolume: () => {},
    setInputDevice: async () => {},
    setOutputDevice: async () => {},
    setMicrophoneMuted: () => {},
    startMicrophoneTest: async () => {},
    stopMicrophoneTest: () => state.stops.push("stop"),
    startAccompaniment: async () => {},
    stopAccompaniment: async () => {},
    setWhisperActive: () => {},
    localizedMessage: (value: string) => value,
    showToast: () => {},
    t: (key: string) => key,
    ...extra,
  };
  const controls = createAudioControls(base as Parameters<typeof createAudioControls>[0]);
  const harness = {
    controls,
    stops: state.stops,
    setSettingsOpen(value: boolean): void {
      state.settingsOpen = value;
      controls.syncSettingsOpen(value);
    },
    open(): void { harness.setSettingsOpen(true); },
    close(): void { harness.setSettingsOpen(false); },
  };
  // 旧 mount 末尾 settingsOpen.value = true：创建即打开（gen=1, req=1 的基准请求）。
  harness.open();
  return harness as typeof harness & Record<string, unknown>;
}

const deviceEvent = { target: { value: "device" } };
const flush = () => new Promise<void>((done) => setTimeout(done, 0));

describe("audio-controls（旧 audio-controls.test.mjs characterization 平移）", () => {
  it("a previous opening cannot publish its preparation error after reopening", async () => {
    const first = deferred(), second = deferred();
    let calls = 0;
    const { controls, setSettingsOpen } = mount({
      prepareInputDevices: () => (++calls === 1 ? first.promise : second.promise),
    });
    await flush();
    setSettingsOpen(false);
    await flush();
    setSettingsOpen(true);
    await flush();
    first.reject(new DOMException("old", "NotAllowedError"));
    await flush();
    expect(controls.store.getState().settingsError).toBe("");
    second.reject(new DOMException("current", "NotFoundError"));
    await flush();
    expect(controls.store.getState().settingsError).toMatch(/未找到可用的麦克风/);
  });
  it("a completed newer device selection retires older errors", async () => {
    const old = deferred();
    const { controls } = mount({ setOutputDevice: () => old.promise, setInputDevice: async () => {} });
    await flush();
    const pending = controls.onOutputDeviceChange(deviceEvent);
    await controls.onInputDeviceChange(deviceEvent);
    old.reject(new Error("old output"));
    await pending;
    expect(controls.store.getState().settingsError).toBe("");
  });

  it("an earlier selection cannot replace the current selection's error", async () => {
    const old = deferred();
    const { controls } = mount({
      setInputDevice: () => old.promise,
      setOutputDevice: async () => { throw new Error("current output"); },
    });
    await flush();
    const pending = controls.onInputDeviceChange(deviceEvent);
    await controls.onOutputDeviceChange(deviceEvent);
    old.reject(new DOMException("old input", "NotAllowedError"));
    await pending;
    expect(controls.store.getState().settingsError).toBe("current output");
  });

  it("closing immediately cancels the test UI and ignores its late rejection", async () => {
    const testStart = deferred();
    const { controls, close, stops } = mount({ startMicrophoneTest: () => testStart.promise });
    await flush();
    const pending = controls.toggleMicTest();
    close();
    expect(stops).toEqual(["stop"]);
    testStart.reject(new Error("old recording"));
    await pending;
    expect(controls.store.getState().settingsError).toBe("");
  });

  it("unmount stops recording and retires device preparation", async () => {
    const preparation = deferred();
    const { controls, stops } = mount({ prepareInputDevices: () => preparation.promise });
    await flush();
    controls.dispose();
    expect(stops).toEqual(["stop"]);
    preparation.reject(new DOMException("old", "NotAllowedError"));
    await flush();
    expect(controls.store.getState().settingsError).toBe("");
  });

  it("volume and threshold adapters scale raw slider values", () => {
    const sent: Record<string, number> = {};
    const { controls } = mount({
      setInputVolume: (v: number) => { sent.input = v; },
      setOutputVolume: (v: number) => { sent.output = v; },
      setVoxThreshold: (v: number) => { sent.vox = v; },
      setNotificationVolume: (v: number) => { sent.notification = v; },
    });
    controls.onInputVolume({ target: { value: "60" } });
    controls.onOutputVolume({ target: { value: "40" } });
    controls.onVoxThreshold({ target: { value: "25" } });
    controls.onNotificationVolume({ target: { value: "80" } });
    expect(sent).toEqual({ input: 0.6, output: 0.4, vox: 0.025, notification: 0.8 });
  });

  it("toggleMicrophone announces the post-toggle state", () => {
    let muted = false;
    const toasts: string[] = [];
    const { controls } = mount({
      getMicrophoneMuted: () => muted,
      setMicrophoneMuted: (value: boolean) => { muted = value; },
      showToast: (message: string) => toasts.push(message),
      t: (key: string) => key,
    });
    controls.toggleMicrophone();
    controls.toggleMicrophone();
    expect(toasts).toEqual(["microphoneMuted", "microphoneActive"]);
    expect(muted).toBe(false);
  });

  it("toggleAccompaniment dispatches the toast by the reported error code", async () => {
    let active = false;
    let errorCode = "";
    const toasts: Array<[string, string | undefined]> = [];
    const { controls } = mount({
      getAccompanimentActive: () => active,
      getAccompanimentErrorCode: () => errorCode,
      startAccompaniment: async () => { throw new Error("denied"); },
      stopAccompaniment: async () => { active = false; },
      showToast: (message: string, tone?: string) => toasts.push([message, tone]),
      t: (key: string) => key,
    });
    errorCode = "needsWebRtc";
    await controls.toggleAccompaniment();
    active = true;
    errorCode = "";
    await controls.toggleAccompaniment();
    expect(toasts).toEqual([["accompanimentNeedsWebRtc", "warn"], ["accompanimentStopped", undefined]]);
  });

  it("meterBarHeight stays flat when idle and scales with mic level while testing", () => {
    let testing = false;
    let micLevel = 0;
    const { controls } = mount({
      getMicrophoneTestActive: () => testing,
      getMicLevel: () => micLevel,
    });
    expect(controls.meterBarHeight(1)).toBe(5);
    testing = true;
    micLevel = 1;
    expect(controls.meterBarHeight(1)).toBe(38);
    expect(controls.meterBarHeight(24)).toBe(17);
  });
});

describe("audio-controls 耳语 PTT（旧 whisper characterization 平移）", () => {
  function whisperFixture(targetCount = 0) {
    const sent: boolean[] = [];
    const captures = new Set<number>();
    const target = {
      focus() {},
      setPointerCapture: (id: number) => captures.add(id),
      hasPointerCapture: (id: number) => captures.has(id),
      releasePointerCapture: (id: number) => captures.delete(id),
    };
    const harness = mount({ getWhisperTargetCount: () => targetCount, setWhisperActive: (active: boolean) => sent.push(active) });
    const pointer = (id = 1, button = 0, isPrimary = true): PointerEvent => ({ pointerId: id, button, isPrimary, currentTarget: target }) as unknown as PointerEvent;
    return { ...harness, sent, captures, pointer };
  }
  const keyEvent = (key: string, extra: Record<string, unknown> = {}): KeyboardEvent => ({ key, preventDefault() {}, ...extra }) as unknown as KeyboardEvent;

  it("secondary buttons and non-primary pointers cannot start whispering", () => {
    const { controls, pointer, sent } = whisperFixture(1);
    controls.onWhisperPttDown(pointer(1, 2));
    controls.onWhisperPttDown(pointer(2, 0, false));
    expect(sent).toEqual([]);
  });

  it("only the pointer that started whispering may release it", () => {
    const { controls, pointer, sent, captures } = whisperFixture(1);
    controls.onWhisperPttDown(pointer());
    controls.onWhisperPttUp(pointer(2));
    expect(controls.store.getState().whisperPttActive).toBe(true);
    controls.onWhisperPttDown(pointer(2));
    controls.onWhisperPttUp(pointer());
    controls.onWhisperPttUp(pointer());
    expect(sent).toEqual([true, false]);
    expect(captures.size).toBe(0);
  });

  it("capture failure does not leave whisper enabled", () => {
    const { controls, pointer, sent } = whisperFixture(1);
    const event = pointer();
    (event.currentTarget as unknown as { setPointerCapture: () => void }).setPointerCapture = () => { throw new Error("pointer no longer active"); };
    expect(() => controls.onWhisperPttDown(event)).not.toThrow();
    expect(sent).toEqual([]);
  });

  it("keyboard whisper ignores repeat and unrelated releases", () => {
    const { controls, sent, pointer } = whisperFixture(1);
    controls.onWhisperPttKeyDown(keyEvent(" "));
    controls.onWhisperPttKeyDown(keyEvent(" ", { repeat: true }));
    controls.onWhisperPttKeyUp(keyEvent("Enter"));
    controls.onWhisperPttUp(pointer());
    expect(controls.store.getState().whisperPttActive).toBe(true);
    controls.onWhisperPttKeyUp(keyEvent(" "));
    controls.onWhisperPttKeyDown(keyEvent("Enter"));
    controls.stopWhisperTalk();
    controls.onWhisperPttKeyUp(keyEvent("Enter"));
    expect(sent).toEqual([true, false, true, false]);
  });

  it("dispose releases an active whisper and its capture", () => {
    const { controls, sent, captures, pointer } = whisperFixture(1);
    controls.onWhisperPttDown(pointer());
    controls.dispose();
    expect(sent).toEqual([true, false]);
    expect(captures.size).toBe(0);
  });

  it("an empty whisper target list blocks both pointer and keyboard starts", () => {
    const { controls, pointer, sent } = whisperFixture(0);
    controls.onWhisperPttDown(pointer());
    controls.onWhisperPttKeyDown(keyEvent(" "));
    expect(sent).toEqual([]);
    expect(controls.store.getState().whisperPttActive).toBe(false);
  });
});
