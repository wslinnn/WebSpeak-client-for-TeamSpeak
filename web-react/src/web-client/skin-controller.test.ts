// Ported from web/test/skin-lifecycle.test.mjs — page-level controller
// semantics (old usePublicSkin) plus the runtime/catalog lifecycle baselines.
// The old vite-plugin module swap for local-persistence became vi.mock.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { setImmediate as nextTurn } from "node:timers/promises";

vi.mock("@/services/local-persistence", () => {
  const storage = () => (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!;
  return {
    isLocalPersistenceAvailable: () => true,
    getInstalledSkin: (id: string) => storage().get(id),
    saveInstalledSkin: (value: unknown) => storage().save(value),
    listInstalledSkins: () => storage().list(),
    loadLocalPreferences: () => storage().preferences(),
    saveLocalPreferences: (value: unknown) => storage().persist(value),
  };
});

import { createSkinController } from "./skin-controller";
import * as runtime from "@/services/skin-runtime";
import * as catalog from "@/services/skin-catalog";

interface SkinStorageDouble {
  get(id: string): Promise<unknown>;
  save(value: unknown): Promise<void>;
  list(): Promise<unknown[]>;
  preferences(): Promise<{ schemaVersion: number; theme?: string }>;
  persist(value: unknown): Promise<void>;
}

interface FakeElement {
  dataset: Record<string, string>;
  textContent: string;
  id: string;
  classList: { toggle(): void; add(): void; remove(): void };
  append(el: FakeElement): void;
  remove(): void;
  matches(): boolean;
  querySelectorAll(): FakeElement[];
}

const skin = (id: string) => ({ id, name: id, version: "1.0.0", minAppVersion: "0.2.6", css: `[data-ws-skin="${id}"] { --skin-test: blue; }`, assets: {}, installedAt: 1 });
const json = (body: unknown) => new Response(JSON.stringify(body));

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

let installed: Map<string, ReturnType<typeof skin>>;
let writes: Array<{ skinId?: string }>;
let storageMap: Map<string, string>;
let elements: Map<string, FakeElement>;
let root: FakeElement;
let handler: (url: unknown, init?: { signal?: AbortSignal }) => Promise<Response>;

function element(): FakeElement {
  const el: FakeElement = {
    dataset: {}, textContent: "", id: "",
    classList: { toggle() {}, add() {}, remove() {} },
    append(added) { elements.set(added.id, added); },
    remove() { elements.delete(el.id); },
    matches: () => false,
    querySelectorAll: () => [],
  };
  return el;
}

beforeEach(async () => {
  installed = new Map(); writes = []; storageMap = new Map(); elements = new Map();
  root = element();
  const documentElement = element(); const head = element(); const body = element();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => void storageMap.set(key, value),
    removeItem: (key: string) => void storageMap.delete(key),
  });
  vi.stubGlobal("document", {
    documentElement, head, body,
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: () => element(),
    querySelectorAll: () => [root],
  });
  vi.stubGlobal("HTMLElement", element);
  vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage = {
    get: async (id) => installed.get(id) ?? null,
    save: async (value) => void installed.set((value as { id: string }).id, value as ReturnType<typeof skin>),
    list: async () => [...installed.values()],
    preferences: async () => ({ schemaVersion: 1 }),
    persist: async (value) => void writes.push(value as { skinId?: string }),
  };
  handler = async () => json({ skins: [] });
  vi.stubGlobal("fetch", ((url: unknown, init?: { signal?: AbortSignal }) => handler(url, init)) as typeof fetch);
  // A failed directory load keeps locally installed packages available.
  handler = async () => { throw new Error("offline"); };
  await catalog.listPublicSkins();
});
afterEach(() => {
  runtime.clearCustomSkinStyle();
  vi.unstubAllGlobals();
});

const page = () => createSkinController({ timeoutMs: 40 });
const S = (controller: ReturnType<typeof page>) => controller.store.getState();

test("a late custom activation cannot replace a newer built-in choice", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  const old = runtime.activateSkin("sample.a").catch((error: unknown) => error);
  await runtime.activateSkin("builtin.dark");
  read.resolve(skin("sample.a")); await old;
  assert.equal(runtime.getStoredSkinId(), "builtin.dark");
  assert.equal(root.dataset.wsSkin, "builtin.dark");
  assert.equal(elements.has("webspeak-active-custom-skin"), false);
});

test("a late failed download cannot fall back over a newer custom skin", async () => {
  const download = deferred<never>();
  handler = () => download.promise as unknown as Promise<Response>;
  const old = runtime.activateSkin("sample.a").catch((error: unknown) => error);
  await nextTurn();
  installed.set("sample.b", skin("sample.b"));
  await runtime.activateSkin("sample.b");
  download.reject(new Error("old network failure")); await old;
  assert.equal(runtime.getStoredSkinId(), "sample.b");
  assert.equal(root.dataset.wsSkin, "sample.b");
});

