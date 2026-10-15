import { createStore } from "zustand";

import type { VoiceAudioStatusSample } from "@/voice/audio-diagnostics";

const SAMPLE_INTERVAL_MS = 2_000;

export type VoiceAudioHealth = "disconnected" | "sampling" | "connecting" | "warning" | "active" | "quiet";

export interface PerformanceMonitorStore {
  panelOpen: boolean;
  running: boolean;
  latest: VoiceAudioStatusSample | null;
  previous: VoiceAudioStatusSample | null;
}

interface PerformanceMonitorOptions {
  isConnected(): boolean;
  measure(): Promise<VoiceAudioStatusSample | null>;
  /** 定时器注入（生产默认 window.*，测试注入手动 tick 桩）。 */
  setInterval?(callback: () => void, ms: number): unknown;
  clearInterval?(timer: unknown): void;
}

function counterDelta(current: number, previous: number | undefined): number | null {
  if (previous === undefined || current < previous) return null;
  return current - previous;
}

function ratePerSecond(current: number, previous: number | undefined, elapsedMs: number): number | null {
  const delta = counterDelta(current, previous);
  if (delta === null || elapsedMs < 250) return null;
  return Math.round((delta * 1_000) / elapsedMs);
}

function bitrateKbps(current: number | null, previous: number | null | undefined, elapsedMs: number): number | null {
  if (current === null || previous == null || current < previous || elapsedMs < 250) return null;
  return Math.round(((current - previous) * 8) / elapsedMs);
}

function intervalLossPercent(
  currentReceived: number | null | undefined,
  previousReceived: number | null | undefined,
  currentLost: number | null | undefined,
  previousLost: number | null | undefined,
  fallback: number | null,
  packetsIncludeLost = false,
): number | null {
  if (currentReceived == null || previousReceived == null || currentLost == null || previousLost == null) return fallback;
  const receivedDelta = counterDelta(currentReceived, previousReceived);
  const lostDelta = counterDelta(Math.max(0, currentLost), Math.max(0, previousLost));
  if (receivedDelta === null || lostDelta === null) return fallback;
  const total = receivedDelta + (packetsIncludeLost ? 0 : lostDelta);
  return total > 0 ? Math.min(100, (lostDelta / total) * 100) : fallback;
}

function downlinkCounter(sample: VoiceAudioStatusSample | null) {
  if (!sample) return null;
  if (sample.transport === "websocket") return { source: "pcm", value: sample.fallbackPlayback.framesReceived };
  if (sample.transport === "webrtc" && sample.browser?.inboundPackets != null) return { source: "rtp", value: sample.browser.inboundPackets };
  return { source: "bridge", value: sample.bridge.egressFrames };
}

export interface VoiceAudioStats {
  ready: boolean;
  health: VoiceAudioHealth;
  transport: VoiceAudioStatusSample["transport"];
  connectionState: string | null;
  microphoneMuted: boolean;
  microphoneReady: boolean;
  microphonePermission: string;
  playbackState: VoiceAudioStatusSample["playbackState"];
  uplinkFramesPerSecond: number | null;
  downlinkFramesPerSecond: number | null;
  uplinkBitrateKbps: number | null;
  downlinkBitrateKbps: number | null;
  uplinkLossPercent: number | null;
  uplinkRttMs: number | null;
  downlinkLossPercent: number | null;
  downlinkJitterMs: number | null;
  concealedSamples: number | null;
  sendErrors: number | null;
  droppedFrames: number | null;
  ingressMaxGapMs: number | null;
  egressMaxGapMs: number | null;
}

/** 双样本差分 → 展示统计（旧 stats computed 平价）：不同 scopeId/transport 的
 *  样本互不差分（重连/降级即新基线），elapse < 250ms 不出速率。 */
