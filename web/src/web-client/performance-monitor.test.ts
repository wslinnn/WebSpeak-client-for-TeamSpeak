import { describe, expect, it } from "vitest";

import { createPerformanceMonitor, computeVoiceStats, type PerformanceMonitor, type VoiceAudioStats } from "./performance-monitor";
import type { VoiceAudioStatusSample } from "@/voice/audio-diagnostics";

function deferred(): { promise: Promise<VoiceAudioStatusSample | null>; resolve: (value: VoiceAudioStatusSample | null) => void } {
  let resolve!: (value: VoiceAudioStatusSample | null) => void;
  const promise = new Promise<VoiceAudioStatusSample | null>((done) => { resolve = done; });
  return { promise, resolve };
}

function sample(extra: Partial<VoiceAudioStatusSample> = {}, bridge: Record<string, number> = {}, browser: Record<string, number> = {}): VoiceAudioStatusSample {
  return {
    scopeId: 1, sampledAt: 1_000, transport: "webrtc", connectionState: "connected",
    microphoneMuted: false, microphoneReady: true, microphonePermission: "granted", playbackState: "playing",
    bridge: { transport: "webrtc", tsSendFrames: 0, tsSendErrors: 0, egressFrames: 0,
      ingressDroppedFrames: 0, egressDroppedFrames: 0, webrtcIngressDecodeErrors: 0,
      webrtcDownlinkDecodeErrors: 0, webrtcQueueDroppedFrames: 0, webrtcQueueUnderrunTicks: 0,
      ingressMaxGapMs: 0, egressMaxGapMs: 0, ...bridge },
    browser: { outboundBytes: 0, outboundPackets: 0, outboundPacketsLost: 0, outboundLossPercent: 0,
      outboundRttMs: 20, inboundBytes: 0, inboundPackets: 0, inboundPacketsLost: 0, inboundLossPercent: 0,
      inboundJitterMs: 5, concealedSamples: 0, ...browser },
    fallbackPlayback: { framesReceived: 0, framesDropped: 0, decodeErrors: 0 },
    ...extra,
  } as VoiceAudioStatusSample;
}

interface Harness {
  monitor: PerformanceMonitor;
  setConnected(value: boolean): void;
  setMeasure(value: () => Promise<VoiceAudioStatusSample | null>): void;
  ticks(): Array<() => void>;
  stats(): VoiceAudioStats;
  flush(): Promise<void>;
}

async function mountHarness(openPanel = true, initialMeasure?: () => Promise<VoiceAudioStatusSample | null>): Promise<Harness> {
  const intervals = new Map<object, () => void>();
  let connected = true;
  let measureImpl: () => Promise<VoiceAudioStatusSample | null> = initialMeasure ?? (async () => sample());
  const monitor = createPerformanceMonitor({
    isConnected: () => connected,
    measure: () => measureImpl(),
    setInterval: (callback, ms) => {
      expect(ms).toBe(2_000);
      const timer = {};
      intervals.set(timer, callback);
      return timer;
    },
    clearInterval: (timer) => { intervals.delete(timer as object); },
  });
  const harness: Harness = {
    monitor,
    setConnected(value: boolean) { connected = value; monitor.syncGating(); },
    setMeasure(value: () => Promise<VoiceAudioStatusSample | null>) { measureImpl = value; },
    ticks: () => [...intervals.values()],
    stats: () => computeVoiceStats(monitor.store.getState().latest, monitor.store.getState().previous, connected),
    flush: () => new Promise<void>((done) => setTimeout(done, 0)),
  };
  if (openPanel) {
    monitor.setPanelOpen(true);
    // 旧 mount 末尾 await nextTurn()：开面板的首探针在 mount 内落地，
    // 后续 refresh 不会被 in-flight 的 running 门吞掉。
    await harness.flush();
  }
  return harness;
}

const nextTurn = () => new Promise<void>((done) => setTimeout(done, 0));

