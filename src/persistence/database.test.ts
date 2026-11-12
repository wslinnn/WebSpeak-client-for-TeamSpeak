import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { WebSpeakDatabase } from "./database.js";

/** A corrupted credential row used to throw from JSON.parse all the way through
 *  /api/admin/login: the admin console then answered 500 with no
 *  explanation. It must now read as "no credential" plus one explicit warning. */
test("a corrupt administrator credential reads as absent instead of throwing", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-corrupt-credential-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "webspeak.db");
  const warnings: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const logger = {
    warn: (objOrMessage: Record<string, unknown> | string, message?: string) => {
      if (typeof objOrMessage === "string") warnings.push({ fields: {}, message: objOrMessage });
      else warnings.push({ fields: objOrMessage, message: message ?? "" });
    },
  };
  const seed = new WebSpeakDatabase(file);
  seed.close();
  const raw = new DatabaseSync(file);
  try {
    raw.prepare("INSERT INTO admin_credentials (id, credential_json, created_at, updated_at) VALUES (1, ?, ?, ?)")
      .run("{not json", new Date().toISOString(), new Date().toISOString());
  } finally { raw.close(); }

  const database = new WebSpeakDatabase(file, logger);
  try {
    assert.equal(database.hasAdmin(), true, "the row still exists");
    assert.equal(database.getAdminCredential(), null, "login must see a missing credential, not a 500");
    // 只报一次：登录页反复重试不该刷屏。
    database.getAdminCredential();
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]!.fields.code, "ADMIN_CREDENTIAL_CORRUPT");
  } finally {
    database.close();
  }

  // A parseable but non-object row is corruption as well.
  const rawAgain = new DatabaseSync(file);
  try {
    rawAgain.prepare("UPDATE admin_credentials SET credential_json = 'null' WHERE id = 1").run();
  } finally { rawAgain.close(); }
  const second = new WebSpeakDatabase(file);
  try {
    assert.equal(second.getAdminCredential(), null);
  } finally {
    second.close();
  }
});
