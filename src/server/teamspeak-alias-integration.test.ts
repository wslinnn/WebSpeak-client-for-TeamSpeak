import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AdminService, type AdminSettingsInput } from "../admin/admin-service.js";
import { migrateConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { WebSpeakDatabase } from "../persistence/database.js";
import { JoinTicketStore } from "./join-ticket.js";
import { createWebServer } from "./server.js";
import { ServerPasswordGuard } from "./server-password-guard.js";

const noop = () => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => logger };
const settings = (target: string, accessMode: "open" | "fixed" = "open"): AdminSettingsInput => ({
  target, accessMode, siteName: "WebSpeak", welcomeText: "", webRtcEnabled: false,
  serverPassword: "stored-password", passwordAction: "replace",
});

test("settings, tests, and join tickets resolve nicknames through the gateway", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-alias-"));
  const database = new WebSpeakDatabase(path.join(directory, "webspeak.db"));
  const service = new AdminService(database, Buffer.alloc(32, 1), logger, path.join(directory, "missing-config.json"), async (target) => {
    assert.deepEqual(target, { host: "8.8.8.8", port: 10000 });
    return { ok: true, protocol: "ts3", latencyMs: 1, serverName: "Test", requiresPassword: false };
  });
  await service.initialize();
  let lookupBody = "8.8.8.8:10000";
  let lookups = 0;
  const realFetch = globalThis.fetch;
  context.mock.method(globalThis, "fetch", ((input, options) => {
    if (new URL(String(input)).origin === "https://named.myteamspeak.com") {
      lookups += 1;
      return Promise.resolve(new Response(lookupBody));
    }
    return realFetch(input, options);
  }) as typeof fetch);
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const joinTickets = new JoinTicketStore();
  const server = createWebServer({ port, adminService: service, voiceBridgeOptions: { joinTickets }, logger, serverPasswordGuard: new ServerPasswordGuard() });
  context.after(async () => {
    await server.stop();
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  await server.start();
  const join = async (input: Record<string, unknown>) => {
    const response = await realFetch(`${origin}/api/join-ticket`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ nickname: "Tester", ...input }),
    });
    const body = await response.json() as { code?: string; ticket?: string };
    return { status: response.status, code: body.code, payload: body.ticket ? joinTickets.consume(body.ticket) : null };
  };

  service.updateSettings(settings("team eco"));
  assert.equal(database.getSettings().tsTarget, "team eco");
  assert.equal(service.getPublicConfig().target, "team eco");
  assert.equal(service.getAdminSettings().target, "team eco");
  const publicConfig = await (await realFetch(`${origin}/api/public-config`)).json() as { target: string; targetPrefillBlocked: boolean };
  assert.equal(publicConfig.target, "team eco");
  assert.equal(publicConfig.targetPrefillBlocked, false);
  const first = await join({ target: "https://named.myteamspeak.com/lookup?name=team%20eco" });
  assert.equal(first.status, 201);
  assert.deepEqual(first.payload?.target, { host: "8.8.8.8", port: 10000 });
  assert.equal(first.payload?.serverPassword, "stored-password");
  assert.equal((await join({ target: "another guild" })).payload?.serverPassword, "");
  assert.equal((await join({ target: "another guild:9987" })).payload?.target.port, 9987);
  assert.equal((await service.testConnection("another guild", "", true)).ok, true);

  lookupBody = "1.1.1.1:10001";
  assert.deepEqual((await join({ target: "team eco" })).payload?.target, { host: "1.1.1.1", port: 10001 });
  lookupBody = "127.0.0.1:9987";
  const blockedConfig = await (await realFetch(`${origin}/api/public-config`)).json() as { target: string; targetPrefillBlocked: boolean };
  assert.equal(blockedConfig.target, "");
  assert.equal(blockedConfig.targetPrefillBlocked, true);
  assert.equal((await join({ target: "team eco" })).code, "TARGET_NOT_ALLOWED");
  assert.equal((await join({})).code, "TARGET_NOT_ALLOWED");

  service.updateSettings(settings("team eco", "fixed"));
  const fixed = await join({ target: "untrusted guild" });
  assert.equal(fixed.status, 201);
  assert.equal(fixed.payload?.target.host, "127.0.0.1");

  lookupBody = "";
  assert.equal((await join({ target: "missing guild" })).code, "HOST_NOT_FOUND");
  await assert.rejects(service.testConnection("missing guild", "", true), { code: "HOST_NOT_FOUND" });
  assert.ok(lookups >= 9);

  service.updateSettings(settings("8.8.8.8#9988"));
  assert.equal(database.getSettings().tsTarget, null);
  const direct = await join({ target: "8.8.8.8:9988" });
  assert.deepEqual(direct.payload?.target, { host: "8.8.8.8", port: 9988 });
  assert.equal(direct.payload?.serverPassword, "stored-password");
});

test("schema 8 settings survive the nickname migration and managed_invites is dropped", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-alias-migration-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "webspeak.db");
  const database = new WebSpeakDatabase(file);
  database.close();
  // Recreate the schema-8 era: settings without ts_target and the
  // managed_invites table as the v1 migration created it (no target_text).
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE managed_invites (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      target_host TEXT NOT NULL,
      target_port INTEGER NOT NULL CHECK (target_port BETWEEN 1 AND 65535),
      server_password_encrypted TEXT,
      channel TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
      use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    ALTER TABLE settings DROP COLUMN ts_target;
    PRAGMA user_version = 8;
  `);
  legacy.close();
  const migrated = new WebSpeakDatabase(file);
  try {
    assert.equal(migrated.schemaVersion, 12);
    assert.equal(migrated.getSettings().tsHost, "127.0.0.1");
    assert.equal(migrated.getSettings().tsTarget, null);
    const check = new DatabaseSync(file);
    try {
      const tables = check.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'managed_invites'",
      ).all() as Array<{ name: string }>;
      assert.equal(tables.length, 0);
    } finally { check.close(); }
  } finally { migrated.close(); }
});

test("legacy config imports nicknames without silently replacing them with localhost", () => {
  assert.deepEqual(migrateConfig({ tsHost: "team eco" }), { tsHost: "team eco", tsPort: 9987, tsTarget: "team eco", tsServerPassword: "" });
  assert.equal(migrateConfig({ tsHost: "another guild", tsPort: 9988 }).tsTarget, "another guild:9988");
  assert.equal(migrateConfig({ tsHost: "abc:123" }).tsTarget, "abc:123");
  assert.equal(migrateConfig({ tsHost: "https://named.myteamspeak.com/lookup?name=team%20eco" }).tsTarget, "team eco");
  assert.equal(migrateConfig(migrateConfig({ tsHost: "team eco" })).tsTarget, "team eco");
  assert.equal(migrateConfig({ tsHost: "voice.example.com", tsPort: 9988 }).tsHost, "voice.example.com");
  assert.equal(migrateConfig({ tsHost: "::1", tsPort: 9988 }).tsHost, "::1");
});

async function availablePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