describe("performance-monitor（旧 voice-performance.test.mjs characterization 平移）", () => {
  it("probes only run while the performance panel is open", async () => {
    let calls = 0;
    const harness = await mountHarness(false);
    harness.setMeasure(async () => { calls++; return sample(); });
    await harness.flush();
    expect(harness.ticks().length).toBe(0);
    expect(harness.stats().ready).toBe(false);
    harness.monitor.setPanelOpen(true);
    await harness.flush();
    expect(harness.ticks().length).toBe(1);
    expect(calls).toBe(1);
    harness.monitor.setPanelOpen(false);
    await harness.flush();
    expect(harness.ticks().length).toBe(0);
  });

  it("transport changes do not subtract RTP packets from compatibility frames", async () => {
    const harness = await mountHarness();
    harness.setMeasure(async () => sample({}, {}, { inboundPackets: 20 }));
    await harness.monitor.refresh();
    await harness.flush();
    harness.setMeasure(async () => sample({ transport: "websocket", sampledAt: 3_000,
      fallbackPlayback: { framesReceived: 200, framesDropped: 0, decodeErrors: 0 } }));
    await harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().downlinkFramesPerSecond).toBeNull();
    expect(harness.stats().health).toBe("quiet");
  });

  it("replacement peers and reconnects start a fresh counter baseline", async () => {
    const harness = await mountHarness();
    await harness.monitor.refresh();
    harness.setMeasure(async () => sample({ scopeId: 2, sampledAt: 3_000 }, { tsSendFrames: 500, tsSendErrors: 10 },
      { outboundBytes: 50_000, inboundBytes: 40_000, inboundPackets: 200 }));
    await harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().uplinkFramesPerSecond).toBeNull();
    expect(harness.stats().uplinkBitrateKbps).toBeNull();
    expect(harness.stats().downlinkFramesPerSecond).toBeNull();
    expect(harness.stats().sendErrors).toBeNull();
    expect(harness.stats().health).toBe("quiet");
    harness.setMeasure(async () => sample({ scopeId: 2, sampledAt: 5_000 }, { tsSendFrames: 600, tsSendErrors: 10 },
      { outboundBytes: 58_000, inboundBytes: 44_000, inboundPackets: 300 }));
    await harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().uplinkFramesPerSecond).toBe(50);
    expect(harness.stats().downlinkFramesPerSecond).toBe(50);
    expect(harness.stats().uplinkBitrateKbps).toBe(32);
    expect(harness.stats().health).toBe("active");
  });

  it("temporarily missing RTP stats do not turn bridge counters into packet deltas", async () => {
    const harness = await mountHarness();
    harness.setMeasure(async () => sample({}, { egressFrames: 1_000 }, { inboundPackets: 20 }));
    await harness.monitor.refresh();
    harness.setMeasure(async () => sample({ sampledAt: 3_000, browser: null }, { egressFrames: 1_100 }));
    await harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().downlinkFramesPerSecond).toBeNull();
    harness.setMeasure(async () => sample({ sampledAt: 5_000, browser: null }, { egressFrames: 1_200 }));
    await harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().downlinkFramesPerSecond).toBe(50);
  });

  it("a missing sample clears stale activity and a later sample starts a new baseline", async () => {
    const harness = await mountHarness();
    harness.setMeasure(async () => sample({ sampledAt: 3_000 }, { tsSendFrames: 100 }));
    await harness.monitor.refresh();
    expect(harness.stats().health).toBe("active");
    harness.setMeasure(async () => null);
    await harness.monitor.refresh();
    expect(harness.stats().ready).toBe(false);
    expect(harness.stats().health).toBe("sampling");
    expect(harness.monitor.store.getState().running).toBe(false);
    harness.setMeasure(async () => sample({ sampledAt: 7_000 }, { tsSendFrames: 300 }));
    await harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().uplinkFramesPerSecond).toBeNull();
  });

  it("a rejected probe is contained and the next refresh can recover", async () => {
    const harness = await mountHarness();
    harness.setMeasure(async () => { throw new Error("Stats unavailable"); });
    harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().ready).toBe(false);
    expect(harness.monitor.store.getState().running).toBe(false);
    harness.setMeasure(async () => sample());
    harness.monitor.refresh();
    await harness.flush();
    expect(harness.stats().ready).toBe(true);
  });

  it("a queued old polling callback cannot start work or wedge a replacement connection", async () => {
    let calls = 0;
    const harness = await mountHarness();
    harness.setMeasure(async () => { calls++; return sample(); });
    await harness.flush();
    const oldTick = harness.ticks()[0]!;
    harness.setConnected(false);
    await nextTurn();
    expect(harness.ticks().length).toBe(0);
    harness.setConnected(true);
    await nextTurn();
    const callsBefore = calls;
    oldTick();
    await nextTurn();
    expect(calls).toBe(callsBefore);
    expect(harness.monitor.store.getState().running).toBe(false);
    harness.monitor.refresh();
    await nextTurn();
    expect(calls).toBe(callsBefore + 1);
  });

  it("dispose retires pending results, queued timers and manual refresh", async () => {
    const pending = deferred();
    let calls = 0;
    const harness = await mountHarness(true, () => { calls++; return pending.promise; });
    const oldTick = harness.ticks()[0]!;
    harness.monitor.dispose();
    expect(harness.ticks().length).toBe(0);
    oldTick();
    harness.monitor.refresh();
    pending.resolve(sample());
    await nextTurn();
    expect(calls).toBe(1);
    expect(harness.monitor.store.getState().running).toBe(false);
    expect(harness.stats().ready).toBe(false);
  });

  it("late samples from an old connection cannot replace current diagnostics", async () => {
    const pending = deferred();
    const harness = await mountHarness();
    harness.setMeasure(() => pending.promise);
    await harness.flush();
    harness.setConnected(false);
    await nextTurn();
    harness.setMeasure(async () => sample({ scopeId: 2, transport: "websocket" }));
    harness.setConnected(true);
    await nextTurn();
    pending.resolve(sample({ scopeId: 1, connectionState: "failed" }));
    await nextTurn();
    expect(harness.stats().transport).toBe("websocket");
    expect(harness.stats().health).toBe("quiet");
    expect(harness.monitor.store.getState().running).toBe(false);
  });
});
