import assert from "node:assert/strict";
import test from "node:test";
import { ByteBucketRateLimiter } from "./byte-bucket-rate-limit.js";

const MIB = 1024 * 1024;

test("a full bucket always admits the first download and clamps to zero (报告 21 S5)", () => {
  const limiter = new ByteBucketRateLimiter(24 * MIB, 8 * MIB);
  // 单包 20MiB < 容量 24MiB：首次点击必须拿到全量包，不受「余额不足」影响。
  assert.equal(limiter.allow("peer", 20 * MIB, 1_000), true);
  // 随后余额为 4MiB：同尺寸再下立即被拒。
  assert.equal(limiter.allow("peer", 20 * MIB, 1_001), false);
});

test("refill admits a second download after enough budget accrues, and Retry-After matches", () => {
  const limiter = new ByteBucketRateLimiter(24 * MIB, 8 * MIB);
  assert.equal(limiter.allow("peer", 20 * MIB, 0), true);
  // 1.5 分钟后回填 12MiB → 16MiB 余额，仍不够 20MiB。
  assert.equal(limiter.allow("peer", 20 * MIB, 90_000), false);
  const blockedForMs = limiter.blockedForMs("peer", 20 * MIB, 90_000);
  assert.equal(blockedForMs, Math.ceil((4 * MIB / (8 * MIB)) * 60_000));
  // 再过 30s（共 2 分钟）回填到 20MiB → 放行。
  assert.equal(limiter.allow("peer", 20 * MIB, 120_000), true);
});

test("304 revalidation (bytes=0) never consumes budget", () => {
  const limiter = new ByteBucketRateLimiter(24 * MIB, 8 * MIB);
  assert.equal(limiter.allow("peer", 20 * MIB, 1_000), true);
  for (let index = 0; index < 50; index++) {
    assert.equal(limiter.allow("peer", 0, 1_000 + index), true, "zero-byte revalidations stay free");
  }
  assert.equal(limiter.allow("peer", 20 * MIB, 1_050), false, "the full-download budget is untouched by revalidations");
});

test("peers are independent and the tracked-peer set stays bounded", () => {
  const limiter = new ByteBucketRateLimiter(24 * MIB, 8 * MIB, 4);
  assert.equal(limiter.allow("a", 24 * MIB, 1_000), true);
  assert.equal(limiter.allow("b", 24 * MIB, 1_000), true);
  assert.equal(limiter.allow("a", 24 * MIB, 1_001), false, "peer a is spent");
  assert.equal(limiter.allow("c", 24 * MIB, 1_001), true);
  // 第 5 个对端把最老的 a 逐出：a 以满桶重新起算。
  assert.equal(limiter.allow("d", 24 * MIB, 1_002), true);
  assert.equal(limiter.allow("e", 24 * MIB, 1_003), true);
  assert.equal(limiter.allow("a", 24 * MIB, 1_004), true, "evicted peer restarts full");
});

test("blockedForMs reports zero for peers that can proceed right now", () => {
  const limiter = new ByteBucketRateLimiter(24 * MIB, 8 * MIB);
  assert.equal(limiter.blockedForMs("fresh", 20 * MIB, 1_000), 0, "full bucket admits immediately");
  assert.equal(limiter.allow("fresh", 20 * MIB, 1_000), true);
  assert.equal(limiter.blockedForMs("fresh", 0, 1_001), 0, "free revalidations report zero wait");
});