test("clearing a skin invalidates an outstanding local read", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  const old = runtime.activateSkin("sample.a").catch((error: unknown) => error);
  runtime.clearCustomSkinStyle(); read.resolve(skin("sample.a")); await old;
  assert.equal(elements.has("webspeak-active-custom-skin"), false);
  assert.equal(runtime.getStoredSkinId(), null);
});

test("aborting an activation prevents a late read from modifying the next page", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  const owner = new AbortController();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  const old = runtime.activateSkin("sample.a", undefined, "0.2.6", { signal: owner.signal }).catch((error: unknown) => error);
  owner.abort(); read.resolve(skin("sample.a")); await old;
  assert.equal(elements.has("webspeak-active-custom-skin"), false);
  assert.equal(runtime.getStoredSkinId(), null);
});

test("a stale directory response cannot enable skins disabled by a newer response", async () => {
  const response = deferred<Response>();
  handler = () => response.promise;
  const old = catalog.listPublicSkins().catch((error: unknown) => error);
  handler = async () => json({ skins: [], defaultSkinId: "builtin.dark" });
  await catalog.listPublicSkins();
  response.resolve(json({ skins: [{ ...skin("sample.a"), author: "test", license: "MIT", enabled: true }], defaultSkinId: "sample.a" }));
  await old;
  assert.equal(catalog.getPublicDefaultSkinId(), "builtin.dark");
  assert.equal(catalog.isPublicSkinEnabled("sample.a"), false);
});

test("a skin load deadline settles a hung local read and rejects its late result", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  await assert.rejects(runtime.activateSkin("sample.a", undefined, "0.2.6", { timeoutMs: 10 }), { name: "TimeoutError" });
  read.resolve(skin("sample.a")); await nextTurn();
  assert.equal(elements.has("webspeak-active-custom-skin"), false);
});

test("the directory deadline includes a hanging JSON body and aborts its request", async () => {
  const body = deferred<unknown>();
  let signal: AbortSignal | undefined;
  handler = (_url, init) => {
    signal = init?.signal;
    return Promise.resolve({ ok: true, json: () => body.promise } as unknown as Response);
  };
  await assert.rejects(catalog.listPublicSkins({ timeoutMs: 10 }), { name: "TimeoutError" });
  assert.equal(signal?.aborted, true);
  body.resolve({ skins: [], defaultSkinId: "builtin.dark" }); await nextTurn();
  assert.equal(catalog.getPublicDefaultSkinId(), "builtin.light");
});

test("the package deadline includes a hanging archive body", async () => {
  const body = deferred<unknown>();
  let signal: AbortSignal | undefined;
  handler = (_url, init) => {
    signal = init?.signal;
    return Promise.resolve({ ok: true, blob: () => body.promise } as unknown as Response);
  };
  await assert.rejects(runtime.activateSkin("sample.a", undefined, "0.2.6", { timeoutMs: 10 }), { name: "TimeoutError" });
  assert.equal(signal?.aborted, true);
  body.resolve(new Blob(["invalid"])); await nextTurn();
  assert.equal(runtime.getStoredSkinId(), null);
});

test("page state and saved preferences belong to the last selected skin", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  const view = page();
  const old = view.select("sample.a");
  await view.select("builtin.dark");
  read.resolve(skin("sample.a")); await old;
  assert.equal(S(view).activeSkinId, "builtin.dark");
  assert.equal(S(view).activeSkin, null);
  assert.equal(S(view).themeMode, "dark");
  assert.deepEqual(writes.map((value) => value.skinId), ["builtin.dark"]);
  view.dispose();
});

test("first paint becomes usable when the directory never answers", async () => {
  const response = deferred<Response>();
  handler = () => response.promise;
  const view = page();
  assert.equal(S(view).skinReady, false);
  await view.initialize();
  assert.equal(S(view).skinReady, true);
  assert.equal(S(view).activeSkinId, "builtin.light");
  await view.select("builtin.dark");
  response.resolve(json({ skins: [], defaultSkinId: "builtin.light" })); await nextTurn();
  assert.equal(S(view).activeSkinId, "builtin.dark");
  assert.equal(root.dataset.wsSkin, "builtin.dark");
  view.dispose();
});

test("a persisted custom choice cannot keep first paint hidden on a hung package", async () => {
  storageMap.set("webspeak:skin-choice", "sample.a");
  handler = async (url) => url === "/api/skins"
    ? json({ skins: [{ ...skin("sample.a"), author: "test", license: "MIT" }] })
    : new Promise<Response>(() => {});
  const view = page();
  await view.initialize();
  assert.equal(S(view).skinReady, true);
  assert.equal(S(view).activeSkinId, "builtin.light");
  assert.equal(storageMap.get("webspeak:skin-choice"), "sample.a", "fallback preserves the deliberate choice for a future retry");
  view.dispose();
});

