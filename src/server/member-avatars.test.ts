import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { AvatarLruCache, type AvatarEntry } from "./avatar-cache.js";
import { AvatarService } from "./avatar-service.js";
import { MemberAvatarLoader } from "./member-avatars.js";
import type { TSClientAvatar } from "./ts-client.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const gif = (value: string): Buffer => Buffer.from(`GIF89a${value}`);
const avatar = (value: string): TSClientAvatar => ({ cacheKey: value, data: gif(value) });
const secret = Buffer.alloc(32, 7);

function fixture(t: TestContext, service = new AvatarService(new AvatarLruCache(128), secret), useMockTimers = true) {
  if (useMockTimers) t.mock.timers.enable({ apis: ["setTimeout"] });
  const members = new Map<number, { id: number; uid: string }>();
  const calls: number[] = [];
  const published: Array<{ uid: string; url: string }> = [];
  const errors: unknown[] = [];
  const state = { current: true, load: async (_id: number, uid: string): Promise<TSClientAvatar | null> => avatar(uid) };
  const loader = new MemberAvatarLoader({
    members,
    avatarUrl: uid => service.url(uid),
    store: (uid, data) => service.store(uid, data),
    isCurrent: () => state.current,
    load: (id, uid) => { calls.push(id); return state.load(id, uid); },
    publish: (uid, url) => published.push({ uid, url }),
    onError: (_id, _uid, error) => errors.push(error),
  });
  const add = (id: number, uid = `user-${id}`) => { members.set(id, { id, uid }); };
  const urlOf = (uid: string) => service.url(uid)!;
  const tick = async (ms = 0) => { t.mock.timers.tick(ms); await nextTurn(); };
  t.after(() => loader.close());
  return { loader, service, members, calls, published, errors, state, add, urlOf, tick };
}

test("avatar batches deduplicate identities and contain optional download failures", async t => {
  const f = fixture(t);
  f.add(1); f.add(2, "user-1"); f.add(3); f.add(4); f.add(5, ""); f.add(6);
  f.state.load = async id => {
    if (id === 3) return { cacheKey: "invalid", data: Buffer.from("not an image") };
    if (id === 4) throw new Error("Permission denied");
    if (id === 6) return null;
    return avatar("one");
  };
  f.loader.schedule(); f.loader.schedule();
  await f.tick();
  assert.deepEqual(f.calls, [2, 3, 4, 6]);
  assert.deepEqual(f.published, [{ uid: "user-1", url: f.urlOf("user-1") }]);
  assert.ok(f.service.url("user-1"));
  assert.equal(f.service.url("user-3"), null, "unusable images are not stored");
  assert.equal(f.service.url("user-4"), null, "failures are view-local, not shared");
  assert.equal(f.service.url("user-6"), null, "absent avatars are not stored");
  assert.equal(f.errors.length, 1);
  f.loader.schedule(); await f.tick();
  assert.equal(f.calls.length, 4, "known absent/denied avatars must not cause a retry loop");
});

test("reset expires only view-local state so reconnects retry failures, not successes", async t => {
  const f = fixture(t);
  f.add(1); f.add(2);
  f.state.load = async id => (id === 2 ? avatar("two") : Promise.reject(new Error("Permission denied")));
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1, 2]);
  assert.equal(f.service.url("user-1"), null, "failures stay view-local");
  assert.deepEqual(f.loader.snapshot(), [{ uid: "user-2", url: f.urlOf("user-2") }]);
  f.loader.reset();
  assert.deepEqual(f.loader.snapshot(), [{ uid: "user-2", url: f.urlOf("user-2") }], "positive entries survive the session");
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1, 2, 1], "only the failed uid is downloaded again");
  assert.equal(f.published.length, 1, "cached positives ride the snapshot, not the download loop");
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
    assert.equal(f.service.url("user-1"), null);
    assert.equal(f.errors.length, 0);
    f.loader.schedule(); await f.tick(250);
    assert.deepEqual(f.calls, [1, 1], "the newer pending batch must still own the work");
    fresh.resolve(avatar("fresh")); await nextTurn();
    assert.deepEqual(f.published, [{ uid: "user-1", url: f.urlOf("user-1") }]);
  });
}

test("closing a scheduled avatar loader clears its timer and future work but keeps the shared cache", async t => {
  const f = fixture(t);
  f.add(1);
  f.service.store("other", gif("other"));
  f.loader.schedule(100);
  f.loader.close(); f.loader.close();
  f.loader.schedule(); await f.tick(1_000);
  assert.equal(f.calls.length, 0);
  assert.ok(f.service.url("other"));
});

