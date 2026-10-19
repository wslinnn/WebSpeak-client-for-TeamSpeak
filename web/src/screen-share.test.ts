// Ported from web/test/screen-share.test.ts (spec contract) — pure screen-share
// controller logic; Vue ref reads became store snapshot reads.
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createScreenShareController } from "./voice/screen-share";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

class Track extends EventTarget {
  kind = "video";
  readyState = "live";
  stop() { this.readyState = "ended"; }
  getSettings() { return { width: 1920, height: 1080, frameRate: 60 }; }
}
function stream() {
  const track = new Track();
  return { track, getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
}

class Peer {
  static instances: Peer[] = [];
  static offer = () => Promise.resolve({ type: "offer", sdp: "offer" });
  static stats = () => Promise.resolve(new Map());
  connectionState = "new";
  iceConnectionState = "new";
  localDescription: unknown;
  parameters: { encodings: Array<Record<string, unknown>> } | null = null;
  codecPreferences: Array<{ mimeType: string }> = [];
  closed = false;
  configuration: { iceServers?: unknown };
  private readonly transceivers: Array<Record<string, unknown>> = [];
  constructor(configuration: { iceServers?: unknown }) {
    this.configuration = configuration;
    Peer.instances.push(this);
  }
  createOffer() { return Peer.offer(); }
  createAnswer() { return Promise.resolve({ type: "answer", sdp: "answer" }); }
  setLocalDescription(description: unknown) { this.localDescription = description; return Promise.resolve(); }
  setRemoteDescription() { return Promise.resolve(); }
  addIceCandidate() { return Promise.resolve(); }
  addTransceiver(kind: string) {
    const transceiver = {
      sender: { track: null },
      receiver: { track: { kind } },
      setCodecPreferences: (codecs: Array<{ mimeType: string }>) => { this.codecPreferences = codecs; },
    };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  addTrack(track: { kind?: string }) {
    this.transceivers.push({
      sender: { track },
      receiver: { track: null },
      setCodecPreferences: (codecs: Array<{ mimeType: string }>) => { this.codecPreferences = codecs; },
    });
    return {
      getParameters: () => ({ encodings: [] as Array<Record<string, unknown>> }),
      setParameters: async (parameters: { encodings: Array<Record<string, unknown>> }) => { this.parameters = parameters; },
    };
  }
  getTransceivers() { return this.transceivers; }
  getStats() { return Peer.stats(); }
  close() { this.closed = true; this.connectionState = "closed"; }
}

let controller: ReturnType<typeof createScreenShareController>;
let sent: Array<{ type: string; requestId?: string }>;

const SS = () => controller.store.getState();

beforeEach(() => {
  Peer.instances = [];
  Peer.offer = () => Promise.resolve({ type: "offer", sdp: "offer" });
  Peer.stats = () => Promise.resolve(new Map());
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: async () => stream() } });
  sent = [];
  controller = createScreenShareController({ isOpen: () => true, send: message => sent.push(message as never) });
});
afterEach(() => {
  controller.stopTransport(false);
  vi.unstubAllGlobals();
});

const remote = { streamId: "remote-1", ownerPeerId: "owner", ownerNickname: "Owner", name: "Screen", source: "browser" as const, audio: false, createdAt: 1, viewerCount: 0 };
function confirmStart(streamId: string, requestId = [...sent].reverse().find(message => message.type === "screenShareStart")?.requestId) {
  controller.handleMessage({ type: "screenShareStarted", owner: true, requestId, stream: { ...remote, streamId } } as never);
}

test("cancelling a pending offer cannot send signaling or restore diagnostics after exit", async () => {
  const offer = deferred<{ type: string; sdp: string }>();
  const stats = deferred<Map<string, unknown>>();
  Peer.offer = () => offer.promise;
  Peer.stats = () => stats.promise;
  controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
  controller.stopTransport(false);
  offer.resolve({ type: "offer", sdp: "obsolete" });
  stats.resolve(new Map());
  await nextTurn();
  assert.equal(Peer.instances[0]?.closed, true);
  assert.deepEqual(sent, []);
  assert.equal(controller.statsStore.getState().updatedAt, null);
  assert.deepEqual(controller.statsStore.getState().peers, []);
});

