import assert from "node:assert/strict";
import test from "node:test";
import { opusFrameDurationMs } from "./opus-frame.js";

// TOC byte = (config << 3) | (stereo << 1) | code.
function packet(config: number, code: number, frameBytes = 1, extra: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([Buffer.from([(config << 3) | code]), Buffer.alloc(frameBytes, 0xaa), extra]);
}

test("single-frame packets (code 0) resolve through the SILK, hybrid and CELT tables", () => {
  assert.equal(opusFrameDurationMs(packet(0, 0)), 10, "SILK NB 10 ms");
  assert.equal(opusFrameDurationMs(packet(1, 0)), 20, "SILK NB 20 ms");
  assert.equal(opusFrameDurationMs(packet(9, 0)), 20, "SILK WB 20 ms");
  assert.equal(opusFrameDurationMs(packet(10, 0)), 40, "SILK WB 40 ms");
  assert.equal(opusFrameDurationMs(packet(12, 0)), 10, "hybrid WB 10 ms");
  assert.equal(opusFrameDurationMs(packet(15, 0)), 20, "hybrid FB 20 ms");
  assert.equal(opusFrameDurationMs(packet(16, 0)), 2.5, "CELT NB 2.5 ms");
  assert.equal(opusFrameDurationMs(packet(31, 0)), 20, "CELT FB 20 ms");
});

test("multi-frame codes multiply the per-frame duration", () => {
  // Code 1: two equal frames.
  assert.equal(opusFrameDurationMs(packet(9, 1, 4)), 40);
  // Code 2: two frames sized by a length prefix; the prefix value does not
  // matter for timing as long as it is present and non-zero.
  assert.equal(opusFrameDurationMs(Buffer.from([0x4a, 0x10, 0xaa, 0xbb])), 40);
  // Code 3 with an inline six-bit frame count (control byte 0x02 = 2 frames).
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x02, 0xaa, 0xbb])), 40);
  // Code 3 with the extended-count flag: the count lives in a third byte.
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x43, 0x03, 0xaa, 0xbb, 0xcc])), 60);
});

test("unparseable payloads return null", () => {
  assert.equal(opusFrameDurationMs(Buffer.alloc(0)), null);
  assert.equal(opusFrameDurationMs(Buffer.from([0x48])), null, "code 0 needs at least one payload byte");
  assert.equal(opusFrameDurationMs(Buffer.from([0x49, 0xaa])), null, "code 1 needs two frames");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4a, 0x00, 0xaa])), null, "a zero first-frame length is illegal");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4a, 0x10])), null, "code 2 needs the frame after its length prefix");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b])), null, "code 3 without a control byte");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x02])), null, "code 3 declares two frames but carries none");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x42, 0x00])), null, "extended count of zero is illegal");
});
