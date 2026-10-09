import assert from "node:assert/strict";
import test from "node:test";
import { CommandRateLimiter, shouldReportRateLimit } from "./command-rate-limit.js";

test("the bucket allows a burst, then refills at the sustained rate", () => {
  const limiter = new CommandRateLimiter(30, 20, 0);
  for (let index = 0; index < 30; index += 1) {
    assert.equal(limiter.tryRemoveToken(0), true);
  }
  // The burst is spent; a refill of 20/s allows one more token every 50ms.
  assert.equal(limiter.tryRemoveToken(10), false);
  assert.equal(limiter.tryRemoveToken(50), true);
  assert.equal(limiter.tryRemoveToken(60), false);
  assert.equal(limiter.tryRemoveToken(100), true);
});

test("idle time refills the bucket back up to its capacity", () => {
  const limiter = new CommandRateLimiter(30, 20, 0);
  for (let index = 0; index < 30; index += 1) limiter.tryRemoveToken(0);
  // One idle second at 20/s refills exactly 20 tokens.
  for (let index = 0; index < 20; index += 1) {
    assert.equal(limiter.tryRemoveToken(1_000), true);
  }
  assert.equal(limiter.tryRemoveToken(1_000), false);
});

test("rate-limit notices merge to at most one per interval", () => {
  assert.equal(shouldReportRateLimit(0, 500), false);
  assert.equal(shouldReportRateLimit(0, 1_000), true);
  assert.equal(shouldReportRateLimit(1_000, 1_500), false);
});