test("a late start acknowledgement cannot cancel a newer capture", async () => {
  await controller.startScreenShare();
  const oldRequest = sent.at(-1)?.requestId;
  controller.stopScreenShare();
  await controller.startScreenShare();
  const newRequest = sent.at(-1)?.requestId;
  confirmStart("old", oldRequest);
  assert.equal(SS().starting, true);
  confirmStart("new", newRequest);
  assert.equal(SS().active, true);
  assert.equal(SS().activeStreamId, "new");
});

test("a superseded permission result preserves the newer capture's output settings", async () => {
  const oldCapture = deferred<ReturnType<typeof stream>>();
  Object.assign(globalThis.navigator as { mediaDevices: { getDisplayMedia: () => Promise<unknown> } }, {
    mediaDevices: { getDisplayMedia: () => oldCapture.promise },
  });
  const oldStart = controller.startScreenShare(true, { maxWidth: 960 });
  controller.stopScreenShare();
  Object.assign(globalThis.navigator as { mediaDevices: { getDisplayMedia: () => Promise<unknown> } }, {
    mediaDevices: { getDisplayMedia: async () => stream() },
  });
  await controller.startScreenShare(true, { maxWidth: 640 });
  confirmStart("new");
  const oldStream = stream();
  oldCapture.resolve(oldStream);
  await oldStart;
  controller.handleMessage({ type: "screenShareSignal", streamId: "new", fromPeerId: "viewer", signal: { kind: "offer", sdp: "offer" } } as never);
  await nextTurn();
  assert.equal(oldStream.track.readyState, "ended");
  const encodings = Peer.instances[0]?.parameters?.encodings ?? [];
  assert.equal((encodings[0] as { scaleResolutionDownBy?: number } | undefined)?.scaleResolutionDownBy, 3);
});

test("invalid capture without a video track still releases every returned track", async () => {
  const capture = stream();
  Object.assign(globalThis.navigator as { mediaDevices: { getDisplayMedia: () => Promise<unknown> } }, {
    mediaDevices: { getDisplayMedia: async () => ({ ...capture, getVideoTracks: () => [] }) },
  });
  await controller.startScreenShare();
  assert.equal(capture.track.readyState, "ended");
  assert.equal(SS().starting, false);
});

test("ICE configuration belongs to each controller independently", async () => {
  const second = createScreenShareController({ isOpen: () => true, send() {} });
  controller.setIceServers([{ urls: "stun:first.example" }]);
  second.setIceServers([{ urls: "stun:second.example" }]);
  try {
    controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
    second.handleMessage({ type: "screenShareJoined", stream: remote } as never);
    await nextTurn();
    assert.deepEqual(Peer.instances.map(peer => peer.configuration.iceServers), [
      [{ urls: "stun:first.example" }], [{ urls: "stun:second.example" }],
    ]);
  } finally { second.stopTransport(false); }
});

test("screen share codecs are ordered H.264, AV1, then VP8 independent of browser order", async () => {
  const codecs = [
    { mimeType: "video/vp8", clockRate: 90_000 },
    { mimeType: "video/rtx", clockRate: 90_000, sdpFmtpLine: "apt=96" },
    { mimeType: "video/av1", clockRate: 90_000 },
    { mimeType: "video/h264", clockRate: 90_000, sdpFmtpLine: "packetization-mode=1;profile-level-id=42e01f" },
  ];
  vi.stubGlobal("RTCRtpSender", { getCapabilities: () => ({ codecs }) });
  controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
  await nextTurn();
  assert.deepEqual(Peer.instances[0]?.codecPreferences.map(codec => codec.mimeType), [
    "video/h264", "video/av1", "video/vp8", "video/rtx",
  ]);
});

test("AV1 keeps its fallback priority over VP8 when the browser has no H.264", async () => {
  const codecs = [
    { mimeType: "video/vp8", clockRate: 90_000 },
    { mimeType: "video/av1", clockRate: 90_000 },
    { mimeType: "video/rtx", clockRate: 90_000, sdpFmtpLine: "apt=96" },
  ];
  vi.stubGlobal("RTCRtpSender", { getCapabilities: () => ({ codecs }) });
  controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
  await nextTurn();
  assert.deepEqual(Peer.instances[0]?.codecPreferences.map(codec => codec.mimeType), [
    "video/av1", "video/vp8", "video/rtx",
  ]);
});
