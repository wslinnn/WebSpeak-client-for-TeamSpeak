import assert from "node:assert/strict";
import test from "node:test";

import { createStunRateLimiter, handleStunDatagram } from "./stun-server.js";

// RFC 8489 §6 mandates 0x2112A44D — the test must quote the RFC number, never
// import the implementation's constant: a shared literal lets a typo validate
// itself (one did, for the entire first deployment).
const MAGIC_COOKIE = 0x2112_a44d;

function bindingRequest(transactionId: Buffer): Buffer {
  const request = Buffer.alloc(20);
  request.writeUInt16BE(0x0001, 0);
  request.writeUInt16BE(0, 2);
  request.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(request, 8);
  return request;
}

function unmaskXorMapped(response: Buffer): { family: number; port: number; address: string } {
  const attributeOffset = 20;
  assert.equal(response.readUInt16BE(attributeOffset), 0x0020, "first attribute must be XOR-MAPPED-ADDRESS");
  const family = response.readUInt8(attributeOffset + 5);
  const xport = response.readUInt16BE(attributeOffset + 6);
  const port = xport ^ (MAGIC_COOKIE >>> 16);
  const addressLength = family === 0x02 ? 16 : 4;
  const bytes: number[] = [];
  for (let index = 0; index < addressLength; index++) {
    const keyOffset = index < 4 ? 4 + index : attributeOffset >= 0 && index >= 4 ? 8 + index - 4 : 4 + index;
    bytes.push(response[attributeOffset + 8 + index]! ^ response[keyOffset]!);
  }
  const address = family === 0x02
    ? Array.from({ length: 8 }, (_, group) => ((bytes[group * 2]! << 8) | bytes[group * 2 + 1]!).toString(16)).join(":")
    : bytes.join(".");
  return { family, port, address };
}

test("the response bytes match a golden vector hand-derived from RFC 8489", () => {
  // Known-answer anchor written from the RFC (cookie 0x2112A44D, port
  // 54321=0xD431 ^0x2112=0xF523, 203.0.113.7 ^ cookie bytes
  // = ea 12 d5(113^164=d5) 4a(7^0x4d=4a)), independent of how the
  // implementation computes the same bytes.
  const transactionId = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const reply = handleStunDatagram(bindingRequest(transactionId), { address: "203.0.113.7", port: 54_321 }, () => true);
  assert.ok(reply);
  assert.equal(
    reply.toString("hex"),
    "0101000c2112a44d0102030405060708090a0b0c002000080001f523ea12d54a",
  );
});

test("the observed-browser cookie flavor (0x2112a442) is answered with self-consistent masking", () => {
  // 现场形态：真实浏览器族被实测以 0x2112a442 作 cookie 且以自身 cookie 作
  // XOR key。服务器掩码 key 取自请求头——442 进、442 掩码出，客户端自洽可解。
  const request = Buffer.alloc(20);
  request.writeUInt16BE(0x0001, 0);
  request.writeUInt32BE(0x2112_a442, 4);
  request.writeUInt32BE(0x0707_0707, 8);
  request.writeUInt32BE(0x0707_0707, 12);
  request.writeUInt32BE(0x0707_0707, 16);
  const reply = handleStunDatagram(request, { address: "198.51.100.9", port: 12_345 }, () => true);
  assert.ok(reply);
  // port 12345=0x3039 ^0x2112=0x112B；198.51.100.9 ^ (21,12,a4,42)=e7 21 c0 4b。
  assert.equal(
    reply.toString("hex"),
    "0101000c2112a442070707070707070707070707002000080001112be721c04b",
  );
});

test("an IPv4-mapped IPv6 arrival is normalized to a plain IPv4 answer", () => {
  // 双栈套接字竞态的防线：v4 包以 ::ffff: 形态到达时按 v4 应答（family=01、
  // 4 字节 XOR），而不是落到对 v4-mapped 文本算出乱码的 v6 路径。
  const transactionId = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2]);
  const reply = handleStunDatagram(bindingRequest(transactionId), { address: "::ffff:203.0.113.7", port: 54_321 }, () => true);
  assert.ok(reply);
  assert.equal(reply.readUInt16BE(0), 0x0101);
  assert.equal(reply.readUInt8(25), 0x01, "family must be IPv4");
  const port = reply.readUInt16BE(26) ^ 0x2112;
  assert.equal(port, 54_321);
  const address = [0, 1, 2, 3].map((index) => reply.readUInt8(28 + index) ^ reply.readUInt8(4 + index)).join(".");
  assert.equal(address, "203.0.113.7");
});

test("binding request yields a success response with the XOR-mapped IPv4 address", () => {
  const transactionId = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const reply = handleStunDatagram(bindingRequest(transactionId), { address: "203.0.113.7", port: 54321 }, () => true);
  assert.ok(reply, "a valid binding request must be answered");
  assert.equal(reply.readUInt16BE(0), 0x0101);
  assert.deepEqual([...reply.subarray(8, 20)], [...transactionId]);
  const mapped = unmaskXorMapped(reply);
  assert.equal(mapped.family, 0x01);
  assert.equal(mapped.port, 54321);
  assert.equal(mapped.address, "203.0.113.7");
});

test("binding request over IPv6 unmasks with cookie plus transaction id", () => {
  const transactionId = Buffer.from([0xab, 0xcd, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const reply = handleStunDatagram(bindingRequest(transactionId), { address: "2001:db8::1", port: 3478 }, () => true);
  assert.ok(reply);
  const mapped = unmaskXorMapped(reply);
  assert.equal(mapped.family, 0x02);
  assert.equal(mapped.port, 3478);
  assert.equal(mapped.address, "2001:db8:0:0:0:0:0:1");
});

test("non-binding frames, foreign cookies and short datagrams are ignored", () => {
  const transactionId = Buffer.alloc(12, 7);
  const allow = () => true;
  const otherType = bindingRequest(transactionId);
  otherType.writeUInt16BE(0x0101, 0);
  assert.equal(handleStunDatagram(otherType, { address: "203.0.113.7", port: 1 }, allow), null);

  const foreignCookie = bindingRequest(transactionId);
  foreignCookie.writeUInt32BE(0xdeadbeef, 4);
  assert.equal(handleStunDatagram(foreignCookie, { address: "203.0.113.7", port: 1 }, allow), null);

  assert.equal(handleStunDatagram(Buffer.alloc(10), { address: "203.0.113.7", port: 1 }, allow), null);
  assert.equal(handleStunDatagram(bindingRequest(transactionId), { address: "not-an-ip", port: 1 }, allow), null);
});

test("exhausted peers are dropped until the bucket refills", () => {
  let now = 1_000_000;
  const limiter = createStunRateLimiter(() => now);
  const key = "203.0.113.7";
  for (let index = 0; index < 30; index++) assert.equal(limiter.allow(key), true, `request ${index} within burst`);
  assert.equal(limiter.allow(key), false, "burst exhausted");
  now += 1_000;
  assert.equal(limiter.allow(key), true, "one second refills the refill rate");
  assert.equal(limiter.allow("198.51.100.9"), true, "other peers keep their own bucket");
  limiter.sweep();
});
