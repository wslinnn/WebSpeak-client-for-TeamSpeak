import assert from "node:assert/strict";
import { test } from "vitest";
import { decideRoute, routeIsAudible, type RouteInput } from "./webrtc-playback-route";

// The two playback paths of one slot: its own element (the only puller Chrome
// keeps alive, and the only path the output-device selector can route) and the
// gain pipe (the only way to render a gain other than 1 on iOS Safari, and the
// only way to boost past 100%). Exactly one may be live.

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    master: 1,
    speaker: 1,
    flowed: true,
    contextRunning: true,
    busBlocked: false,
    pipeAvailable: true,
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

test("attenuation and amplification both ride the pipe", () => {
  assert.deepEqual(decideRoute(input({ master: 0.5 })), { route: "pipe", elementVolume: 1 });
  assert.deepEqual(decideRoute(input({ speaker: 2 })), { route: "pipe", elementVolume: 1 });
  // 0.5 x 2 lands exactly on unity, which needs no pipe at all.
  assert.deepEqual(decideRoute(input({ master: 0.5, speaker: 2 })), { route: "element", elementVolume: 1 });
  assert.deepEqual(decideRoute(input({ master: 0.5, speaker: 3 })), { route: "pipe", elementVolume: 1 });
});

test("before the first packet the element carries the gain", () => {
  // A pipe bound before the track's first RTP packet renders silence forever.
  assert.deepEqual(decideRoute(input({ master: 0.5, flowed: false })), { route: "element", elementVolume: 0.5 });
});

test("a suspended context keeps the element audible", () => {
  assert.deepEqual(decideRoute(input({ master: 0.5, contextRunning: false })), { route: "element", elementVolume: 0.5 });
});

test("a blocked bus falls back to element volume instead of muting", () => {
  // Muting the element for a pipe nobody plays would silence the room.
  assert.deepEqual(decideRoute(input({ master: 0.5, busBlocked: true })), { route: "element", elementVolume: 0.5 });
});

test("an unavailable pipe falls back to element volume", () => {
  // The element volume cannot exceed 1, so a boost beyond 100% is clamped there
  // rather than silently applied at full level.
  assert.deepEqual(decideRoute(input({ speaker: 2, pipeAvailable: false })), { route: "element", elementVolume: 1 });
  assert.deepEqual(decideRoute(input({ master: 0.5, pipeAvailable: false })), { route: "element", elementVolume: 0.5 });
});

test("boost past 100% is only possible through the pipe", () => {
  assert.equal(decideRoute(input({ speaker: 2 })).route, "pipe");
  // Without a pipe the gain is clamped, not silently applied at full level.
  assert.deepEqual(decideRoute(input({ speaker: 2, busBlocked: true })), { route: "element", elementVolume: 1 });
});

test("audibility tells a blocked room from a degraded one", () => {
  assert.equal(routeIsAudible({ route: "muted", elementVolume: 1 }, false), false);
  assert.equal(routeIsAudible({ route: "element", elementVolume: 0.5 }, true), true, "the element does not depend on the bus");
  assert.equal(routeIsAudible({ route: "pipe", elementVolume: 1 }, true), false, "a muted element depends entirely on the bus");
  assert.equal(routeIsAudible({ route: "pipe", elementVolume: 1 }, false), true);
});
