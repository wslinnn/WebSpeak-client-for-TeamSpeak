// @vitest-environment node
// 旧 web/test/identity-dialog.test.mjs 平移（22 用例）：代际纪律、导出 URL 生命周期、启动恢复。
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createHomeIdentity } from "./home-identity";
import { createHomeStore } from "./home-store";

const bytes = (value: string) => new TextEncoder().encode(value).buffer;
const file = (pending: { promise: Promise<ArrayBuffer>; resolve: (value: ArrayBuffer) => void }) =>
  ({ size: 10, arrayBuffer: () => pending.promise });

let material: string;
let remember: boolean;
let notices: string[];
let store: ReturnType<typeof createHomeStore>;
let identity: ReturnType<typeof createHomeIdentity>;
let documentOverridden = false;
const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

const dialog = () => store.getState().identityDialog;

function deferred<T = ArrayBuffer>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mount(extra: Partial<Parameters<typeof createHomeIdentity>[0]> = {}) {
  material = "previous-material";
  remember = false;
  notices = [];
  store = createHomeStore();
  store.setState({ identityMaterial: material, rememberIdentity: remember });
  identity = createHomeIdentity({
    store,
    showToast: (message) => notices.push(message),
    t: (key) => key,
    ...extra,
  });
  identity.show();
}

function overrideDocument(document: unknown): void {
  documentOverridden = true;
  vi.stubGlobal("document", document);
}

beforeEach(() => {
  documentOverridden = false;
});
afterEach(() => {
  identity?.dispose();
  if (documentOverridden) vi.unstubAllGlobals();
  else vi.restoreAllMocks();
  if (originalDescriptor) Object.defineProperty(globalThis, "document", originalDescriptor);
});

test("only the latest chosen file can replace identity text", async () => {
  mount();
  const a = deferred(), b = deferred();
  const first = identity.readFile(file(a)), second = identity.readFile(file(b));
  b.resolve(bytes("new selection")); await second;
  a.resolve(bytes("old selection")); await first;
  expect(dialog().text).toBe("new selection");
});

test("an old read rejection cannot replace a newer read result", async () => {
  mount();
  const a = deferred();
  const first = identity.readFile(file(a));
  await identity.readFile({ size: 3, arrayBuffer: async () => bytes("new") });
  a.reject(new Error("read failed")); await first;
  expect(dialog().error).toBe("");
  expect(dialog().text).toBe("new");
});

test("closing and reopening the dialog retires its pending file", async () => {
  mount();
  const a = deferred(), first = identity.readFile(file(a));
  identity.close(); identity.show();
  a.resolve(bytes("old dialog")); await first;
  expect(dialog().open).toBe(true);
  expect(dialog().text).toBe("");
});

test("manual editing wins over an already pending file read", async () => {
  mount();
  const a = deferred(), first = identity.readFile(file(a));
  identity.setText("new manual input");
  a.resolve(bytes("file")); await first;
  expect(dialog().text).toBe("new manual input");
});

test("rejecting a new oversized file also retires the previous selection", async () => {
  mount();
  const a = deferred(), first = identity.readFile(file(a));
  await identity.readFile({ size: 128 * 1024 + 1, arrayBuffer: () => { throw new Error("must not read"); } });
  a.resolve(bytes("old file")); await first;
  expect(dialog().text).toBe("");
  expect(dialog().error).toBe("identityImportErrorTooLarge");
});

test("unmount prevents a pending file from writing back", async () => {
  mount();
  const a = deferred(), first = identity.readFile(file(a));
  identity.dispose(); a.resolve(bytes("file")); await first;
  expect(dialog().text).toBe("");
});

test("unmount prevents a pending parse from replacing identity or notifying", async () => {
  const parsed = deferred<string>(); mount({ parse: () => parsed.promise });
  identity.setText("submitted");
  const pending = identity.submit(); identity.dispose();
  parsed.resolve("new-material"); await pending;
  expect(store.getState().identityMaterial).toBe("previous-material");
  expect(store.getState().rememberIdentity).toBe(false);
  expect(notices).toEqual([]);
});

test("normal import commits once and keeps the busy close guard", async () => {
  const parsed = deferred<string>();
  let calls = 0;
  mount({ parse: (value) => { expect(value).toBe("submitted"); calls++; return parsed.promise; } });
  identity.setText("submitted");
  const pending = identity.submit();
  await identity.submit(); identity.close();
  expect(dialog().open).toBe(true);
  expect(dialog().busy).toBe(true);
  parsed.resolve("new-material"); await pending;
  expect(store.getState().identityMaterial).toBe("new-material");
  expect(store.getState().rememberIdentity).toBe(true);
  expect(dialog().open).toBe(false);
  expect(dialog().text).toBe("");
  expect(dialog().busy).toBe(false);
  expect(calls).toBe(1);
  expect(notices).toEqual(["identityImportSuccess"]);
});

