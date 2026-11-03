// @vitest-environment node
// Node environment on purpose: the legacy spec ran in plain node where
// `typeof Image === "undefined"` routes avatar probes straight into the cache;
// jsdom's Image never fires onload (no resource loader), which would wedge
// the avatar path under test.
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { LocalPreferences } from "../services/local-persistence";
import { createVoiceSessionController, type VoiceSessionController } from "./session-controller";
import {
  AudioContextStub,
  AudioDecoderStub,
  AudioNodeStub,
  AudioSourceStub,
  RecorderStub,
  TestAudioElement,
  TestPeer,
  TestSocket,
  audioElements,
  browserTimers,
  decodedChunk,
  deferred,
  displayStream,
  fakeStorage,
  installVoiceStubs,
  microphoneStream,
  receiveAudio,
  uninstallVoiceStubs,
} from "../test/voice-test-stubs";

// Ported from web/test/voice-session.test.mjs (spec contract), adapted to the
// framework-free controller: Vue's in-place reactive identity no longer holds
// by design — the store replaces arrays/objects so React can observe changes.
// Assertions that pinned Vue identity now pin the replacement semantics; the
// "channel projections share the member object" invariant is kept as-is.
// Defer to wave 2: chat ack pipeline, audio devices, accompaniment, mic test,
// playback decoders, WebRTC negotiation, screen-share signaling details.

// 偏好持久化在 node 测试环境无 IndexedDB：换内存桩，让「存→新控制器取」的
// 偏好往返（如 >100% 麦克风增益恢复）可测；其余导出保持原实现。
const preferenceStore = vi.hoisted(() => ({ current: undefined as LocalPreferences | undefined }));
vi.mock("../services/local-persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/local-persistence")>();
  type Preferences = Parameters<typeof actual.saveLocalPreferences>[0];
  return {
    ...actual,
    async loadLocalPreferences(): Promise<Preferences> {
      return preferenceStore.current ?? { schemaVersion: 1, volumesByUid: {} };
    },
    async saveLocalPreferences(preferences: Preferences): Promise<void> {
      const base = preferenceStore.current ?? { schemaVersion: 1, volumesByUid: {} };
      preferenceStore.current = { ...base, ...preferences, volumesByUid: { ...base.volumesByUid, ...preferences.volumesByUid } };
    },
  };
});

let voice: VoiceSessionController;

const V = () => voice.view();
const S = () => voice.session.store.getState();

beforeEach(() => {
  installVoiceStubs();
  preferenceStore.current = undefined;
  voice = createVoiceSessionController();
});

afterEach(() => {
  voice?.stopMicrophoneTest();
  voice?.disconnect();
  vi.restoreAllMocks();
  uninstallVoiceStubs();
});

async function connect(): Promise<TestSocket> {
  voice.connect("voice.example:9987", "", "Visitor");
  await nextTurn();
  const socket = TestSocket.instances.at(-1);
  assert.ok(socket, "join ticket should open a voice socket");
  return socket;
}

test("directory snapshots keep member names, flags and identity-scoped volume in sync", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, members: [{ id: 7, uid: "old-user", nickname: "Before" }] });
  voice.setVolume(7, 0.3);
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [
    { id: 7, uid: "old-user", nickname: "Renamed", away: true, awayMessage: "Lunch", inputMuted: true, outputMuted: true, channelCommander: true },
    { id: 1, uid: "self", nickname: "Visitor" },
  ] }] });
  assert.equal(S().members.find(member => member.id === 7)?.nickname, "Renamed");
  assert.equal(S().members.find(member => member.id === 7)?.awayMessage, "Lunch");
  assert.equal(S().members.find(member => member.id === 7)?.inputMuted, true);
  assert.equal(S().members.find(member => member.id === 1)?.isSelf, true);
  assert.equal(V().volumes[7], 0.3);
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [
    { id: 7, uid: "replacement-user", nickname: "Replacement" },
  ] }] });
  assert.deepEqual(S().members.map(member => member.id), [7]);
  assert.equal(S().members[0]?.uid, "replacement-user");
  assert.equal(S().members[0]?.away, undefined);
  assert.equal(V().volumes[7] ?? 1, 1, "a reused numeric ID must not inherit the previous member's gain");
});

test("member-enter preserves status fields and updates an already listed member", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  socket.receive({ type: "memberEnter", id: 7, uid: "user", nickname: "Before", away: true,
    awayMessage: "Away", inputMuted: true, outputMuted: true, channelCommander: true });
  assert.equal(S().members[0]?.awayMessage, "Away");
  assert.equal(S().members[0]?.outputMuted, true);
  assert.equal(S().members[0]?.channelCommander, true);
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [...S().members] }] });
  socket.receive({ type: "memberEnter", id: 7, uid: "user", nickname: "After", away: false, inputMuted: false });
  assert.equal(S().members.length, 1);
  assert.equal(S().members[0]?.nickname, "After");
  assert.equal(S().channels[0]?.members?.[0]?.nickname, "After");
  assert.equal(S().channels[0]?.members?.[0]?.inputMuted, false);
});

test("a restored member volume reaches already-live playback, not just the state map", async () => {
  preferenceStore.current = { schemaVersion: 1, volumesByUid: { "stable-peer": 0.25 } };
  const scoped = createVoiceSessionController();
  try {
    scoped.connect("voice.example:9987", "", "Visitor");
    await nextTurn();
    const socket = TestSocket.instances.at(-1)!;
    socket.receive({ type: "connected", tsClientId: 1 });
    await nextTurn();
    // 成员先出声（目录还没到）：兼容回放流按默认音量建立。
    const before = AudioContextStub.gains.length;
    receiveAudio(socket, 7);
    const gain = AudioContextStub.gains[before];
    assert.ok(gain, "a compat playback stream builds its own gain node");
    assert.equal(gain.gain.value, 1);
    // 目录到达 → 按 uid 回填偏好：状态与已在播的流必须一起更新，否则保存的
    // 音量要等用户再拖一次滑条才生效。
    socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [{ id: 7, uid: "stable-peer", nickname: "Peer" }] }] });
    assert.equal(scoped.view().volumes[7], 0.25);
    assert.equal(gain.gain.value, 0.25);
  } finally {
    scoped.disconnect();
  }
});

test("a corrupt stored member volume is ignored instead of poisoning the mix", async () => {
  preferenceStore.current = { schemaVersion: 1, volumesByUid: { "bad-peer": Number.NaN } };
  const scoped = createVoiceSessionController();
  try {
    scoped.connect("voice.example:9987", "", "Visitor");
    await nextTurn();
    const socket = TestSocket.instances.at(-1)!;
    socket.receive({ type: "connected", tsClientId: 1 });
    socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [{ id: 7, uid: "bad-peer", nickname: "Peer" }] }] });
    assert.equal(scoped.view().volumes[7], undefined, "NaN must not become a playback gain");
  } finally {
    scoped.disconnect();
  }
});

test("member departure immediately removes every directory projection and per-ID state", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, members: [{ id: 7, uid: "user", nickname: "Leaving" }] });
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [...S().members] }] });
  socket.receive({ type: "whisperTargets", targetIds: [7], active: true });
  voice.setVolume(7, 0.5);
  socket.receive({ type: "memberLeave", id: 7 });
  assert.equal(S().members.length, 0);
  assert.equal(S().channels[0]?.members?.length, 0);
  assert.equal(V().volumes[7], undefined);
  assert.equal(V().whisperTargetIds.has(7), false);
  assert.equal(V().whisperActive, false);
});

test("omitted channel members preserve known data and avatars reject a different UID", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, members: [{ id: 7, uid: "user", nickname: "Visitor" }] });
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [...S().members] }] });
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Renamed lobby" }] });
  assert.equal(S().members.length, 1);
  assert.equal(S().channels[0]?.members?.[0]?.nickname, "Visitor");
  socket.receive({ type: "avatarUpdate", uid: "other-user", url: "/avatars/otheruser" });
  assert.equal(S().members[0]?.avatar, undefined);
  socket.receive({ type: "avatarUpdate", uid: "user", url: "/avatars/abcdef12?v=abc123" });
  assert.equal(S().members[0]?.avatar, "/avatars/abcdef12?v=abc123");
  assert.equal(S().channels[0]?.members?.[0]?.avatar, "/avatars/abcdef12?v=abc123");
});

test("member deltas replace the member object and channel projections share it", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  socket.receive({ type: "channelList", channels: [
    { id: "1", parentID: "0", name: "Lobby", members: [{ id: 7, uid: "user", nickname: "Visitor" }] },
    { id: "2", parentID: "0", name: "Room", members: [] },
  ] });
  const memberRef = S().members[0];
  socket.receive({ type: "memberUpdated", id: 7, nickname: "Renamed", away: true });
  const updated = S().members[0]!;
  assert.notEqual(updated, memberRef, "memberUpdated must replace the member object so reference-based rendering sees it");
  assert.equal(updated.nickname, "Renamed");
  assert.equal(S().channels[0]?.members?.[0], updated, "channel projections share the member object");
  socket.receive({ type: "memberMoved", id: 7, channelId: "2" });
  assert.equal(S().channels[0]?.members?.length, 0);
  assert.deepEqual(S().channels[1]?.members?.map(member => member.id), [7]);
});

test("a TS-side force move of our own client surfaces as selfMovedChannelId", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  socket.receive({ type: "channelList", channels: [
    { id: "1", parentID: "0", name: "Lobby", members: [{ id: 1, nickname: "Self" }] },
    { id: "2", parentID: "0", name: "Room", members: [] },
  ] });
  socket.receive({ type: "memberMoved", id: 7, channelId: "2" });
  assert.equal(V().selfMovedChannelId, "", "another client's move must not set the flag");
  socket.receive({ type: "memberMoved", id: 1, channelId: "2" });
  assert.equal(V().selfMovedChannelId, "2");
  socket.receive({ type: "memberMoved", id: 1 });
  assert.equal(V().selfMovedChannelId, "2", "a move without a target channel must not update the flag");
});

test("the server event log keeps a bounded tail on busy rooms", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  for (let index = 0; index < 505; index++) {
    socket.receive({ type: "serverEvent", event: { id: `e-${index}`, kind: "joined", message: `#${index}`, timestamp: index } });
  }
  assert.equal(S().serverEvents.length, 500, "the log must not grow without bound");
  assert.equal(S().serverEvents[0]?.id, "e-5");
  assert.equal(S().serverEvents[499]?.id, "e-504");
});

test("channel deltas create, rename and remove channels without touching members", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  socket.receive({ type: "channelCreated", channel: { id: "3", parentID: "0", name: "New", members: [] } });
  assert.deepEqual(S().channels.map(channel => channel.name), ["New"]);
  socket.receive({ type: "channelCreated", channel: { id: "3", parentID: "0", name: "Duplicate", members: [] } });
  assert.equal(S().channels.length, 1, "a repeated create must not duplicate the channel");
  socket.receive({ type: "channelUpdated", id: "3", name: "Renamed" });
  assert.equal(S().channels[0]?.name, "Renamed");
  socket.receive({ type: "channelRemoved", id: "3" });
  assert.equal(S().channels.length, 0);
});

test("member avatars are keyed by uid, warm later joins and survive reconnects", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  socket.receive({ type: "avatarUpdate", uid: "user", url: "/avatars/abcdef12?v=abc123" });
  assert.equal(S().members.length, 0, "an avatar for an unknown member only warms the cache");
  socket.receive({ type: "memberEnter", id: 7, uid: "user", nickname: "Later", channelId: "1" });
  assert.equal(S().members[0]?.avatar, "/avatars/abcdef12?v=abc123", "a later join restores the warm avatar");
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [...S().members.map(({ avatar: _avatar, ...rest }) => rest)] }] });
  assert.equal(S().members[0]?.avatar, "/avatars/abcdef12?v=abc123", "a directory without avatars keeps warm ones");
  socket.receive({ type: "disconnected", recoverable: true });
  socket.receive({ type: "connected", tsClientId: 2 });
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [{ id: 8, uid: "user", nickname: "Reconnected" }] }] });
  assert.equal(S().members[0]?.avatar, "/avatars/abcdef12?v=abc123", "avatars survive a reconnect reset");
});

test("explicit disconnect and replacement target clear all session history and notifications", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  socket.receive({ type: "serverEvent", event: { id: "event", kind: "joined", message: "Old server", timestamp: 1 } });
  socket.receive({ type: "pokeReceived", invokerId: 7, invokerUid: "old-user", invokerName: "Old user", message: "Old poke" });
  voice.disconnect();
  assert.equal(S().serverEvents.length, 0);
  assert.equal(S().pokeNotifications.length, 0);
  await connect();
  assert.equal(S().serverEvents.length, 0);
  assert.equal(S().pokeNotifications.length, 0);
});

test("a recovered session replaces its directory even when the gateway omits members", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, members: [{ id: 7, uid: "old-user", nickname: "Previous" }] });
  socket.receive({ type: "channelList", channels: [{ id: "1", parentID: "0", name: "Lobby", members: [...S().members] }] });
  socket.receive({ type: "chatMessage", invokerId: 7, invokerName: "Previous", message: "Keep room history", scope: "channel" });
  socket.receive({ type: "disconnected", recoverable: true });
  assert.equal(S().chatMessages.length, 1);
  socket.receive({ type: "connected", tsClientId: 2 });
  assert.equal(S().members.length, 0);
  assert.equal(S().channels.length, 0);
  assert.equal(S().chatMessages.length, 1, "same-socket recovery may retain historical messages");
});

test("chat history stays bounded no matter how long the session runs", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  for (let i = 0; i < 520; i += 1) {
    socket.receive({ type: "chatMessage", invokerId: 7, invokerName: "Chatty", message: `remote-${i}`, scope: "channel" });
  }
  assert.equal(S().chatMessages.length, 500);
  assert.equal(S().chatMessages[0]?.message, "remote-20", "trimming drops the head, never the tail");
  assert.equal(S().chatMessages[499]?.message, "remote-519");
});

function controlRequestTimers() {
  const active = new Set<{ delay: number; callback: () => void }>();
  const scheduled: Array<{ delay: number; callback: () => void }> = [];
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  vi.stubGlobal("setTimeout", (callback: (...args: []) => void, delay: number, ...args: unknown[]) => {
    if (delay !== 8_000 && delay !== 15_000) return realSet(callback, delay, ...args);
    const timer = { delay, callback };
    active.add(timer);
    scheduled.push(timer);
    return timer as unknown as ReturnType<typeof setTimeout>;
  });
  vi.stubGlobal("clearTimeout", (timer: unknown) => {
    if (scheduled.includes(timer as { delay: number; callback: () => void })) active.delete(timer as { delay: number; callback: () => void });
    else realClear(timer as ReturnType<typeof setTimeout>);
  });
  return {
    active, scheduled,
    fire(timer?: { callback: () => void }) {
      assert.ok(timer, "a request deadline must exist");
      active.delete(timer as { delay: number; callback: () => void });
      timer.callback();
    },
  };
}