test("client ID reuse cannot attach a departed member's avatar to its replacement", async t => {
  const f = fixture(t);
  f.add(1, "departed");
  const pending = deferred<TSClientAvatar | null>();
  f.state.load = () => pending.promise;
  f.loader.schedule(); await f.tick();
  f.add(1, "replacement");
  pending.resolve(avatar("old")); await nextTurn();
  assert.equal(f.service.url("departed"), null);
  assert.equal(f.published.length, 0);
  f.state.load = async () => avatar("new");
  await f.tick(250);
  assert.deepEqual(f.published.map(message => message.uid), ["replacement"]);
  assert.ok(f.service.url("replacement"));
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

test("a shared service satisfies a new session without a second download", async t => {
  const service = new AvatarService(new AvatarLruCache(128), secret);
  const first = fixture(t, service);
  first.add(1);
  first.loader.schedule(); await first.tick();
  assert.deepEqual(first.calls, [1]);
  first.loader.close();
  const second = fixture(t, service, false);
  second.add(9, "user-1");
  assert.deepEqual(
    second.loader.snapshot(),
    [{ uid: "user-1", url: first.urlOf("user-1") }],
    "the warm uid is served by the snapshot without any transfer",
  );
  second.loader.schedule(); await second.tick();
  assert.deepEqual(second.calls, [], "the warm uid must skip the SDK download");
  assert.deepEqual(second.published, [], "delivery rides the snapshot; the loop only pushes new downloads");
});

test("a reattached view is served cached URLs again without a second download", async t => {
  const f = fixture(t);
  f.add(1); f.add(2);
  f.state.load = async id => (id === 2 ? avatar("two") : Promise.reject(new Error("Permission denied")));
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.published, [{ uid: "user-2", url: f.urlOf("user-2") }]);
  // Page refresh: the same view reattaches through attachSocket, reusing this
  // loader whose download ledger still holds every member.
  f.loader.retryFailedDownloads();
  assert.deepEqual(f.loader.snapshot(), [{ uid: "user-2", url: f.urlOf("user-2") }]);
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1, 2, 1], "only the errored transfer is retried for the reattached view");
});

test("reattach retries transfer errors once but keeps true absents settled", async t => {
  const f = fixture(t);
  f.add(1); f.add(2);
  f.state.load = async id => (id === 1 ? Promise.reject(new Error("transfer port blocked")) : null);
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1, 2]);
  assert.deepEqual(f.published, []);
  f.loader.retryFailedDownloads();
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.calls, [1, 2, 1], "the errored transfer is retried, the absent avatar is not");
  f.state.load = async () => avatar("late");
  f.loader.retryFailedDownloads();
  f.loader.schedule(); await f.tick();
  assert.deepEqual(f.published, [{ uid: "user-1", url: f.urlOf("user-1") }], "a recovered transfer finally delivers");
});

test("avatar service keys URLs by identity and versions them by content", () => {
  const service = new AvatarService(new AvatarLruCache(4), Buffer.alloc(32, 3));
  assert.equal(service.url("uid-1"), null, "nothing cached yet");
  assert.equal(service.store("uid-1", Buffer.from("not an image")), false, "unusable bytes are refused");
  assert.equal(service.store("uid-1", Buffer.alloc(0)), false, "empty bytes are refused");
  assert.ok(service.store("uid-1", gif("one")));
  const first = service.url("uid-1")!;
  assert.match(first, /^\/avatars\/[0-9a-f]{32}\?v=[0-9a-f]{16}$/);
  assert.ok(service.store("uid-1", gif("two")));
  const second = service.url("uid-1")!;
  assert.notEqual(first, second, "changed content rotates the version query");
  const aid = first.slice("/avatars/".length, first.indexOf("?"));
  assert.equal(service.serve(aid)?.mime, "image/gif");
  assert.equal(service.serve(aid)?.hash, second.slice(second.indexOf("?v=") + 3));
  assert.equal(service.serve("nothex"), null, "malformed ids miss");
  assert.equal(service.serve("0".repeat(32)), null, "unknown ids miss");
});

test("avatar LRU cache evicts the least recently read entry beyond capacity", () => {
  const cache = new AvatarLruCache(2);
  const entry = (value: string): AvatarEntry => ({ data: gif(value), mime: "image/gif", hash: value });
  cache.set("a", entry("1"));
  cache.set("b", entry("2"));
  assert.equal(cache.get("a")?.hash, "1");
  cache.set("c", entry("3"));
  assert.equal(cache.has("b"), false);
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("c"), true);
  assert.equal(cache.size, 2);
  cache.delete("a");
  assert.equal(cache.has("a"), false);
  assert.equal(cache.get("missing"), undefined);
});
