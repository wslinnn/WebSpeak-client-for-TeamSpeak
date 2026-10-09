import assert from "node:assert/strict";
import test from "node:test";
import { escapeTeamSpeakValue } from "./ts-escaping.js";

test("TeamSpeak command arguments escape protocol delimiters and control characters", () => {
  assert.equal(escapeTeamSpeakValue("a b"), "a\\sb");
  assert.equal(escapeTeamSpeakValue("a|b"), "a\\pb");
  assert.equal(escapeTeamSpeakValue("a/b"), "a\\/b");
  assert.equal(escapeTeamSpeakValue("a\\b"), "a\\\\b");
  assert.equal(escapeTeamSpeakValue("a\nb\rc\td\fe\vfg"), "a\\nb\\rc\\td\\fe\\vfg");
});

test("escaping keeps a hostile argument from injecting additional command pairs", () => {
  const hostile = "x=1|clientupdate client_nickname=owned";
  const escaped = escapeTeamSpeakValue(hostile);
  assert.equal(escaped.includes("|clientupdate"), false);
  assert.match(escaped, /\\pclientupdate/);
});