test("a command send failure rejects immediately and releases its deadline", async () => {
  const socket = await connect();
  const timers = controlRequestTimers();
  socket.send = () => { throw new Error("Socket cannot send"); };
  await assert.rejects(voice.moveClient(2, "1"), /Socket cannot send/);
  assert.equal(timers.active.size, 0);
});

test("confirmed and rejected commands release deadlines and preserve server error codes", async () => {
  const socket = await connect();
  controlRequestTimers();
  const moved = voice.moveClient(2, "1");
  const request = socket.messages.at(-1) as { type: string; requestId: string };
  assert.equal(request.type, "moveClient");
  socket.receive({ type: "commandCompleted", requestId: request.requestId });
  socket.receive({ type: "commandCompleted", requestId: request.requestId });
  await moved;
  const rejected = assert.rejects(voice.moveClient(3, "1"), { code: "PERMISSION_DENIED" });
  socket.receive({ type: "error", requestId: (socket.messages.at(-1) as { requestId: string }).requestId,
    error: { code: "PERMISSION_DENIED", message: "Permission denied" } });
  await rejected;
});

test("command timeout and disconnect settle once without touching replacement commands", async () => {
  const old = await connect();
  const oldMessage = old.onmessage!.bind(old);
  const timers = controlRequestTimers();
  const expired = assert.rejects(voice.moveClient(2, "1"), /操作超时/);
  const expiredRequest = old.messages.at(-1) as { requestId: string };
  timers.fire(timers.scheduled.at(-1));
  await expired;
  old.receive({ type: "commandCompleted", requestId: expiredRequest.requestId });
  const closed = assert.rejects(voice.moveClient(3, "1"), /语音连接已关闭/);
  const oldRequest = old.messages.at(-1) as { requestId: string };
  const oldTimer = timers.scheduled.at(-1);
  const current = await connect();
  await closed;
  assert.equal(timers.active.size, 0);
  let completed = false;
  const moved = voice.moveClient(4, "2").then(() => { completed = true; });
  const currentRequest = current.messages.at(-1) as { requestId: string };
  oldTimer?.callback();
  oldMessage({ data: JSON.stringify({ type: "commandCompleted", requestId: currentRequest.requestId }) });
  current.receive({ type: "commandCompleted", requestId: oldRequest.requestId });
  await nextTurn();
  assert.equal(completed, false);
  assert.equal(timers.active.size, 1);
  current.receive({ type: "commandCompleted", requestId: currentRequest.requestId });
  await moved;
  assert.equal(timers.active.size, 0);
});

test("disconnect immediately aborts a pending join request and releases its deadline", async () => {
  const timers = controlRequestTimers();
  const response = deferred();
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", (_: unknown, options: { signal: AbortSignal }) => { signal = options.signal; return response.promise; });
  voice.connect("voice.example:9987", "", "Visitor");
  await nextTurn();
  voice.disconnect();
  assert.equal(signal?.aborted, true);
  assert.equal(timers.active.size, 0);
  response.reject(new Error("Late network failure"));
  await nextTurn();
  assert.equal(V().errorCode, "");
  assert.equal(V().connecting, false);
});

test("a replaced join request cannot read an old body or alter the new target", async () => {
  controlRequestTimers();
  const response = deferred();
  const requests: Array<{ signal?: AbortSignal; body: string }> = [];
  vi.stubGlobal("fetch", (_: unknown, options: { signal?: AbortSignal; body: string }) => {
    requests.push(options);
    return requests.length === 1 ? response.promise : Promise.resolve({ ok: true, json: async () => ({ ticket: "new-ticket" }) });
  });
  voice.connect("old.example:9987", "", "Old");
  await nextTurn();
  voice.connect("new.example:9987", "2", "New", "password", "identity", true);
  await nextTurn();
  assert.equal(requests[0]?.signal?.aborted, true);
  assert.deepEqual(JSON.parse(requests[1]!.body), { target: "new.example:9987", channel: "2", nickname: "New", serverPassword: "password", identity: "identity", rememberIdentity: true });
  let oldBodyReads = 0;
  response.resolve({ ok: true, json: async () => { oldBodyReads++; return { ticket: "old-ticket" }; } } as never);
  await nextTurn();
  assert.equal(oldBodyReads, 0);
  assert.equal(TestSocket.instances.length, 1);
  assert.match(voice.ws()!.url, /ticket=new-ticket$/);
});

test("切换服务器等旧 socket 的 close 握手落地才发起新 join（先退后进）", async () => {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", (_: unknown, options: { body: string }) => {
    bodies.push(options.body);
    return Promise.resolve({ ok: true, json: async () => ({ ticket: `ticket-${bodies.length}` }) });
  });
  voice.connect("old.example:9987", "", "Old");
  await nextTurn();
  assert.equal(TestSocket.instances.length, 1);
  voice.connect("new.example:9987", "", "New");
  // 串行化：新 join 不随 connect() 同步发出，等旧 socket close。
  assert.equal(bodies.length, 1);
  TestSocket.instances[0]!.close(1000);
  await nextTurn();
  assert.equal(bodies.length, 2);
  assert.equal(TestSocket.instances.length, 2);
  assert.match(TestSocket.instances[1]!.url, /ticket=ticket-2$/);
});

for (const phase of ["request", "body"] as const) {
  test(`the join deadline covers a hanging ${phase} and rejects its late result`, async () => {
    const timers = controlRequestTimers();
    const pending = deferred();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return phase === "request" ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise });
    });
    voice.connect("voice.example:9987", "", "Visitor");
    await nextTurn();
    assert.equal(V().connecting, true);
    timers.fire(timers.scheduled.at(-1));
    assert.equal(signal?.aborted, true);
    assert.equal(V().connecting, false);
    assert.equal(V().errorCode, "REQUEST_TIMEOUT");
    assert.equal(timers.active.size, 0);
    pending.resolve(phase === "request" ? { ok: true, json: async () => ({ ticket: "late-ticket" }) } : { ticket: "late-ticket" });
    await nextTurn();
    assert.equal(TestSocket.instances.length, 0);
    assert.equal(V().errorCode, "REQUEST_TIMEOUT");
  });
}

test("cancelling response-body parsing cannot report a failure in the replacement session", async () => {
  controlRequestTimers();
  const body = deferred();
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (_: unknown, options: { signal: AbortSignal }) => { signal = options.signal; return { ok: true, json: () => body.promise }; });
  voice.connect("old.example:9987", "", "Old");
  await nextTurn();
  const oldSignal = signal;
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ ticket: "new-ticket" }) }));
  const current = await connect();
  assert.equal(oldSignal?.aborted, true);
  body.reject(new Error("Old body failed"));
  await nextTurn();
  assert.equal(voice.ws(), current);
  assert.equal(V().errorCode, "");
});

test("a rejected join request preserves its public error and clears its deadline", async () => {
  controlRequestTimers();
  vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({ code: "INVITE_INVALID" }) }));
  voice.connect("voice.example:9987", "", "Visitor");
  await nextTurn();
  assert.equal(V().errorCode, "INVITE_INVALID");
  assert.equal(V().connecting, false);
  assert.equal(TestSocket.instances.length, 0);
});

test("a queued old join deadline cannot abort the replacement request", async () => {
  const timers = controlRequestTimers();
  const signals: AbortSignal[] = [];
  const pending = deferred();
  vi.stubGlobal("fetch", (_: unknown, options: { signal: AbortSignal }) => { signals.push(options.signal); return pending.promise; });
  voice.connect("old.example:9987", "", "Old");
  await nextTurn();
  const oldTimer = timers.scheduled.at(-1);
  voice.connect("new.example:9987", "", "New");
  await nextTurn();
  oldTimer?.callback();
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, false);
  assert.equal(V().connecting, true);
  assert.equal(V().errorCode, "");
  assert.equal(timers.active.size, 1);
  pending.resolve({ ok: true, json: async () => ({ ticket: "current-ticket" }) } as never);
  await nextTurn();
  assert.equal(TestSocket.instances.length, 1);
  assert.equal(timers.active.size, 0);
});

test("gateway close reasons survive generic errors and stale close callbacks", async () => {
  const old = await connect();
  const lateClose = old.onclose!.bind(old);
  old.onerror?.({});
  assert.equal(V().errorCode, "");
  old.close(4005);
  assert.equal(V().errorCode, "IDENTITY_IN_USE");
  const current = await connect();
  lateClose({ code: 4004, reason: "SERVER_REJECTED" });
  assert.equal(voice.ws(), current);
  assert.equal(V().errorCode, "");
});

test("a socket close failure cannot leave the session connected or retain socket handlers", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, members: [{ id: 1, nickname: "Self" }] });
  await nextTurn();
  socket.close = () => { throw new Error("Already disposed"); };
  assert.doesNotThrow(() => voice.disconnect());
  assert.equal(voice.ws(), null);
  assert.equal(V().connected, false);
  assert.equal(S().members.length, 0);
  assert.equal(socket.onmessage, null);
  assert.equal(socket.onclose, null);
});

test("late control messages from a replaced socket cannot change the new session", async () => {
  const old = await connect();
  const lateMessage = old.onmessage!.bind(old);
  const current = await connect();
  current.receive({ type: "memberEnter", id: 2, nickname: "Current" });
  lateMessage({ data: JSON.stringify({ type: "memberEnter", id: 3, nickname: "Previous" }) });
  assert.deepEqual(S().members.map(member => member.nickname), ["Current"]);
});

test("unexpected socket closure releases active screen capture and pending commands", async () => {
  const stream = displayStream();
  (globalThis.navigator as { mediaDevices: { getDisplayMedia: () => Promise<unknown> } }).mediaDevices.getDisplayMedia = async () => stream;
  const socket = await connect();
  await voice.screenShare.startScreenShare();
  const start = socket.messages.find(message => (message as { type: string }).type === "screenShareStart") as { requestId: string };
  socket.receive({ type: "screenShareStarted", requestId: start.requestId, owner: true,
    stream: { streamId: "share-1", ownerPeerId: "owner" } });
  assert.equal(voice.screenShare.store.getState().active, true);
  const command = assert.rejects(voice.moveClient(2, "1"), /语音连接已关闭/);
  socket.close(1006);
  await command;
  assert.equal(stream.track.readyState, "ended");
  assert.equal(voice.screenShare.store.getState().active, false);
  assert.equal(voice.screenShare.store.getState().streams.length, 0);
  assert.equal(voice.ws(), null);
});

test("screen permission resolved after socket closure releases the late stream", async () => {
  const capture = deferred<unknown>();
  const stream = displayStream();
  (globalThis.navigator as { mediaDevices: { getDisplayMedia: () => Promise<unknown> } }).mediaDevices.getDisplayMedia = () => capture.promise;
  const socket = await connect();
  const pendingStart = voice.screenShare.startScreenShare();
  socket.close(1006);
  capture.resolve(stream);
  await pendingStart;
  assert.equal(stream.track.readyState, "ended");
  assert.equal(voice.screenShare.store.getState().starting, false);
  assert.equal(socket.messages.some(message => (message as { type: string }).type === "screenShareStart"), false);
});

test("browser reconnect budget exhaustion raises the failure banner and drops the resume intent", async () => {
  const sessionStore = fakeStorage();
  vi.stubGlobal("sessionStorage", sessionStore);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const socket = await connect();
    socket.receive({ type: "connected", tsClientId: 1, reconnectTicket: "ticket-1" });
    assert.ok(sessionStore.getItem("webspeak:voice-session"), "a connected session stores its resume intent");
    socket.close(1006);
    assert.equal(V().reconnecting, true);
    // Three budgeted attempts (1/2/4s), each dying again, exhaust the schedule;
    // the fourth schedule call abandons instead of arming another timer.
    for (let attempt = 0; attempt < 3; attempt++) {
      vi.advanceTimersByTime(20_000);
      await nextTurn();
      const next = TestSocket.instances.at(-1);
      assert.ok(next, `reconnect attempt ${attempt + 1} should open a socket`);
      next.close(1006);
    }
    assert.equal(V().reconnectFailed, true);
    assert.equal(V().errorCode, "GATEWAY_NETWORK_LOST");
    assert.equal(V().connectionFailureCode, "GATEWAY_NETWORK_LOST");
    assert.equal(sessionStore.getItem("webspeak:voice-session"), null, "an abandoned resume must not linger for the next page load");
  } finally {
    vi.useRealTimers();
  }
  void AudioContextStub;
});

test("browser reconnect delays carry ±20% jitter inside the 1/2/4s tiers", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const socket = await connect();
    socket.receive({ type: "connected", tsClientId: 1, reconnectTicket: "ticket-1" });
    // 首档下限：1s × 0.8——799ms 之前不得重试，到点必重试。
    socket.close(1006);
    vi.advanceTimersByTime(799);
    await nextTurn();
    assert.equal(TestSocket.instances.length, 1, "the jittered first delay must not fire before 800ms");
    vi.advanceTimersByTime(1);
    await nextTurn();
    assert.equal(TestSocket.instances.length, 2);
    // 二档上限：2s × 1.2——2399ms 之前不得重试，到点必重试。
    random.mockReturnValue(1);
    TestSocket.instances.at(-1)!.close(1006);
    vi.advanceTimersByTime(2_399);
    await nextTurn();
    assert.equal(TestSocket.instances.length, 2, "the jittered second delay must not fire before 2400ms");
    vi.advanceTimersByTime(1);
    await nextTurn();
    assert.equal(TestSocket.instances.length, 3);
  } finally {
    vi.useRealTimers();
  }
  void AudioContextStub;
});

