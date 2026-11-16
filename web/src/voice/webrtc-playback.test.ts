import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createWebRtcPlayback } from "./webrtc-playback";
import { audioElements, AudioContextStub, installVoiceStubs, uninstallVoiceStubs } from "../test/voice-test-stubs";

// The playback layer is the only place where member and master volume meet the
// platform: element.volume is ignored on iOS Safari, `muted` is honored
// everywhere, and a Web Audio gain pipe is the only way to render a gain other
// than 1 there.

interface ElementProbe {
  muted: boolean;
  volume: number;
  srcObject: unknown;
}

function receiverStub(packets: () => number) {
  return {
    getStats: async () => new Map([["inbound", { type: "inbound-rtp", kind: "audio", packetsReceived: packets() }]]),
  } as unknown as RTCRtpReceiver;
}

function harness(options: { master?: number; speakers?: Record<number, number> } = {}) {
  // onEndpoint fires only for slot elements, never for the mix-bus player, so
  // it is the reliable way to tell the two kinds apart.
  const endpoints: ElementProbe[] = [];
  const playback = createWebRtcPlayback({
    volume: () => options.master ?? 1,
    speakerVolume: clientId => options.speakers?.[clientId] ?? 1,
    onEndpoint: element => endpoints.push(element as unknown as ElementProbe),
    onBlocked() {},
    onPlaying() {},
    onSlotActivity() {},
  });
  const attach = (slot: number, packets: () => number) => {
    playback.attach(new MediaStream(), slot, receiverStub(packets));
    return endpoints.at(-1)!;
  };
  return { playback, attach, endpoints };
}

/** The mix-bus player element: the last audio element that is not a slot. */
function mixElement(endpoints: ElementProbe[]): ElementProbe | null {
  const slots = new Set(endpoints);
  const others = [...audioElements] as ElementProbe[];
  return others.find(element => !slots.has(element)) ?? null;
}

/** Lets the 350 ms slot poll run and its promise settle. */
async function pollOnce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(350);
  await Promise.resolve();
}

beforeEach(() => {
  installVoiceStubs();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  uninstallVoiceStubs();
});

test("a muted member is silenced with `muted`, not with element volume", async () => {
  // iOS Safari ignores element.volume: a member dragged to 0 kept playing at
  // full volume there. `muted` is honored everywhere.
  const { playback, attach } = harness({ speakers: { 7: 0 } });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, true);
  assert.equal(element.volume, 1, "the element volume is not the mute mechanism");
  assert.equal(AudioContextStub.instances.length, 0, "a mute needs no gain pipe");
});

test("master volume 0 mutes every slot", async () => {
  const { playback, attach } = harness({ master: 0 });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, true);
  assert.equal(element.volume, 1);
});

test("unity gain plays the element at full volume with no pipe", async () => {
  const { playback, attach } = harness();
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, false);
  assert.equal(element.volume, 1);
  assert.equal(AudioContextStub.instances.length, 0);
});

test("attenuation rides a gain pipe once the slot has flowed", async () => {
  // element.volume = 0.5 is ignored on iOS Safari (the member stays at full
  // volume and the master slider does nothing); the gain pipe works there.
  const { playback, attach } = harness({ master: 0.5 });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, true, "the element is muted while the pipe renders");
  const context = AudioContextStub.instances.at(-1)!;
  assert.equal(context.state, "running");
  const gain = AudioContextStub.gains.at(-1)! as unknown as { gain: { value: number } };
  assert.equal(gain.gain.value, 0.5);
  playback.stop();
});

test("attenuation before the first packet stays on element volume", async () => {
  // A pipe bound before the slot's first RTP packet renders silence forever.
  const { playback, attach } = harness({ master: 0.5 });
  const element = attach(0, () => 0);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, false);
  assert.equal(element.volume, 0.5);
  assert.equal(AudioContextStub.instances.length, 0, "no pipe before flow");
  playback.stop();
});

test("a replaced stream re-arms the flow gate", async () => {
  let packets = 5;
  const { playback, attach } = harness({ master: 0.5 });
  const first = attach(0, () => packets);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(first.muted, true, "the first stream flows, so the pipe renders");
  // A renegotiated stream starts a new RTP timeline: the pipe's source binding
  // is gone and the packet counter restarts.
  packets = 0;
  const second = attach(0, () => packets);
  assert.equal(second.muted, false, "before the new stream's first packet the element stays audible");
  assert.equal(second.volume, 0.5);
  playback.stop();
});

