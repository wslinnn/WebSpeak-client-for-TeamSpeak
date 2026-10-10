import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { setImmediate as nextTurn } from "node:timers/promises";
import { WebSocket, type WebSocketServer } from "ws";
import pino from "pino";
import { ReconnectTicketStore } from "./reconnect-ticket.js";
import { VoiceBridge } from "./voice-bridge.js";
import { JoinTicketStore } from "./join-ticket.js";
import { OpusEncoder } from "./opus-codec.js";
import { normalizeTeamSpeakKickedReason } from "../errors.js";
import type { TSClient, TSClientAvatar, TSDirectorySnapshot } from "./ts-client.js";
import type { AudioFlowStats } from "./audio-stats.js";
import type { WebRtcAudioSession } from "./webrtc-audio.js";

// Real loopback HTTP/WebSocket and native codec, with only the external SDK
// replaced. This validates gateway wiring, not a connection to TeamSpeak.
class TeamSpeakStub extends EventEmitter {
  disconnected = false;
  sent: Buffer[] = [];
  directory: TSDirectorySnapshot = { channels: [], clients: [] };
  avatarRequest: (id: number, uid: string) => Promise<TSClientAvatar | null> = async () => null;
  async connect() { this.disconnected = false; this.emit("directorySnapshot", this.directory); }
  async disconnect() { this.disconnected = true; }
  getClientId() { return 1; }
  getChannelId() { return 1n; }
  isConnected() { return !this.disconnected; }
  async sendProtocolCommand() {}
  async setAccompanimentActive() {}
  sendVoice(data: Buffer) { this.sent.push(data); this.emit("sent", data); }
  sendWhisper(data: Buffer) { this.sent.push(data); }
  getClientAvatar(id: number, uid: string) { return this.avatarRequest(id, uid); }
}

