import assert from "node:assert/strict";
import test from "node:test";
import { parseServerInfoRow } from "./server-info.js";

test("serverinfo row maps virtual server name and welcome message", () => {
  const info = parseServerInfoRow({
    virtualserver_name: "My Server",
    virtualserver_welcomemessage: "Welcome to TeamSpeak, check www.teamspeak.com for latest information",
  });
  assert.deepEqual(info, {
    name: "My Server",
    welcomeMessage: "Welcome to TeamSpeak, check www.teamspeak.com for latest information",
  });
});

test("either field alone is kept, whitespace-only fields drop", () => {
  assert.deepEqual(parseServerInfoRow({ virtualserver_name: "  Only Name  " }), { name: "Only Name", welcomeMessage: undefined });
  assert.deepEqual(parseServerInfoRow({ virtualserver_welcomemessage: "hi" }), { name: undefined, welcomeMessage: "hi" });
  assert.equal(parseServerInfoRow({ virtualserver_name: "   " }), null);
  assert.equal(parseServerInfoRow({}), null);
  assert.equal(parseServerInfoRow(undefined), null);
});

test("fields are clamped to protocol bounds", () => {
  const info = parseServerInfoRow({
    virtualserver_name: "n".repeat(400),
    virtualserver_welcomemessage: "w".repeat(4000),
  });
  assert.ok(info);
  assert.equal(info.name?.length, 160);
  assert.equal(info.welcomeMessage?.length, 1024);
});
