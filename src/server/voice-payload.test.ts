import assert from "node:assert/strict";
import test from "node:test";
import { splitVoicePayload, VOICE_FLAG_EXTENSION, VOICE_FLAG_TRAILER } from "./voice-payload.js";

test("plain payloads pass through as one frame", () => {
  const data = Buffer.from([1, 2, 3, 4]);
  assert.deepEqual(splitVoicePayload(data, 0), { frames: [data], jitterMs: null });
});

test("the trailer byte is stripped and exposed as jitter milliseconds", () => {
  const data = Buffer.from([1, 2, 3, 30]);
  const split = splitVoicePayload(data, VOICE_FLAG_TRAILER);
  assert.deepEqual(split?.frames, [Buffer.from([1, 2, 3])]);
  assert.equal(split?.jitterMs, 10);
});

test("the extension byte splits the audio into nvp equal frames", () => {
  const data = Buffer.from([2, 0xaa, 0xbb, 0xcc, 0xdd]);
  const split = splitVoicePayload(data, VOICE_FLAG_EXTENSION);
  assert.deepEqual(split?.frames, [Buffer.from([0xaa, 0xbb]), Buffer.from([0xcc, 0xdd])]);
  assert.equal(split?.jitterMs, null);
});

test("extension and trailer combine: trailer stripped, then frames split", () => {
  const data = Buffer.from([2, 0xaa, 0xbb, 0xcc, 0xdd, 30]);
  const split = splitVoicePayload(data, VOICE_FLAG_EXTENSION | VOICE_FLAG_TRAILER);
  assert.deepEqual(split?.frames, [Buffer.from([0xaa, 0xbb]), Buffer.from([0xcc, 0xdd])]);
  assert.equal(split?.jitterMs, 10);
});

test("a zero frame count or a non-divisible payload is malformed", () => {
  assert.equal(splitVoicePayload(Buffer.from([0, 0xaa]), VOICE_FLAG_EXTENSION), null);
  assert.equal(splitVoicePayload(Buffer.from([3, 0xaa, 0xbb, 0xcc, 0xdd]), VOICE_FLAG_EXTENSION), null);
  assert.equal(splitVoicePayload(Buffer.alloc(0), VOICE_FLAG_EXTENSION), null);
});

test("a trailer without audio leaves a valid empty frame for the CN filter", () => {
  const split = splitVoicePayload(Buffer.from([30]), VOICE_FLAG_TRAILER);
  assert.equal(split?.frames.length, 1);
  assert.equal(split?.frames[0]!.length, 0);
  assert.equal(split?.jitterMs, 10);
});