test("a rate-limited reconnect honours Retry-After without burning the reconnect budget", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 抖动系数 1.0：延迟即基准值，断言可精确到毫秒
    const socket = await connect();
    socket.receive({ type: "connected", tsClientId: 1, reconnectTicket: "ticket-1" });
    let throttled = true;
    vi.stubGlobal("fetch", async () => {
      if (throttled) {
        throttled = false;
        return { ok: false, status: 429, json: async () => ({ ok: false, code: "RATE_LIMITED", retryAfterMs: 45_000 }) };
      }
      return { ok: true, json: async () => ({ ticket: "ticket-after-throttle" }) };
    });
    socket.close(1006);
    assert.equal(V().reconnectAttempt, 1);
    // 第一次尝试落在 1s 档、被网关限流：预算不动，下一档改等 Retry-After。
    vi.advanceTimersByTime(1_000);
    await nextTurn();
    assert.equal(V().reconnectAttempt, 1, "a throttle must not consume the 1/2/4s reconnect budget");
    assert.equal(V().reconnecting, true);
    assert.equal(V().reconnectFailed, false);
    assert.equal(V().errorCode, "RATE_LIMITED");
    // Retry-After 未到之前不得再敲网关（否则 429 只会继续烧预算）。
    vi.advanceTimersByTime(44_999);
    await nextTurn();
    assert.equal(TestSocket.instances.length, 1, "the throttled retry must wait out Retry-After");
    vi.advanceTimersByTime(1);
    await nextTurn();
    assert.equal(TestSocket.instances.length, 2, "the retry opens a socket once the window has passed");
    assert.equal(V().reconnectFailed, false);
  } finally {
    vi.useRealTimers();
  }
  void AudioContextStub;
});

test("input volume boosts to 200% with clamps and survives the preference round-trip", async () => {
  voice.setInputVolume(1.5);
  assert.equal(V().inputVolume, 1.5);
  voice.setInputVolume(3);
  assert.equal(V().inputVolume, 2, "boost clamps at the 200% ceiling");
  voice.setInputVolume(-1);
  assert.equal(V().inputVolume, 0);

  // 存/取往返：>100% 的增益持久化后原样恢复，不得被钳回 100%（麦克风音量增强）。
  // 持久化与恢复都是异步链，全量并行跑时固定次数的 nextTurn 偶尔等不到——
  // 两端都改为轮询断言（ vitest 5 vi.waitFor），超时仍失败则真回归。
  voice.setInputVolume(1.5);
  await vi.waitFor(() => assert.equal(preferenceStore.current?.inputGain, 1.5, "the boost is persisted"), { timeout: 5_000 });
  const second = createVoiceSessionController();
  try {
    await vi.waitFor(() => assert.equal(second.view().inputVolume, 1.5, "a stored >100% gain restores as-is"), { timeout: 5_000 });
  } finally {
    second.disconnect();
  }
});

// --- Wave 2A: device switching, processing toggles, enumeration fallbacks ---

const availableDevices = [
  ...["mic-a", "mic-b"].map(deviceId => ({ deviceId, kind: "audioinput", label: deviceId, groupId: "" })),
  ...["speaker-a", "speaker-b"].map(deviceId => ({ deviceId, kind: "audiooutput", label: deviceId, groupId: "" })),
];

type MediaDevicesStub = {
  getDisplayMedia: (options?: unknown) => Promise<unknown>;
  getUserMedia: (constraints: { audio: { deviceId?: { exact?: string } } }) => Promise<unknown>;
  enumerateDevices: () => Promise<readonly { deviceId: string; kind: string; label: string; groupId: string }[]>;
};

const devices = () => (globalThis.navigator as { mediaDevices: MediaDevicesStub }).mediaDevices;

async function connectWebRtc() {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, webrtcAvailable: true });
  await nextTurn();
  assert.ok(socket.messages.some(message => (message as { type: string }).type === "webrtcOffer"));
  return { socket, peer: TestPeer.instances.at(-1)! };
}

const audioFrames = (socket: TestSocket) => socket.messages.filter(message => message instanceof ArrayBuffer).length;
type ProcessorStub = { onaudioprocess?: (event: { inputBuffer: { getChannelData: () => Float32Array } }) => void };

test("an old input switch failure cannot roll back a newer microphone selection", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const permission = deferred<unknown>();
  const current = microphoneStream();
  devices().getUserMedia = ({ audio }) => audio.deviceId?.exact === "mic-a" ? permission.promise : Promise.resolve(current);
  const old = voice.setInputDevice("mic-a").catch(() => {});
  await voice.setInputDevice("mic-b");
  permission.reject(new Error("Old microphone unavailable"));
  await old;
  assert.equal(V().selectedInputDeviceId, "mic-b");
  assert.equal(globalThis.localStorage.getItem("webspeak:input-device"), "mic-b");
  assert.equal((current.track as { readyState: string }).readyState, "live");
});

test("a failed microphone switch leaves an existing WebRTC peer and capture alive", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const stream = microphoneStream();
  devices().getUserMedia = async () => stream;
  const { peer, socket } = await connectWebRtc();
  devices().getUserMedia = async () => { throw new Error("New device unavailable"); };
  await assert.rejects(voice.setInputDevice("mic-a"), /New device unavailable/);
  assert.notEqual(peer.connectionState, "closed");
  receiveAudio(socket);
  assert.equal(AudioDecoderStub.instances.length, 0, "WebRTC still owns playback");
  assert.equal((stream.track as { readyState: string }).readyState, "live");
  assert.equal(V().selectedInputDeviceId, "");
});

// --- 音频横幅闭锁（× 带代码落锁 / 条件解除复位 / 闭锁不被无参清除短路）---

test("a dismissed audio notice stays dismissed while the condition holds", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const stream = microphoneStream();
  devices().getUserMedia = async () => stream;
  await voice.ensureMicrophone();
  (stream.track as EventTarget).dispatchEvent(new Event("ended"));
  assert.equal(V().audioNoticeCode, "MIC_TRACK_LOST");
  voice.dismissAudioNotice("MIC_TRACK_LOST");
  assert.equal(V().audioNotice, "");
  assert.equal(V().audioNoticeCode, "");
  // 条件仍成立：同代码重触发（重同步/轨道事件）不得顶回。
  (stream.track as EventTarget).dispatchEvent(new Event("ended"));
  assert.equal(V().audioNoticeCode, "", "a same-code refire must stay suppressed after ×");
});

test("a dismissed audio notice re-alerts once the condition resolves and recurs", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const first = microphoneStream();
  devices().getUserMedia = async () => first;
  await voice.ensureMicrophone();
  (first.track as EventTarget).dispatchEvent(new Event("ended"));
  voice.dismissAudioNotice("MIC_TRACK_LOST");
  assert.equal(V().audioNoticeCode, "");
  // 用户照提示重选设备：新采集图落定 = 条件解除，闭锁复位。
  const second = microphoneStream();
  devices().getUserMedia = async () => second;
  await voice.setInputDevice("mic-b");
  assert.equal(V().audioNoticeCode, "", "recapture resolves the lost-track condition");
  (second.track as EventTarget).dispatchEvent(new Event("ended"));
  assert.equal(V().audioNoticeCode, "MIC_TRACK_LOST", "a new occurrence must alert again");
});

test("a no-argument clear keeps lifecycle resets from being mistaken for dismissal", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const stream = microphoneStream();
  devices().getUserMedia = async () => stream;
  await voice.ensureMicrophone();
  (stream.track as EventTarget).dispatchEvent(new Event("ended"));
  assert.equal(V().audioNoticeCode, "MIC_TRACK_LOST");
  // 生命周期边界（断开/重连）走无参清除：展示清空且闭锁不落，
  // 条件若仍成立，下一条同代码提醒照常出现。
  voice.clearAudioNotice();
  assert.equal(V().audioNoticeCode, "");
  (stream.track as EventTarget).dispatchEvent(new Event("ended"));
  assert.equal(V().audioNoticeCode, "MIC_TRACK_LOST", "lifecycle clear must not lock the code");
});

test("an old output switch rejection cannot roll back the latest selection", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const ctx = AudioContextStub.instances.at(-1)!;
  const oldSink = deferred<void>();
  vi.spyOn(ctx, "setSinkId").mockImplementation(id => id === "speaker-a" ? oldSink.promise : Promise.resolve());
  const old = voice.setOutputDevice("speaker-a").catch(() => {});
  await nextTurn();
  const current = voice.setOutputDevice("speaker-b");
  oldSink.reject(new Error("Old output unavailable"));
  await Promise.all([old, current]);
  assert.equal(V().selectedOutputDeviceId, "speaker-b");
  assert.equal(globalThis.localStorage.getItem("webspeak:output-device"), "speaker-b");
});

test("overlapping output switches leave the actual sink on the latest device", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const ctx = AudioContextStub.instances.at(-1)!;
  const oldSink = deferred<void>();
  vi.spyOn(ctx, "setSinkId").mockImplementation(async id => { if (id === "speaker-a") await oldSink.promise; ctx.sinkId = id; });
  const old = voice.setOutputDevice("speaker-a");
  await nextTurn();
  const current = voice.setOutputDevice("speaker-b");
  oldSink.resolve();
  await Promise.all([old, current]);
  assert.equal(ctx.sinkId, "speaker-b");
  assert.equal(V().selectedOutputDeviceId, "speaker-b");
});

test("an older device enumeration cannot replace a newer device list", async () => {
  const oldDevices = deferred<readonly { deviceId: string; kind: string; label: string; groupId: string }[]>();
  let calls = 0;
  devices().enumerateDevices = () => ++calls === 1 ? oldDevices.promise : Promise.resolve(availableDevices);
  const old = voice.refreshAudioDevices();
  await voice.refreshAudioDevices();
  oldDevices.resolve([]);
  await old;
  assert.deepEqual(V().inputDevices.map(device => device.deviceId), ["mic-a", "mic-b"]);
});

test("device enumeration rejected after disconnect cannot restore an audio notice", async () => {
  const enumeration = deferred<readonly { deviceId: string; kind: string; label: string; groupId: string }[]>();
  devices().enumerateDevices = () => enumeration.promise;
  const pending = voice.refreshAudioDevices();
  voice.disconnect();
  enumeration.reject(new Error("Old device query rejected"));
  await pending;
  assert.equal(V().audioNoticeCode, "");
});

test("a successful microphone switch replaces the WebRTC peer and persists the new device", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const initial = microphoneStream();
  devices().getUserMedia = async () => initial;
  const { peer: old, socket } = await connectWebRtc();
  const replacement = microphoneStream();
  devices().getUserMedia = async () => replacement;
  await voice.setInputDevice("mic-b");
  assert.equal(old.connectionState, "closed");
  assert.notEqual(TestPeer.instances.at(-1), old);
  assert.equal((initial.track as { readyState: string }).readyState, "ended");
  assert.equal((replacement.track as { readyState: string }).readyState, "live");
  assert.equal(socket.messages.filter(message => (message as { type: string }).type === "webrtcOffer").length, 2);
  assert.equal(globalThis.localStorage.getItem("webspeak:input-device"), "mic-b");
});

test("a failed replacement input restores the last working device instead of another pending choice", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const permission = deferred<unknown>();
  devices().getUserMedia = ({ audio }) => audio.deviceId?.exact === "mic-a"
    ? permission.promise : Promise.reject(new Error("Replacement failed"));
  const old = voice.setInputDevice("mic-a");
  await assert.rejects(voice.setInputDevice("mic-b"), /Replacement failed/);
  const late = microphoneStream();
  permission.resolve(late);
  await old;
  assert.equal(V().selectedInputDeviceId, "");
  assert.equal(globalThis.localStorage.getItem("webspeak:input-device"), "");
  assert.equal((late.track as { readyState: string }).readyState, "ended");
});

test("disconnect skips queued output changes and keeps only the last committed device", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const ctx = AudioContextStub.instances.at(-1)!;
  const oldSink = deferred<void>();
  const applied: string[] = [];
  vi.spyOn(ctx, "setSinkId").mockImplementation(async id => { applied.push(id); await oldSink.promise; });
  const first = voice.setOutputDevice("speaker-a");
  await nextTurn();
  const second = voice.setOutputDevice("speaker-b");
  voice.disconnect();
  oldSink.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(applied, ["speaker-a"]);
  assert.equal(V().selectedOutputDeviceId, "");
  assert.equal(globalThis.localStorage.getItem("webspeak:output-device"), null);
});

test("failure on the WebRTC output restores the previously committed context sink", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const { peer } = await connectWebRtc();
  peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: peer.transceivers[1] });
  const output = [...audioElements][0] as { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
  output.setSinkId = async id => { if (id === "speaker-a") throw new Error("Output denied"); output.sinkId = id; };
  const ctx = AudioContextStub.instances.at(-1)!;
  await assert.rejects(voice.setOutputDevice("speaker-a"), /Output denied/);
  assert.equal(ctx.sinkId, "default");
  assert.equal(output.sinkId, "default");
  assert.equal(V().selectedOutputDeviceId, "");
});

test("a channelSwitched reply settles the pending switch instead of timing out", async () => {
  const socket = await connect();
  let settled = false;
  const pending = voice.switchChannel("9").then(() => { settled = true; });
  const sent = socket.messages.filter(message => (message as { type: string }).type === "switchChannel").at(-1) as { requestId?: string } | undefined;
  assert.ok(sent?.requestId, "the switch command must carry a requestId");
  socket.receive({ type: "channelSwitched", requestId: sent.requestId, channelId: "9" });
  // A regression here leaves the command pending: the explicit loser fails
  // fast with the cause instead of hanging the whole suite for 8 seconds.
  await Promise.race([
    pending,
    new Promise((_, reject) => setTimeout(() => reject(new Error("channelSwitched did not settle the pending switch")), 500)),
  ]);
  assert.equal(settled, true);
  assert.equal(V().errorCode, "", "a successful switch must not surface an error");
});

test("the uplink applies the input gain exactly once (no squared stage)", async () => {
  await connectWebRtc();
  voice.setInputVolume(0.5);
  assert.ok(AudioContextStub.gains.some(gain => gain.gain.value === 0.5), "one gain carries the slider value");
  assert.equal(AudioContextStub.gains.some(gain => gain.gain.value === 0.25), false, "the gain must not be applied twice");
});

test("with denoise off at unity gain the uplink bypasses the WebAudio graph", async () => {
  let lastGumStream: ReturnType<typeof microphoneStream> | undefined;
  devices().enumerateDevices = async () => availableDevices;
  devices().getUserMedia = async () => { lastGumStream = microphoneStream(); return lastGumStream; };
  const { peer } = await connectWebRtc();
  assert.equal(peer.sender.track, AudioContextStub.destinations.at(-1)!.stream!.getAudioTracks()[0], "noise suppression on keeps the processed mix");
  await voice.setNoiseSuppressionEnabled(false);
  const live = TestPeer.instances.at(-1)!;
  assert.equal(live.sender.track, lastGumStream!.getAudioTracks()[0], "denoise off at unity gain feeds the sender the raw track");
  voice.setInputVolume(0.8);
  assert.equal(live.sender.track, AudioContextStub.destinations.at(-1)!.stream!.getAudioTracks()[0], "a non-unity gain returns the sender to the processed mix");
  voice.disconnect();
});

