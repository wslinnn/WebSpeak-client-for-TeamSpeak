import { vi } from "vitest";

/** Ported verbatim from web/test/voice-session.test.mjs: the spec's network and
 *  media doubles. Only browser/network boundaries are simulated; these stubs
 *  make no claim about real audio quality. */

export class TestSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: TestSocket[] = [];
  readyState = TestSocket.OPEN;
  bufferedAmount = 0;
  messages: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    TestSocket.instances.push(this);
  }
  send(raw: string | ArrayBuffer) { this.messages.push(typeof raw === "string" ? JSON.parse(raw) : raw); }
  close(code = 1000) {
    this.readyState = TestSocket.CLOSED;
    this.onclose?.({ code, reason: "" });
  }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

export class TestTrack extends EventTarget {
  kind = "video";
  readyState = "live";
  stopped = 0;
  stop() { this.stopped++; this.readyState = "ended"; }
  getSettings() { return { displaySurface: "monitor", width: 1920, height: 1080, frameRate: 60 }; }
  async applyConstraints() {}
}

export class AudioNodeStub {
  gain = { value: 1 };
  disconnects = 0;
  connect() {}
  disconnect() { this.disconnects++; }
}

export class AudioSourceStub extends EventTarget {
  static failStart = false;
  stopped = 0;
  disconnects = 0;
  startedAt: number | undefined;
  connect() {}
  disconnect() { this.disconnects++; }
  start(time: number) { if (AudioSourceStub.failStart) throw new Error("Source cannot start"); this.startedAt = time; }
  stop() { this.stopped++; }
}

export class AudioDecoderStub {
  static instances: AudioDecoderStub[] = [];
  static failConfigure = false;
  decodeQueueSize = 0;
  closed = 0;
  lastChunk: unknown;
  callbacks: unknown;
  constructor(callbacks: unknown) {
    this.callbacks = callbacks;
    AudioDecoderStub.instances.push(this);
  }
  configure() { if (AudioDecoderStub.failConfigure) throw new Error("Codec unavailable"); }
  decode(chunk: unknown) { this.lastChunk = chunk; }
  close() { this.closed++; }
}

export class RecorderStub {
  static instances: RecorderStub[] = [];
  static failStart = false;
  state = "inactive";
  mimeType = "audio/webm";
  stops = 0;
  stream: unknown;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(stream: unknown) {
    this.stream = stream;
    RecorderStub.instances.push(this);
  }
  start() { if (RecorderStub.failStart) throw new Error("Recorder start failed"); this.state = "recording"; }
  stop() { this.stops++; this.state = "inactive"; }
  finish() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["audio"]) }); this.onstop?.(); }
}

export function decodedChunk() {
  return { sampleRate: 48000, numberOfChannels: 1, numberOfFrames: 960, closed: 0, copyTo() {}, close() { this.closed++; } };
}

export function receiveAudio(socket: TestSocket, clientId = 7) {
  socket.onmessage?.({ data: new Uint8Array([4, clientId >> 8, clientId & 255, 1, 2, 3]).buffer });
}