async function fixture(t: TestContext, overrides: {
  createTeamSpeakClient?: () => TSClient;
  createEncoder?: () => Pick<OpusEncoder, "encode" | "dispose">;
  configureSdk?: (sdk: TeamSpeakStub) => void;
  bridgeOptions?: { reconnectTickets?: ReconnectTicketStore };
} = {}) {
  const sdk = new TeamSpeakStub();
  overrides.configureSdk?.(sdk);
  const tickets = new JoinTicketStore();
  const bridge = new VoiceBridge({ joinTickets: tickets, ...(overrides.bridgeOptions ?? {}) }, pino({ enabled: false }), undefined, {
    createTeamSpeakClient: overrides.createTeamSpeakClient ?? (() => sdk as unknown as TSClient),
    ...(overrides.createEncoder ? { createEncoder: overrides.createEncoder } : {}),
  });
  const server = createServer();
  bridge.attach(server);
  const wss = (bridge as unknown as { wss: WebSocketServer }).wss;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const ticket = tickets.create({ target: { host: "voice.example.invalid", port: 9987 }, nickname: "Test", serverPassword: "" });
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws/voice?ticket=${ticket}`);
  const messages: Array<{ data: Buffer; binary: boolean }> = [];
  socket.on("message", (data, binary) => messages.push({ data: data as Buffer, binary }));
  const first = once(socket, "message");
  t.after(async () => {
    socket.terminate();
    // Clean fixtures even when a regression removes the WebSocketServer's own
    // close listener. The membership assertion below tests that behavior first.
    for (const peer of wss.clients) peer.terminate();
    wss.clients.clear();
    await bridge.shutdown();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  await first;
  const entries = (bridge as unknown as { entries: Map<string, {
    id: string; ws: WebSocket; audio: AudioFlowStats; webrtc: WebRtcAudioSession | null;
    isAlive: boolean; avatarCache: Map<string, string | null>;
    members: Map<number, { id: number; uid: string }>; eventLog: unknown[];
  }> }).entries;
  return { bridge, sdk, socket, messages, entries, wss, tickets, port: address.port };
}

test("a TeamSpeak constructor failure releases the admitted gateway slot", { timeout: 5_000 }, async t => {
  const f = await fixture(t, { createTeamSpeakClient() { throw new Error("Identity initialization failed"); } });
  if (f.socket.readyState !== WebSocket.CLOSED) await once(f.socket, "close");
  await nextTurn();
  assert.equal(JSON.parse(f.messages[0]!.data.toString()).code, "TEAM_SPEAK_CLIENT_UNAVAILABLE");
  assert.equal(f.bridge.getActiveCount(), 0);
});

test("a codec disposal failure cannot abandon TeamSpeak or the browser socket", { timeout: 5_000 }, async t => {
  const encoder = new OpusEncoder(48000, 1);
  t.mock.method(encoder, "dispose", () => { throw new Error("Codec already disposed"); });
  const f = await fixture(t, { createEncoder: () => encoder });
  const entry = [...f.entries.values()][0]!;
  await f.bridge.terminateSession(entry.id);
  assert.equal(f.sdk.disconnected, true);
  assert.notEqual(entry.ws.readyState, WebSocket.OPEN);
  assert.equal(f.bridge.getActiveCount(), 0);
});

test("late SDK audio during peer closure cannot write after the session is removed", { timeout: 5_000 }, async t => {
  const f = await fixture(t);
  const entry = [...f.entries.values()][0]!;
  const onVoice = f.sdk.listeners("voiceData")[0]!;
  let release!: () => void;
  const closing = new Promise<void>(resolve => { release = resolve; });
  entry.webrtc = { close: () => closing, getStats: () => ({}) } as unknown as WebRtcAudioSession;
  const writes: unknown[] = [];
  t.mock.method(entry.ws, "send", (data: unknown) => { writes.push(data); });
  const stopped = f.bridge.terminateSession(entry.id);
  try {
    onVoice({ clientId: 2, codec: 4, data: Buffer.from([1, 2, 3]) });
    assert.equal(writes.length, 0);
    assert.equal(entry.audio.tsReceiveFrames, 0);
  } finally {
    release();
    await stopped;
  }
});

test("normal session teardown retains the WebSocketServer close bookkeeping", { timeout: 5_000 }, async t => {
  const f = await fixture(t);
  const entry = [...f.entries.values()][0]!;
  const closed = once(entry.ws, "close");
  await f.bridge.terminateSession(entry.id);
  // Do not await our close listener: a broken removeAllListeners erases it too.
  await once(f.socket, "close");
  await nextTurn();
  assert.equal(f.wss.clients.size, 0);
  await closed;
});

test("loopback PCM reaches the SDK as native Opus and malformed PCM is rejected", { timeout: 5_000 }, async t => {
  const f = await fixture(t);
  const sent = once(f.sdk, "sent");
  f.socket.send(Buffer.alloc(1_920));
  await sent;
  const encoded = f.sdk.sent[0]!;
  assert.ok(encoded.length > 0 && encoded.length < 1_920, "must encode Opus, not pass through PCM");
  const decoder = new OpusEncoder(48_000, 1);
  try { assert.equal(decoder.decode(encoded).length, 1_920); }
  finally { decoder.dispose(); }
  const error = once(f.socket, "message");
  f.socket.send(Buffer.alloc(1_919));
  const [raw] = await error;
  assert.equal(JSON.parse(raw.toString()).error.code, "INVALID_AUDIO_FRAME");
  assert.equal(f.sdk.sent.length, 1);
});

test("failed final peer statistics do not interrupt session cleanup", { timeout: 5_000 }, async t => {
  const f = await fixture(t);
  const entry = [...f.entries.values()][0]!;
  entry.webrtc = { close: async () => {}, getStats() { throw new Error("Closed peer"); } } as unknown as WebRtcAudioSession;
  await f.bridge.terminateSession(entry.id);
  assert.equal(f.sdk.disconnected, true);
  assert.notEqual(entry.ws.readyState, WebSocket.OPEN);
  assert.equal(f.bridge.getActiveCount(), 0);
});

async function avatarFixture(t: TestContext) {
  const calls: number[] = [];
  const avatar = { cacheKey: "sample", data: Buffer.from("GIF89a") };
  let release!: (value: TSClientAvatar) => void;
  let started!: () => void;
  const pending = new Promise<TSClientAvatar>(resolve => { release = resolve; });
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  t.after(() => release(avatar));
  const f = await fixture(t, { configureSdk(sdk) {
    sdk.directory.clients = [2, 3].map(id => ({ id, uid: `user-${id}`, nickname: `User ${id}`, channelID: 1n, type: 1, serverGroups: [] }));
    sdk.avatarRequest = async id => { calls.push(id); if (calls.length === 1) { started(); return pending; } return avatar; };
  } });
  await firstStarted;
  return { ...f, calls, release: () => release(avatar), entry: [...f.entries.values()][0]! };
}

test("avatar completion after teardown cannot refill the cache or start another SDK request", { timeout: 5_000 }, async t => {
  const f = await avatarFixture(t);
  await f.bridge.terminateSession(f.entry.id);
  f.release();
  await nextTurn();
  assert.equal(f.bridge.avatarCacheSize, 0);
  assert.deepEqual(f.calls, [2]);
});

test("pending heartbeat acknowledgement does not cancel a live avatar refresh", { timeout: 5_000 }, async t => {
  const f = await avatarFixture(t);
  f.entry.isAlive = false;
  f.release();
  await nextTurn();
  assert.deepEqual(f.calls, [2, 3]);
  assert.equal(f.bridge.avatarCacheSize, 2);
});

test("an interrupted SDK connection invalidates its pending avatar results", { timeout: 5_000 }, async t => {
  const f = await avatarFixture(t);
  f.sdk.emit("disconnected");
  f.release();
  await nextTurn();
  assert.equal(f.bridge.avatarCacheSize, 0);
  assert.deepEqual(f.calls, [2]);
});

test("late directory callbacks cannot refill a session while its peer is closing", { timeout: 5_000 }, async t => {
  const f = await fixture(t);
  const entry = [...f.entries.values()][0]!;
  const onEnter = f.sdk.listeners("clientEnter")[0]!;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  entry.webrtc = { close: () => pending, getStats: () => ({}) } as unknown as WebRtcAudioSession;
  const closing = f.bridge.terminateSession(entry.id);
  try {
    onEnter({ id: 9, uid: "", nickname: "Late", channelID: 1n, type: 1, serverGroups: [] });
    assert.equal(entry.members.has(9), false);
  } finally {
    release();
    await closing;
  }
});

test("directory snapshots during reconnect backoff cannot leak members into the next connection", { timeout: 5_000 }, async t => {
  const f = await fixture(t);
  const entry = [...f.entries.values()][0]!;
  const reconnected = new Promise<void>(resolve => {
    f.socket.on("message", (data, binary) => { if (!binary && JSON.parse(data.toString()).type === "reconnected") resolve(); });
  });
  f.sdk.emit("disconnected");
  f.sdk.emit("directorySnapshot", { channels: [], clients: [{ id: 9, uid: "", nickname: "Stale", channelID: 1n, type: 1, serverGroups: [] }] });
  await reconnected;
  assert.equal(entry.members.has(9), false);
});

test("commands arriving during recovery receive a correlated rejection", { timeout: 5_000 }, async t => {
  const f = await fixture(t);
  const rejected = new Promise<{ requestId?: string }>(resolve => {
    f.socket.on("message", (data, binary) => {
      if (binary) return;
      const message = JSON.parse(data.toString());
      if (message.type === "error" && message.error?.code === "SESSION_NOT_READY") resolve(message);
    });
  });
  f.sdk.emit("disconnected");
  f.socket.send(JSON.stringify({ type: "sendServerMessage", requestId: "chat-in-flight", payload: { message: "Hello" } }));
  assert.equal((await rejected).requestId, "chat-in-flight");
});

for (const order of ["kick-first", "disconnect-first"] as const) {
  test(`a kick remains terminal when notifications arrive ${order}`, { timeout: 5_000 }, async t => {
    const f = await fixture(t);
    const kick = normalizeTeamSpeakKickedReason("Removed by operator", 4);
    if (order === "disconnect-first") f.sdk.emit("disconnected");
    f.sdk.emit("kicked", kick);
    if (order === "kick-first") f.sdk.emit("disconnected");
    await nextTurn();
    assert.equal(f.bridge.getActiveCount(), 0);
    if (f.socket.readyState !== WebSocket.CLOSED) await once(f.socket, "close");
    const failures = f.messages.filter(message => !message.binary).map(message => JSON.parse(message.data.toString())).filter(message => message.type === "connectionFailed");
    assert.equal(failures.length, 1);
    assert.equal(failures[0].code, "KICKED");
    assert.match(failures[0].detail, /Removed by operator/);
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met within timeout");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface DetachableEntry {
  id: string;
  ws: WebSocket;
  detached?: boolean;
  detachedAt?: number;
}

test("a dropped browser socket keeps the TeamSpeak session and a resume reattaches without a TeamSpeak reconnect", { timeout: 5_000 }, async t => {
  const reconnectTickets = new ReconnectTicketStore();
  let sdkConnects = 0;
  const f = await fixture(t, {
    bridgeOptions: { reconnectTickets },
    configureSdk: (sdk) => {
      t.mock.method(sdk, "connect", async () => {
        sdkConnects += 1;
        sdk.disconnected = false;
        sdk.emit("directorySnapshot", sdk.directory);
      });
    },
  });
  const first = JSON.parse(f.messages[0]!.data.toString()) as { type: string; reconnectTicket?: string };
  assert.equal(first.type, "connected");
  const token = first.reconnectTicket;
  assert.equal(typeof token, "string");

  // The view goes away abnormally (reload, network loss): the TeamSpeak
  // session and the admission slot are kept for the resume window.
  const entry = [...f.entries.values()][0]! as DetachableEntry;
  const serverSocketBefore = entry.ws;
  f.socket.close(1001, "going away");
  await once(f.socket, "close");
  await waitFor(() => entry.detached === true);
  assert.equal(f.sdk.disconnected, false);
  assert.equal(f.bridge.getActiveCount(), 1);

  // The exchange finds a resumable session and mints a resume ticket (the
  // server.ts branch, simulated at the store level here).
  const record = reconnectTickets.consume(token!);
  assert.ok(record);
  assert.equal(f.bridge.isDetachedResumable(record.entryId), true);
  const resumeTicket = f.tickets.create({ ...record.payload, resumeOfEntryId: record.entryId });

  const secondSocket = new WebSocket(`ws://127.0.0.1:${f.port}/ws/voice?ticket=${resumeTicket}`);
  const secondConnected = once(secondSocket, "message");
  await once(secondSocket, "open");
  const second = JSON.parse((await secondConnected)[0].toString()) as { type: string; reconnectTicket?: string };
  assert.equal(second.type, "connected");
  assert.ok(second.reconnectTicket && second.reconnectTicket !== token, "a fresh token is issued on reattach");
  await nextTurn();
  assert.equal(sdkConnects, 1, "the kept TeamSpeak session is reused, never reconnected");
  assert.equal(f.entries.size, 1, "the same entry is adopted, not duplicated");
  const adopted = [...f.entries.values()][0]! as DetachableEntry;
  assert.equal(adopted.id, entry.id);
  assert.equal(adopted.detached, false);
  // entry.ws is the SERVER-side peer of the client socket: a fresh, open
  // socket that is not the one that dropped.
  assert.notEqual(adopted.ws, serverSocketBefore);
  assert.equal(adopted.ws.readyState, WebSocket.OPEN);
  assert.equal(f.bridge.isDetachedResumable(record.entryId), false);

  // A deliberate 1000 close after the resume tears the session down normally.
  secondSocket.close(1000, "done");
  await once(secondSocket, "close");
  await waitFor(() => f.sdk.disconnected === true);
  assert.equal(f.bridge.getActiveCount(), 0);
});

test("a detached session past its grace window releases the kept TeamSpeak connection", { timeout: 5_000 }, async t => {
  const reconnectTickets = new ReconnectTicketStore();
  const f = await fixture(t, { bridgeOptions: { reconnectTickets } });
  const entry = [...f.entries.values()][0]! as DetachableEntry;
  f.socket.close(1001, "going away");
  await once(f.socket, "close");
  await waitFor(() => entry.detached === true);
  assert.equal(f.sdk.disconnected, false);

  (f.bridge as unknown as { sweepDetachedSessions(now: number): void }).sweepDetachedSessions(Date.now() + 120_000);
  await nextTurn();
  assert.equal(f.sdk.disconnected, true);
  assert.equal(f.bridge.getActiveCount(), 0);
});
