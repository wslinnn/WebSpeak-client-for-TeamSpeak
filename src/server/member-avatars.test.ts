import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { AvatarLruCache } from "./avatar-cache.js";
import { MemberAvatarLoader } from "./member-avatars.js";
import type { TSClientAvatar } from "./ts-client.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const avatar = (value: string): TSClientAvatar => ({ cacheKey: value, data: Buffer.from(`GIF89a${value}`) });
const dataUrl = (value: string) => `data:image/gif;base64,${avatar(value).data.toString("base64")}`;

function fixture(t: TestContext, cache: Map<string, string | null> = new Map(), useMockTimers = true) {
  if (useMockTimers) t.mock.timers.enable({ apis: ["setTimeout"] });
  const members = new Map<number, { id: number; uid: string }>();
  const calls: number[] = [];
  const published: Array<{ uid: string; avatar: string }> = [];
  const errors: unknown[] = [];
  const state = { current: true, load: async (_id: number, uid: string): Promise<TSClientAvatar | null> => avatar(uid) };
  const loader = new MemberAvatarLoader({
    members, cache, isCurrent: () => state.current,
    load: (id, uid) => { calls.push(id); return state.load(id, uid); },
    publish: (uid, image) => published.push({ uid, avatar: image }),
    onError: (_id, _uid, error) => errors.push(error),
  });
  const add = (id: number, uid = `user-${id}`) => { members.set(id, { id, uid }); };
  const tick = async (ms = 0) => { t.mock.timers.tick(ms); await nextTurn(); };
  t.after(() => loader.close());
  return { loader, members, cache, calls, published, errors, state, add, tick };
}

test("avatar batches deduplicate identities and contain optional download failures", async t => {
  const f = fixture(t);
  f.add(1); f.add(2, "user-1"); f.add(3); f.add(4); f.add(5, ""); f.add(6);
  f.cache.set("user-6", null);
  f.state.load = async id => {
    if (id === 3) return { cacheKey: "invalid", data: Buffer.from("not an image") };
    if (id === 4) throw new Error("Permission denied");
    return avatar("one");
  };
  f.loader.schedule(); f.loader.schedule();
  await f.tick();
  assert.deepEqual(f.calls, [2, 3, 4]);
  assert.deepEqual(f.published, [{ uid: "user-1", avatar: dataUrl("one") }]);
  assert.equal(f.cache.get("user-1"), dataUrl("one"));
  assert.equal(f.cache.get("user-3"), null);
  assert.equal(f.cache.get("user-4"), null);
  assert.equal(f.errors.length, 1);
  f.loader.schedule(); await f.tick();
  assert.equal(f.calls.length, 3, "known absent/denied avatars must not cause a retry loop");
});

test("reset expires only negative cache entries so reconnects retry failures, not successes", async t => {
  const f = fixture(t);
  f.add(1); f.add(2);
  f.state.load = async id => (id === 2 ? avatar("two") : Promise.reject(new Error("Permission denied")));
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1, 2]);
  assert.equal(f.cache.get("user-1"), null);
  assert.equal(f.cache.get("user-2"), dataUrl("two"));
  f.loader.reset();
  assert.equal(f.cache.has("user-1"), false, "negative entries expire with the session");
  assert.equal(f.cache.get("user-2"), dataUrl("two"), "positive entries survive the session");
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1, 2, 1], "only the failed uid is downloaded again");
});

