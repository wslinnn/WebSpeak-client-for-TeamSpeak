import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { effectScope, nextTick, ref } from "vue";

let vite, useVoiceServerSwitch;
before(async () => {
  vite = await createServer({ configFile: false, root: fileURLToPath(new URL("../", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  ({ useVoiceServerSwitch } = await vite.ssrLoadModule("/src/composables/useVoiceServerSwitch.ts"));
});
after(async () => { await vite?.close(); });

function mount(t) {
  const errorCode = ref("");
  const scope = effectScope();
  const machine = scope.run(() => useVoiceServerSwitch(() => errorCode.value));
  t.after(() => scope.stop());
  return { machine, errorCode };
}

test("a switch stays pending through password prompts and fails on other errors", async t => {
  const { machine, errorCode } = mount(t);
  machine.begin("Game Server");
  assert.equal(machine.pending.value, "Game Server");
  errorCode.value = "SERVER_PASSWORD_REQUIRED";
  await nextTick();
  errorCode.value = "INVALID_SERVER_PASSWORD";
  await nextTick();
  assert.equal(machine.pending.value, "Game Server");
  assert.equal(machine.failed.value, null);
  errorCode.value = "IDENTITY_REJECTED";
  await nextTick();
  assert.equal(machine.pending.value, null);
  assert.equal(machine.failed.value, "Game Server");
});

test("a connect settles the switch and clears a stale failure banner", t => {
  const { machine } = mount(t);
  machine.begin("Game Server");
  machine.fail();
  assert.equal(machine.failed.value, "Game Server");
  machine.begin("Other Server");
  assert.equal(machine.failed.value, null);
  assert.equal(machine.pending.value, "Other Server");
  machine.settle();
  assert.equal(machine.pending.value, null);
  assert.equal(machine.failed.value, null);
  assert.equal(machine.active.value, false);
});

test("a gateway that never answers flips the banner to failed after 20s", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { machine } = mount(t);
  machine.begin("Game Server");
  t.mock.timers.tick(19_999);
  assert.equal(machine.pending.value, "Game Server");
  t.mock.timers.tick(1);
  assert.equal(machine.pending.value, null);
  assert.equal(machine.failed.value, "Game Server");
});

test("settling cancels the safety timer and later failures are no-ops", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { machine } = mount(t);
  machine.begin("Game Server");
  machine.settle();
  t.mock.timers.tick(60_000);
  assert.equal(machine.failed.value, null);
  machine.fail();
  assert.equal(machine.failed.value, null);
  assert.equal(machine.pending.value, null);
});
