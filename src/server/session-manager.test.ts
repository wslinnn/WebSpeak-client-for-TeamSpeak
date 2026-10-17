import assert from "node:assert/strict";
import test from "node:test";
import { ConnectionStateMachine, SessionManager, type ManagedSession, type SessionTeardownReason } from "./session-manager.js";

function connect(session: ManagedSession | ConnectionStateMachine): void {
  session.transition("connecting");
  session.transition("authenticating");
  session.transition("syncing");
  session.transition("connected");
}

test("a connected session can reconnect successfully and later fail cleanly", () => {
  const state = new ConnectionStateMachine();
  assert.throws(() => state.transition("connected"), /Illegal connection state transition/);
  assert.equal(state.state, "idle");
  connect(state);
  state.transition("interrupted");
  state.transition("reconnecting");
  connect(state);
  assert.equal(state.state, "connected");
  state.transition("interrupted");
  state.transition("reconnecting");
  state.transition("failed");
  state.transition("disconnecting");
  state.transition("idle");
  assert.equal(state.state, "idle");
});

test("concurrent teardown requests run cleanup once and retain admission until it finishes", async () => {
  const manager = new SessionManager();
  const reasons: SessionTeardownReason[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const session = manager.admit("browser", async (reason) => { reasons.push(reason); await pending; });
  assert.ok(session);
  connect(session);

  const first = manager.teardown("browser", "websocket-close");
  const second = manager.teardown("browser", "admin-terminated");
  assert.deepEqual(reasons, ["websocket-close"]);
  assert.equal(session.state, "disconnecting");
  assert.equal(manager.activeCount, 1);
  release();
  await Promise.all([first, second]);
  await manager.teardown("browser", "websocket-error");
  assert.equal(session.state, "idle");
  assert.equal(manager.activeCount, 0);
  assert.equal(manager.get("browser"), undefined);
  assert.deepEqual(reasons, ["websocket-close"]);
});

test("cleanup errors still release the session and allow a new admission", async () => {
  const manager = new SessionManager();
  const session = manager.admit("browser", async () => { throw new Error("socket already closed"); });
  assert.ok(session);
  session.transition("connecting");
  await manager.teardown("browser", "teamSpeak-connect-failed");
  assert.equal(session.state, "idle");
  assert.equal(manager.activeCount, 0);
  assert.ok(manager.admit("browser", async () => {}));
  await manager.shutdown();
});

test("admission enforces capacity and reuses slots only after teardown", async () => {
  const manager = new SessionManager();
  for (let index = 0; index < manager.maxSessions; index++) {
    assert.ok(manager.admit(String(index), async () => {}));
  }
  assert.equal(manager.admit("overflow", async () => {}), null);
  assert.equal(manager.createdCount, manager.maxSessions);
  await manager.teardown("0", "client-disconnect");
  assert.ok(manager.admit("replacement", async () => {}));
  assert.equal(manager.createdCount, manager.maxSessions + 1);
  assert.equal(manager.peakCount, manager.maxSessions);
  await manager.shutdown();
  assert.equal(manager.activeCount, 0);
});

test("shutdown stops admission immediately and waits for every cleanup even when one fails", async () => {
  const manager = new SessionManager();
  const reasons: SessionTeardownReason[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  manager.admit("slow", async (reason) => { reasons.push(reason); await pending; });
  manager.admit("failed", async (reason) => { reasons.push(reason); throw new Error("closed"); });
  const shutdown = manager.shutdown();
  assert.equal(manager.isAccepting, false);
  assert.equal(manager.admit("late", async () => {}), null);
  assert.deepEqual(reasons, ["gateway-shutdown", "gateway-shutdown"]);
  release();
  await shutdown;
  await manager.shutdown();
  assert.equal(manager.activeCount, 0);
  assert.equal(reasons.length, 2);
});

test("admission caps concurrent sessions per peer key and releases the budget on teardown (报告 21 S3)", async () => {
  const manager = new SessionManager();
  for (let index = 0; index < 10; index++) {
    assert.ok(manager.admit(`s-${index}`, async () => {}, "lan-peer"));
  }
  assert.equal(manager.admit("s-over", async () => {}, "lan-peer"), null);
  assert.equal(manager.rejectReason, "peer-limit");
  // 另一对端不受影响；无键的 admit（旧测试/内部路径）也不受影响。
  assert.ok(manager.admit("other-peer", async () => {}, "other-peer"));
  assert.ok(manager.admit("no-key", async () => {}));
  // 重连场景：先 admit 后拆前驱的瞬时不占新预算——拆除一个后立刻可再进。
  await manager.teardown("s-0", "superseded");
  assert.ok(manager.admit("s-successor", async () => {}, "lan-peer"));
  assert.equal(manager.rejectReason, null);
  // 全量清空后预算归零，可再次进满（不用 shutdown——它会永久关闭准入）。
  for (let index = 0; index < 10; index++) {
    await manager.teardown(`s-${index}`, "client-disconnect");
    await manager.teardown("other-peer", "client-disconnect");
    await manager.teardown("no-key", "client-disconnect");
  }
  await manager.teardown("s-successor", "client-disconnect");
  assert.equal(manager.activeCount, 0);
  for (let index = 0; index < 10; index++) {
    assert.ok(manager.admit(`r-${index}`, async () => {}, "lan-peer"));
  }
  for (let index = 0; index < 10; index++) {
    await manager.teardown(`r-${index}`, "client-disconnect");
  }
});

test("global capacity exhaustion reports gateway-full, distinct from the per-peer cap", async () => {
  const manager = new SessionManager();
  for (let index = 0; index < manager.maxSessions; index++) {
    assert.ok(manager.admit(String(index), async () => {}, `peer-${index}`));
  }
  assert.equal(manager.admit("overflow", async () => {}, "another-peer"), null);
  assert.equal(manager.rejectReason, "gateway-full");
  await manager.shutdown();
});
