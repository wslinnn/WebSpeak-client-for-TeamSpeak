import assert from "node:assert/strict";
import test from "node:test";

import { createStunRateLimiter, handleStunDatagram } from "./stun-server.js";

const MAGIC_COOKIE = 0x2112_a444;

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