test("the microphone test gates the room uplink by gain without disabling the raw track", async () => {
  const raw = microphoneStream();
  devices().enumerateDevices = async () => availableDevices;
  devices().getUserMedia = async () => raw;
  await connectWebRtc();
  const live = TestPeer.instances.at(-1)!;
  // Mark the capture gain with a unique value so the gate is observable on
  // the exact node the slider drives, whatever else shares the context.
  voice.setInputVolume(0.6);
  const captureGain = AudioContextStub.gains.find(gain => gain.gain.value === 0.6);
  assert.ok(captureGain, "the uplink gain follows the slider");
  voice.setInputVolume(1);
  await voice.startMicrophoneTest();
  assert.equal(captureGain.gain.value, 0, "the mic test must gate the uplink by gain");
  assert.equal((raw.getAudioTracks()[0] as unknown as { enabled: boolean }).enabled, true, "the test recorder taps the raw track and needs it live");
  assert.notEqual(live.sender.track, raw.getAudioTracks()[0], "the gate rides the processed mix — raw bypass would skip the gain");
  voice.stopMicrophoneTest();
  assert.equal(captureGain.gain.value, 1, "stopping the test restores the user gain");
  voice.disconnect();
});

test("a failed noise suppression change restores its setting and preserves WebRTC capture", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const initial = microphoneStream();
  devices().getUserMedia = async () => initial;
  const { peer } = await connectWebRtc();
  devices().getUserMedia = async () => { throw new Error("Capture reconfiguration failed"); };
  await voice.setNoiseSuppressionEnabled(false);
  assert.notEqual(peer.connectionState, "closed");
  assert.equal(V().noiseSuppressionEnabled, true);
  assert.equal((initial.track as { readyState: string }).readyState, "live");
  assert.notEqual(V().microphoneErrorCode, "");
});

test("echo cancellation and auto gain default off, re-apply constraints and roll back on failure", async () => {
  const requested: Array<Record<string, unknown>> = [];
  devices().enumerateDevices = async () => availableDevices;
  devices().getUserMedia = async options => { requested.push(options!.audio as unknown as Record<string, unknown>); return microphoneStream(); };
  await connectWebRtc();
  assert.equal(requested.at(-1)!.echoCancellation, false, "echo cancellation must default off");
  assert.equal(requested.at(-1)!.autoGainControl, false, "auto gain must default off");
  assert.equal(requested.at(-1)!.noiseSuppression, true, "noise suppression keeps its opt-out default");
  await voice.setEchoCancellationEnabled(true);
  await voice.setAutoGainControlEnabled(true);
  assert.equal(requested.at(-1)!.echoCancellation, true);
  assert.equal(requested.at(-1)!.autoGainControl, true);
  const livePeer = TestPeer.instances.at(-1)!;
  devices().getUserMedia = async () => { throw new Error("Capture reconfiguration failed"); };
  await voice.setEchoCancellationEnabled(false);
  assert.equal(V().echoCancellationEnabled, true, "a failed change restores the committed value");
  assert.notEqual(livePeer.connectionState, "closed");
  voice.disconnect();
});

test("changing processing during an input switch commits the device actually acquired", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const permission = deferred<unknown>();
  let calls = 0;
  devices().getUserMedia = () => ++calls === 1 ? permission.promise : Promise.resolve(microphoneStream());
  const input = voice.setInputDevice("mic-a");
  await voice.setNoiseSuppressionEnabled(false);
  const late = microphoneStream();
  permission.resolve(late);
  await input;
  assert.equal(globalThis.localStorage.getItem("webspeak:input-device"), "mic-a");
  assert.equal((late.track as { readyState: string }).readyState, "ended");
  voice.disconnect();
  assert.equal(V().selectedInputDeviceId, "mic-a");
});

test("closing audio settings releases standalone capture even without a recording test", async () => {
  const stream = microphoneStream();
  devices().getUserMedia = async () => stream;
  await voice.prepareInputDevices();
  voice.stopMicrophoneTest();
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
});

test("compatibility capture keeps sending while a replacement permission is pending or fails", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  const capture = AudioContextStub.processors.at(-1) as unknown as ProcessorStub;
  const permission = deferred<unknown>();
  devices().getUserMedia = () => permission.promise;
  const pending = voice.setInputDevice("mic-a");
  const rejected = assert.rejects(pending, /Device denied/);
  const samples = new Float32Array(960).fill(0.25);
  capture.onaudioprocess!({ inputBuffer: { getChannelData: () => samples } });
  const beforeFailure = audioFrames(socket);
  permission.reject(new Error("Device denied"));
  await rejected;
  capture.onaudioprocess!({ inputBuffer: { getChannelData: () => samples } });
  assert.equal(beforeFailure, 1);
  assert.equal(audioFrames(socket), 2);
});

test("replacing compatibility capture prevents the old graph from sending into the new session", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  const old = AudioContextStub.processors.at(-1) as unknown as ProcessorStub;
  await voice.setInputDevice("mic-b");
  const current = AudioContextStub.processors.at(-1) as unknown as ProcessorStub;
  const event = { inputBuffer: { getChannelData: () => new Float32Array(960).fill(0.25) } };
  old.onaudioprocess!(event);
  current.onaudioprocess!(event);
  assert.equal(audioFrames(socket), 1);
  voice.disconnect();
  current.onaudioprocess!(event);
  assert.equal(audioFrames(socket), 1);
});

test("a failed replacement processing graph preserves the live microphone and PCM path", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const initial = microphoneStream();
  devices().getUserMedia = async () => initial;
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  const capture = AudioContextStub.processors.at(-1) as unknown as ProcessorStub;
  const replacement = microphoneStream();
  devices().getUserMedia = async () => replacement;
  const ctx = AudioContextStub.instances.at(-1)!;
  const processing = { ...V().microphoneProcessing };
  vi.spyOn(ctx, "createGain").mockImplementation(() => { throw new Error("Gain allocation failed"); });
  await assert.rejects(voice.setInputDevice("mic-b"), /Gain allocation failed/);
  assert.equal((initial.track as { readyState: string }).readyState, "live");
  assert.equal((replacement.track as { readyState: string }).readyState, "ended");
  capture.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(0.25) } });
  assert.equal(audioFrames(socket), 1);
  assert.deepEqual({ ...V().microphoneProcessing }, processing);
  assert.equal(V().selectedInputDeviceId, "");
  assert.notEqual(V().microphoneErrorCode, "");
});

test("waiting for a replacement worklet keeps the current graph sending", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  const capture = AudioContextStub.processors.at(-1) as unknown as ProcessorStub;
  const module = deferred<void>();
  (AudioContextStub.instances.at(-1) as unknown as { audioWorklet: unknown }).audioWorklet = { addModule: (url: string) => url === "/mic-capture-worklet.js" ? module.promise : Promise.resolve() };
  // A missing worklet constructor must still permit the ScriptProcessor fallback.
  vi.stubGlobal("AudioWorkletNode", class { constructor() { throw new Error("Worklet unavailable"); } });
  try {
    const pending = voice.setInputDevice("mic-a");
    await nextTurn();
    capture.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(0.25) } });
    const framesWhilePreparing = audioFrames(socket);
    module.resolve();
    await pending;
    assert.equal(framesWhilePreparing, 1);
  } finally {
    module.resolve();
  }
  (AudioContextStub.processors.at(-1) as unknown as ProcessorStub).onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(0.25) } });
  assert.equal(audioFrames(socket), 2);
});

test("disconnect during worklet preparation releases every candidate node and track", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const module = deferred<void>();
  const ctx = AudioContextStub.instances.at(-1)!;
  (ctx as unknown as { audioWorklet: unknown }).audioWorklet = { addModule: (url: string) => url === "/mic-capture-worklet.js" ? module.promise : Promise.resolve() };
  const source = new AudioNodeStub();
  const destination = Object.assign(new AudioNodeStub(), { stream: microphoneStream() });
  vi.spyOn(ctx, "createMediaStreamSource").mockImplementation(() => source as never);
  vi.spyOn(ctx, "createMediaStreamDestination").mockImplementation(() => destination as never);
  const stream = microphoneStream();
  devices().getUserMedia = async () => stream;
  const pending = voice.setInputDevice("mic-a");
  try {
    await nextTurn();
    voice.disconnect();
    assert.equal((stream.track as { readyState: string }).readyState, "ended");
    assert.equal((destination as unknown as { stream: ReturnType<typeof microphoneStream> }).stream.track.readyState, "ended");
    assert.ok(source.disconnects > 0);
  } finally {
    module.resolve();
  }
  await pending;
  assert.equal(voice.ws(), null);
});

test("a failed first capture graph reports an error and releases its stream", async () => {
  const stream = microphoneStream();
  devices().getUserMedia = async () => stream;
  vi.spyOn(AudioContextStub.prototype, "createScriptProcessor").mockImplementation(() => { throw new Error("Capture node unavailable"); });
  await assert.rejects(voice.ensureMicrophone(), /Capture node unavailable/);
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
  assert.notEqual(V().microphoneErrorCode, "");
});

test("removing the selected microphone restarts WebRTC with the default input", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.setInputDevice("mic-a");
  const { peer, socket } = await connectWebRtc();
  devices().enumerateDevices = async () => availableDevices.filter(device => device.deviceId !== "mic-a");
  const replacement = microphoneStream();
  devices().getUserMedia = async () => replacement;
  await voice.refreshAudioDevices();
  await nextTurn();
  assert.equal(peer.connectionState, "closed");
  assert.equal(socket.messages.filter(message => (message as { type: string }).type === "webrtcOffer").length, 2);
  assert.equal(V().selectedInputDeviceId, "");
  assert.equal(globalThis.localStorage.getItem("webspeak:input-device"), "");
  assert.equal((replacement.track as { readyState: string }).readyState, "live");
});

test("a failed default input fallback does not overwrite the last successful preference", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.setInputDevice("mic-a");
  await voice.ensureMicrophone();
  devices().enumerateDevices = async () => availableDevices.filter(device => device.deviceId !== "mic-a");
  devices().getUserMedia = async () => { throw new Error("Default microphone unavailable"); };
  await voice.refreshAudioDevices();
  await nextTurn();
  assert.equal(V().selectedInputDeviceId, "mic-a");
  assert.equal(globalThis.localStorage.getItem("webspeak:input-device"), "mic-a");
  assert.notEqual(V().microphoneErrorCode, "");
});

test("a rejected default output fallback preserves the last preference and reports the failure", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.prepareInputDevices();
  await voice.setOutputDevice("speaker-a");
  devices().enumerateDevices = async () => availableDevices.filter(device => device.deviceId !== "speaker-a");
  const ctx = AudioContextStub.instances.at(-1)!;
  vi.spyOn(ctx, "setSinkId").mockImplementation(async id => { if (id === "default") throw new Error("Default output unavailable"); ctx.sinkId = id; });
  await voice.refreshAudioDevices();
  await nextTurn();
  assert.equal(V().selectedOutputDeviceId, "speaker-a");
  assert.equal(globalThis.localStorage.getItem("webspeak:output-device"), "speaker-a");
  assert.equal(V().audioNoticeCode, "OUTPUT_DEVICE_UNAVAILABLE");
});

test("an AudioWorklet capture sends PCM and ignores late port messages after teardown", async () => {
  devices().enumerateDevices = async () => availableDevices;
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  const worklets: Array<AudioNodeStub & { port: { onmessage: ((event: { data: { samples: Float32Array } }) => void) | null; closed: boolean; close(): void } }> = [];
  vi.stubGlobal("AudioWorkletNode", class extends AudioNodeStub {
    port = { onmessage: null as ((event: { data: { samples: Float32Array } }) => void) | null, closed: false, close() { this.closed = true; } };
    constructor() { super(); worklets.push(this); }
  });
  (AudioContextStub.instances.at(-1) as unknown as { audioWorklet: unknown }).audioWorklet = { addModule: async () => {} };
  await voice.setInputDevice("mic-b");
  const capture = worklets.at(-1)!;
  const onmessage = capture.port.onmessage!;
  onmessage({ data: { samples: new Float32Array(960).fill(0.25) } });
  assert.equal(audioFrames(socket), 1);
  voice.disconnect();
  assert.equal(capture.port.closed, true);
  assert.ok(capture.disconnects > 0);
  onmessage({ data: { samples: new Float32Array(960).fill(0.25) } });
  assert.equal(audioFrames(socket), 1);
});

test("a failed newer switch restores the device whose graph is already live during enumeration", async () => {
  devices().enumerateDevices = async () => availableDevices;
  await voice.ensureMicrophone();
  const enumeration = deferred<readonly { deviceId: string; kind: string; label: string; groupId: string }[]>();
  let reads = 0;
  devices().enumerateDevices = () => ++reads === 1 ? enumeration.promise : Promise.resolve(availableDevices);
  const replacement = microphoneStream();
  devices().getUserMedia = ({ audio }) => audio.deviceId?.exact === "mic-a"
    ? Promise.resolve(replacement) : Promise.reject(new Error("Newer input failed"));
  const first = voice.setInputDevice("mic-a");
  await nextTurn();
  await assert.rejects(voice.setInputDevice("mic-b"), /Newer input failed/);
  enumeration.resolve(availableDevices);
  await first;
  assert.equal((replacement.track as { readyState: string }).readyState, "live");
  assert.equal(V().selectedInputDeviceId, "mic-a");
  assert.equal(globalThis.localStorage.getItem("webspeak:input-device"), "mic-a");
});

test("disconnect while initial device labels load still cancels microphone readiness", async () => {
  const enumeration = deferred<readonly { deviceId: string; kind: string; label: string; groupId: string }[]>();
  devices().enumerateDevices = () => enumeration.promise;
  const readiness = voice.ensureMicrophone();
  await nextTurn();
  voice.disconnect();
  enumeration.resolve(availableDevices);
  await assert.rejects(readiness, (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(V().microphoneErrorCode, "");
});

// --- Wave 2B: microphone permission generations, accompaniment, mic meter ---

function enableMicrophoneMeter() {
  const analysers: Array<AudioNodeStub & { fftSize: number; level: number; reads: number; getFloatTimeDomainData: (samples: Float32Array) => void }> = [];
  const intervals: Array<{ callback: () => void; delay: number }> = [];
  const cleared: unknown[] = [];
  vi.spyOn(AudioContextStub.prototype, "createAnalyser").mockImplementation(() => {
    const analyser = Object.assign(new AudioNodeStub(), {
      fftSize: 512, level: 0.1, reads: 0,
      getFloatTimeDomainData(this: { reads: number; level: number }, samples: Float32Array) { this.reads++; samples.fill(this.level); },
    });
    analysers.push(analyser as never);
    return analyser as never;
  });
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, delay: number) => {
    const timer = { callback, delay };
    intervals.push(timer);
    return timer;
  }) as never);
  vi.spyOn(globalThis, "clearInterval").mockImplementation((timer: unknown) => { cleared.push(timer); });
  return { analysers, intervals, cleared };
}

