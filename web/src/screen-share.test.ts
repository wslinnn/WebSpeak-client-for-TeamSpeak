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
  restartCalls = 0;
  receivers: Array<{ track: unknown; getStats: () => Promise<Map<string, Record<string, unknown>>> }> = [];
  ontrack: ((event: { track: unknown; streams: readonly unknown[] }) => void) | null = null;
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
  getReceivers() { return this.receivers; }
  addEventListener() { /* stub: gathering-complete logging is not unit-tested */ }
  removeEventListener() { /* stub */ }
  restartIce() { this.restartCalls++; }
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

test("a viewer's failed watch attempt never paints an error on the owner or stops the broadcast", async () => {
  await controller.startScreenShare();
  confirmStart("live-1");
  controller.handleMessage({ type: "screenShareSignal", streamId: "live-1", fromPeerId: "viewer-1", signal: { kind: "offer", sdp: "offer" } } as never);
  await nextTurn();
  const peer = Peer.instances.at(-1)!;
  assert.equal(sent.some(message => message.type === "screenShareSignal"), true);
  peer.connectionState = "failed";
  (peer as unknown as { onconnectionstatechange?: () => void }).onconnectionstatechange?.();
  assert.equal(peer.restartCalls, 1);
  assert.equal(SS().error, "");
  peer.connectionState = "failed";
  (peer as unknown as { onconnectionstatechange?: () => void }).onconnectionstatechange?.();
  assert.equal(peer.closed, true);
  assert.equal(SS().error, "");
  assert.equal(SS().active, true);
  assert.equal(SS().activeStreamId, "live-1");
  assert.equal(sent.some(message => message.type === "screenShareStop"), false);
  assert.equal(sent.some(message => message.type === "screenShareLeave"), false);
});

test("a stalled viewer negotiation retries once via ICE restart before failing locally", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
    await nextTurn();
    await nextTurn();
    assert.equal(sent.some(message => message.type === "screenShareSignal"), true);
    const peer = Peer.instances[0]!;
    await vi.advanceTimersByTimeAsync(15_000);
    assert.equal(peer.restartCalls, 1);
    assert.equal(SS().viewing, true);
    assert.equal(SS().error, "");
    await vi.advanceTimersByTimeAsync(15_000);
    assert.equal(peer.restartCalls, 1);
    assert.equal(SS().error.includes("协商超时"), true);
    assert.equal(SS().viewing, false);
    assert.equal(SS().remoteStream, null);
    assert.equal(sent.some(message => message.type === "screenShareLeave"), true);
  } finally {
    vi.useRealTimers();
  }
});

test("a late duplicate start acknowledgement never stops the live broadcast", async () => {
  await controller.startScreenShare();
  const requestId = sent.at(-1)?.requestId;
  confirmStart("live-1", requestId);
  assert.equal(SS().active, true);
  controller.handleMessage({ type: "screenShareStarted", owner: true, requestId: "stale", stream: { ...remote, streamId: "live-1" } } as never);
  assert.equal(sent.some(message => message.type === "screenShareStop"), false);
  assert.equal(SS().active, true);
  assert.equal(SS().activeStreamId, "live-1");
});

test("the viewer's share offer declares Opus stereo capability for the owner sender", async () => {
  Peer.offer = () => Promise.resolve({
    type: "offer",
    sdp: "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=fmtp:96 apt=111\r\n",
  });
  controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
  await nextTurn();
  const peer = Peer.instances[0]!;
  const sdp = (peer.localDescription as { sdp?: string } | null)?.sdp ?? "";
  assert.ok(sdp.includes("a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;maxaveragebitrate=510000"), "the opus line gains stereo for the P2P audio");
  assert.ok(sdp.includes("a=fmtp:96 apt=111\r\n"), "non-opus lines pass through unchanged");
});

test("the owner pins a music-grade send target on the audio sender", async () => {
  const videoTrack = new Track();
  const audioTrack = new Track();
  audioTrack.kind = "audio";
  const capture = {
    getTracks: () => [videoTrack, audioTrack],
    getVideoTracks: () => [videoTrack],
    getAudioTracks: () => [audioTrack],
  };
  Object.assign(globalThis.navigator as { mediaDevices: { getDisplayMedia: () => Promise<unknown> } }, {
    mediaDevices: { getDisplayMedia: async () => capture },
  });
  await controller.startScreenShare(true);
  confirmStart("live-1");
  controller.handleMessage({ type: "screenShareSignal", streamId: "live-1", fromPeerId: "viewer-1", signal: { kind: "offer", sdp: "offer" } } as never);
  await nextTurn();
  const peer = Peer.instances.at(-1)!;
  const encodings = ((peer.parameters ?? { encodings: [] }).encodings?.[0] ?? {}) as { maxBitrate?: number };
  assert.equal(encodings.maxBitrate, 128_000, "the audio sender carries the music bitrate target");
});

