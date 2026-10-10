import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { effectScope, nextTick, ref } from "vue";

// Minimal localStorage: the composable persists fold memory through it.
const storage = new Map();
before(() => {
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
});

let vite, useChannelFold;
before(async () => {
  vite = await createServer({ configFile: false, root: fileURLToPath(new URL("../", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  ({ useChannelFold } = await vite.ssrLoadModule("/src/composables/useChannelFold.ts"));
});
after(async () => { await vite?.close(); });

function mount(t, serverKey) {
  const scope = effectScope();
  const fold = scope.run(() => useChannelFold(() => serverKey.value));
  t.after(() => scope.stop());
  return fold;
}

test("folds persist per server and swap with the server key", async t => {
  const serverKey = ref("lobby.example:9987");
  const fold = mount(t, serverKey);
  assert.equal(fold.folded.value.size, 0);
  fold.toggle("3");
  fold.toggle("7");
  assert.deepEqual([...fold.folded.value].sort(), ["3", "7"]);
  assert.deepEqual(JSON.parse(localStorage.getItem("webspeak:channel-folds:lobby.example:9987")), ["3", "7"]);

  serverKey.value = "other.example:9987";
  await nextTick();
  assert.equal(fold.folded.value.size, 0, "another server starts from its own memory");

  serverKey.value = "lobby.example:9987";
  await nextTick();
  assert.deepEqual([...fold.folded.value].sort(), ["3", "7"], "returning restores the first server's folds");

  fold.toggle("3");
  assert.deepEqual(JSON.parse(localStorage.getItem("webspeak:channel-folds:lobby.example:9987")), ["7"]);
});

test("a corrupt stored set falls back to fully expanded", async t => {
  const serverKey = ref("broken.example:9987");
  localStorage.setItem("webspeak:channel-folds:broken.example:9987", "{not json");
  const fold = mount(t, serverKey);
  assert.equal(fold.folded.value.size, 0);
});