const accompanimentActiveMessages = (socket: TestSocket) =>
  socket.messages.filter(message => (message as { type: string }).type === "setAccompanimentActive");

test("a microphone permission result after disconnect is cancelled and its track stopped", async () => {
  const permission = deferred<unknown>();
  const stream = microphoneStream();
  devices().getUserMedia = () => permission.promise;
  const pending = voice.ensureMicrophone();
  const cancelled = assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === "AbortError");
  voice.disconnect();
  permission.resolve(stream);
  await cancelled;
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
  assert.equal(V().microphoneErrorCode, "");
});

test("a new connection acquires its own microphone while old permission is still pending", async () => {
  const oldPermission = deferred<unknown>();
  const oldStream = microphoneStream();
  let requests = 0;
  devices().getUserMedia = () => ++requests === 1 ? oldPermission.promise : Promise.resolve(microphoneStream());
  const first = await connect();
  first.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  const second = await connect();
  second.receive({ type: "connected", tsClientId: 2 });
  await nextTurn();
  const observedRequests = requests;
  oldPermission.resolve(oldStream);
  await nextTurn();
  assert.equal(observedRequests, 2);
  assert.equal((oldStream.track as { readyState: string }).readyState, "ended");
  assert.equal(V().microphoneErrorCode, "");
});

test("accompaniment permission arriving after disconnect releases every returned track", async () => {
  await connectWebRtc();
  const permission = deferred<unknown>();
  const stream = microphoneStream();
  devices().getDisplayMedia = () => permission.promise;
  const pending = voice.startAccompaniment();
  voice.disconnect();
  permission.resolve(stream);
  await pending;
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
  assert.equal(V().accompanimentActive, false);
});

test("a superseded accompaniment capture cannot replace or stop its successor", async () => {
  await connectWebRtc();
  const firstPermission = deferred<unknown>();
  const old = microphoneStream();
  const current = microphoneStream();
  devices().getDisplayMedia = () => firstPermission.promise;
  const first = voice.startAccompaniment();
  devices().getDisplayMedia = async () => current;
  await voice.startAccompaniment();
  firstPermission.resolve(old);
  await first;
  assert.equal((old.track as { readyState: string }).readyState, "ended");
  assert.equal((current.track as { readyState: string }).readyState, "live");
  assert.equal(V().accompanimentActive, true);
});

test("stopping accompaniment while constraints are pending cancels the capture", async () => {
  await connectWebRtc();
  const constraints = deferred<void>();
  const stream = microphoneStream();
  (stream.track as unknown as { applyConstraints: () => Promise<void> }).applyConstraints = () => constraints.promise;
  devices().getDisplayMedia = async () => stream;
  const pending = voice.startAccompaniment();
  await nextTurn();
  await voice.stopAccompaniment();
  const stateAtStop = (stream.track as { readyState: string }).readyState;
  constraints.resolve();
  await pending;
  assert.equal(stateAtStop, "ended", "cancellation must release capture before constraints settle");
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
  assert.equal(V().accompanimentActive, false);
});

test("an old accompaniment ended event cannot stop the replacement track", async () => {
  await connectWebRtc();
  const old = microphoneStream();
  const current = microphoneStream();
  devices().getDisplayMedia = async () => old;
  await voice.startAccompaniment();
  devices().getDisplayMedia = async () => current;
  await voice.startAccompaniment();
  old.track.dispatchEvent(new Event("ended"));
  await nextTurn();
  assert.equal((current.track as { readyState: string }).readyState, "live");
  assert.equal(V().accompanimentActive, true);
});

test("accompaniment allocation failure preserves the live microphone sender", async () => {
  const { socket, peer } = await connectWebRtc();
  const originalTrack = peer.sender.track as { readyState: string };
  const candidate = microphoneStream();
  devices().getDisplayMedia = async () => candidate;
  const context = AudioContextStub.instances.at(-1)!;
  const createSource = context.createMediaStreamSource.bind(context);
  vi.spyOn(context, "createMediaStreamSource").mockImplementation(stream => {
    if (stream === candidate) throw new Error("Cannot allocate accompaniment source");
    return createSource(stream) as never;
  });
  await assert.rejects(voice.startAccompaniment(), /Cannot allocate/);
  assert.equal(originalTrack.readyState, "live");
  assert.equal(peer.sender.track, originalTrack);
  assert.equal((candidate.track as { readyState: string }).readyState, "ended");
  assert.equal(V().accompanimentActive, false);
  assert.equal(accompanimentActiveMessages(socket).some(message => (message as { payload: { active: boolean } }).payload.active), false);
});

test("failed accompaniment replacement keeps the previous capture and disconnects the candidate node", async () => {
  const { peer } = await connectWebRtc();
  const current = microphoneStream();
  devices().getDisplayMedia = async () => current;
  await voice.startAccompaniment();
  const originalTrack = peer.sender.track as { readyState: string };
  const candidate = microphoneStream();
  const failedNode = new AudioNodeStub();
  failedNode.connect = () => { throw new Error("Cannot connect accompaniment source"); };
  devices().getDisplayMedia = async () => candidate;
  const context = AudioContextStub.instances.at(-1)!;
  const createSource = context.createMediaStreamSource.bind(context);
  vi.spyOn(context, "createMediaStreamSource").mockImplementation(stream => stream === candidate ? failedNode as never : createSource(stream) as never);
  await assert.rejects(voice.startAccompaniment(), /Cannot connect/);
  assert.equal((current.track as { readyState: string }).readyState, "live");
  assert.equal(V().accompanimentActive, true);
  assert.equal(originalTrack.readyState, "live");
  assert.equal((candidate.track as { readyState: string }).readyState, "ended");
  assert.equal(failedNode.disconnects, 1);
});

test("starting and stopping accompaniment never ends the microphone sender track", async () => {
  const { peer } = await connectWebRtc();
  const originalTrack = peer.sender.track as { readyState: string };
  const stream = microphoneStream();
  devices().getDisplayMedia = async () => stream;
  await voice.startAccompaniment();
  assert.equal(originalTrack.readyState, "live");
  assert.equal(peer.sender.track, originalTrack);
  await voice.stopAccompaniment();
  assert.equal(originalTrack.readyState, "live");
  assert.equal(peer.sender.track, originalTrack);
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
});

test("stopping accompaniment succeeds even when another output cannot be allocated", async () => {
  const { peer } = await connectWebRtc();
  const stream = microphoneStream();
  devices().getDisplayMedia = async () => stream;
  await voice.startAccompaniment();
  const originalTrack = peer.sender.track as { readyState: string };
  vi.spyOn(AudioContextStub.instances.at(-1)!, "createMediaStreamDestination").mockImplementation(() => { throw new Error("No output available"); });
  await voice.stopAccompaniment();
  assert.equal(originalTrack.readyState, "live");
  assert.equal(peer.sender.track, originalTrack);
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
});

test("disconnect releases pending accompaniment without waiting for constraints", async () => {
  await connectWebRtc();
  const constraints = deferred<void>();
  const stream = microphoneStream();
  (stream.track as unknown as { applyConstraints: () => Promise<void> }).applyConstraints = () => constraints.promise;
  devices().getDisplayMedia = async () => stream;
  const pending = voice.startAccompaniment();
  await nextTurn();
  voice.disconnect();
  const stateAtDisconnect = (stream.track as { readyState: string }).readyState;
  constraints.resolve();
  await pending;
  assert.equal(stateAtDisconnect, "ended");
  assert.equal(V().accompanimentActive, false);
});

// --- 伴奏增益与削波提示（2026-10-29，伴奏电平从「直连 destination 不受控」收编） ---

test("the accompaniment tap gets its own gain stage and the slider drives it through replacements", async () => {
  await connectWebRtc();
  const stream = microphoneStream();
  devices().getDisplayMedia = async () => stream;
  await voice.startAccompaniment();
  voice.setAccompanimentVolume(0.3);
  const tapGain = AudioContextStub.gains.find(gain => gain.gain.value === 0.3);
  assert.ok(tapGain, "the slider value lands on the accompaniment gain stage");
  assert.equal(AudioContextStub.gains.find(gain => gain.gain.value === 0.25), undefined, "the gain must not be applied twice");
  const replacement = microphoneStream();
  devices().getDisplayMedia = async () => replacement;
  await voice.startAccompaniment();
  assert.equal(tapGain.gain.value, 0.3, "a replacement tap reuses the stage with the current volume");
  voice.setAccompanimentVolume(2);
  assert.equal(tapGain.gain.value, 2, "live stages follow later slider changes");
});

test("a stored accompaniment gain restores into the view and clamps to the slider maximum", async () => {
  preferenceStore.current = { schemaVersion: 1, accompanimentGain: 0.3 };
  const soft = createVoiceSessionController();
  try {
    soft.connect("voice.example:9987", "", "Visitor");
    await nextTurn();
    assert.equal(soft.view().accompanimentVolume, 0.3, "the stored gain restores into the view");
  } finally { soft.disconnect(); }
  preferenceStore.current = { schemaVersion: 1, accompanimentGain: 5 };
  const hard = createVoiceSessionController();
  try {
    hard.connect("voice.example:9987", "", "Visitor");
    await nextTurn();
    assert.equal(hard.view().accompanimentVolume, 2, "over-range gains clamp to the slider maximum");
  } finally { hard.disconnect(); }
});

test("changing the accompaniment volume persists the gain", async () => {
  await connectWebRtc();
  voice.setAccompanimentVolume(0.3);
  await vi.waitFor(() => assert.equal(preferenceStore.current?.accompanimentGain, 0.3), { timeout: 5_000 });
});

test("the accompaniment clip warning follows the tap peak, holds, clears and stops with the tap", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  try {
    const analysers: Array<{ fftSize: number; level: number; getFloatTimeDomainData: (samples: Float32Array) => void }> = [];
    vi.spyOn(AudioContextStub.prototype, "createAnalyser").mockImplementation(() => {
      const analyser = Object.assign(new AudioNodeStub(), {
        fftSize: 512,
        level: 0.1,
        getFloatTimeDomainData(this: { level: number }, samples: Float32Array) { samples.fill(this.level); },
      }) as never;
      analysers.push(analyser);
      return analyser;
    });
    await connectWebRtc();
    const stream = microphoneStream();
    devices().getDisplayMedia = async () => stream;
    await voice.startAccompaniment();
    const tapMeter = analysers.at(-1)!;
    tapMeter.level = 1.01;
    await vi.advanceTimersByTimeAsync(300);
    assert.equal(V().accompanimentClipping, true);
    tapMeter.level = 0.1;
    await vi.advanceTimersByTimeAsync(1_700);
    assert.equal(V().accompanimentClipping, true, "the warning holds through the 2s window after the last hot sample");
    await vi.advanceTimersByTimeAsync(600);
    assert.equal(V().accompanimentClipping, false);
    tapMeter.level = 1.01;
    await vi.advanceTimersByTimeAsync(300);
    assert.equal(V().accompanimentClipping, true);
    await voice.stopAccompaniment();
    assert.equal(V().accompanimentClipping, false, "stopping the accompaniment clears the warning immediately");
  } finally {
    vi.useRealTimers();
  }
});

test("a newer accompaniment request immediately releases an older pending candidate", async () => {
  await connectWebRtc();
  const constraints = deferred<void>();
  const old = microphoneStream();
  (old.track as unknown as { applyConstraints: () => Promise<void> }).applyConstraints = () => constraints.promise;
  devices().getDisplayMedia = async () => old;
  const pending = voice.startAccompaniment();
  await nextTurn();
  const current = microphoneStream();
  devices().getDisplayMedia = async () => current;
  await voice.startAccompaniment();
  const oldStateAtReplacement = (old.track as { readyState: string }).readyState;
  constraints.resolve();
  await pending;
  assert.equal(oldStateAtReplacement, "ended");
  assert.equal((current.track as { readyState: string }).readyState, "live");
  assert.equal(V().accompanimentActive, true);
});

test("capture ended during accompaniment preparation is never announced as active", async () => {
  const { socket } = await connectWebRtc();
  const constraints = deferred<void>();
  const stream = microphoneStream();
  (stream.track as unknown as { applyConstraints: () => Promise<void> }).applyConstraints = () => constraints.promise;
  devices().getDisplayMedia = async () => stream;
  const pending = voice.startAccompaniment();
  await nextTurn();
  (stream.track as { readyState: string }).readyState = "ended";
  stream.track.dispatchEvent(new Event("ended"));
  constraints.resolve();
  await pending;
  assert.equal(V().accompanimentActive, false);
  assert.equal(accompanimentActiveMessages(socket).some(message => (message as { payload: { active: boolean } }).payload.active), false);
});

test("an optional content hint failure does not abandon or fail accompaniment capture", async () => {
  await connectWebRtc();
  const stream = microphoneStream();
  Object.defineProperty(stream.track, "contentHint", { set() { throw new Error("Hint unavailable"); } });
  devices().getDisplayMedia = async () => stream;
  await voice.startAccompaniment();
  assert.equal(V().accompanimentActive, true);
  await voice.stopAccompaniment();
  assert.equal((stream.track as { readyState: string }).readyState, "ended");
});

test("a failing mix-node disconnect cannot prevent peer and microphone cleanup", async () => {
  const microphone = microphoneStream();
  devices().getUserMedia = async () => microphone;
  const { peer } = await connectWebRtc();
  const outputTrack = peer.sender.track as { readyState: string };
  vi.spyOn(AudioContextStub.mediaSources[1]!, "disconnect").mockImplementationOnce(() => { throw new Error("Node already unavailable"); });
  assert.doesNotThrow(() => voice.disconnect());
  assert.equal(peer.connectionState, "closed");
  assert.equal(outputTrack.readyState, "ended");
  assert.equal((microphone.track as { readyState: string }).readyState, "ended");
});

