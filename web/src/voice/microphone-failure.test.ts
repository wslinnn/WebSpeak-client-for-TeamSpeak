import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMicrophoneFailure } from "./microphone-failure.js";

function namedError(name: string): Error {
  const error = new Error("boom");
  error.name = name;
  return error;
}

test("normalizeMicrophoneFailure maps DOMException names to stable codes and actionable guidance", () => {
  const permission = normalizeMicrophoneFailure(namedError("NotAllowedError"));
  assert.equal(permission.code, "MIC_NOTALLOWEDERROR");
  assert.match(permission.message, /地址栏/);
  assert.match(permission.message, /^麦克风访问失败：/);

  // TypeError is the insecure-context signature (navigator.mediaDevices absent).
  const typeError = normalizeMicrophoneFailure(namedError("TypeError"));
  assert.equal(typeError.code, "MIC_TYPEERROR");
  assert.match(typeError.message, /https/);

  const occupied = normalizeMicrophoneFailure(namedError("NotReadableError"));
  assert.equal(occupied.code, "MIC_NOTREADABLEERROR");
  assert.match(occupied.message, /独占模式/);

  const stale = normalizeMicrophoneFailure(namedError("OverconstrainedError"));
  assert.equal(stale.code, "MIC_OVERCONSTRAINEDERROR");
});

test("normalizeMicrophoneFailure falls back for unknown and non-Error inputs", () => {
  // Unknown names keep the sanitized name in the code for diagnosability, but
  // the readable sentence falls back to the generic guidance.
  const unknown = normalizeMicrophoneFailure(namedError("SomethingNew"));
  assert.equal(unknown.code, "MIC_SOMETHINGNEW");
  assert.match(unknown.message, /麦克风不可用/);

  const nonError = normalizeMicrophoneFailure("nope");
  assert.equal(nonError.code, "MIC_UNAVAILABLE");
  assert.match(nonError.message, /麦克风不可用/);
});