export function computeVoiceStats(
  current: VoiceAudioStatusSample | null,
  prior: VoiceAudioStatusSample | null,
  isConnected: boolean,
): VoiceAudioStats {
  const previous = current && prior && current.scopeId === prior.scopeId && current.transport === prior.transport ? prior : null;
  const elapsedMs = current && previous ? current.sampledAt - previous.sampledAt : 0;
  const bridge = current?.bridge;
  const previousBridge = previous?.bridge;
  const browser = current?.browser;
  const previousBrowser = previous?.browser;
  const uplinkFramesPerSecond = bridge
    ? ratePerSecond(bridge.tsSendFrames, previousBridge?.tsSendFrames, elapsedMs)
    : null;
  const downlink = downlinkCounter(current);
  const priorDownlink = downlinkCounter(previous);
  const downlinkFramesPerSecond = downlink && priorDownlink && downlink.source === priorDownlink.source
    ? ratePerSecond(downlink.value, priorDownlink.value, elapsedMs) : null;
  const uplinkLossPercent = browser
    ? intervalLossPercent(browser.outboundPackets, previousBrowser?.outboundPackets, browser.outboundPacketsLost, previousBrowser?.outboundPacketsLost, browser.outboundLossPercent, true)
    : null;
  const downlinkLossPercent = browser
    ? intervalLossPercent(browser.inboundPackets, previousBrowser?.inboundPackets, browser.inboundPacketsLost, previousBrowser?.inboundPacketsLost, browser.inboundLossPercent)
    : null;
  const recentErrors = bridge && previousBridge
    ? (counterDelta(bridge.tsSendErrors, previousBridge.tsSendErrors) ?? 0)
      + (counterDelta(bridge.ingressDroppedFrames, previousBridge.ingressDroppedFrames) ?? 0)
      + (counterDelta(bridge.egressDroppedFrames, previousBridge.egressDroppedFrames) ?? 0)
      + (counterDelta(bridge.webrtcDownlinkDroppedFrames, previousBridge.webrtcDownlinkDroppedFrames) ?? 0)
      + (counterDelta(current?.fallbackPlayback.decodeErrors ?? 0, previous?.fallbackPlayback.decodeErrors ?? 0) ?? 0)
    : 0;
  const uplinkBitrateKbps = browser ? bitrateKbps(browser.outboundBytes, previousBrowser?.outboundBytes, elapsedMs) : null;
  const downlinkBitrateKbps = browser ? bitrateKbps(browser.inboundBytes, previousBrowser?.inboundBytes, elapsedMs) : null;
  const mediaIsActive = (uplinkFramesPerSecond ?? 0) > 0
    || (downlinkFramesPerSecond ?? 0) > 0
    || (uplinkBitrateKbps ?? 0) > 0
    || (downlinkBitrateKbps ?? 0) > 0;
  const playbackBlocked = (downlinkFramesPerSecond ?? 0) > 0
    && (current?.playbackState === "paused" || current?.playbackState === "unavailable");
  let health: VoiceAudioHealth = "sampling";
  if (!isConnected) health = "disconnected";
  else if (current) {
    if (current.connectionState === "failed" || recentErrors > 0 || playbackBlocked || (!current.microphoneMuted && (current.microphonePermission === "denied" || (current.microphonePermission === "granted" && !current.microphoneReady)))) health = "warning";
    else if (current.transport === "negotiating" || (current.transport === "webrtc" && current.connectionState && current.connectionState !== "connected")) health = "connecting";
    else health = mediaIsActive ? "active" : "quiet";
  }

  return {
    ready: current !== null,
    health,
    transport: current?.transport ?? "disconnected",
    connectionState: current?.connectionState ?? null,
    microphoneMuted: current?.microphoneMuted ?? false,
    microphoneReady: current?.microphoneReady ?? false,
    microphonePermission: current?.microphonePermission ?? "unknown",
    playbackState: current?.playbackState ?? null,
    uplinkFramesPerSecond,
    downlinkFramesPerSecond,
    uplinkBitrateKbps,
    downlinkBitrateKbps,
    uplinkLossPercent,
    uplinkRttMs: browser?.outboundRttMs ?? null,
    downlinkLossPercent,
    downlinkJitterMs: browser?.inboundJitterMs ?? null,
    concealedSamples: browser?.concealedSamples ?? null,
    sendErrors: bridge && previousBridge ? counterDelta(bridge.tsSendErrors, previousBridge.tsSendErrors) : null,
    droppedFrames: bridge && previousBridge
      ? (counterDelta(bridge.ingressDroppedFrames, previousBridge.ingressDroppedFrames) ?? 0)
        + (counterDelta(bridge.egressDroppedFrames, previousBridge.egressDroppedFrames) ?? 0)
        + (counterDelta(bridge.webrtcDownlinkDroppedFrames, previousBridge.webrtcDownlinkDroppedFrames) ?? 0)
        + (counterDelta(current?.fallbackPlayback.framesDropped ?? 0, previous?.fallbackPlayback.framesDropped ?? 0) ?? 0)
      : null,
    ingressMaxGapMs: bridge?.ingressMaxGapMs ?? null,
    egressMaxGapMs: bridge?.egressMaxGapMs ?? null,
  };
}

