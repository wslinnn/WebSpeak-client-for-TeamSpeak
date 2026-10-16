import assert from "node:assert/strict";
import { test } from "vitest";
import { parseVoiceSessionIntent } from "./session-intent";

test("parseVoiceSessionIntent accepts a well-formed intent payload", () => {
  assert.deepEqual(
    parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "abc123def456", savedAt: 1234 })),
    { reconnectToken: "abc123def456", savedAt: 1234 },
  );
});

test("parseVoiceSessionIntent round-trips the display target and tolerates its absence", () => {
  // 旧存量 intent 无 target：缺失是合法形态（回退旧行为）。
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "abc123def456", savedAt: 1 }))?.target, undefined);
  assert.deepEqual(
    parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "abc123def456", savedAt: 1, target: { address: "ts.example.com", port: "9987" } })),
    { reconnectToken: "abc123def456", savedAt: 1, target: { address: "ts.example.com", port: "9987" } },
  );
});

test("parseVoiceSessionIntent rejects malformed targets instead of trusting them", () => {
  const base = { reconnectToken: "abc123def456", savedAt: 1 };
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ ...base, target: "ts.example.com:9987" })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ ...base, target: { address: "", port: "9987" } })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ ...base, target: { address: "h", port: "99a87" } })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ ...base, target: { address: "h", port: 9987 } })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ ...base, target: { address: "h", port: "123456" } })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ ...base, target: { address: "a".repeat(256), port: "9987" } })), null);
});

test("parseVoiceSessionIntent rejects malformed payloads", () => {
  assert.equal(parseVoiceSessionIntent(null), null);
  assert.equal(parseVoiceSessionIntent(""), null);
  assert.equal(parseVoiceSessionIntent("not json"), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "short", savedAt: 1 })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ reconnectToken: 42, savedAt: 1 })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "abc123def456" })), null);
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "abc123def456", savedAt: "late" })), null);
  // Oversized tokens are rejected so a hostile storage value cannot smuggle data.
  assert.equal(parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "a".repeat(129), savedAt: 1 })), null);
});
