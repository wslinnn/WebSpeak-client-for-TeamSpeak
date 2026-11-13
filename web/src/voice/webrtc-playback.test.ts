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

function lastElement(): ElementProbe {
  const elements = [...audioElements] as ElementProbe[];
  assert.ok(elements.length > 0, "a slot element must exist");
  return elements.at(-1)!;
}

function harness(options: { master?: number; speakers?: Record<number, number> } = {}) {
  const playback = createWebRtcPlayback({
    volume: () => options.master ?? 1,
    speakerVolume: clientId => options.speakers?.[clientId] ?? 1,
    onEndpoint() {},
    onBlocked() {},
    onPlaying() {},
    onSlotActivity() {},
  });
  const attach = (slot: number, packets: () => number) => {
    playback.attach(new MediaStream(), slot, receiverStub(packets));
    return lastElement();
  };
  return { playback, attach };
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
