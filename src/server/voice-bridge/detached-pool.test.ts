import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import type { Logger as LoggerType } from "../../logger.js";
import type { WebClientEntry } from "./types.js";
import { DetachedSessionPool } from "./detached-pool.js";

// The heartbeat owns two responsibilities this file pins: sweep detached
// sessions past their grace window, and keep the resume ticket of every live
// attached session fresh — an expired token under a healthy session is what
// turned long idle stretches into unrecoverable drops (2026-11-04).

interface PoolHarness {
  pool: DetachedSessionPool;
  renewed: string[];
  teardowns: string[];
}

function harness(entries: Map<string, WebClientEntry>): PoolHarness {
  const renewed: string[] = [];
  const teardowns: string[] = [];
  const pool = new DetachedSessionPool({
    entries,
    logger: { info() {}, warn() {} } as unknown as LoggerType,
    resumeGraceMs: 30_000,
    teardown: async entryId => { teardowns.push(entryId); },
    stopWebRtc: async () => {},
    removeScreenPeer: () => {},
    renewReconnectTicket: entryId => { renewed.push(entryId); },
  });
  return { pool, renewed, teardowns };
}

function entry(id: string, overrides: Partial<WebClientEntry> = {}): WebClientEntry {
  return {
    id,
    detached: false,
    isAlive: true,
    reconnectTicketToken: `token-${id}`,
    ws: { readyState: WebSocket.OPEN, ping() {}, terminate() {} },
    ...overrides,
  } as unknown as WebClientEntry;
}

test("the heartbeat renews the resume ticket of every live attached session", () => {
  const entries = new Map<string, WebClientEntry>([
    ["w-1", entry("w-1")],
    ["w-2", entry("w-2")],
  ]);
  const { pool, renewed } = harness(entries);
  pool.heartbeatTick(Date.now());
  assert.deepEqual(renewed, ["w-1", "w-2"]);
});

test("detached entries, dead sockets and ticketless sessions are not renewed", () => {
  const entries = new Map<string, WebClientEntry>([
    ["w-live", entry("w-live")],
    // Detached sessions hold no live socket; the sweep owns their lifecycle.
    ["w-detached", entry("w-detached", { detached: true })],
    // A socket whose previous pong never arrived is terminated, not renewed.
    ["w-dead", entry("w-dead", { isAlive: false })],
    ["w-ticketless", entry("w-ticketless", { reconnectTicketToken: undefined })],
  ]);
  const { pool, renewed, teardowns } = harness(entries);
  pool.heartbeatTick(Date.now());
  assert.deepEqual(renewed, ["w-live"]);
  assert.deepEqual(teardowns, ["w-dead"]);
});