test("a piped gain still follows the chosen output when the context cannot route", async () => {
  // Chromium has no AudioContext.setSinkId (measured 2026-11-16: absent on the
  // prototype and the instance), so a pipe rendered into context.destination
  // could not follow a chosen device: the muted slot would sit on that device
  // while the gain played through the default one. The pipe renders into a
  // MediaStreamAudioDestinationNode instead, whose player IS a media element
  // and therefore routable — gain and device selection hold together.
  const contextWithSink = Object.getOwnPropertyDescriptor(AudioContextStub.prototype, "setSinkId");
  try {
    Object.defineProperty(AudioContextStub.prototype, "setSinkId", { value: undefined, configurable: true });
    const { playback, attach, endpoints } = harness({ master: 0.5 });
    const element = attach(0, () => 5);
    playback.setSlotClients([7]);
    await pollOnce();
    const mix = mixElement(endpoints) as unknown as { muted: boolean; sinkIds: string[] } | null;
    assert.ok(mix, "a mix-bus player element exists once a slot is piped");
    await playback.setSinkDevice("headphones");
    assert.equal(mix!.sinkIds.includes("headphones"), true, "the bus element was routed to the chosen device");
    assert.equal(element.muted, true, "the slot element stays muted as the puller");
    assert.equal(mix!.muted, false, "the bus element carries the room's audio");
    playback.stop();
  } finally {
    if (contextWithSink) Object.defineProperty(AudioContextStub.prototype, "setSinkId", contextWithSink);
    else delete (AudioContextStub.prototype as unknown as Record<string, unknown>).setSinkId;
  }
});

test("a context suspended mid-session falls back to the element and restores the pipe on resume", async () => {
  const { playback, attach } = harness({ master: 0.5 });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, true, "the pipe renders while the context runs");
  // An iOS call or a backgrounded tab suspends the context; the muted element
  // must take over instead of silencing the member.
  const context = AudioContextStub.instances.at(-1)!;
  context.state = "suspended";
  context.dispatchEvent(new Event("statechange"));
  assert.equal(element.muted, false, "the element takes over while the context is suspended");
  assert.equal(element.volume, 0.5);
  context.state = "running";
  context.dispatchEvent(new Event("statechange"));
  assert.equal(element.muted, true, "the pipe renders again once the context resumes");
  playback.stop();
});

test("speaking uses the synchronous sources and skips getStats entirely", async () => {
  // One getStats per slot per poll is a cross-thread snapshot; the receiver's
  // synchronization sources carry the same reception state for free.
  const activity: Array<[number, boolean]> = [];
  const statsCalls = { count: 0 };
  const sources: RTCRtpSynchronizationSource[] = [];
  const receiver = {
    getSynchronizationSources: () => sources,
    getStats: async () => { statsCalls.count += 1; return new Map(); },
  } as unknown as RTCRtpReceiver;
  const playback = createWebRtcPlayback({
    volume: () => 1,
    speakerVolume: () => 1,
    onEndpoint() {},
    onBlocked() {},
    onPlaying() {},
    onSlotActivity: (clientId, active) => activity.push([clientId, active]),
  });
  playback.attach(new MediaStream(), 0, receiver);
  playback.setSlotClients([7]);
  // No source yet: the slot has not flowed and must not light the badge.
  await pollOnce();
  assert.equal(activity.length, 0);
  // Chromium reports an epoch timestamp here (measured 2026-11-16), not a
  // performance.now() relative value: a stub on the wrong clock hides the
  // badge staying lit for the ~10 s the source entry survives.
  sources.push({ timestamp: Date.now(), source: 1, audioLevel: 0.2, voiceActivityFlag: true } as unknown as RTCRtpSynchronizationSource);
  await pollOnce();
  assert.deepEqual(activity.at(-1), [7, true], "a live source marks the member as speaking");
  assert.equal(statsCalls.count, 0, "no statistics snapshot was taken");
  // A source whose last packet is older than the hold means silence.
  sources[0] = { ...sources[0]!, timestamp: Date.now() - 5_000 } as unknown as RTCRtpSynchronizationSource;
  await pollOnce();
  assert.deepEqual(activity.at(-1), [7, false]);
  playback.stop();
});