test("an obsolete read cannot clear a newer file's reading state", async () => {
  mount();
  const a = deferred(), b = deferred();
  const first = identity.readFile(file(a)), second = identity.readFile(file(b));
  a.resolve(bytes("old")); await first;
  expect(dialog().reading).toBe(true);
  b.resolve(bytes("new")); await second;
  expect(dialog().reading).toBe(false);
});

test("submitting waits for the selected file and editing cancels the old read", async () => {
  let submitted = "";
  mount({ parse: async (value) => { submitted = value; return "new-material"; } });
  identity.setText("previous text");
  const read = deferred(), pending = identity.readFile(file(read));
  await identity.submit(); expect(submitted).toBe("");
  identity.setText("manual text");
  await identity.submit();
  read.resolve(bytes("obsolete file")); await pending;
  expect(submitted).toBe("manual text");
  expect(dialog().text).toBe("");
  expect(dialog().open).toBe(false);
});

test("text edits retire a pending parse without losing the new draft", async () => {
  const parsed = deferred<string>(); mount({ parse: () => parsed.promise });
  identity.setText("old");
  const pending = identity.submit();
  identity.setText("new");
  parsed.resolve("obsolete-material"); await pending;
  expect(store.getState().identityMaterial).toBe("previous-material");
  expect(dialog().text).toBe("new");
  expect(dialog().busy).toBe(false);
  expect(notices).toEqual([]);
});

test("reset retires a parse and its late rejection cannot affect a new submission", async () => {
  const a = deferred<string>(), b = deferred<string>();
  let count = 0;
  mount({ parse: () => ++count === 1 ? a.promise : b.promise });
  identity.setText("old");
  const first = identity.submit();
  identity.reset(); identity.show(); identity.setText("new");
  const second = identity.submit();
  a.reject(new Error("obsolete failure")); await first;
  expect(dialog().error).toBe("");
  expect(dialog().busy).toBe(true);
  b.resolve("new-material"); await second;
  expect(store.getState().identityMaterial).toBe("new-material");
});

test("current parse failure preserves the draft and allows retry", async () => {
  mount({ parse: async () => { throw new Error("invalid"); } });
  identity.setText("invalid draft"); await identity.submit();
  expect(dialog().text).toBe("invalid draft");
  expect(dialog().error).toBe("identityImportErrorInvalidKey");
  expect(dialog().busy).toBe(false);
  expect(store.getState().identityMaterial).toBe("previous-material");
  identity.close();
  expect(dialog().open).toBe(false);
});

test("file decoding retains UTF-8 and both UTF-16 BOM forms", async () => {
  mount();
  for (const data of [new Uint8Array(bytes("测试")), new Uint8Array([0xff, 0xfe, 0x4b, 0x6d, 0xd5, 0x8b]), new Uint8Array([0xfe, 0xff, 0x6d, 0x4b, 0x8b, 0xd5])]) {
    await identity.readFile({ size: data.length, arrayBuffer: async () => data.buffer as ArrayBuffer });
    expect(dialog().text).toBe("测试");
    expect(dialog().error).toBe("");
    expect(dialog().reading).toBe(false);
  }
  await identity.readFile({ size: 1, arrayBuffer: async () => new Uint8Array([0xff]).buffer as ArrayBuffer });
  expect(dialog().error).toBe("identityImportErrorMalformed");
  expect(dialog().text).toBe("测试");
  await identity.readFile({ size: 0, arrayBuffer: async () => bytes("") });
  expect(dialog().error).toBe("identityImportErrorEmpty");
});

interface ExportDom { created: string[]; revoked: string[]; links: Array<Record<string, unknown>>; timers: Set<() => void>; }
function exportDom(options: { clickFailure?: boolean; removeFailure?: boolean } = {}): ExportDom {
  const created: string[] = [], revoked: string[] = [], links: Array<Record<string, unknown>> = [];
  const timers = new Set<() => void>();
  const fakeUrl = class extends URL {
    static createObjectURL(): string { const url = `blob:test-${created.length}`; created.push(url); return url; }
    static revokeObjectURL(url: string): void { revoked.push(url); }
  };
  vi.stubGlobal("URL", fakeUrl);
  vi.stubGlobal("setTimeout", ((callback: () => void, ms?: number) => {
    expect(ms).toBe(1000);
    timers.add(callback);
    // 控制器把返回值当句柄回传给 clearTimeout——这里直接以回调本身作句柄。
    return callback;
  }) as unknown as typeof setTimeout);
  const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
  vi.stubGlobal("clearTimeout", ((timer: unknown) => {
    timers.delete(timer as () => void);
    return realClearTimeout(timer as Parameters<typeof realClearTimeout>[0]);
  }) as unknown as typeof clearTimeout);
  overrideDocument({
    body: { append(link: { appended?: boolean }) { link.appended = true; } },
    createElement(tag: string) {
      expect(tag).toBe("a");
      const link: Record<string, unknown> = {
        click() { if (options.clickFailure) throw new Error("click failed"); this.clicked = true; },
        remove() { if (options.removeFailure) throw new Error("remove failed"); this.removed = true; },
      };
      links.push(link);
      return link;
    },
  });
  documentOverridden = true;
  return { created, revoked, links, timers };
}

