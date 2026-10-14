import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ref, type Ref } from "vue";
import { useWebClientServerHistory } from "./useWebClientServerHistory.js";

// The composable only touches Vue reactivity here; listFavorites/saveFavorite
// degrade to no-ops without IndexedDB, so the in-memory list is the fixture.
interface Harness extends ReturnType<typeof useWebClientServerHistory> {
  serverHost: Ref<string>;
  serverPort: Ref<string>;
  serverPassword: Ref<string>;
  nickname: Ref<string>;
  channel: Ref<string>;
}

function createHarness(overrides?: Partial<Parameters<typeof useWebClientServerHistory>[0]>): Harness {
  const options = {
    serverHost: ref(""),
    serverPort: ref("9987"),
    serverPassword: ref(""),
    nickname: ref(""),
    channel: ref(""),
    rememberIdentity: ref(false),
    identityMaterial: ref(""),
    t: (key: string) => key,
    showToast: () => {},
    ...overrides,
  };
  const history = useWebClientServerHistory(options);
  return {
    ...history,
    serverHost: options.serverHost as Ref<string>,
    serverPort: options.serverPort as Ref<string>,
    serverPassword: options.serverPassword as Ref<string>,
    nickname: options.nickname as Ref<string>,
    channel: options.channel as Ref<string>,
  };
}

describe("useWebClientServerHistory favorites", () => {
  it("a dialog save overwrites the stored nickname, channel and password", async () => {
    const history = createHarness();
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Alice", channel: "Lobby", password: "old-secret" });
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Bob", channel: "Games", password: "new-secret" });
    assert.equal(history.favoriteServers.value.length, 1);
    const favorite = history.favoriteServers.value[0]!;
    assert.equal(favorite.nickname, "Bob");
    assert.equal(favorite.lastChannelHint?.name, "Games");
    assert.equal(favorite.password, "new-secret");
  });

  it("a cleared channel or password removes the stored value", async () => {
    const history = createHarness();
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Alice", channel: "Lobby", password: "old-secret" });
    await history.upsertFavoriteServer({ label: "Main", address: "ts.example.com", port: "9987", nickname: "Alice", channel: "", password: "" });
    const favorite = history.favoriteServers.value[0]!;
    assert.equal(favorite.lastChannelHint, undefined);
    assert.equal(favorite.password, undefined);
  });

  it("the identity binding survives a dialog save; a blank dialog password clears the synced one", async () => {
    const history = createHarness({
      serverHost: ref("ts.example.com"),
      serverPassword: ref("pw"),
      nickname: ref("Alice"),
      channel: ref("Lobby"),
      rememberIdentity: ref(true),
      identityMaterial: ref("identity-material"),
    });
    await history.syncFavoriteConnection();
    await history.upsertFavoriteServer({ label: "", address: "ts.example.com", port: "9987", nickname: "Bob", channel: "Games", password: "" });
    const favorite = history.favoriteServers.value[0]!;
    assert.equal(favorite.identityId, "current");
    assert.equal(favorite.nickname, "Bob");
    assert.equal(favorite.lastChannelHint?.name, "Games");
    assert.equal(favorite.password, undefined);
    assert.equal(favorite.label, "ts.example.com:9987");
  });

  it("selecting a saved server restores its whole context, nickname included", () => {
    const history = createHarness({
      serverHost: ref("other.example.com"),
      nickname: ref("TypedName"),
    });
    history.selectLocalServer({ address: "ts.example.com:9987", nickname: "Alice", channel: "Lobby", password: "pw" });
    assert.equal(history.serverHost.value, "ts.example.com");
    assert.equal(history.nickname.value, "Alice");
    assert.equal(history.channel.value, "Lobby");
    assert.equal(history.serverPassword.value, "pw");
  });
});