test("a browser without synchronization sources falls back to getStats", async () => {
  const activity: Array<[number, boolean]> = [];
  const receiver = receiverStub(() => 10);
  const playback = createWebRtcPlayback({
    volume: () => 1,
    speakerVolume: () => 1,
    onEndpoint() {},
    onBlocked() {},
    onPlaying() {},
    onSlotActivity: (clientId, active) => activity.push([clientId, active]),
  });
  playback.attach(new MediaStream(), 0, receiver);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.deepEqual(activity.at(-1), [7, true], "the statistics fallback still detects speaking");
  playback.stop();
});

test("a hidden tab skips the slot sweep", async () => {
  // The receiver deliberately has no getSynchronizationSources: with it the
  // sweep takes the synchronous path and never calls getStats anyway, so the
  // assertion would hold even without the visibility check.
  const statsCalls = { count: 0 };
  const receiver = {
    getStats: async () => { statsCalls.count += 1; return new Map(); },
  } as unknown as RTCRtpReceiver;
  const playback = createWebRtcPlayback({
    volume: () => 1,
    speakerVolume: () => 1,
    onEndpoint() {},
    onBlocked() {},
    onPlaying() {},
    onSlotActivity() {},
  });
  playback.attach(new MediaStream(), 0, receiver);
  playback.setSlotClients([7]);
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  try {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await pollOnce();
    assert.equal(statsCalls.count, 0, "a hidden tab takes no statistics snapshot");
    // Visible again: the same receiver does poll, so the check above is not
    // passing because the sweep is broken.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await pollOnce();
    assert.equal(statsCalls.count > 0, true, "a visible tab resumes polling");
  } finally {
    if (visibility) Object.defineProperty(Document.prototype, "visibilityState", visibility);
    else delete (document as unknown as Record<string, unknown>).visibilityState;
    playback.stop();
  }
});

test("a source entry that outlives its last packet does not keep the badge lit", async () => {
  // The receiver keeps the synchronization source for ~10 s after the final
  // packet (measured on Chromium). Reading that entry's existence as "talking"
  // lit every member for ten seconds after they stopped; only the age of its
  // epoch timestamp decides.
  const activity: Array<[number, boolean]> = [];
  const sources: RTCRtpSynchronizationSource[] = [];
  const receiver = {
    getSynchronizationSources: () => sources,
    getStats: async () => new Map(),
  } as unknown as RTCRtpReceiver;
  const playback = createWebRtcPlayback({
    volume: () => 1, speakerVolume: () => 1,
    onEndpoint() {}, onBlocked() {}, onPlaying() {},
    onSlotActivity: (clientId, active) => activity.push([clientId, active]),
  });
  playback.attach(new MediaStream(), 0, receiver);
  playback.setSlotClients([7]);
  sources.push({ timestamp: Date.now(), source: 1 } as unknown as RTCRtpSynchronizationSource);
  await pollOnce();
  assert.deepEqual(activity.at(-1), [7, true]);
  // Two seconds later the entry is still there, the packet is long gone.
  sources[0] = { ...sources[0]!, timestamp: Date.now() - 2_000 } as unknown as RTCRtpSynchronizationSource;
  await pollOnce();
  assert.deepEqual(activity.at(-1), [7, false], "a stale entry is silence, not speech");
  playback.stop();
});

test("a piped slot is never played twice", async () => {
  // The whole point of muting the slot element: exactly one of {element, pipe}
  // may render a member. Leaving both connected meant hearing them twice, once
  // at full volume.
  let master = 0.5;
  const endpoints: Array<{ muted: boolean }> = [];
  const playback = createWebRtcPlayback({
    volume: () => master,
    speakerVolume: () => 1,
    onEndpoint: element => endpoints.push(element as unknown as { muted: boolean }),
    onBlocked() {},
    onPlaying() {},
    onSlotActivity() {},
  });
  playback.attach(new MediaStream(), 0, receiverStub(() => 5));
  const element = endpoints.at(-1)! as { muted: boolean };
  playback.setSlotClients([7]);
  await pollOnce();
  const slots = new Set(endpoints);
  const mix = ([...audioElements] as Array<{ muted: boolean }>).find(candidate => !slots.has(candidate as never))!;
  assert.equal(element.muted, true, "the slot element is muted while the pipe renders");
  assert.equal(mix.muted, false);
  // Back to unity gain: the pipe is torn down and the element takes over.
  master = 1;
  playback.setVolume();
  assert.equal(element.muted, false, "unity gain returns to the element");
  assert.equal(mix.muted, true, "and the bus element stops rendering, so nothing plays twice");
  playback.stop();
});

