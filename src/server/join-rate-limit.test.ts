import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AdminService, type AdminSettingsInput } from "../admin/admin-service.js";
import type { Logger } from "../logger.js";
import { WebSpeakDatabase } from "../persistence/database.js";
import { JoinRateLimiter } from "./join-rate-limit.js";
import { JoinTicketStore } from "./join-ticket.js";
import { createWebServer } from "./server.js";
import { ServerPasswordGuard } from "./server-password-guard.js";

const noop = () => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => logger };
const settings: AdminSettingsInput = {
  target: "8.8.8.8#9988", accessMode: "open", siteName: "WebSpeak", welcomeText: "", webRtcEnabled: false,
  serverPassword: "", passwordAction: "replace",
};

async function availablePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("join rate limiter blocks the 31st request and reports the remaining window", () => {
  const limiter = new JoinRateLimiter();
  const now = 1_000_000;
  for (let index = 0; index < 30; index += 1) assert.equal(limiter.allow("peer-1", now + index), true);
  assert.equal(limiter.allow("peer-1", now + 30), false);
  assert.equal(limiter.allow("peer-2", now + 30), true, "other peers keep their own budget");
  assert.equal(limiter.blockedForMs("peer-1", now + 30), 60_000 - 30);
  assert.equal(limiter.blockedForMs("peer-2", now + 30), 0);
  // 窗口滚过：预算恢复，等待时间归零。
  assert.equal(limiter.allow("peer-1", now + 60_000), true);
  assert.equal(limiter.blockedForMs("peer-1", now + 60_000), 0);
});

test("a throttled join ticket answers 429 with Retry-After so browsers can wait instead of burning their reconnect budget", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-join-limit-"));
  const database = new WebSpeakDatabase(path.join(directory, "webspeak.db"));
  const service = new AdminService(database, Buffer.alloc(32, 1), logger, path.join(directory, "missing-config.json"), async () => {
    throw new Error("IP targets must not need a resolver lookup");
  });
  await service.initialize();
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const joinTickets = new JoinTicketStore();
  const server = createWebServer({
    port, adminService: service,
    voiceBridgeOptions: { joinTickets },
    logger, serverPasswordGuard: new ServerPasswordGuard(),
  });
  context.after(async () => {
    await server.stop();
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  await server.start();
  service.updateSettings(settings);

  const join = () => fetch(`${origin}/api/join-ticket`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ target: "8.8.8.8:9988", nickname: "Tester" }),
  });
  for (let index = 0; index < 30; index += 1) {
    const allowed = await join();
    assert.equal(allowed.status, 201, `request ${index + 1} is within the window budget`);
    await allowed.json();
  }

  const throttled = await join();
  assert.equal(throttled.status, 429);
  const retryAfter = Number(throttled.headers.get("retry-after"));
  const body = await throttled.json() as { code?: string; retryAfterMs?: number };
  assert.equal(body.code, "RATE_LIMITED");
  assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, `Retry-After must be a bounded wait, got ${String(retryAfter)}`);
  assert.ok(typeof body.retryAfterMs === "number" && body.retryAfterMs > 0 && body.retryAfterMs <= 60_000, "the body mirrors the wait in milliseconds");
});
