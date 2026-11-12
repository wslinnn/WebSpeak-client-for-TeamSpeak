import assert from "node:assert/strict";
import test from "node:test";
import { createGracefulShutdown, type GracefulShutdownStep } from "./graceful-shutdown.js";

const logger = { info: () => {}, warn: () => {} };

test("shutdown runs each step once, in order, and exits after the last one", async () => {
  const order: string[] = [];
  const exits: number[] = [];
  const steps: GracefulShutdownStep[] = [
    { name: "web-server", run: async () => { order.push("web-server"); } },
    { name: "stun", run: () => { order.push("stun"); } },
    { name: "database", run: () => { order.push("database"); } },
  ];
  const shutdown = createGracefulShutdown({ steps, logger, exit: code => exits.push(code) });
  await Promise.all([shutdown("SIGINT"), shutdown("SIGINT"), shutdown("SIGTERM")]);
  assert.deepEqual(order, ["web-server", "stun", "database"]);
  assert.deepEqual(exits, [0], "a repeated signal must not re-run teardown or exit twice");
});

test("a failing step neither skips the remaining steps nor skips the exit", async () => {
  const order: string[] = [];
  const exits: number[] = [];
  const shutdown = createGracefulShutdown({
    logger,
    exit: code => exits.push(code),
    steps: [
      { name: "web-server", run: () => { order.push("web-server"); } },
      { name: "stun", run: () => { throw new Error("ERR_SOCKET_DGRAM_NOT_RUNNING"); } },
      { name: "database", run: () => { order.push("database"); } },
    ],
  });
  await shutdown("SIGTERM");
  assert.deepEqual(order, ["web-server", "database"]);
  assert.deepEqual(exits, [0]);
});

test("a step that never settles still lets the watchdog force the exit", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const exits: number[] = [];
  const shutdown = createGracefulShutdown({
    logger,
    exit: code => exits.push(code),
    timeoutMs: 10_000,
    steps: [
      { name: "web-server", run: () => new Promise<void>(() => { /* never settles */ }) },
      { name: "database", run: () => { throw new Error("unreachable"); } },
    ],
  });
  void shutdown("SIGINT");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(exits, []);
  t.mock.timers.tick(9_999);
  assert.deepEqual(exits, []);
  t.mock.timers.tick(1);
  assert.deepEqual(exits, [1], "the hard deadline forces a non-zero exit code");
});
