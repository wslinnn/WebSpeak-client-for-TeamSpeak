import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AdminService } from "./admin-service.js";
import type { Logger } from "../logger.js";
import { WebSpeakDatabase } from "../persistence/database.js";

test("first startup mints a one-time setup token instead of a default password", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-admin-setup-"));
  const warnings: string[] = [];
  const logger: Logger = {
    debug: () => {}, info: () => {},
    warn: (...args: unknown[]) => { warnings.push(String(args[0])); },
    error: () => {}, child: () => logger,
  };
  const database = new WebSpeakDatabase(path.join(directory, "webspeak.db"));
  const service = new AdminService(database, Buffer.alloc(32, 1), logger, path.join(directory, "missing-config.json"), async () => {
    throw new Error("unexpected probe");
  });
  try {
    await service.initialize();
    const tokenLine = warnings.find((line) => line.startsWith("Admin setup token: "));
    assert.ok(tokenLine, "the setup token must be printed to the log");
    const token = tokenLine.slice("Admin setup token: ".length).trim();
    assert.ok(token.startsWith("ws-setup-"));
    // The historical admin/admin pair is gone; only the printed token signs in.
    assert.equal(await service.verifyPassword("admin", token), true);
    assert.equal(await service.verifyPassword("admin", "admin"), false);
    assert.equal(service.isPasswordChangeRequired(), true);

    warnings.length = 0;
    await service.initialize();
    assert.equal(warnings.some((line) => line.includes("setup token")), false, "a second start must not re-mint the token");
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