test("disposing a page settles its pending skin without publishing or persisting", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  const view = page();
  const old = view.select("sample.a");
  view.dispose();
  await old;
  await runtime.activateSkin("builtin.dark");
  read.resolve(skin("sample.a")); await nextTurn();
  assert.equal(runtime.getStoredSkinId(), "builtin.dark");
  assert.equal(S(view).activeSkin, null);
  assert.deepEqual(writes, []);
});

test("a manual choice wins over an unfinished page initialization", async () => {
  const response = deferred<Response>();
  handler = () => response.promise;
  const view = page();
  const old = view.initialize();
  await view.select("builtin.dark");
  response.resolve(json({ skins: [], defaultSkinId: "builtin.light" }));
  await old;
  assert.equal(S(view).activeSkinId, "builtin.dark");
  assert.equal(S(view).skinReady, true);
  assert.deepEqual(writes.map((value) => value.skinId), ["builtin.dark"]);
  view.dispose();
});

test("normal initialization uses the instance default and cached custom content", async () => {
  const item = { ...skin("sample.a"), author: "test", license: "MIT", contentData: { title: "custom" } };
  installed.set(item.id, item as never);
  handler = async () => json({ skins: [item], defaultSkinId: item.id });
  const view = page();
  await view.initialize();
  assert.equal(S(view).skinReady, true);
  assert.equal(S(view).activeSkinId, item.id);
  assert.deepEqual((S(view).activeSkin as { contentData?: unknown } | null)?.contentData, item.contentData);
  assert.equal(S(view).themeMode, "system", "initializing a default custom skin must not override the saved system theme");
  assert.equal(storageMap.has("webspeak:skin-choice"), false);
  assert.equal(root.dataset.wsSkin, item.id);
  view.dispose();
});

test("reset prevents outstanding choices from restoring cleared state", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  const view = page();
  const old = view.select("sample.a");
  handler = async () => json({ skins: [] });
  await view.reset();
  read.resolve(skin("sample.a")); await old;
  assert.equal(S(view).activeSkin, null);
  assert.equal(S(view).activeSkinId, "builtin.light");
  assert.equal(elements.has("webspeak-active-custom-skin"), false);
  assert.deepEqual(writes, []);
  view.dispose();
});

test("an already aborted caller cannot cancel the next page's activation", async () => {
  const read = deferred<ReturnType<typeof skin>>();
  (globalThis as { skinStorage?: SkinStorageDouble }).skinStorage!.get = () => read.promise;
  const current = runtime.activateSkin("sample.b");
  const retired = new AbortController();
  retired.abort();
  await assert.rejects(runtime.activateSkin("sample.a", undefined, undefined, { signal: retired.signal }), { name: "AbortError" });
  read.resolve(skin("sample.b")); await current;
  assert.equal(runtime.getStoredSkinId(), "sample.b");
});

test("a failed DOM installation releases the candidate's compiled asset URLs", async () => {
  const original = URL.revokeObjectURL;
  const revoked: string[] = [];
  URL.revokeObjectURL = (value: string) => { revoked.push(value); original(value); };
  installed.set("sample.a", { ...skin("sample.a"), css: 'a { background-image: url("wskin-asset:art.png"); }', assets: { "art.png": new Blob(["asset"]) } } as never);
  const defaultAppend = (document.head as unknown as { append: (el: FakeElement) => void }).append.bind(document.head);
  (document.head as unknown as { append: (el: FakeElement) => void }).append = (added) => {
    if (added.id === "webspeak-active-custom-skin") throw new Error("simulated DOM failure");
    defaultAppend(added);
  };
  try {
    assert.equal(await runtime.activateSkin("sample.a"), null);
    assert.equal(revoked.length, 1);
    assert.equal(elements.has("webspeak-active-custom-skin-base"), false);
    assert.equal(runtime.getStoredSkinId(), "builtin.light");
  } finally { URL.revokeObjectURL = original; }
});

test("theme switches keep an active custom skin only when preservation is requested", async () => {
  root.dataset.wsSkin = "sample.custom";
  const { saveTheme } = await import("@/services/theme");
  saveTheme("dark", { preserveCustomSkins: true });
  assert.equal(root.dataset.wsSkin, "sample.custom", "a custom skin owns the data-ws-skin namespace across theme flips");
  assert.equal((document as unknown as { documentElement: FakeElement }).documentElement.dataset.theme, "dark");
  assert.equal(storageMap.get("webspeak:theme"), "dark");
  saveTheme("light");
  assert.equal(root.dataset.wsSkin, "builtin.light", "an unpreserved switch hands appearance back to the builtin skin");
});
