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

// Avatars are served from the shared cache through capability URLs. The
// endpoint is load-bearing for the whole URL-delivery design: stable URLs
// with immutable caching are what let the browser's disk cache absorb every
// refresh and resume, so the exact response headers are pinned here.
test("the avatar endpoint serves cache bytes with cache-friendly headers and misses safely", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-avatars-"));
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

  assert.equal((await fetch(`${origin}/avatars/0123456789abcdef0123456789abcdef`)).status, 404, "unknown ids miss");
  assert.equal((await fetch(`${origin}/avatars/short`)).status, 404, "malformed ids miss");

  const bytes = Buffer.from("GIF89a-fake-avatar-bytes");
  assert.ok(server.avatars.store("uid-1", bytes));
  const url = server.avatars.url("uid-1")!;
  const missBefore = await fetch(`${origin}/avatars/${"0".repeat(32)}`);
  assert.equal(missBefore.headers.get("cache-control"), "no-store", "misses must not be cached");

  const hit = await fetch(`${origin}${url}`);
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get("content-type"), "image/gif");
  assert.equal(hit.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal(hit.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Buffer.from(await hit.arrayBuffer()).toString(), bytes.toString(), "exact bytes are served");

  // Changed content rotates the version query — same capability path, new
  // browser cache key, so clients converge on the replaced bytes.
  assert.ok(server.avatars.store("uid-1", Buffer.from("GIF89a-replaced")));
  const rotated = server.avatars.url("uid-1")!;
  assert.notEqual(url, rotated);
  assert.equal((await fetch(`${origin}${rotated}`)).status, 200);
});
