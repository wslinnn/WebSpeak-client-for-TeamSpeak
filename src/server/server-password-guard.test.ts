import assert from "node:assert/strict";
import test from "node:test";
import { ServerPasswordGuard } from "./server-password-guard.js";

test("the first wrong-password attempts stay unblocked, then a cooldown begins", () => {
  const guard = new ServerPasswordGuard();
  const now = 1_000_000;
  for (let index = 0; index < 5; index += 1) {
    assert.equal(guard.blockedForMs("target-a", now), 0);
    guard.recordFailure("target-a", now);
  }
  // Five failures in the window arm a 30s cooldown on the next attempt.
  assert.equal(guard.blockedForMs("target-a", now + 1_000), 29_000);
  assert.equal(guard.blockedForMs("target-b", now + 1_000), 0);
});

test("cooldowns grow with repeated failures and expire after the window", () => {
  const guard = new ServerPasswordGuard();
  const now = 1_000_000;
  for (let index = 0; index < 7; index += 1) guard.recordFailure("target-a", now);
  // 7 failures: 30s * 2^2 = 120s from the last failure.
  assert.equal(guard.blockedForMs("target-a", now), 120_000);
  // The window (10 minutes) without further failures resets the target.
  assert.equal(guard.blockedForMs("target-a", now + 10 * 60 * 1000), 0);
});

test("a successful connection clears the target immediately", () => {
  const guard = new ServerPasswordGuard();
  const now = 1_000_000;
  for (let index = 0; index < 8; index += 1) guard.recordFailure("target-a", now);
  guard.recordSuccess("target-a");
  assert.equal(guard.blockedForMs("target-a", now + 1_000), 0);
});

test("tracking stays bounded when many distinct targets fail", () => {
  const guard = new ServerPasswordGuard(8);
  const now = 1_000_000;
  for (let index = 0; index < 64; index += 1) guard.recordFailure(`target-${index}`, now);
  assert.equal(guard.trackedTargetCount <= 8, true);
  // Evicted targets lose their failure history; recent ones keep it. The
  // five failures recorded for target-63 arm its first 30s cooldown.
  for (let index = 1; index < 5; index += 1) guard.recordFailure("target-63", now);
  assert.equal(guard.blockedForMs("target-63", now + 1_000), 29_000);
  assert.equal(guard.blockedForMs("target-0", now + 1_000), 0);
});
