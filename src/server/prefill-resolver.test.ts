import assert from "node:assert/strict";
import test from "node:test";
import { createPrefillResolver } from "./prefill-resolver.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("concurrent cold requests share one lookup", async () => {
  const gate = deferred<boolean>();
  let calls = 0;
  const blocked = createPrefillResolver(() => { calls += 1; return gate.promise; }, { ttlMs: 0 });
  // 三路并发同时冷启动：只允许一次上游查询。
  const pending = [blocked("guild"), blocked("guild"), blocked("guild")];
  assert.equal(calls, 1);
  gate.resolve(false);
  assert.deepEqual(await Promise.all(pending), [false, false, false]);
  assert.equal(calls, 1);
});

test("a completed result is cached for the TTL and refreshed after it", async () => {
  let now = 1_000;
  let calls = 0;
  const blocked = createPrefillResolver(async () => { calls += 1; return calls === 1; }, { ttlMs: 30_000, clock: () => now });
  assert.equal(await blocked("guild"), true);
  // TTL 内不再查询。
  now += 29_999;
  assert.equal(await blocked("guild"), true);
  assert.equal(calls, 1);
  // 过期后重新查询（这次返回未阻断）。
  now += 2;
  assert.equal(await blocked("guild"), false);
  assert.equal(calls, 2);
});

test("different targets keep their own in-flight lookup", async () => {
  const first = deferred<boolean>();
  const second = deferred<boolean>();
  const gates = new Map([["a", first], ["b", second]]);
  let calls = 0;
  const blocked = createPrefillResolver((target) => { calls += 1; return gates.get(target)!.promise; }, { ttlMs: 0 });
  const a = blocked("a");
  const b = blocked("b");
  assert.equal(calls, 2);
  first.resolve(false);
  second.resolve(true);
  assert.deepEqual(await Promise.all([a, b]), [false, true]);
});

test("a failed lookup fails closed and is cached like a result", async () => {
  let calls = 0;
  const blocked = createPrefillResolver(async () => { calls += 1; throw new Error("registry down"); }, { ttlMs: 30_000 });
  assert.equal(await blocked("guild"), true);
  assert.equal(await blocked("guild"), true);
  assert.equal(calls, 1, "a failure is cached too, so a down registry is not hammered");
});