test("accompaniment keeps display processing off and preserves microphone mute and gain", async () => {
  const { peer, socket } = await connectWebRtc();
  const originalTrack = peer.sender.track as { readyState: string };
  voice.setInputVolume(0.4);
  // The uplink gain is identified by behavior (the one the slider drives),
  // not by creation order: capture, silence and playback nodes all live in
  // the same context and their order is an implementation detail.
  const micGain = AudioContextStub.gains.find(gain => gain.gain.value === 0.4);
  assert.ok(micGain, "setting the input volume must land on exactly one uplink gain");
  const audio = microphoneStream();
  const video = displayStream();
  (audio.track as unknown as { contentHint: string }).contentHint = "";
  let applied: unknown, requested: { audio: unknown; selfBrowserSurface?: string; systemAudio?: string; windowAudio?: string } | undefined;
  (audio.track as unknown as { applyConstraints: (value: unknown) => Promise<void> }).applyConstraints = async value => { applied = value; throw new Error("Optional constraints unavailable"); };
  const deviceApi = devices() as MediaDevicesStub & { getSupportedConstraints: () => Record<string, boolean> };
  deviceApi.getSupportedConstraints = () => ({ restrictOwnAudio: true });
  deviceApi.getDisplayMedia = async options => {
    requested = options as typeof requested;
    return { getTracks: () => [audio.track, video.track], getAudioTracks: () => [audio.track], getVideoTracks: () => [video.track] };
  };
  await voice.startAccompaniment();
  assert.deepEqual(applied, { autoGainControl: false, echoCancellation: false, noiseSuppression: false });
  assert.deepEqual(requested!.audio, { ...(applied as object), restrictOwnAudio: true });
  assert.equal(requested!.selfBrowserSurface, "exclude");
  assert.equal(requested!.systemAudio, "include");
  assert.equal(requested!.windowAudio, "window");
  assert.equal((audio.track as unknown as { contentHint: string }).contentHint, "music");
  assert.equal((video.track as { readyState: string }).readyState, "ended");
  assert.equal(micGain!.gain.value, 0.4);
  voice.setMicrophoneMuted(true);
  assert.equal(micGain!.gain.value, 0);
  assert.equal((audio.track as { readyState: string }).readyState, "live");
  voice.setInputVolume(0.7);
  assert.equal(micGain!.gain.value, 0);
  voice.setMicrophoneMuted(false);
  assert.equal(micGain!.gain.value, 0.7);
  (audio.track as { readyState: string }).readyState = "ended";
  audio.track.dispatchEvent(new Event("ended"));
  assert.equal(V().accompanimentActive, false);
  assert.equal(peer.sender.track, originalTrack);
  assert.equal(originalTrack.readyState, "live");
  assert.deepEqual(accompanimentActiveMessages(socket).map(message => (message as { payload: { active: boolean } }).payload.active), [true, false]);
});

test("an old accompaniment permission rejection cannot change a successful replacement", async () => {
  await connectWebRtc();
  const permission = deferred<unknown>();
  devices().getDisplayMedia = () => permission.promise;
  const old = voice.startAccompaniment();
  const stream = microphoneStream();
  devices().getDisplayMedia = async () => stream;
  await voice.startAccompaniment();
  permission.reject(new DOMException("Old permission denied", "NotAllowedError"));
  await old;
  assert.equal(V().accompanimentActive, true);
  assert.equal(V().accompanimentErrorCode, "");
  assert.equal((stream.track as { readyState: string }).readyState, "live");
});

test("a failed source selection preserves active accompaniment and disconnect clears its error", async () => {
  const { peer } = await connectWebRtc();
  const stream = microphoneStream();
  devices().getDisplayMedia = async () => stream;
  await voice.startAccompaniment();
  const rejected = displayStream();
  devices().getDisplayMedia = async () => rejected;
  await assert.rejects(voice.startAccompaniment(), /no audio/);
  assert.equal(V().accompanimentErrorCode, "noAudio");
  assert.equal((rejected.track as { readyState: string }).readyState, "ended");
  assert.equal((stream.track as { readyState: string }).readyState, "live");
  assert.equal((peer.sender.track as { readyState: string }).readyState, "live");
  assert.equal(V().accompanimentActive, true);
  voice.disconnect();
  assert.equal(V().accompanimentActive, false);
  assert.equal(V().accompanimentErrorCode, "");
});

test("an unavailable microphone analyser releases its partial source without failing voice", async () => {
  vi.spyOn(AudioContextStub.prototype, "createAnalyser").mockImplementation(() => { throw new Error("Analyser unavailable"); });
  const { peer } = await connectWebRtc();
  assert.equal((AudioContextStub.mediaSources.at(-1) as unknown as { disconnects: number }).disconnects, 1);
  assert.notEqual(peer.connectionState, "closed");
  assert.equal((peer.sender.track as { readyState: string }).readyState, "live");
});

test("a failed microphone meter connection releases all prepared meter nodes", async () => {
  const analyser = new AudioNodeStub();
  analyser.connect = () => { throw new Error("Meter unavailable"); };
  vi.spyOn(AudioContextStub.prototype, "createAnalyser").mockImplementation(() => analyser as never);
  const { peer } = await connectWebRtc();
  assert.equal((AudioContextStub.mediaSources.at(-1) as unknown as { disconnects: number }).disconnects, 1);
  // 两只 meter 都会尝试挂 analyser（上行 meter + 预增益显示 meter），各自在
  // connect 失败后完整释放自己的 source/analyser/silent —— 共享桩累计 2 次。
  assert.equal(analyser.disconnects, 2);
  assert.equal(AudioContextStub.gains.at(-1)!.disconnects, 1);
  assert.equal((peer.sender.track as { readyState: string }).readyState, "live");
});

test("a queued old microphone meter tick cannot read or change a replacement session", async () => {
  const meter = enableMicrophoneMeter();
  await connectWebRtc();
  const oldTick = meter.intervals[0]!.callback;
  await connectWebRtc();
  const current = meter.analysers.at(-1)!;
  oldTick();
  assert.equal(current.reads, 0);
  assert.equal(V().micLevel, 0);
  assert.ok(meter.cleared.includes(meter.intervals[0]));
});

test("a microphone analyser read failure stops only the meter and clears its level", async () => {
  const meter = enableMicrophoneMeter();
  const { peer } = await connectWebRtc();
  meter.intervals[0]!.callback();
  assert.ok(V().micLevel > 0);
  // analysers[0] = 预增益显示 meter（startMicrophone 先建）；[1] = 上行 meter。
  // 显示 meter 读失败只停自己并清电平；上行 meter 与说话判定不受牵连。
  meter.analysers[0]!.getFloatTimeDomainData = () => { throw new Error("Analyser closed"); };
  assert.doesNotThrow(() => meter.intervals[0]!.callback());
  assert.equal(V().micLevel, 0);
  assert.ok(meter.cleared.includes(meter.intervals[0]));
  assert.equal(meter.analysers[0]!.disconnects, 1);
  // 失败 meter 的 source 一并释放（at(-2)=显示 meter 的 source；at(-1)=仍存活
  // 的上行 meter 的 source，其 silent gain 断言移入上一条连接失败测试）。
  assert.equal((AudioContextStub.mediaSources.at(-2) as unknown as { disconnects: number }).disconnects, 1);
  assert.notEqual(peer.connectionState, "closed");
  assert.equal((peer.sender.track as { readyState: string }).readyState, "live");
});

test("a meter disconnect failure cannot interrupt the remaining session cleanup", async () => {
  const meter = enableMicrophoneMeter();
  const microphone = microphoneStream();
  devices().getUserMedia = async () => microphone;
  const { peer } = await connectWebRtc();
  vi.spyOn(AudioContextStub.mediaSources.at(-1)!, "disconnect").mockImplementationOnce(() => { throw new Error("Meter already closed"); });
  assert.doesNotThrow(() => voice.disconnect());
  assert.equal(peer.connectionState, "closed");
  assert.equal((microphone.track as { readyState: string }).readyState, "ended");
  assert.equal(meter.analysers[0]!.disconnects, 1);
  assert.equal(AudioContextStub.gains.at(-1)!.disconnects, 1);
});

test("microphone metering preserves its cadence and bounded level and stops on disconnect", async () => {
  const meter = enableMicrophoneMeter();
  await connectWebRtc();
  assert.equal(meter.intervals[0]!.delay, 50);
  meter.intervals[0]!.callback();
  assert.ok(Math.abs(V().micLevel - 0.6) < 0.00001);
  meter.analysers[0]!.level = 0.8;
  meter.intervals[0]!.callback();
  assert.equal(V().micLevel, 1);
  voice.disconnect();
  assert.equal(V().micLevel, 0);
  const reads = meter.analysers[0]!.reads;
  meter.intervals[0]!.callback();
  assert.equal(meter.analysers[0]!.reads, reads);
});

// --- Wave 2C: downstream slots, speaking badge, remote playback decoders ---

function captureIntervals() {
  const intervals: Array<{ callback: () => void; delay: number }> = [];
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, delay: number) => {
    const timer = { callback, delay };
    intervals.push(timer);
    return timer;
  }) as never);
  return intervals;
}

const speaking = () => voice.speakingStore.getState().speakingIds;

test("a voiceRoute announcement binds the downstream slot to the member's volume", async () => {
  const intervals = captureIntervals();
  const { socket, peer } = await connectWebRtc();
  const receiver = {
    getStats: async () => new Map([["in", { type: "inbound-rtp", kind: "audio", packetsReceived: 10, audioLevel: 0.2 }]]),
  };
  peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: peer.transceivers[1], receiver });
  socket.receive({ type: "voiceRoute", slots: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  await nextTurn();
  const output = [...audioElements][0] as { volume: number; muted?: boolean };
  assert.equal(output.volume, 1, "the bound slot starts at the neutral volume");
  voice.setVolume(7, 2);
  await nextTurn();
  assert.equal(output.volume, 1, "a >100% gain clamps to the element until the slot has flowed");
  for (const timer of intervals) timer.callback();
  await nextTurn();
  assert.ok(AudioContextStub.gains.some(gain => gain.gain.value === 2), "amplification beyond 100% rides the gain pipe once the slot flows");
  assert.equal(output.muted, true, "the element stays attached as the puller while the pipe renders");
  voice.setVolume(9, 3);
  assert.equal(AudioContextStub.gains.some(gain => gain.gain.value === 3), false, "volumes for unbound speakers apply nowhere");
});

test("a transmitting slot keeps the speaking badge lit across polls and the hangover clears it", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    const intervals = captureIntervals();
    const { socket, peer } = await connectWebRtc();
    let packets = 0;
    let transmitting = true;
    const receiver = {
      getStats: async () => {
        if (transmitting) packets += 10;
        return new Map([["in", { type: "inbound-rtp", kind: "audio", packetsReceived: packets }]]);
      },
    };
    peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: peer.transceivers[1], receiver });
    socket.receive({ type: "voiceRoute", slots: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    await nextTurn();
    const drivePolls = async () => {
      for (const timer of intervals) timer.callback();
      await nextTurn();
    };

    await drivePolls();
    assert.ok(speaking().has(7), "the first flowing packets light the member");
    vi.advanceTimersByTime(400);
    assert.equal(speaking().has(7), false, "the hold expires without a fresh mark");
    await drivePolls();
    assert.ok(speaking().has(7), "each poll re-marks a still-transmitting member");
    transmitting = false;
    vi.advanceTimersByTime(400);
    await drivePolls();
    assert.ok(speaking().has(7), "the hangover bridges word gaps after packets stop");
    vi.advanceTimersByTime(2_000);
    await drivePolls();
    assert.equal(speaking().has(7), false, "silence outlasts the hangover and clears the member");
  } finally {
    vi.useRealTimers();
  }
});

test("disconnect cancels an ICE gathering wait without sending an offer", async () => {
  vi.spyOn(TestPeer.prototype, "setLocalDescription").mockImplementation(async function (this: TestPeer, description: unknown) {
    this.localDescription = description;
    this.iceGatheringState = "gathering";
  });
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, webrtcAvailable: true });
  await nextTurn();
  assert.ok(browserTimers.size > 0);
  voice.disconnect();
  await nextTurn();
  assert.equal(browserTimers.size, 0);
  assert.equal(socket.messages.some(message => (message as { type: string }).type === "webrtcOffer"), false);
  assert.equal(V().microphoneErrorCode, "");
});

test("an offer rejected after a new connection opens cannot report a microphone error", async () => {
  const oldOffer = deferred<unknown>();
  let calls = 0;
  vi.spyOn(TestPeer.prototype, "createOffer").mockImplementation(function (this: TestPeer) {
    return (++calls === 1 ? oldOffer.promise : Promise.resolve({ type: "offer", sdp: "new-offer" })) as never;
  });
  const old = await connect();
  old.receive({ type: "connected", tsClientId: 1, webrtcAvailable: true });
  await nextTurn();
  const current = await connectWebRtc();
  oldOffer.reject(new Error("old peer closed"));
  await nextTurn();
  assert.notEqual(current.peer.connectionState, "closed");
  assert.equal(V().microphoneErrorCode, "");
  assert.equal(V().audioNoticeCode, "");
});

test("resetting an overloaded remote decoder disconnects its old gain", async () => {
  const socket = await connect();
  receiveAudio(socket);
  const gain = AudioContextStub.gains.at(-1)!;
  AudioDecoderStub.instances.at(-1)!.decodeQueueSize = 3;
  receiveAudio(socket);
  assert.equal(gain.disconnects, 1);
  assert.equal(AudioDecoderStub.instances.length, 2);
});

test("an old source ending cannot hide replacement playback from session cleanup", async () => {
  const socket = await connect();
  receiveAudio(socket);
  const first = AudioDecoderStub.instances.at(-1)!;
  (first.callbacks as { output: (chunk: unknown) => void }).output(decodedChunk());
  const oldSource = AudioContextStub.sources.at(-1)!;
  first.decodeQueueSize = 3;
  receiveAudio(socket);
  (AudioDecoderStub.instances.at(-1)!.callbacks as { output: (chunk: unknown) => void }).output(decodedChunk());
  const replacement = AudioContextStub.sources.at(-1)!;
  oldSource.dispatchEvent(new Event("ended"));
  voice.disconnect();
  assert.equal(replacement.stopped, 1);
});