test("a decoded frame retires the first-frame proof silently", async () => {
  vi.stubGlobal("MediaStream", class {
    private readonly tracks: Track[];
    constructor(tracks?: Track[]) { this.tracks = [...(tracks ?? [])]; }
    addTrack(track: Track): void { this.tracks.push(track); }
    getTracks(): Track[] { return this.tracks; }
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
    await vi.advanceTimersByTimeAsync(0);
    const peer = Peer.instances[0]!;
    const proofTrack = new Track();
    peer.receivers = [{ track: proofTrack, getStats: () => Promise.resolve(new Map([["r1", { type: "inbound-rtp", kind: "video", framesDecoded: 5 }]])) }];
    peer.ontrack?.({ track: proofTrack, streams: [] } as never);
    await vi.advanceTimersByTimeAsync(600);
    assert.equal(SS().error, "", "a decoded frame is proof of a working watch");
    assert.equal(SS().viewing, true);
    assert.equal(sent.some(message => message.type === "screenShareLeave"), false);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.stubGlobal("RTCPeerConnection", Peer);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: async () => stream() } });
  }
});

test("a connected but frameless peer gets a stall diagnosis instead of an endless spinner", async () => {
  vi.stubGlobal("MediaStream", class {
    private readonly tracks: Track[];
    constructor(tracks?: Track[]) { this.tracks = [...(tracks ?? [])]; }
    addTrack(track: Track): void { this.tracks.push(track); }
    getTracks(): Track[] { return this.tracks; }
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
    await vi.advanceTimersByTimeAsync(0);
    const peer = Peer.instances[0]!;
    const proofTrack = new Track();
    peer.receivers = [{ track: proofTrack, getStats: () => Promise.resolve(new Map([["r1", { type: "inbound-rtp", kind: "video", framesDecoded: 0 }]])) }];
    peer.ontrack?.({ track: proofTrack, streams: [] } as never);
    peer.connectionState = "connected";
    await vi.advanceTimersByTimeAsync(10_500);
    assert.equal(SS().error.includes("直连已建立但迟迟没有画面帧"), true);
    assert.equal(SS().viewing, true, "stall diagnosis never tears the watch down by itself");
    assert.equal(sent.some(message => message.type === "screenShareLeave"), false);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.stubGlobal("RTCPeerConnection", Peer);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: async () => stream() } });
  }
});

test("ontrack no longer disarms the negotiation deadline for a slow-ICE viewer", async () => {
  vi.stubGlobal("MediaStream", class {
    private readonly tracks: Track[];
    constructor(tracks?: Track[]) { this.tracks = [...(tracks ?? [])]; }
    addTrack(track: Track): void { this.tracks.push(track); }
    getTracks(): Track[] { return this.tracks; }
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    controller.handleMessage({ type: "screenShareJoined", stream: remote } as never);
    await vi.advanceTimersByTimeAsync(0);
    const peer = Peer.instances[0]!;
    const proofTrack = new Track();
    peer.receivers = [{ track: proofTrack, getStats: () => Promise.resolve(new Map()) }];
    peer.ontrack?.({ track: proofTrack, streams: [] } as never);
    await vi.advanceTimersByTimeAsync(15_000);
    assert.equal(peer.restartCalls, 1, "the retry budget is consumed first");
    assert.equal(SS().error, "");
    await vi.advanceTimersByTimeAsync(15_000);
    assert.equal(SS().error.includes("协商超时"), true, "the negotiation deadline still owns never-connected failures");
    assert.equal(sent.some(message => message.type === "screenShareLeave"), true);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.stubGlobal("RTCPeerConnection", Peer);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: async () => stream() } });
  }
});

test("the owner's picture preference and codec choice reach the sender and transceiver", async () => {
  const codecs = [
    { mimeType: "video/vp8", clockRate: 90_000 },
    { mimeType: "video/h264", clockRate: 90_000, sdpFmtpLine: "packetization-mode=1;profile-level-id=42e01f" },
  ];
  vi.stubGlobal("RTCRtpSender", { getCapabilities: () => ({ codecs }) });
  await controller.startScreenShare(true, { codecPreference: "vp8", degradationPreference: "maintain-framerate" });
  confirmStart("live-1");
  controller.handleMessage({ type: "screenShareSignal", streamId: "live-1", fromPeerId: "viewer-1", signal: { kind: "offer", sdp: "offer" } } as never);
  await nextTurn();
  const peer = Peer.instances.at(-1)!;
  assert.equal(peer.codecPreferences[0]?.mimeType, "video/vp8", "a forced codec is promoted to the front");
  assert.equal(peer.codecPreferences.at(-1)?.mimeType, "video/h264", "the rest of the order stays as fallback");
  const parameters = peer.parameters as { degradationPreference?: string } | null;
  assert.equal(parameters?.degradationPreference, "maintain-framerate", "the picture preference rides the sender parameters");
});

test("an unrelated error cannot abort a pending start, a start rejection still can", async () => {
  const capture = stream();
  Object.assign(globalThis.navigator as { mediaDevices: { getDisplayMedia: () => Promise<unknown> } }, {
    mediaDevices: { getDisplayMedia: async () => capture },
  });
  await controller.startScreenShare();
  const requestId = sent.at(-1)?.requestId;
  controller.handleMessage({ type: "screenShareError", requestId: "other-request", code: "SCREEN_SHARE_SIGNAL_FAILED", message: "unrelated" } as never);
  assert.equal(SS().starting, true);
  assert.equal(capture.track.readyState, "live");
  controller.handleMessage({ type: "screenShareError", requestId, code: "SCREEN_SHARE_ERROR", message: "start rejected" } as never);
  assert.equal(SS().starting, false);
  assert.equal(capture.track.readyState, "ended");
});
