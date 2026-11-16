import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { sourceAgeMs, sourceClockNow } from "./webrtc-slot-activity";

// `RTCRtpSynchronizationSource.timestamp` has no single clock across browsers:
// Chromium stamps it with the monotonic epoch (`timeOrigin + performance.now()`,
// measured 2026-11-16), the spec wording suggests the relative clock. Both
// shapes must be read correctly — getting it wrong makes a member look like they
// are speaking for as long as the receiver keeps the source entry.

afterEach(() => {
  vi.restoreAllMocks();
});

test("an epoch timestamp is aged against the monotonic epoch clock", () => {
  const origin = performance.timeOrigin;
  const now = origin + performance.now();
  assert.ok(Math.abs(sourceAgeMs(now - 250, now) - 250) < 2);
  assert.ok(Math.abs(sourceAgeMs(now - 10_000, now) - 10_000) < 2, "a ten-second-old packet is long past the hold");
});

test("a relative timestamp is aged against performance.now()", () => {
  const relative = performance.now();
  const now = performance.timeOrigin + relative;
  // The spec form: a small relative value, far below any epoch reading.
  assert.ok(Math.abs(sourceAgeMs(relative - 250, now) - 250) < 2);
});

test("an epoch timestamp in the future clamps to zero instead of a negative age", () => {
  const now = performance.timeOrigin + performance.now();
  assert.equal(sourceAgeMs(now + 5_000, now), 0);
  assert.equal(sourceAgeMs(sourceClockNow() + 60_000, sourceClockNow()), 0);
});

test("a relative timestamp above performance.now() is read as old, not as speech", () => {
  // Ambiguous by construction: a value just above the relative clock could be a
  // future relative stamp or a long-past epoch one. The epoch reading wins,
  // which ages it as long silent — a member must never look like they are
  // talking because of clock skew.
  const now = performance.timeOrigin + performance.now();
  assert.ok(sourceAgeMs(performance.now() + 5_000, now) > 1_000);
});

test("the monotonic clock tracks the wall clock but does not follow it backwards", () => {
  const monotonic = sourceClockNow();
  const wall = Date.now();
  assert.ok(Math.abs(monotonic - wall) < 5_000, "the two clocks agree in normal operation");
  // A wall-clock jump is exactly what this clock must ignore: with Date.now()
  // forced an hour back, the monotonic reading stays put.
  vi.spyOn(Date, "now").mockReturnValue(wall - 3_600_000);
  assert.ok(Math.abs(sourceClockNow() - monotonic) < 5_000);
});