test("decoder failure releases the speaker's queued sources and gain immediately", async () => {
  const socket = await connect();
  receiveAudio(socket);
  const decoder = AudioDecoderStub.instances.at(-1)!;
  const callbacks = decoder.callbacks as { output: (chunk: unknown) => void; error: (error: unknown) => void };
  callbacks.output(decodedChunk());
  const source = AudioContextStub.sources.at(-1)!;
  const gain = AudioContextStub.gains.at(-1)!;
  callbacks.error(new Error("Decode failed"));
  assert.equal(source.stopped, 1);
  assert.equal(gain.disconnects, 1);
});

test("codec configuration failure is contained and releases the partially created stream", async () => {
  const socket = await connect();
  AudioDecoderStub.failConfigure = true;
  assert.doesNotThrow(() => receiveAudio(socket));
  assert.equal(AudioDecoderStub.instances.at(-1)!.closed, 1);
  assert.equal(AudioContextStub.gains.at(-1)!.disconnects, 1);
  AudioDecoderStub.failConfigure = false;
  receiveAudio(socket);
  assert.equal(AudioDecoderStub.instances.length, 2);
});

test("a failed audio source start does not retain a connected playback node", async () => {
  const socket = await connect();
  receiveAudio(socket);
  AudioSourceStub.failStart = true;
  const chunk = decodedChunk();
  (AudioDecoderStub.instances.at(-1)!.callbacks as { output: (chunk: unknown) => void }).output(chunk);
  assert.ok(AudioContextStub.sources.at(-1)!.disconnects > 0);
  assert.equal(chunk.closed, 1);
});

test("late decoded chunks after disconnect close without creating playback", async () => {
  const socket = await connect();
  receiveAudio(socket);
  const old = AudioDecoderStub.instances.at(-1)!;
  voice.disconnect();
  const chunk = decodedChunk();
  (old.callbacks as { output: (chunk: unknown) => void }).output(chunk);
  assert.equal(chunk.closed, 1);
  assert.equal(AudioContextStub.sources.length, 0);
});

test("a departing speaker releases only its own playback", async () => {
  const socket = await connect();
  socket.receive({ type: "memberEnter", id: 7, nickname: "Leaving" });
  socket.receive({ type: "memberEnter", id: 8, nickname: "Staying" });
  receiveAudio(socket, 7);
  receiveAudio(socket, 8);
  const [leaving, staying] = AudioDecoderStub.instances;
  (leaving!.callbacks as { output: (chunk: unknown) => void }).output(decodedChunk());
  (staying!.callbacks as { output: (chunk: unknown) => void }).output(decodedChunk());
  const [oldSource, currentSource] = AudioContextStub.sources;
  socket.receive({ type: "memberLeave", id: 7 });
  assert.deepEqual(S().members.map(member => member.id), [8]);
  assert.equal(leaving!.closed, 1);
  assert.equal(oldSource!.stopped, 1);
  assert.equal(staying!.closed, 0);
  assert.equal(currentSource!.stopped, 0);
});

test("remote playback preserves member volume through output mute and decoder reset", async () => {
  const socket = await connect();
  voice.setVolume(7, 0.4);
  voice.setOutputVolume(0.5);
  receiveAudio(socket, 7);
  receiveAudio(socket, 8);
  assert.deepEqual(AudioContextStub.gains.map(node => node.gain.value), [0.2, 0.5]);
  voice.toggleOutputMute();
  assert.deepEqual(AudioContextStub.gains.map(node => node.gain.value), [0, 0]);
  const old = AudioDecoderStub.instances[0]!;
  old.decodeQueueSize = 3;
  receiveAudio(socket, 7);
  const replacement = AudioDecoderStub.instances.at(-1)!;
  (old.callbacks as { error: (error: unknown) => void }).error(new Error("stale decoder error"));
  assert.equal(replacement.closed, 0);
  assert.equal(AudioContextStub.gains.at(-1)!.gain.value, 0);
  voice.toggleOutputMute();
  assert.equal(AudioContextStub.gains.at(-1)!.gain.value, 0.2);
  assert.equal(AudioContextStub.gains[1]!.gain.value, 0.5);
});

test("decoded audio stays within the 80 ms playback window and recovers after overflow", async () => {
  const socket = await connect();
  receiveAudio(socket);
  const decoder = AudioDecoderStub.instances[0]!;
  const chunks = Array.from({ length: 5 }, decodedChunk);
  for (const chunk of chunks) (decoder.callbacks as { output: (chunk: unknown) => void }).output(chunk);
  assert.deepEqual(AudioContextStub.sources.map(source => source.startedAt), [0, 0.02, 0.04, 0.06]);
  assert.equal(decoder.closed, 1);
  assert.ok(AudioContextStub.sources.every(source => source.stopped === 1));
  assert.ok(chunks.every(chunk => chunk.closed === 1));
  receiveAudio(socket);
  const replacement = AudioDecoderStub.instances.at(-1)!;
  (replacement.callbacks as { output: (chunk: unknown) => void }).output(decodedChunk());
  assert.notEqual(replacement, decoder);
  assert.equal(AudioContextStub.sources.at(-1)!.startedAt, 0);
});

test("old socket audio cannot create a decoder in a replacement session", async () => {
  const old = await connect();
  const lateAudio = old.onmessage!.bind(old);
  const current = await connect();
  lateAudio({ data: new Uint8Array([4, 0, 7, 1, 2, 3]).buffer });
  assert.equal(AudioDecoderStub.instances.length, 0);
  receiveAudio(current);
  assert.equal(AudioDecoderStub.instances.length, 1);
});

// --- Wave 2D: WebRTC negotiation, audio probes, microphone test ---

type MediaElementStub = {
  play?: () => Promise<void>;
  pause?: () => void;
  remove?: () => void;
  srcObject?: unknown;
  volume: number;
  muted?: boolean;
  setSinkId?: (id: string) => Promise<void>;
  sinkId?: string;
};

const windowStub = () => globalThis.window as unknown as EventTarget & {
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (timer: number) => void;
  addEventListener: EventTarget["addEventListener"];
};

test("a successful old WebRTC answer cannot activate WebRTC for a compatibility connection", async () => {
  const first = await connectWebRtc();
  const answer = deferred<void>();
  first.peer.setRemoteDescription = () => answer.promise;
  first.socket.receive({ type: "webrtcAnswer", payload: { sdp: { type: "answer", sdp: "old-answer" } } });
  const current = await connect();
  current.receive({ type: "connected", tsClientId: 2 });
  await nextTurn();
  answer.resolve();
  await nextTurn();
  voice.setVolume(9, 0.4);
  assert.equal(current.messages.some(message => (message as { type: string }).type === "setMemberVolume"), false);
});

test("a queued track event from a closed peer cannot replace current playback", async () => {
  const first = await connectWebRtc();
  const oldOnTrack = first.peer.ontrack!;
  const current = await connectWebRtc();
  current.peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: current.peer.transceivers[1] });
  const output = [...audioElements][0];
  oldOnTrack({ streams: [microphoneStream()] });
  assert.deepEqual([...audioElements], [output]);
});

test("a late playback rejection does not restore notices or retry listeners after disconnect", async () => {
  const { peer } = await connectWebRtc();
  const playback = deferred<void>();
  const output = new TestAudioElement();
  output.play = () => playback.promise;
  (globalThis.document as unknown as { createElement: () => unknown }).createElement = () => output;
  peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: peer.transceivers[1] });
  voice.disconnect();
  playback.reject(new Error("autoplay blocked"));
  await nextTurn();
  assert.equal(V().audioNoticeCode, "");
  assert.equal(audioElements.size, 0);
});

test("a playback pause failure cannot prevent peer and microphone cleanup", async () => {
  const microphone = microphoneStream();
  devices().getUserMedia = async () => microphone;
  const { peer } = await connectWebRtc();
  peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: peer.transceivers[1] });
  const output = [...audioElements][0] as MediaElementStub;
  vi.spyOn(output, "pause").mockImplementationOnce(() => { throw new Error("Playback unavailable"); });
  assert.doesNotThrow(() => voice.disconnect());
  assert.equal(peer.connectionState, "closed");
  assert.equal((microphone.track as { readyState: string }).readyState, "ended");
  assert.equal(audioElements.size, 0);
  assert.equal(output.srcObject, null);
});

test("a peer close failure cannot prevent microphone and session cleanup", async () => {
  const microphone = microphoneStream();
  devices().getUserMedia = async () => microphone;
  const { peer } = await connectWebRtc();
  vi.spyOn(peer, "close").mockImplementationOnce(() => { throw new Error("Peer unavailable"); });
  assert.doesNotThrow(() => voice.disconnect());
  assert.equal((microphone.track as { readyState: string }).readyState, "ended");
  assert.equal(V().connected, false);
  assert.equal(voice.ws(), null);
  assert.equal(peer.ontrack, null);
  assert.equal(browserTimers.size, 0);
});

test("a playback setup failure releases its element and restores compatibility audio", async () => {
  const { peer, socket } = await connectWebRtc();
  const output = new TestAudioElement();
  let removed = false;
  output.remove = () => { removed = true; audioElements.delete(output); };
  Object.defineProperty(output, "srcObject", { set(value) { if (value) throw new Error("Playback source unavailable"); } });
  (globalThis.document as unknown as { createElement: () => unknown }).createElement = () => output;
  assert.doesNotThrow(() => peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: peer.transceivers[1] }));
  await nextTurn();
  assert.equal(removed, true);
  assert.equal(peer.connectionState, "closed");
  assert.equal(V().audioNoticeCode, "WEBRTC_FALLBACK");
  assert.equal(V().microphoneErrorCode, "");
  assert.equal(socket.messages.filter(message => (message as { type: string }).type === "webrtcStop").length, 1);
});

test("a queued old playback retry cannot play a replacement session", async () => {
  let retry: (() => void) | undefined;
  const addListener = windowStub().addEventListener.bind(windowStub());
  vi.spyOn(windowStub(), "addEventListener").mockImplementation(((type: string, callback: () => void, options?: unknown) => {
    if (type === "pointerdown") retry = callback;
    addListener(type, callback as EventListener, options as AddEventListenerOptions);
  }) as never);
  const first = await connectWebRtc();
  const blocked = new TestAudioElement();
  blocked.play = async () => { throw new Error("Gesture required"); };
  (globalThis.document as unknown as { createElement: () => unknown }).createElement = () => blocked;
  first.peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: first.peer.transceivers[1] });
  await nextTurn();
  const oldRetry = retry;
  assert.equal(typeof oldRetry, "function");
  const next = await connectWebRtc();
  const output = new TestAudioElement();
  let plays = 0;
  output.play = async () => { plays++; };
  (globalThis.document as unknown as { createElement: () => unknown }).createElement = () => output;
  next.peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: next.peer.transceivers[1] });
  await nextTurn();
  assert.equal(plays, 1);
  oldRetry!();
  await nextTurn();
  assert.equal(plays, 1);
  assert.equal(V().audioNoticeCode, "");
});

test("overlapping playback retry gestures share one in-flight play attempt", async () => {
  const { peer } = await connectWebRtc();
  const output = new TestAudioElement();
  const playback = deferred<void>();
  let plays = 0;
  output.play = () => ++plays === 1 ? Promise.reject(new Error("Gesture required")) : playback.promise;
  (globalThis.document as unknown as { createElement: () => unknown }).createElement = () => output;
  peer.ontrack?.({ streams: [microphoneStream()], track: microphoneStream().getAudioTracks()[0], transceiver: peer.transceivers[1] });
  await nextTurn();
  windowStub().dispatchEvent(new Event("pointerdown"));
  windowStub().dispatchEvent(new Event("keydown"));
  const attempts = plays;
  playback.resolve();
  await nextTurn();
  assert.equal(attempts, 2);
  assert.equal(V().audioNoticeCode, "");
});

test("failed fallback signaling still releases WebRTC and resumes compatibility capture", async () => {
  vi.spyOn(TestPeer.prototype, "createOffer").mockImplementation(async () => { throw new Error("Negotiation unavailable"); });
  const send = TestSocket.prototype.send;
  vi.spyOn(TestSocket.prototype, "send").mockImplementation(function (this: TestSocket, raw: string | ArrayBuffer) {
    if (typeof raw === "string" && (JSON.parse(raw) as { type: string }).type === "webrtcStop") throw new Error("Signal send failed");
    return send.call(this, raw);
  });
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, webrtcAvailable: true });
  await nextTurn();
  assert.equal(TestPeer.instances[0]!.connectionState, "closed");
  assert.equal(V().microphoneErrorCode, "");
  assert.equal(V().audioNoticeCode, "WEBRTC_FALLBACK");
  (AudioContextStub.processors.at(-1) as unknown as ProcessorStub).onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(0.2) } });
  assert.ok(socket.messages.some(message => message instanceof ArrayBuffer && message.byteLength === 1920));
});

test("an old fallback microphone failure cannot report into a replacement connection", async () => {
  const { peer } = await connectWebRtc();
  const permission = deferred<unknown>();
  devices().getUserMedia = () => permission.promise;
  peer.connectionState = "failed";
  peer.onconnectionstatechange?.();
  await nextTurn();
  devices().getUserMedia = async () => microphoneStream();
  await connectWebRtc();
  permission.reject(new DOMException("Old permission rejected", "NotAllowedError"));
  await nextTurn();
  assert.equal(V().microphoneErrorCode, "");
  assert.equal(V().audioNoticeCode, "");
});

test("an old answer timeout cannot hide the replacement deadline from cleanup", async () => {
  const timers: Array<() => void> = [];
  const setTimer = windowStub().setTimeout.bind(windowStub());
  vi.spyOn(windowStub(), "setTimeout").mockImplementation(((callback: () => void, ms: number) => {
    if (ms === 8000) timers.push(callback);
    return setTimer(callback, ms);
  }) as never);
  await connectWebRtc();
  await connectWebRtc();
  timers[0]!();
  voice.disconnect();
  assert.equal(browserTimers.size, 0);
});

test("disconnect settles an audio probe while browser stats are still pending", async () => {
  const { peer, socket } = await connectWebRtc();
  const stats = deferred<Map<string, unknown>>();
  peer.getStats = () => stats.promise;
  let settled = false;
  const pending = voice.measureVoiceAudioStatus().then(sample => { settled = true; return sample; });
  const request = socket.messages.find(message => (message as { type: string }).type === "audioStatsProbe") as { payload: { sequence: string } };
  socket.receive({ type: "audioStats", sequence: request.payload.sequence, stats: { transport: "webrtc" } });
  voice.disconnect();
  await nextTurn();
  const settledAtDisconnect = settled;
  stats.resolve(new Map());
  const result = await pending;
  assert.equal(settledAtDisconnect, true);
  assert.equal(result, null);
});