export class AudioContextStub extends EventTarget {
  static instances: AudioContextStub[] = [];
  static processors: AudioNodeStub[] = [];
  static sources: AudioSourceStub[] = [];
  static gains: AudioNodeStub[] = [];
  static mediaSources: AudioNodeStub[] = [];
  static destinations: Array<AudioNodeStub & { stream: ReturnType<typeof microphoneStream> }> = [];
  state = "running";
  currentTime = 0;
  sampleRate = 48000;
  destination = new AudioNodeStub();
  sinkId: string | undefined;
  constructor() {
    super();
    AudioContextStub.instances.push(this);
  }
  async setSinkId(id: string) { this.sinkId = id; }
  close() { this.state = "closed"; return Promise.resolve(); }
  createMediaStreamSource(stream: unknown) {
    if (this.state === "closed") throw new Error("Audio context closed");
    const node = Object.assign(new AudioNodeStub(), { stream });
    AudioContextStub.mediaSources.push(node);
    return node;
  }
  createMediaStreamDestination() {
    const node = Object.assign(new AudioNodeStub(), { stream: microphoneStream() });
    AudioContextStub.destinations.push(node);
    return node;
  }
  createGain() { const node = new AudioNodeStub(); AudioContextStub.gains.push(node); return node; }
  createDynamicsCompressor() {
    // 参数面与真实 DynamicsCompressorNode 对齐：mic-capture 只读写 .value。
    return Object.assign(new AudioNodeStub(), {
      threshold: { value: -24 }, knee: { value: 30 }, ratio: { value: 12 },
      attack: { value: 0.003 }, release: { value: 0.25 }, reduction: 0,
    });
  }
  createAnalyser() {
    // Silent by default: the multi-track playback polls each slot analyser
    // for speaking detection, and empty samples keep every slot quiet.
    return Object.assign(new AudioNodeStub(), {
      fftSize: 2048,
      getFloatTimeDomainData(target: Float32Array) { target.fill(0); },
    });
  }
  createBuffer(_channels: number, frames: number, sampleRate: number) {
    return { duration: frames / sampleRate, copyToChannel() {} };
  }
  createBufferSource() { const node = new AudioSourceStub(); AudioContextStub.sources.push(node); return node; }
  createScriptProcessor() { const node = new AudioNodeStub(); AudioContextStub.processors.push(node); return node; }
  createOscillator() {
    return { frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
  }
}

export function microphoneStream() {
  const track = new TestTrack();
  track.kind = "audio";
  return { track, getTracks: () => [track], getVideoTracks: () => [], getAudioTracks: () => [track] };
}

export function displayStream() {
  const track = new TestTrack();
  return { track, getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
}

export function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

export class TestPeer extends EventTarget {
  static instances: TestPeer[] = [];
  static senderParameters: unknown[] = [];
  iceGatheringState = "complete";
  connectionState = "new";
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  senderEncodings: unknown[] = [];
  transceivers: Array<Record<string, unknown>> = [];
  config: unknown;
  sender = {
    track: null as unknown,
    replaceTrack: async (track: unknown) => { this.sender.track = track; },
    getParameters: () => ({ encodings: this.senderEncodings }),
    setParameters: async (parameters: unknown) => { TestPeer.senderParameters.push(parameters); },
  };
  constructor(config: unknown) {
    super();
    this.config = config;
    TestPeer.instances.push(this);
  }
  addTrack(track: unknown) {
    this.sender.track = track;
    const transceiver = { kind: "audio", direction: "sendrecv", receiver: { track } };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  addTransceiver(kind: string, init: { direction?: string } = {}) {
    const transceiver = { kind, direction: init.direction ?? "sendrecv", receiver: { track: null } };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  getTransceivers() { return this.transceivers; }
  getSenders() { return [this.sender]; }
  // Assigned by the WebRTC transport; tests invoke it directly to simulate
  // a downstream track arriving.
  ontrack: ((event: { streams?: unknown[]; track?: unknown; transceiver?: unknown; receiver?: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  getStats: () => Promise<Map<string, unknown>> = () => Promise.resolve(new Map());
  async createOffer() { return { type: "offer", sdp: "test-offer" }; }
  async setLocalDescription(description: unknown) { this.localDescription = description; }
  async setRemoteDescription(description: unknown) { this.remoteDescription = description; }
  close() { this.connectionState = "closed"; }
}

export const browserTimers = new Set<ReturnType<typeof setTimeout>>();
export const audioElements = new Set<unknown>();

export class TestAudioElement extends EventTarget {
  style: Record<string, string> = {};
  async play() {}
  pause() {}
  setAttribute() {}
  remove() { audioElements.delete(this); }
}

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function fakeStorage(): FakeStorage {
  const map = new Map<string, string>();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}

/** Installs every browser boundary the controller touches. Call in
 *  beforeEach; pair with uninstallVoiceStubs() in afterEach. */
export function installVoiceStubs(): void {
  TestSocket.instances.length = 0;
  TestPeer.instances.length = 0;
  TestPeer.senderParameters.length = 0;
  AudioContextStub.processors.length = 0;
  AudioContextStub.instances.length = 0;
  AudioContextStub.sources.length = 0;
  AudioContextStub.gains.length = 0;
  AudioContextStub.mediaSources.length = 0;
  AudioContextStub.destinations.length = 0;
  AudioDecoderStub.instances.length = 0;
  AudioDecoderStub.failConfigure = false;
  AudioSourceStub.failStart = false;
  RecorderStub.instances.length = 0;
  RecorderStub.failStart = false;
  audioElements.clear();
  const timersWindow = Object.assign(new EventTarget(), {
    setTimeout(callback: (...args: []) => void, ms: number) {
      const timer = setTimeout(() => { browserTimers.delete(timer); callback(); }, ms);
      browserTimers.add(timer);
      return timer;
    },
    clearTimeout(timer: ReturnType<typeof setTimeout>) { clearTimeout(timer); browserTimers.delete(timer); },
    setInterval(callback: (...args: []) => void, ms: number) { const timer = setInterval(callback, ms); browserTimers.add(timer); return timer; },
    clearInterval(timer: ReturnType<typeof setInterval>) { clearInterval(timer); browserTimers.delete(timer); },
  });
  vi.stubGlobal("MediaStream", class {
    tracks: unknown[];
    id = `stub-${Math.random().toString(36).slice(2)}`;
    constructor(tracks?: unknown[]) { this.tracks = tracks ?? []; }
    getAudioTracks() { return this.tracks; }
  });
  vi.stubGlobal("RTCPeerConnection", TestPeer);
  vi.stubGlobal("window", timersWindow);
  vi.stubGlobal("document", Object.assign(new EventTarget(), {
    createElement: () => new TestAudioElement(),
    body: { append: (element: unknown) => audioElements.add(element) },
  }));
  vi.stubGlobal("WebSocket", TestSocket);
  vi.stubGlobal("location", { protocol: "https:", host: "gateway.example" });
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ ticket: "test-ticket" }) }));
  vi.stubGlobal("AudioContext", AudioContextStub);
  vi.stubGlobal("AudioDecoder", AudioDecoderStub);
  vi.stubGlobal("MediaRecorder", RecorderStub);
  vi.stubGlobal("localStorage", fakeStorage());
  vi.stubGlobal("sessionStorage", fakeStorage());
  vi.stubGlobal("EncodedAudioChunk", class { constructor(init: unknown) { Object.assign(this, init); } });
  vi.stubGlobal("HTMLMediaElement", class {});
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getDisplayMedia: async () => displayStream(),
      getUserMedia: async () => microphoneStream(),
      enumerateDevices: async () => [],
    },
  });
}

export function uninstallVoiceStubs(): void {
  for (const timer of browserTimers) clearTimeout(timer);
  browserTimers.clear();
  vi.unstubAllGlobals();
}
