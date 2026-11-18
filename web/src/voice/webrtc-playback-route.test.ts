import assert from "node:assert/strict";
import { test } from "vitest";
import { decideRoute, routeIsAudible, type RouteInput } from "./webrtc-playback-route";

// The two playback paths of one slot: its own element (the only puller Chrome
// keeps alive, the only path the output-device selector can route, and the only
// one that shares the receiver's clock) and the gain pipe (the only way to boost
// past 100% and the only way to render a gain on iOS Safari, whose element
// volume writes are ignored). Exactly one may be live.

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    master: 1,
    speaker: 1,
    flowed: true,
    contextRunning: true,
    sinkRoutable: true,
    pipeAvailable: true,
    elementVolumeHonored: true,
    ...overrides,
  };
}

test("unity gain renders through the element with no pipe", () => {
  assert.deepEqual(decideRoute(input()), { route: "element", elementVolume: 1 });
});

test("a muted master or member uses `muted`, never volume 0", () => {
  // iOS Safari ignores element.volume writes: a muted-by-volume member would
  // keep playing at full level there.
  assert.deepEqual(decideRoute(input({ master: 0 })), { route: "muted", elementVolume: 1 });
  assert.deepEqual(decideRoute(input({ speaker: 0 })), { route: "muted", elementVolume: 1 });
  assert.deepEqual(decideRoute(input({ master: 0.5, speaker: 0 })), { route: "muted", elementVolume: 1 });
});

test("attenuation stays on the element where element volume is honoured", () => {
  // The pipe plays the stream through a second media element with its own
  // clock; on hardware that does not run the context's rate the two drift and
  // playback stretches. Every engine except iOS Safari renders element volume,
  // so attenuation must not pay that cost.
  assert.deepEqual(decideRoute(input({ master: 0.5 })), { route: "element", elementVolume: 0.5 });
  assert.deepEqual(decideRoute(input({ master: 0.5, speaker: 1.5 })), { route: "element", elementVolume: 0.75 });
  assert.deepEqual(decideRoute(input({ master: 0.1 })), { route: "element", elementVolume: 0.1 });
});

test("attenuation rides the pipe only where element volume is ignored", () => {
  assert.deepEqual(
    decideRoute(input({ master: 0.5, elementVolumeHonored: false })),
    { route: "pipe", elementVolume: 1 },
  );
});

test("amplification always needs the pipe", () => {
  // The element volume cannot exceed 1, so a boost is only possible through it.
  assert.deepEqual(decideRoute(input({ speaker: 2 })), { route: "pipe", elementVolume: 1 });
  assert.deepEqual(decideRoute(input({ master: 0.5, speaker: 3 })), { route: "pipe", elementVolume: 1 });
  // 0.5 x 2 lands exactly on unity, which needs no pipe at all.
  assert.deepEqual(decideRoute(input({ master: 0.5, speaker: 2 })), { route: "element", elementVolume: 1 });
});

test("before the first packet the element carries the gain", () => {
  // A pipe bound before the track's first RTP packet renders silence forever.
  assert.deepEqual(decideRoute(input({ master: 0.5, flowed: false })), { route: "element", elementVolume: 0.5 });
  assert.deepEqual(
    decideRoute(input({ speaker: 2, flowed: false })),
    { route: "element", elementVolume: 1 },
  );
});

test("a suspended context keeps the element audible", () => {
  assert.deepEqual(decideRoute(input({ speaker: 2, contextRunning: false })), { route: "element", elementVolume: 1 });
  assert.deepEqual(
    decideRoute(input({ master: 0.5, elementVolumeHonored: false, contextRunning: false })),
    { route: "element", elementVolume: 0.5 },
  );
});

test("a pipe that cannot reach the chosen sink clamps the boost to unity", () => {
  // The pipe renders through AudioContext.destination, which always plays on the
  // default device (Chromium has no AudioContext.setSinkId, measured
  // 2026-11-18). A boost there would leave the chosen device silent for that
  // member, so it is clamped instead of silently applied at full level.
  assert.deepEqual(decideRoute(input({ speaker: 2, sinkRoutable: false })), { route: "element", elementVolume: 1 });
  // Attenuation and unity are unaffected: they stay on the routable element.
  assert.deepEqual(decideRoute(input({ master: 0.5, sinkRoutable: false })), { route: "element", elementVolume: 0.5 });
});

test("an unavailable pipe falls back to element volume", () => {
  // The element volume cannot exceed 1, so a boost beyond 100% is clamped there
  // rather than silently applied at full level.
  assert.deepEqual(decideRoute(input({ speaker: 2, pipeAvailable: false })), { route: "element", elementVolume: 1 });
  assert.deepEqual(
    decideRoute(input({ master: 0.5, elementVolumeHonored: false, pipeAvailable: false })),
    { route: "element", elementVolume: 0.5 },
  );
});

test("audibility tells a blocked room from a degraded one", () => {
  assert.equal(routeIsAudible({ route: "muted", elementVolume: 1 }, false), false);
  assert.equal(routeIsAudible({ route: "element", elementVolume: 0.5 }, true), true, "the element does not depend on the bus");
  assert.equal(routeIsAudible({ route: "pipe", elementVolume: 1 }, true), false, "a muted element depends entirely on the bus");
  assert.equal(routeIsAudible({ route: "pipe", elementVolume: 1 }, false), true);
});
