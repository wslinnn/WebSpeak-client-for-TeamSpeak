import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createWebRtcPlayback } from "./webrtc-playback";
import { audioElements, AudioContextStub, installVoiceStubs, TestAudioElement, uninstallVoiceStubs } from "../test/voice-test-stubs";

// The playback layer is the only place where member and master volume meet the
// platform: element.volume is ignored on iOS Safari, `muted` is honored
// everywhere, and a Web Audio gain pipe is the only way to render a gain other
// than 1 there — and the only way to boost past 100% anywhere.

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

function harness(options: { master?: number; speakers?: Record<number, number>; volumeIgnored?: boolean } = {}) {
  // onEndpoint fires only for slot elements, never for the mix-bus player, so
  // it is the reliable way to tell the two kinds apart.
  TestAudioElement.ignoreVolumeWrites = options.volumeIgnored === true;
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

test("the gain pipe adopts the device sample rate instead of forcing 48 kHz", async () => {
  // Forcing 48 kHz made the bus resample against hardware that commonly runs
  // 44.1 kHz; the bus's player element has its own clock, so nothing absorbed
  // the resulting drift and playback stretched (Android Chrome, 2026-11-18).
  const { playback, attach } = harness({ master: 1, speakers: { 7: 2 } });
  attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(AudioContextStub.instances.length, 1, "the pipe built one context");
  const options = AudioContextStub.options.at(-1);
  assert.equal(options?.sampleRate, undefined, "no sampleRate is pinned on the context");
  playback.stop();
});

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

test("attenuation rides a gain pipe only where element volume is ignored", async () => {
  // iOS Safari drops element.volume = 0.5 (the member stays at full volume and
  // the master slider does nothing); the gain pipe works there.
  const { playback, attach } = harness({ master: 0.5, volumeIgnored: true });
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

test("attenuation stays on the element where element volume is honoured", async () => {
  // The pipe plays through a second media element with an independent clock, so
  // routing plain attenuation through it stretched playback on Android Chrome
  // (measured 2026-11-18). Engines that render element volume must not pay that.
  const { playback, attach } = harness({ master: 0.5 });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, false, "the element keeps rendering the member");
  assert.equal(element.volume, 0.5);
  assert.equal(AudioContextStub.instances.length, 0, "no pipe for plain attenuation");
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
  const { playback, attach } = harness({ master: 1, speakers: { 7: 2 } });
  const first = attach(0, () => packets);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(first.muted, true, "the first stream flows, so the pipe renders");
  // A renegotiated stream starts a new RTP timeline: the pipe's source binding
  // is gone and the packet counter restarts.
  packets = 0;
  const second = attach(0, () => packets);
  assert.equal(second.muted, false, "before the new stream's first packet the element stays audible");
  assert.equal(second.volume, 1, "the element is clamped to unity until the pipe can bind");
  playback.stop();
});

test("a piped gain renders into the audio destination, with no second element", async () => {
  // The pipe used to feed a shared MediaStreamAudioDestinationNode played by a
  // second hidden element, so a boosted member could follow a non-default sink.
  // That detour crossed three clock domains and stretched playback (measured
  // 2026-11-18, desktop and mobile). It now renders straight into
  // AudioContext.destination; only the per-slot elements remain.
  const { playback, attach, endpoints } = harness({ master: 1, speakers: { 7: 2 } });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await pollOnce();
  assert.equal(element.muted, true, "the slot element is muted while the pipe renders");
  assert.equal(endpoints.length, 1, "only the slot element exists");
  assert.equal(mixElement(endpoints), null, "no mix-bus player element was created");
  const gain = AudioContextStub.gains.at(-1) as unknown as { gain: { value: number } };
  assert.equal(gain.gain.value, 2, "the boost is applied at the gain node");
  playback.stop();
});

test("a boosted member returns to the element at unity gain", async () => {
  // Exactly one of {element, pipe} may render a member: leaving both live meant
  // hearing them twice, once at full volume.
  let master = 2;
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
  assert.equal(element.muted, true, "the slot element is muted while the pipe renders");
  master = 1;
  playback.setVolume();
  assert.equal(element.muted, false, "unity gain returns to the element");
  playback.stop();
});

test("a non-default sink clamps a boost to unity instead of going silent", async () => {
  // destination always plays on the default device, so piping a boosted gain
  // while another sink is selected would leave that member inaudible. The route
  // clamps to 100% and stays on the routable element.
  const { playback, attach } = harness({ master: 1, speakers: { 7: 2 } });
  const element = attach(0, () => 5);
  playback.setSlotClients([7]);
  await playback.setSinkDevice("headphones");
  assert.equal(element.muted, false, "the element stays audible");
  assert.equal(element.volume, 1, "the boost is clamped to unity");
  playback.stop();
});

test("a context suspended mid-session falls back to the element and restores the pipe on resume", async () => {
  const { playback, attach } = harness({ master: 1, speakers: { 7: 2 } });
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
  assert.equal(element.volume, 1, "the boost is clamped to unity without a pipe");
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

test("returning to the tab resumes an interrupted audio session", async () => {
  // Safari's non-standard \`interrupted\` state (a call, another app) needs the
  // same resume as \`suspended\`. It also matters on iOS because element.volume is
  // ignored there: while the pipe is down the member plays at full volume and
  // the slider is inert, so the session must come back without a new gesture.
  const { playback, attach } = harness({ master: 1, speakers: { 7: 2 } });
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
  const { playback, attach } = harness({ master: 1, speakers: { 7: 2 } });
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

test("a piped member is never reported as a blocked room", async () => {
  // A piped slot mutes its element, but the gain pipe renders into the audio
  // device and the autoplay policy cannot refuse it. Folding the muted
  // element's play() result into the verdict would raise a false banner.
  const events: string[] = [];
  const endpoints: Array<{ muted: boolean; play(): Promise<void> }> = [];
  const playback = createWebRtcPlayback({
    volume: () => 2,
    speakerVolume: () => 1,
    onEndpoint: element => endpoints.push(element as unknown as { muted: boolean; play(): Promise<void> }),
    onBlocked: blocked => events.push(blocked ? "blocked" : "clear"),
    onPlaying: () => events.push("playing"),
    onSlotActivity() {},
  });
  playback.attach(new MediaStream(), 0, receiverStub(() => 5));
  playback.setSlotClients([7]);
  await pollOnce();
  // Every element obeys the browser rule from now on.
  for (const element of [...audioElements] as Array<{ muted: boolean; play(): Promise<void> }>) {
    element.play = function play(this: { muted: boolean }) {
      return this.muted ? Promise.resolve() : Promise.reject(new DOMException("blocked", "NotAllowedError"));
    };
  }
  events.length = 0;
  await playback.play();
  assert.equal(events.includes("blocked"), false, "the pipe carries the member, so the room is not blocked");
  playback.stop();
});

test("a refused slot element raises the blocked notice", async () => {
  // With no bus in the picture an unmuted element is the member's only path, so
  // its refusal must surface instead of leaving a silent room unexplained.
  const events: string[] = [];
  const playback = createWebRtcPlayback({
    volume: () => 1,
    speakerVolume: () => 1,
    onEndpoint() {},
    onBlocked: blocked => events.push(blocked ? "blocked" : "clear"),
    onPlaying: () => events.push("playing"),
    onSlotActivity() {},
  });
  playback.attach(new MediaStream(), 0, receiverStub(() => 5));
  playback.setSlotClients([7]);
  await pollOnce();
  for (const element of [...audioElements] as Array<{ muted: boolean; play(): Promise<void> }>) {
    element.play = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
  }
  events.length = 0;
  await playback.play();
  assert.deepEqual(events, ["blocked"]);
  playback.stop();
});

