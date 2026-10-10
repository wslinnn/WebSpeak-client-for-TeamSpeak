import assert from "node:assert/strict";
import test from "node:test";
import { parseVoiceSessionIntent, readLastResumeAt, writeLastResumeAt } from "./session-intent.js";

test("parseVoiceSessionIntent accepts a well-formed intent payload", () => {
  assert.deepEqual(
    parseVoiceSessionIntent(JSON.stringify({ reconnectToken: "abc123def456", savedAt: 1234 })),
    { reconnectToken: "abc123def456", savedAt: 1234 },
  );
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

test("resume cooldown timestamps fall back to zero without storage", () => {
  if (typeof sessionStorage !== "undefined") return;
  assert.equal(readLastResumeAt(), 0);
  assert.doesNotThrow(() => writeLastResumeAt(Date.now()));
  assert.equal(readLastResumeAt(), 0);
});
