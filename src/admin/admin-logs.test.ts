import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readConnectionHistory, readRecentLogs } from "./admin-logs.js";

async function withLogFile(lines: string[], run: (filePath: string) => void | Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-admin-logs-"));
  const filePath = path.join(directory, "webspeak.log");
  await writeFile(filePath, lines.map((line) => `${line}\n`).join(""), "utf8");
  try {
    await run(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("readRecentLogs returns newest entries first", async () => {
  const line = (time: string, msg: string) => JSON.stringify({ time, level: 30, msg });
  await withLogFile(
    [line("2026-10-26T10:00:00.000Z", "first"), line("2026-10-26T10:01:00.000Z", "second"), line("2026-10-26T10:02:00.000Z", "third")],
    (filePath) => {
      const entries = readRecentLogs(filePath, 10);
      assert.equal(entries.length, 3);
      assert.equal(entries[0]!.message, "third");
      assert.equal(entries[2]!.message, "first");
    },
  );
});

test("readRecentLogs maps pino levels and whitelists context keys", async () => {
  const raw = JSON.stringify({
    time: "2026-10-26T10:00:00.000Z", level: 50, msg: "TS connect failed",
    nickname: "alice", target: "ts.example.com", entryId: "e1", secret: "nope",
  });
  await withLogFile([raw], (filePath) => {
    const [entry] = readRecentLogs(filePath, 5);
    assert.equal(entry!.level, "ERROR");
    assert.equal(entry!.message, "TS connect failed");
    assert.deepEqual(entry!.context, { nickname: "alice", target: "ts.example.com", entryId: "e1" });
  });
});

test("readRecentLogs keeps non-JSON lines as plain messages", async () => {
  await withLogFile(["not json at all"], (filePath) => {
    const [entry] = readRecentLogs(filePath, 5);
    assert.equal(entry!.message, "not json at all");
    assert.equal(entry!.level, "INFO");
    assert.equal(entry!.timestamp, null);
  });
});

test("readConnectionHistory reconstructs a full session newest-first", async () => {
  const entry = (time: string, msg: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ time, level: 30, msg, entryId: "e1", nickname: "alice", clientIp: "10.0.0.4", target: "ts.example.com", ...extra });
  await withLogFile(
    [
      entry("2026-10-26T10:00:00.000Z", "WebClient connecting"),
      entry("2026-10-26T10:00:05.000Z", "Web client connected to TeamSpeak"),
      entry("2026-10-26T10:12:05.000Z", "Client session torn down", { durationSeconds: 720 }),
    ],
    (filePath) => {
      const [record] = readConnectionHistory(filePath, 10);
      assert.equal(record!.status, "disconnected");
      assert.equal(record!.nickname, "alice");
      assert.equal(record!.connectedAt, "2026-10-26T10:00:05.000Z");
      assert.equal(record!.durationSeconds, 720);
    },
  );
});

test("readConnectionHistory keeps an explicit failure code for failed connections", async () => {
  const entry = (time: string, msg: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ time, level: 50, msg, entryId: "e2", nickname: "bob", target: "ts.example.com", ...extra });
  await withLogFile(
    [
      entry("2026-10-26T11:00:00.000Z", "WebClient connecting"),
      entry("2026-10-26T11:00:03.000Z", "TS connect failed", { code: "TIMEOUT" }),
    ],
    (filePath) => {
      const [record] = readConnectionHistory(filePath, 10);
      assert.equal(record!.status, "failed");
      assert.equal(record!.reason, "TIMEOUT");
      assert.equal(record!.connectedAt, null);
    },
  );
});
