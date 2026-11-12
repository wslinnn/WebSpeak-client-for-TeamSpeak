import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { BlockList } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createAdminRouter } from "./admin-router.js";
import { AdminService } from "./admin-service.js";
import { AdminSessionStore } from "./admin-session.js";
import type { Logger } from "../logger.js";
import { WebSpeakDatabase } from "../persistence/database.js";

/** Admin session cookies are httpOnly and per-login: an integration test is the
 *  only way to observe what a second browser tab can still do after a password
 *  change. The admin router is mounted standalone so this file stays inside the
 *  admin module's dependency boundary (admin→server imports are restricted). */
test("changing the admin password retires every other admin session", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-admin-session-"));
  const warnings: string[] = [];
  const logger: Logger = {
    debug: () => {}, info: () => {},
    warn: (...args: unknown[]) => { warnings.push(String(args[0])); },
    error: () => {}, child: () => logger,
  };
  const database = new WebSpeakDatabase(path.join(directory, "webspeak.db"));
  const service = new AdminService(database, Buffer.alloc(32, 1), logger, path.join(directory, "missing-config.json"));
  await service.initialize();
  const setupToken = warnings
    .find(line => line.startsWith("Admin setup token: "))
    ?.slice("Admin setup token: ".length)
    .trim();
  assert.ok(setupToken, "the setup token is printed on first start");

  const sessions = new AdminSessionStore();
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  app.use("/api/admin", createAdminRouter({
    service, sessions, logger,
    trustedProxies: new BlockList(),
    getActiveSessions: () => 0,
    getPeakSessions: () => 0,
    startedAt: Date.now(),
  }));
  const http = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => http.once("listening", resolve));
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  context.after(async () => {
    await new Promise<void>(resolve => http.close(() => resolve()));
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const login = async (password: string): Promise<{ cookie: string; csrfToken: string }> => {
    const response = await fetch(`${origin}/api/admin/login`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { csrfToken: string };
    const cookie = response.headers.getSetCookie()
      .map(header => header.split(";")[0]!.trim())
      .find(value => value.startsWith("webspeak_admin="));
    assert.ok(cookie, "login must set the admin session cookie");
    return { cookie, csrfToken: body.csrfToken };
  };
  const authenticated = async (cookie: string): Promise<boolean> => {
    const response = await fetch(`${origin}/api/admin/session`, { headers: { cookie } });
    return (await response.json() as { authenticated: boolean }).authenticated;
  };

  // 两个「浏览器」先后登录：改密前两者都有效。
  const current = await login(setupToken);
  const stale = await login(setupToken);
  assert.equal(await authenticated(current.cookie), true);
  assert.equal(await authenticated(stale.cookie), true);
  const changed = await fetch(`${origin}/api/admin/change-password`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: current.cookie, "x-csrf-token": current.csrfToken },
    body: JSON.stringify({ newPassword: "a-very-long-admin-password" }),
  });
  assert.equal(changed.status, 200);
  assert.deepEqual(await changed.json(), { ok: true, mustChangePassword: false });
  assert.equal(await authenticated(current.cookie), true, "改密的那个会话保持可用");
  assert.equal(await authenticated(stale.cookie), false, "改密前签发的其它会话全部失效");
  // 失效只针对会话，不是口令假象：新口令能登录，旧的 setup token 不能。
  assert.ok((await login("a-very-long-admin-password")).csrfToken.length > 0);
  const rejected = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: setupToken }),
  });
  assert.equal(rejected.status, 401);
});
