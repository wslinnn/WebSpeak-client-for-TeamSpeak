import assert from "node:assert/strict";
import { beforeAll as before, afterAll as after, beforeEach, test } from "vitest";
import { setImmediate as nextTurn } from "node:timers/promises";
import { clearNamespacedStorageEntries, getChatHistoryConversationKey, loadLocalPreferences, normalizeChatHistoryServerKey, saveLocalPreferences } from "./local-persistence";

// Control IndexedDB's request and transaction completion separately. These tests
// exercise the public storage APIs, including cancellation before opening the DB.
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
interface FakeRequest {
  result?: unknown;
  onsuccess: () => void;
}
let opening: FakeRequest;
let transactions: Transaction[] = [];
class Transaction {
  oncomplete?: () => void; onerror?: () => void; onabort?: () => void;
  getRequest: FakeRequest = { onsuccess: () => {} };
  putRequest: FakeRequest = { onsuccess: () => {} };
  written: unknown; aborted = false;
  objectStore() { return {
    get: () => this.getRequest = { onsuccess: () => {} },
    put: (value: unknown) => { this.written = value; return this.putRequest = { onsuccess: () => {} }; },
  }; }
  abort() { this.aborted = true; this.onabort?.(); }
  read(value: unknown) { this.getRequest.result = value; this.getRequest.onsuccess(); }
  writtenSuccessfully() { this.putRequest.onsuccess(); }
  commit() { assert.equal(this.aborted, false); this.oncomplete?.(); }
}
const database = { transaction: () => { const tx = new Transaction(); transactions.push(tx); return tx; } };

test("chat history keys isolate server targets and group private messages by stable conversation", () => {
  assert.equal(normalizeChatHistoryServerKey(" Example.COM:9987 "), "example.com:9987");
  const privateMessage = { id: "m1", scope: "private", conversationKey: "uid:peer", invokerName: "Peer", message: "hi", timestamp: 1 } as const;
  assert.equal(getChatHistoryConversationKey(privateMessage), "private:uid:peer");
  assert.equal(getChatHistoryConversationKey({ ...privateMessage, conversationKey: "unknown-member-session-1", conversationId: "7", conversationName: "Peer" }), 'private:client:["7","Peer"]');
  assert.equal(getChatHistoryConversationKey({ ...privateMessage, scope: "channel", targetId: "42" }), "channel:42");
});
before(() => Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: {
  // 开库成功事件在微任务里自触发：openDatabase 在 open() 返回后才挂 onsuccess，
  // 假环境没有浏览器事件循环来派发它。
  open: () => {
    opening = { result: database, onsuccess: () => {} };
    queueMicrotask(() => opening.onsuccess());
    return opening;
  },
} }));
beforeEach(() => { transactions = []; });
after(() => {
  if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
  else Reflect.deleteProperty(globalThis, "indexedDB");
});

test("a successful request is not reported as durable until its transaction commits", async () => {
  let settled = false;
  const pending = saveLocalPreferences({ schemaVersion: 1 }).then(() => { settled = true; });
  await nextTurn(); const tx = transactions[0]!;
  // 偏好保存是同事务 get→put：先完成读取，putRequest 才存在。
  tx.read({ schemaVersion: 1 });
  tx.writtenSuccessfully(); await nextTurn();
  assert.equal(settled, false);
  tx.commit(); await pending;
  assert.equal(settled, true);
});
test("cancelling a pending preference merge aborts it without blocking the caller", async () => {
  const owner = new AbortController();
  const pending = saveLocalPreferences({ schemaVersion: 1, language: "en" }, owner.signal);
  await nextTurn(); const tx = transactions[0]!;
  owner.abort(); await pending;
  assert.equal(tx.aborted, true);
  assert.equal(tx.written, undefined);
});
test("storage read success still returns its original data after transaction completion", async () => {
  const pending = loadLocalPreferences();
  await nextTurn(); const tx = transactions[0]!;
  tx.read({ schemaVersion: 1, language: "en" }); tx.commit();
  assert.deepEqual(await pending, { schemaVersion: 1, language: "en", volumesByUid: {} });
});

function createFakeStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
  } as Storage;
}

test("namespace sweep removes every webspeak key and nothing else", () => {
  const storage = createFakeStorage({
    "webspeak:nickname": "alice",
    "webspeak:mobile-gate": "continue",
    "other:theme": "dark",
    "website:sound": "on",
  });
  assert.equal(clearNamespacedStorageEntries(storage), 2);
  assert.equal(storage.getItem("webspeak:nickname"), null);
  assert.equal(storage.getItem("webspeak:mobile-gate"), null);
  assert.equal(storage.getItem("other:theme"), "dark");
  assert.equal(storage.getItem("website:sound"), "on");
});

test("namespace sweep tolerates storage failures and custom prefixes", () => {
  const broken = { get length(): number { throw new Error("denied"); } } as unknown as Storage;
  assert.equal(clearNamespacedStorageEntries(broken), 0);
  const storage = createFakeStorage({ "ws-a:1": "x", "keep:1": "y" });
  assert.equal(clearNamespacedStorageEntries(storage, "ws-a:"), 1);
  assert.equal(storage.getItem("keep:1"), "y");
});