test("returning to the tab resumes an interrupted audio session", async () => {
  // Safari's non-standard \`interrupted\` state (a call, another app) needs the
  // same resume as \`suspended\`. It also matters on iOS because element.volume is
  // ignored there: while the pipe is down the member plays at full volume and
  // the slider is inert, so the session must come back without a new gesture.
  const { playback, attach } = harness({ master: 0.5 });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  const context = AudioContextStub.instances.at(-1)!;
  let resumes = 0;
  context.resume = async () => { resumes += 1; context.state = "running"; };
  context.state = "interrupted";
  context.dispatchEvent(new Event("statechange"));
  assert.equal(element.muted, false, "the element carries the gain while interrupted");
  // ampRunning already attempts a resume on the state change; the stub refuses
  // until a user is back, which is what the visibility handler covers.
  context.resume = async () => { resumes += 1; context.state = "running"; };
  context.state = "interrupted";
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  try {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(resumes > 0, true, "returning to the tab resumes an interrupted context");
    assert.equal(element.muted, true, "the pipe renders again once it is running");
  } finally {
    if (visibility) Object.defineProperty(Document.prototype, "visibilityState", visibility);
    else delete (document as unknown as Record<string, unknown>).visibilityState;
    playback.stop();
  }
});

test("a suspended context is not rebuilt and torn down on every volume tick", async () => {
  // While the context cannot run (no gesture yet, iOS interruption) every apply
  // used to create an audio node pair and immediately destroy it again — on
  // each slider tick, slot binding and speaker refresh.
  const { playback, attach } = harness({ master: 0.5 });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  const context = AudioContextStub.instances.at(-1)!;
  // Keep it down: this stub refuses to resume.
  context.resume = async () => undefined;
  context.state = "suspended";
  context.dispatchEvent(new Event("statechange"));
  const gainsBefore = AudioContextStub.gains.length;
  for (let tick = 0; tick < 5; tick++) playback.setVolume();
  assert.equal(AudioContextStub.gains.length, gainsBefore, "no pipe is built while the context cannot render");
  assert.equal(element.muted, false, "the element carries the gain meanwhile");
  playback.stop();
});

test("a blocked bus element keeps the slots on element volume instead of muting the room", async () => {
  // If the mix-bus player cannot autoplay, the slots must not be muted for a
  // pipe nobody hears — that combination is a silent room.
  const endpoints: Array<{ muted: boolean; volume: number; play(): Promise<void> }> = [];
  const playback = createWebRtcPlayback({
    volume: () => 0.5,
    speakerVolume: () => 1,
    onEndpoint: element => endpoints.push(element as unknown as { muted: boolean; volume: number; play(): Promise<void> }),
    onBlocked() {},
    onPlaying() {},
    onSlotActivity() {},
  });
  playback.attach(new MediaStream(), 0, receiverStub(() => 5));
  playback.setSlotClients([7]);
  await pollOnce();
  const slots = new Set(endpoints);
  const mix = ([...audioElements] as Array<{ muted: boolean; play(): Promise<void> }>)
    .find(candidate => !slots.has(candidate as never));
  assert.ok(mix, "a bus element exists");
  // Refuse autoplay on the bus only (the slot elements keep their own behaviour).
  mix!.play = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
  // Re-drive the pipe so the slot applies the bus state it now reports.
  await playback.play();
  playback.setVolume();
  await Promise.resolve();
  await Promise.resolve();
  const element = endpoints.at(-1)!;
  assert.equal(element.muted, false, "the slot element stays audible");
  assert.ok(element.volume <= 0.5 + 1e-9, "at its own volume, not muted");
  playback.stop();
});
