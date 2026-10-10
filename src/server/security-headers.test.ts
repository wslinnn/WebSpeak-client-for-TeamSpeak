import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AdminService } from "../admin/admin-service.js";
import type { Logger } from "../logger.js";
import { WebSpeakDatabase } from "../persistence/database.js";
import { JoinTicketStore } from "./join-ticket.js";
import { createWebServer } from "./server.js";
import { ServerPasswordGuard } from "./server-password-guard.js";

const noop = () => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => logger };

async function availablePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

// The CSP whitelist is load-bearing for shipped features: skin packs load
// their assets as blob: URLs, the microphone test plays back a blob: clip and
// the optional RNNoise denoiser compiles WASM. A hardening pass that drops any
// of these silently breaks those features (regression 2026-10-10), so pin them.
test("security headers keep the feature-critical CSP sources", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-headers-"));
  const database = new WebSpeakDatabase(path.join(directory, "webspeak.db"));
  const service = new AdminService(database, Buffer.alloc(32, 1), logger, path.join(directory, "missing-config.json"), async () => ({
    ok: true, protocol: "ts3", latencyMs: 1, serverName: "Test", requiresPassword: false,
  }));
  await service.initialize();
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = createWebServer({
    port, adminService: service,
    voiceBridgeOptions: { joinTickets: new JoinTicketStore() },
    logger, serverPasswordGuard: new ServerPasswordGuard(),
  });
  context.after(async () => {
    await server.stop();
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  await server.start();
  // The static index may 404 in a test checkout (web/dist unbuilt); Express's
  // error pages carry their own CSP. Hit an API route — the header middleware
  // runs for every response, including API errors.
  const response = await fetch(`${origin}/api/public-config`);
  assert.equal(response.status, 200);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src [^;]*'wasm-unsafe-eval'/);
  assert.match(csp, /img-src [^;]*'self'[^;]*blob:/);
  assert.match(csp, /font-src [^;]*'self'[^;]*blob:/);
  assert.match(csp, /media-src [^;]*'self'[^;]*blob:/);
  assert.match(csp, /style-src [^;]*'unsafe-inline'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("permissions-policy"), null);
});
