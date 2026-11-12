import assert from "node:assert/strict";
import test from "node:test";
import { ReconnectTicketStore } from "./reconnect-ticket.js";
import type { JoinTicketPayload } from "./join-ticket.js";

const payload: JoinTicketPayload = {
  target: { host: "127.0.0.1", port: 9987 },
  serverPassword: "secret",
  nickname: "alice",
  channel: "Lobby",
};

test("a ticket survives once and reports its owning entry", () => {
  const store = new ReconnectTicketStore();
  const token = store.issue(payload, "w-1", 1_000);
  assert.deepEqual(store.consume(token, 2_000), { payload, entryId: "w-1" });
  assert.equal(store.consume(token, 3_000), null);
});

test("expired tickets are refused", () => {
  const store = new ReconnectTicketStore(5_000);
  const token = store.issue(payload, "w-1", 0);
  assert.equal(store.consume(token, 5_001), null);
});

test("updateChannel rewrites the stored payload channel for the owning entry only", () => {
  const store = new ReconnectTicketStore();
  const first = store.issue(payload, "w-1", 0);
  store.issue(payload, "w-2", 0);
  store.updateChannel("w-1", "Gaming", 1);
  store.updateChannel("w-3", "Nowhere", 1);
  const restored = store.consume(first, 1);
  assert.equal(restored?.payload.channel, "Gaming");
  assert.equal(restored?.entryId, "w-1");
  // An empty channel name removes the field so the default applies again.
  const second = store.issue({ ...payload, channel: "Temp" }, "w-9", 0);
  store.updateChannel("w-9", "", 1);
  assert.equal(store.consume(second, 1)?.payload.channel, undefined);
});

test("updateChannel rewrites every live ticket of an entry", () => {
  const store = new ReconnectTicketStore();
  // A resume whose predecessor token was never consumed leaves two tickets for
  // the same entry; the browser holds the newest one, so both must follow the
  // channel switch.
  const older = store.issue(payload, "w-1", 0);
  const newer = store.issue(payload, "w-1", 0);
  store.updateChannel("w-1", "Gaming", 1);
  assert.equal(store.consume(older, 1)?.payload.channel, "Gaming");
  assert.equal(store.consume(newer, 1)?.payload.channel, "Gaming");
});

test("issuing beyond the cap evicts the oldest live ticket", () => {
  const store = new ReconnectTicketStore(10_000, 2);
  const first = store.issue(payload, "w-1", 0);
  const second = store.issue(payload, "w-2", 0);
  const third = store.issue(payload, "w-3", 1);
  assert.equal(store.consume(first, 1), null);
  assert.notEqual(store.consume(second, 1), null);
  assert.notEqual(store.consume(third, 1), null);
});

test("renew slides the expiry forward for the owning entry only", () => {
  const store = new ReconnectTicketStore(5_000);
  const renewed = store.issue(payload, "w-1", 0);
  const untouched = store.issue(payload, "w-2", 0);
  store.renew("w-1", 4_000);
  // Past the original TTL the renewed ticket is still alive; the untouched one is gone.
  assert.notEqual(store.consume(renewed, 6_000), null);
  assert.equal(store.consume(untouched, 6_000), null);
});

test("renew ignores expired tickets and unknown entries", () => {
  const store = new ReconnectTicketStore(5_000);
  const token = store.issue(payload, "w-1", 0);
  // An expired ticket must not be resurrected by a late tick.
  store.renew("w-1", 6_000);
  assert.equal(store.consume(token, 6_001), null);
  store.renew("w-404", 1);
});
