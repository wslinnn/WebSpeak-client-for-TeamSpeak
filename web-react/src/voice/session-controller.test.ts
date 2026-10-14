// @vitest-environment node
// Node environment on purpose: the legacy spec ran in plain node where
// `typeof Image === "undefined"` routes avatar probes straight into the cache;
// jsdom's Image never fires onload (no resource loader), which would wedge
// the avatar path under test.
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createVoiceSessionController, type VoiceSessionController } from "./session-controller";
import {
  AudioContextStub,
  TestSocket,
  deferred,
  displayStream,
  fakeStorage,
  installVoiceStubs,
  uninstallVoiceStubs,
} from "../test/voice-test-stubs";

// Ported from web/test/voice-session.test.mjs (spec contract), adapted to the
// framework-free controller: Vue's in-place reactive identity no longer holds
// by design — the store replaces arrays/objects so React can observe changes.
// Assertions that pinned Vue identity now pin the replacement semantics; the
// "channel projections share the member object" invariant is kept as-is.
// Defer to wave 2: chat ack pipeline, audio devices, accompaniment, mic test,
// playback decoders, WebRTC negotiation, screen-share signaling details.

let voice: VoiceSessionController;

const V = () => voice.view();
const S = () => voice.session.store.getState();

beforeEach(() => {
  installVoiceStubs();
  voice = createVoiceSessionController();
});

afterEach(() => {
  voice?.stopMicrophoneTest();
  voice?.disconnect();
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
    // Five budgeted attempts (1s..15s), each dying again, exhaust the schedule;
    // the sixth schedule call abandons instead of arming another timer.
    for (let attempt = 0; attempt < 5; attempt++) {
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
