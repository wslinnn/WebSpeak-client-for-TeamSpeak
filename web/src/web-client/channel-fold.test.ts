// @vitest-environment node
// 旧 channel-fold.test.mjs 平移（2 用例）：折叠记忆按服务器键持久化、换服换记忆、
// 损坏存储回退全展开。
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createChannelFold } from "./channel-fold";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, String(value)),
    removeItem: (key: string) => void storage.delete(key),
  });
});

describe("channel fold（每服务器折叠记忆）", () => {
  it("folds persist per server and swap with the server key", () => {
    const fold = createChannelFold();
    fold.sync("lobby.example:9987");
    expect(fold.store.getState().folded.size).toBe(0);
    fold.toggle("3");
    fold.toggle("7");
    expect([...fold.store.getState().folded].sort()).toEqual(["3", "7"]);
    expect(JSON.parse(storage.get("webspeak:channel-folds:lobby.example:9987")!)).toEqual(["3", "7"]);

    fold.sync("other.example:9987");
    expect(fold.store.getState().folded.size).toBe(0);

    fold.sync("lobby.example:9987");
    expect([...fold.store.getState().folded].sort()).toEqual(["3", "7"]);

    fold.toggle("3");
    expect(JSON.parse(storage.get("webspeak:channel-folds:lobby.example:9987")!)).toEqual(["7"]);
  });

  it("a corrupt stored set falls back to fully expanded", () => {
    storage.set("webspeak:channel-folds:broken.example:9987", "{not json");
    const fold = createChannelFold();
    fold.sync("broken.example:9987");
    expect(fold.store.getState().folded.size).toBe(0);
  });
});
