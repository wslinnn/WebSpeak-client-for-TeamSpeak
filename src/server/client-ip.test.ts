import assert from "node:assert/strict";
import test from "node:test";
import { rateLimitPeerKey, resolveClientAddress } from "./client-ip.js";

test("direct connections ignore forwarded headers entirely", () => {
  assert.equal(resolveClientAddress("203.0.113.7", "198.51.100.9", false), "203.0.113.7");
  assert.equal(resolveClientAddress("203.0.113.7", "198.51.100.9, 10.0.0.1", false), "203.0.113.7");
});

test("trust proxy takes the first forwarded address and validates it", () => {
  assert.equal(resolveClientAddress("127.0.0.1", "198.51.100.9, 10.0.0.1", true), "198.51.100.9");
  // A garbage or absent header falls back to the socket address.
  assert.equal(resolveClientAddress("203.0.113.7", "not-an-ip", true), "203.0.113.7");
  assert.equal(resolveClientAddress("203.0.113.7", undefined, true), "203.0.113.7");
});

test("IPv4-mapped socket addresses stay IPv4 so limiting cannot merge all v4 peers", () => {
  assert.equal(resolveClientAddress("::ffff:203.0.113.7", undefined, false), "203.0.113.7");
  assert.equal(rateLimitPeerKey(resolveClientAddress("::ffff:203.0.113.7", undefined, false)), "203.0.113.7");
  // Even a raw mapped literal passed to the key function normalizes to IPv4.
  assert.equal(rateLimitPeerKey("::ffff:203.0.113.7"), "203.0.113.7");
});

test("IPv6 peers aggregate to their /64", () => {
  assert.equal(rateLimitPeerKey("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
  // Compressed and expanded spellings of the same /64 collapse together.
  assert.equal(rateLimitPeerKey("2001:db8:1:2::9"), "2001:db8:1:2::/64");
  assert.equal(rateLimitPeerKey("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(rateLimitPeerKey("203.0.113.7"), "203.0.113.7");
});
