// @vitest-environment node
// 旧 useWebClientServerHistory.test.ts 平移（4 用例）。收藏服务在无 IndexedDB 环境
// 退化为空操作，内存列表即夹具。
import { describe, expect, it } from "vitest";

import { createHomeFavorites } from "./home-favorites";
import { createHomeStore } from "./home-store";

function createHarness(overrides: Partial<Record<string, unknown>> = {}) {
  const store = createHomeStore();
  store.setState(overrides as never);
  const history = createHomeFavorites({
    store,
    t: (key) => key,
    showToast: () => {},
  });
  return { store, history };
}

describe("home favorites（连接即收藏模型）", () => {
  it("a dialog save overwrites the stored nickname, channel and password", async () => {
    const { store, history } = createHarness();
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Alice", channel: "Lobby", password: "old-secret" });
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Bob", channel: "Games", password: "new-secret" });
    expect(store.getState().favoriteServers.length).toBe(1);
    const favorite = store.getState().favoriteServers[0]!;
    expect(favorite.nickname).toBe("Bob");
    expect(favorite.lastChannelHint?.name).toBe("Games");
    expect(favorite.password).toBe("new-secret");
  });

  it("a cleared channel or password removes the stored value", async () => {
    const { store, history } = createHarness();
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Alice", channel: "Lobby", password: "old-secret" });
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Alice", channel: "", password: "" });
    const favorite = store.getState().favoriteServers[0]!;
    expect(favorite.lastChannelHint).toBeUndefined();
    expect(favorite.password).toBeUndefined();
  });

  it("the identity binding survives a dialog save; a blank dialog password clears the synced one", async () => {
    const { store, history } = createHarness({
      serverHost: "ts.example.com",
      serverPassword: "pw",
      nickname: "Alice",
      channelName: "Lobby",
      rememberIdentity: true,
      identityMaterial: "identity-material",
    });
    await history.syncFavoriteConnection();
    await history.upsertFavoriteServer({ label: "", address: "ts.example.com", port: "9987", nickname: "Bob", channel: "Games", password: "" });
    const favorite = store.getState().favoriteServers[0]!;
    expect(favorite.identityId).toBe("current");
    expect(favorite.nickname).toBe("Bob");
    expect(favorite.lastChannelHint?.name).toBe("Games");
    expect(favorite.password).toBeUndefined();
    expect(favorite.label).toBe("ts.example.com:9987");
  });

  it("selecting a saved server restores its whole context, nickname included", () => {
    const { store, history } = createHarness({
      serverHost: "other.example.com",
      nickname: "TypedName",
    });
    history.selectLocalServer({ address: "ts.example.com:9987", nickname: "Alice", channel: "Lobby", password: "pw" });
    expect(store.getState().serverHost).toBe("ts.example.com");
    expect(store.getState().nickname).toBe("Alice");
    expect(store.getState().channelName).toBe("Lobby");
    expect(store.getState().serverPassword).toBe("pw");
  });

  it("the add-dialog prefill inherits label/channel/password from an existing favorite of the same target", async () => {
    const { history } = createHarness({ serverHost: "ts.example.com", serverPort: "9987", nickname: "Alice" });
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Alice", channel: "Lobby", password: "secret" });
    const prefill = history.buildFavoritePrefill();
    expect(prefill.address).toBe("ts.example.com");
    expect(prefill.label).toBe("Main");
    expect(prefill.channel).toBe("Lobby");
    expect(prefill.password).toBe("secret");
  });

  it("the add-dialog prefill for an unknown target only carries the form values", () => {
    const { history } = createHarness({ serverHost: "fresh.example.com", serverPort: "4111", nickname: "Bob" });
    expect(history.buildFavoritePrefill()).toEqual({ address: "fresh.example.com", port: "4111", nickname: "Bob" });
  });
});
