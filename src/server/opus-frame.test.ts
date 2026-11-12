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
});

// RFC 6716 §3.2.5 / Figure 5：帧数字节是 |v|p| M |——bit 7 = VBR、bit 6 = Opus
// padding、低 6 位 = 帧数（1..48）。参考实现（libopus）同样是 packet[1]&0x3F。
test("code 3 reads the frame count from the low six bits regardless of the VBR and padding bits", () => {
  const cbr = (flags: number, count: number, tail: number[]): Buffer =>
    Buffer.from([0x4b, flags | count, ...tail]);
  // 无 pad/VBR：2 帧。
  assert.equal(opusFrameDurationMs(cbr(0x00, 2, [0xaa, 0xbb])), 40);
  // padding 位（0x40）只表示包尾有 padding，帧数不变：padding 长度字节 0x01
  // 后面是 2 帧数据，再跟 1 字节 padding。
  assert.equal(opusFrameDurationMs(cbr(0x40, 2, [0x01, 0xaa, 0xbb, 0x00])), 40);
  // padding 长度字节的数值绝不能当作帧数：0x02 只说明 2 字节 padding。
  assert.equal(opusFrameDurationMs(cbr(0x40, 3, [0x02, 0xaa, 0xbb, 0xcc, 0x00, 0x00])), 60);
  // VBR 位（0x80）：帧数仍在低 6 位，1 个长度字节之后是帧数据。
  assert.equal(opusFrameDurationMs(cbr(0x80, 2, [0x01, 0xaa, 0xbb])), 40);
  // VBR + padding 同时置位。
  assert.equal(opusFrameDurationMs(cbr(0xc0, 2, [0x01, 0x01, 0xaa, 0xbb, 0x00])), 40);
  // 旧实现把 0x40 当「扩展帧数字节」：padding 长度字节 0x01 会被读成 1 帧
  // （时间轴少推 20ms），0x10 会被读成 16 帧（多推 300ms）。
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x42, 0x01, 0xaa, 0xbb, 0x00])), 40);
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x41, 0x10, 0xaa, ...Array(16).fill(0)])), 20);
});

test("a packet longer than the RFC's 120 ms ceiling is rejected", () => {
  // 20ms SILK 帧 × 6 = 120ms（允许），× 7 = 140ms（RFC 6716 §3.2.5 禁止）。
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x06, ...Array(6).fill(0x11)])), 120);
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x07, ...Array(7).fill(0x11)])), null);
  // 60ms SILK WB（config 11）帧 × 3 = 180ms 同样越界。
  assert.equal(opusFrameDurationMs(Buffer.from([0x5b, 0x03, 0x11, 0x12, 0x13, 0x14, 0x15])), null);
});

test("unparseable payloads return null", () => {
  assert.equal(opusFrameDurationMs(Buffer.alloc(0)), null);
  assert.equal(opusFrameDurationMs(Buffer.from([0x48])), null, "code 0 needs at least one payload byte");
  assert.equal(opusFrameDurationMs(Buffer.from([0x49, 0xaa])), null, "code 1 needs two frames");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4a, 0x00, 0xaa])), null, "a zero first-frame length is illegal");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4a, 0x10])), null, "code 2 needs the frame after its length prefix");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b])), null, "code 3 without a control byte");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x02])), null, "code 3 declares two frames but carries none");
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x00, 0xaa, 0xbb])), null, "M MUST NOT be zero (RFC 6716 §3.2.5)");
  // padding 只声明了字节，没有帧数据：不足以推进时间轴。
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x42, 0x00])), null);
  // 低 6 位之外没有「扩展帧数」空间：49 帧越界（RFC 上限 48）。
  assert.equal(opusFrameDurationMs(Buffer.from([0x4b, 0x31, ...Array(49).fill(0x11)])), null);
});