test("an audio probe keeps its deadline after the gateway replies", async () => {
  const { peer, socket } = await connectWebRtc();
  const stats = deferred<Map<string, unknown>>();
  peer.getStats = () => stats.promise;
  let settled = false;
  const pending = voice.measureVoiceAudioStatus(10).then(sample => { settled = true; return sample; });
  const request = socket.messages.find(message => (message as { type: string }).type === "audioStatsProbe") as { payload: { sequence: string } };
  socket.receive({ type: "audioStats", sequence: request.payload.sequence, stats: { transport: "webrtc" } });
  await new Promise(resolve => setTimeout(resolve, 25));
  const settledAtDeadline = settled;
  stats.resolve(new Map());
  const result = await pending;
  assert.equal(settledAtDeadline, true);
  assert.equal(result, null);
});

test("an old peer's browser stats cannot be combined with a replacement peer", async () => {
  const { peer, socket } = await connectWebRtc();
  const stats = deferred<Map<string, unknown>>();
  peer.getStats = () => stats.promise;
  const pending = voice.measureVoiceAudioStatus();
  const request = socket.messages.find(message => (message as { type: string }).type === "audioStatsProbe") as { payload: { sequence: string } };
  socket.receive({ type: "audioStats", sequence: request.payload.sequence, stats: { transport: "webrtc" } });
  await voice.setInputDevice("replacement");
  assert.notEqual(TestPeer.instances.at(-1), peer);
  stats.resolve(new Map());
  assert.equal(await pending, null);
});

test("a failed audio probe send completes without an unhandled diagnostic rejection", async () => {
  const { socket } = await connectWebRtc();
  const send = socket.send.bind(socket);
  vi.spyOn(socket, "send").mockImplementation((raw: string | ArrayBuffer) => {
    if (typeof raw === "string" && (JSON.parse(raw) as { type: string }).type === "audioStatsProbe") throw new Error("Probe send failed");
    return send(raw);
  });
  assert.equal(await voice.measureVoiceAudioStatus(), null);
});

test("a current audio probe retains browser metrics and accepts missing browser stats", async () => {
  const { peer, socket } = await connectWebRtc();
  peer.getStats = async () => new Map([
    ["out", { type: "outbound-rtp", kind: "audio", bytesSent: 100, packetsSent: 10 }],
    ["remote", { type: "remote-inbound-rtp", kind: "audio", packetsLost: 2, roundTripTime: 0.05 }],
  ]);
  const pending = voice.measureVoiceAudioStatus();
  const request = socket.messages.find(message => (message as { type: string }).type === "audioStatsProbe") as { payload: { sequence: string } };
  socket.receive({ type: "audioStats", sequence: request.payload.sequence, stats: { transport: "webrtc", tsSendFrames: 12 } });
  const sample = (await pending)!;
  assert.equal(sample.transport, "webrtc");
  assert.equal(sample.bridge?.tsSendFrames, 12);
  assert.equal(sample.browser?.outboundPackets, 10);
  assert.equal(sample.browser?.outboundBytes, 100);
  assert.equal(sample.browser?.outboundRttMs, 50);
  assert.equal(sample.browser?.outboundLossPercent, 20);
  peer.getStats = async () => { throw new Error("Stats unavailable"); };
  const missing = voice.measureVoiceAudioStatus();
  const nextRequest = socket.messages.filter(message => (message as { type: string }).type === "audioStatsProbe").at(-1) as { payload: { sequence: string } };
  socket.receive({ type: "audioStats", sequence: nextRequest.payload.sequence, stats: { transport: "webrtc" } });
  assert.equal((await missing)!.browser, null);
});

async function audioSample(socket: TestSocket, bridge: Record<string, unknown> = {}) {
  const pending = voice.measureVoiceAudioStatus();
  const request = socket.messages.filter(message => (message as { type: string }).type === "audioStatsProbe").at(-1) as { payload: { sequence: string } };
  socket.receive({ type: "audioStats", sequence: request.payload.sequence, stats: { transport: "websocket", ...bridge } });
  return pending;
}

test("diagnostic sample scopes follow peer replacement and fallback on one socket", async () => {
  const { socket } = await connectWebRtc();
  const first = (await audioSample(socket))!;
  const next = (await audioSample(socket))!;
  assert.equal(typeof first.scopeId, "number");
  assert.equal(next.scopeId, first.scopeId);
  await voice.setInputDevice("replacement");
  const replaced = (await audioSample(socket))!;
  assert.notEqual(replaced.scopeId, first.scopeId);
  socket.receive({ type: "webrtcError", code: "WEBRTC_UNAVAILABLE" });
  await nextTurn();
  const fallback = (await audioSample(socket))!;
  assert.notEqual(fallback.scopeId, replaced.scopeId);
  assert.equal(fallback.transport, "websocket");
});

test("session recovery resets compatibility diagnostics without mutating old snapshots", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  receiveAudio(socket);
  receiveAudio(socket);
  socket.onmessage!({ data: new Uint8Array([1, 2]).buffer });
  const previous = (await audioSample(socket))!;
  assert.equal(previous.fallbackPlayback.framesReceived, 2);
  assert.equal(previous.fallbackPlayback.framesDropped, 1);
  socket.receive({ type: "disconnected", recoverable: true });
  socket.receive({ type: "connected", tsClientId: 2 });
  await nextTurn();
  const current = (await audioSample(socket))!;
  assert.notEqual(current.scopeId, previous.scopeId);
  assert.deepEqual(current.fallbackPlayback, { framesReceived: 0, framesDropped: 0, decodeErrors: 0 });
  assert.equal(previous.fallbackPlayback.framesReceived, 2);
});

test("a probe started before peer allocation cannot survive a failed transport attempt", async () => {
  vi.spyOn(TestPeer.prototype, "createOffer").mockImplementation(async () => { throw new Error("Offer unavailable"); });
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, webrtcAvailable: true });
  const pending = voice.measureVoiceAudioStatus();
  const request = socket.messages.filter(message => (message as { type: string }).type === "audioStatsProbe").at(-1) as { payload: { sequence: string } };
  await nextTurn();
  assert.equal(TestPeer.instances.at(-1)!.connectionState, "closed");
  socket.receive({ type: "audioStats", sequence: request.payload.sequence, stats: { transport: "websocket" } });
  assert.equal(await pending, null);
});

test("disconnect clears the WebRTC answer deadline immediately", async () => {
  await connectWebRtc();
  assert.ok(browserTimers.size > 0);
  voice.disconnect();
  assert.equal(browserTimers.size, 0);
});

test("negotiation failure resumes bounded PCM capture without a false microphone error", async () => {
  vi.spyOn(TestPeer.prototype, "createOffer").mockImplementation(async () => { throw new Error("negotiation failed"); });
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, webrtcAvailable: true });
  await nextTurn();
  assert.equal(TestPeer.instances[0]!.connectionState, "closed");
  assert.equal(V().audioNoticeCode, "WEBRTC_FALLBACK");
  assert.equal(V().microphoneErrorCode, "");
  const capture = AudioContextStub.processors.at(-1) as unknown as ProcessorStub;
  capture.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(0.2) } });
  assert.ok(socket.messages.some(message => message instanceof ArrayBuffer && message.byteLength === 1920));
  assert.equal(socket.messages.filter(message => (message as { type: string }).type === "webrtcStop").length, 1);
});

test("track setup failure also releases the peer and restores compatibility capture", async () => {
  vi.spyOn(TestPeer.prototype, "addTrack").mockImplementation(() => { throw new Error("track rejected"); });
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1, webrtcAvailable: true });
  await nextTurn();
  assert.equal(TestPeer.instances[0]!.connectionState, "closed");
  assert.equal(V().audioNoticeCode, "WEBRTC_FALLBACK");
  assert.equal(V().microphoneErrorCode, "");
  (AudioContextStub.processors.at(-1) as unknown as ProcessorStub).onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(0.2) } });
  assert.ok(socket.messages.some(message => message instanceof ArrayBuffer && message.byteLength === 1920));
});

test("a current answer completes negotiation and removes its timeout", async () => {
  const { socket, peer } = await connectWebRtc();
  socket.receive({ type: "webrtcAnswer", payload: { sdp: { type: "answer", sdp: "current-answer" } } });
  await nextTurn();
  assert.equal((peer.remoteDescription as { sdp: string }).sdp, "current-answer");
  assert.equal(browserTimers.size, 0);
  assert.equal(socket.messages.some(message => (message as { type: string }).type === "webrtcStop"), false);
});

test("a completed answer pins the audio sender's encoder target to the uplink budget", async () => {
  const { socket } = await connectWebRtc();
  socket.receive({ type: "webrtcAnswer", payload: { sdp: { type: "answer", sdp: "current-answer" } } });
  await nextTurn();
  assert.equal(TestPeer.senderParameters.length, 1);
  const encodings = (TestPeer.senderParameters[0] as { encodings: Array<{ maxBitrate?: number }> }).encodings;
  assert.equal(encodings.length, 1, "an empty encodings list must be seeded before setting maxBitrate");
  assert.equal(encodings[0]!.maxBitrate, 60_000);
});

test("a rejected sender parameter update does not fail the negotiated transport", async () => {
  const { socket, peer } = await connectWebRtc();
  peer.sender.setParameters = async () => { throw new Error("setParameters rejected"); };
  socket.receive({ type: "webrtcAnswer", payload: { sdp: { type: "answer", sdp: "current-answer" } } });
  await nextTurn();
  assert.equal(socket.messages.some(message => (message as { type: string }).type === "webrtcStop"), false);
  assert.equal(V().audioNoticeCode, "", "a codec-quality-only failure must keep the WebRTC transport up");
});

test("disconnect stops a microphone test and discards its late recording", async () => {
  await voice.startMicrophoneTest();
  const recorder = RecorderStub.instances.at(-1)!;
  voice.disconnect();
  assert.equal(recorder.stops, 1);
  assert.equal(V().microphoneTestActive, false);
  recorder.finish();
  assert.equal(V().testAudioUrl, "");
});

test("a replacement microphone test stops the old recorder and ignores its late result", async () => {
  const created: unknown[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((obj: Blob | MediaSource) => { created.push(obj); return `blob:test-${created.length}`; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  await voice.startMicrophoneTest();
  const old = RecorderStub.instances.at(-1)!;
  await voice.startMicrophoneTest();
  const current = RecorderStub.instances.at(-1)!;
  assert.equal(old.stops, 1);
  current.finish();
  const currentUrl = V().testAudioUrl;
  old.finish();
  assert.equal(V().testAudioUrl, currentUrl);
  assert.equal(created.length, 1);
});

test("an old microphone test permission failure cannot stop a new recording", async () => {
  const oldPermission = deferred<unknown>();
  let requests = 0;
  devices().getUserMedia = () => ++requests === 1 ? oldPermission.promise : Promise.resolve(microphoneStream());
  const old = voice.startMicrophoneTest().catch(() => {});
  voice.stopMicrophoneTest();
  await voice.startMicrophoneTest();
  oldPermission.reject(new Error("Old permission failed"));
  await old;
  assert.equal(V().microphoneTestActive, true);
  assert.equal(RecorderStub.instances.at(-1)!.state, "recording");
});

test("stopping a microphone test while devices refresh prevents recorder creation", async () => {
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  const refresh = deferred<readonly { deviceId: string; kind: string; label: string; groupId: string }[]>();
  devices().enumerateDevices = () => refresh.promise;
  const pending = voice.startMicrophoneTest();
  voice.stopMicrophoneTest();
  refresh.resolve([]);
  await pending;
  assert.equal(RecorderStub.instances.length, 0);
  assert.equal(V().microphoneTestActive, false);
});

test("a naturally finished microphone recording clears active state and standalone capture", async () => {
  const revoked: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:finished");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => { revoked.push(url); });
  await voice.startMicrophoneTest();
  const recorder = RecorderStub.instances.at(-1)!;
  recorder.finish();
  assert.equal(V().microphoneTestActive, false);
  assert.equal((recorder.stream as { track: { readyState: string } }).track.readyState, "ended");
  assert.equal(V().testAudioUrl, "blob:finished");
  voice.disconnect();
  assert.deepEqual(revoked, ["blob:finished"]);
  assert.equal(V().testAudioUrl, "");
});

test("recorder startup failure releases standalone microphone capture", async () => {
  RecorderStub.failStart = true;
  await assert.rejects(voice.startMicrophoneTest(), /Recorder start failed/);
  assert.equal(V().microphoneTestActive, false);
  assert.equal((RecorderStub.instances.at(-1)!.stream as { track: { readyState: string } }).track.readyState, "ended");
});

test("stopping a connected microphone test publishes its recording without stopping room capture", async () => {
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:connected");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const socket = await connect();
  socket.receive({ type: "connected", tsClientId: 1 });
  await nextTurn();
  await voice.startMicrophoneTest();
  const recorder = RecorderStub.instances.at(-1)!;
  voice.stopMicrophoneTest();
  recorder.finish();
  assert.equal(V().testAudioUrl, "blob:connected");
  assert.equal((recorder.stream as { track: { readyState: string } }).track.readyState, "live");
  assert.equal(V().connected, true);
});

test("the microphone test deadline stops recording and is removed on completion", async () => {
  let deadline: (() => void) | undefined;
  const cleared: unknown[] = [];
  vi.spyOn(windowStub(), "setTimeout").mockImplementation(((callback: () => void, delay: number) => { assert.equal(delay, 5_000); deadline = callback; return 123; }) as never);
  vi.spyOn(windowStub(), "clearTimeout").mockImplementation(((timer: unknown) => cleared.push(timer)) as never);
  await voice.startMicrophoneTest();
  const recorder = RecorderStub.instances.at(-1)!;
  deadline!();
  assert.equal(recorder.stops, 1);
  assert.equal(V().microphoneTestActive, false);
  assert.deepEqual(cleared, [123]);
});

test("an asynchronous recorder failure stops capture and reports a microphone error", async () => {
  await voice.startMicrophoneTest();
  const recorder = RecorderStub.instances.at(-1)!;
  (recorder as unknown as { onerror: (event: { error: Error }) => void }).onerror({ error: new Error("Recorder failed") });
  assert.equal(recorder.stops, 1);
  assert.equal((recorder.stream as { track: { readyState: string } }).track.readyState, "ended");
  assert.equal(V().microphoneTestActive, false);
  assert.notEqual(V().microphoneErrorCode, "");
  recorder.finish();
  assert.equal(V().testAudioUrl, "");
});