/** 性能面板监视器（旧 useWebClientPerformance 平价）：探针循环面板私有——只在
 *  面板可展示时采样（门控：connected && panelOpen），不为主连接全程轮询。代际
 *  纪律：连接更换/停止即作废在途探针与排队 tick。旧 watch([connected, panelOpen])
 *  显式化为 syncGating(isConnected)（视图 effect 调）+ 面板开关内部自查。 */
export function createPerformanceMonitor(options: PerformanceMonitorOptions) {
  const setIntervalImpl = options.setInterval ?? ((callback: () => void, ms: number) => window.setInterval(callback, ms));
  const clearIntervalImpl = options.clearInterval ?? ((timer: unknown) => window.clearInterval(timer as number));
  const store = createStore<PerformanceMonitorStore>(() => ({ panelOpen: false, running: false, latest: null, previous: null }));
  let timer: unknown = null;
  let generation = 0;
  let disposed = false;

  async function runProbe(expectedGeneration = generation): Promise<void> {
    if (disposed || expectedGeneration !== generation || store.getState().running || !options.isConnected()) return;
    store.setState({ running: true });
    try {
      const sample = await options.measure();
      if (expectedGeneration !== generation || !options.isConnected()) return;
      store.setState({ previous: sample ? store.getState().latest : null, latest: sample });
    } catch {
      if (expectedGeneration === generation) {
        store.setState({ latest: null, previous: null });
      }
    } finally {
      if (expectedGeneration === generation) store.setState({ running: false });
    }
  }

  function stop(): void {
    if (timer !== null) {
      clearIntervalImpl(timer);
      timer = null;
    }
    generation += 1;
    store.setState({ running: false, latest: null, previous: null });
  }

  function start(): void {
    if (timer !== null || !options.isConnected()) return;
    const activeGeneration = ++generation;
    void runProbe(activeGeneration);
    timer = setIntervalImpl(() => { void runProbe(activeGeneration); }, SAMPLE_INTERVAL_MS);
  }

  /** 旧 watch([connected, panelOpen]) 平价：开跑/停采的单一判定点。 */
  function applyGating(): void {
    const shouldRun = options.isConnected() && store.getState().panelOpen;
    if (shouldRun) start();
    else stop();
  }

  function setPanelOpen(open: boolean): void {
    store.setState({ panelOpen: open });
    applyGating();
  }

  function togglePanel(): void {
    setPanelOpen(!store.getState().panelOpen);
  }

  function refresh(): void {
    void runProbe();
  }

  function syncGating(): void {
    applyGating();
  }

  function dispose(): void {
    disposed = true;
    stop();
  }

  return { store, setPanelOpen, togglePanel, refresh, syncGating, dispose };
}

export type PerformanceMonitor = ReturnType<typeof createPerformanceMonitor>;
export { SAMPLE_INTERVAL_MS };