test("export coalesces pending clicks, removes its anchor and revokes its URL", async () => {
  const dom = exportDom();
  const serialized = deferred<string>();
  let calls = 0;
  mount({ serialize: (value) => { calls++; expect(value).toBe("previous-material"); return serialized.promise; } });
  store.setState({ rememberIdentity: true });
  const pending = identity.exportIdentity(); await identity.exportIdentity();
  serialized.resolve("exported ini"); await pending;
  expect(calls).toBe(1);
  expect(dom.links[0]?.download).toBe("webspeak-identity.ini");
  expect(dom.links[0]?.clicked).toBe(true);
  expect(dom.links[0]?.removed).toBe(true);
  expect(dialog().exporting).toBe(false);
  for (const callback of [...dom.timers]) callback();
  expect(dom.revoked).toEqual(dom.created);
  expect(dom.timers.size).toBe(0);
});

test("unmount discards a pending export without creating a download or toast", async () => {
  const dom = exportDom();
  const serialized = deferred<string>();
  mount({ serialize: () => serialized.promise });
  store.setState({ rememberIdentity: true });
  const pending = identity.exportIdentity(); identity.dispose();
  serialized.resolve("old identity"); await pending;
  expect(dom.created).toEqual([]);
  expect(notices).toEqual([]);
});

test("identity changes retire old exports even if the original identity is restored", async () => {
  const dom = exportDom();
  const old = deferred<string>(), latest = deferred<string>();
  let calls = 0;
  mount({ serialize: () => ++calls === 1 ? old.promise : latest.promise });
  store.setState({ rememberIdentity: true });
  const first = identity.exportIdentity();
  store.setState({ identityMaterial: "replacement" });
  store.setState({ identityMaterial: "previous-material" });
  const second = identity.exportIdentity();
  old.reject(new Error("obsolete")); await first;
  expect(dialog().exporting).toBe(true);
  expect(notices).toEqual([]);
  latest.resolve("current identity"); await second;
  expect(dom.created.length).toBe(1);
  identity.dispose();
  expect(dom.revoked).toEqual(dom.created);
  expect(dom.timers.size).toBe(0);
});

test("turning remembered identity off prevents a late export", async () => {
  const dom = exportDom();
  const serialized = deferred<string>();
  mount({ serialize: () => serialized.promise });
  store.setState({ rememberIdentity: true });
  const pending = identity.exportIdentity();
  store.setState({ rememberIdentity: false });
  serialized.resolve("identity"); await pending;
  expect(dom.created).toEqual([]);
  expect(notices).toEqual([]);
});

test("failed download clicks release URLs even if removing the anchor also fails", async () => {
  const dom = exportDom({ clickFailure: true, removeFailure: true });
  mount({ serialize: async () => "identity" });
  store.setState({ rememberIdentity: true });
  await identity.exportIdentity();
  expect(dom.revoked).toEqual(dom.created);
  expect(dom.timers.size).toBe(0);
  expect(dialog().exporting).toBe(false);
  expect(notices).toEqual(["identityExportError"]);
});

test("startup restoration cannot overwrite an identity imported while storage was pending", async () => {
  mount({ parse: async () => "imported-material" });
  const stored = deferred<string>(), pending = identity.restore(() => stored.promise);
  identity.setText("imported"); await identity.submit();
  stored.resolve("stored-material"); await pending;
  expect(store.getState().identityMaterial).toBe("imported-material");
});

test("reset and disposal retire startup identity restoration", async () => {
  mount();
  const stored = deferred<string>(), pending = identity.restore(() => stored.promise);
  identity.reset(); stored.resolve("stored-material"); await pending;
  expect(store.getState().identityMaterial).toBe("previous-material");
  const late = deferred<string>(), closing = identity.restore(() => late.promise);
  identity.dispose(); late.resolve("late-material"); await closing;
  expect(store.getState().identityMaterial).toBe("previous-material");
});

test("restoring optional identity preserves a newer remember preference", async () => {
  mount();
  store.setState({ rememberIdentity: true });
  const stored = deferred<string>(), pending = identity.restore(() => stored.promise);
  store.setState({ rememberIdentity: false }); stored.resolve("stored-material"); await pending;
  expect(store.getState().rememberIdentity).toBe(false);
  expect(store.getState().identityMaterial).toBe("previous-material");
});

test("current startup identity restoration still succeeds", async () => {
  mount();
  await identity.restore(async () => "stored-material");
  expect(store.getState().rememberIdentity).toBe(true);
  expect(store.getState().identityMaterial).toBe("stored-material");
});

test("optional storage failure leaves the current identity usable", async () => {
  mount();
  await identity.restore(async () => { throw new Error("storage unavailable"); });
  expect(store.getState().identityMaterial).toBe("previous-material");
  expect(notices).toEqual([]);
});