for (const outcome of ["success", "failure"] as const) {
  test(`a late old avatar ${outcome} cannot cache data or unlock a newer batch`, async t => {
    const f = fixture(t);
    f.add(1);
    const old = deferred<TSClientAvatar | null>();
    const fresh = deferred<TSClientAvatar | null>();
    f.state.load = () => old.promise;
    f.loader.schedule(); await f.tick();
    f.loader.reset();
    f.state.load = () => fresh.promise;
    f.loader.schedule(); await f.tick();
    if (outcome === "success") old.resolve(avatar("old"));
    else old.reject(new Error("Old connection failed"));
    await nextTurn();
    assert.equal(f.cache.size, 0);
    assert.equal(f.errors.length, 0);
    f.loader.schedule(); await f.tick(250);
    assert.deepEqual(f.calls, [1, 1], "the newer pending batch must still own the work");
    fresh.resolve(avatar("fresh")); await nextTurn();
    assert.equal(f.cache.get("user-1"), dataUrl("fresh"));
    assert.deepEqual(f.published, [{ uid: "user-1", avatar: dataUrl("fresh") }]);
  });
}

test("closing a scheduled avatar loader clears its timer and future work but keeps the shared cache", async t => {
  const f = fixture(t);
  f.add(1); f.cache.set("other", dataUrl("other"));
  f.loader.schedule(100);
  f.loader.close(); f.loader.close();
  f.loader.schedule(); await f.tick(1_000);
  assert.equal(f.calls.length, 0);
  assert.equal(f.cache.get("other"), dataUrl("other"));
});

test("client ID reuse cannot attach a departed member's avatar to its replacement", async t => {
  const f = fixture(t);
  f.add(1, "departed");
  const pending = deferred<TSClientAvatar | null>();
  f.state.load = () => pending.promise;
  f.loader.schedule(); await f.tick();
  f.add(1, "replacement");
  pending.resolve(avatar("old")); await nextTurn();
  assert.equal(f.cache.size, 0);
  assert.equal(f.published.length, 0);
  f.state.load = async () => avatar("new");
  await f.tick(250);
  assert.deepEqual(f.published.map(message => message.uid), ["replacement"]);
  assert.equal(f.cache.get("replacement"), dataUrl("new"));
});

test("avatar work keeps a 50-member batch and cancels the delayed remainder on close", async t => {
  const f = fixture(t);
  for (let id = 1; id <= 55; id++) f.add(id);
  f.loader.schedule(); await f.tick();
  assert.equal(f.calls.length, 50);
  await f.tick(249);
  assert.equal(f.calls.length, 50);
  await f.tick(1);
  assert.equal(f.calls.length, 55);
  f.add(56); f.loader.schedule(250); f.loader.close();
  await f.tick(250);
  assert.equal(f.calls.length, 55);
});

test("members arriving during an active batch are scheduled without overlapping downloads", async t => {
  const f = fixture(t);
  const pending = deferred<TSClientAvatar | null>();
  f.add(1);
  f.state.load = () => pending.promise;
  f.loader.schedule(); await f.tick();
  f.add(2); f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1]);
  f.state.load = async () => avatar("second");
  pending.resolve(avatar("first")); await nextTurn();
  await f.tick(250);
  assert.deepEqual(f.calls, [1, 2]);
  assert.deepEqual(f.published.map(message => message.uid), ["user-1", "user-2"]);
});

test("a shared cache satisfies a new session without a second download", async t => {
  const cache = new Map<string, string | null>();
  const first = fixture(t, cache);
  first.add(1);
  first.loader.schedule(); await first.tick();
  assert.deepEqual(first.calls, [1]);
  first.loader.close();
  const second = fixture(t, cache, false);
  second.add(9, "user-1");
  second.loader.schedule(); await nextTurn();
  assert.deepEqual(second.calls, [], "the warm uid must skip the SDK download");
});

test("avatar LRU cache evicts the least recently read entry beyond capacity", () => {
  const cache = new AvatarLruCache(2);
  cache.set("a", "1");
  cache.set("b", "2");
  assert.equal(cache.get("a"), "1");
  cache.set("c", "3");
  assert.equal(cache.has("b"), false);
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("c"), true);
  assert.equal(cache.size, 2);
  cache.delete("a");
  assert.equal(cache.has("a"), false);
  assert.equal(cache.get("missing"), undefined);
});
