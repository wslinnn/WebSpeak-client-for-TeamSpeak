import assert from "node:assert/strict";
import test from "node:test";
import {
  createConfiguredTrustedProxies,
  createTrustedProxies,
  isTrustedProxyPeer,
  NO_TRUSTED_PROXIES,
  rateLimitPeerKey,
  resolveClientAddress,
} from "./client-ip.js";

const loopback = () => createTrustedProxies(undefined);

test("direct connections ignore forwarded headers entirely", () => {
  assert.equal(resolveClientAddress("203.0.113.7", "198.51.100.9", NO_TRUSTED_PROXIES), "203.0.113.7");
  assert.equal(resolveClientAddress("203.0.113.7", "198.51.100.9, 10.0.0.1", NO_TRUSTED_PROXIES), "203.0.113.7");
  assert.equal(resolveClientAddress("203.0.113.7", undefined, loopback()), "203.0.113.7");
  assert.equal(resolveClientAddress("203.0.113.7", "198.51.100.9", loopback()), "203.0.113.7",
    "a declared proxy list does not make a direct client's own header believable");
});

test("a trusted proxy chain is read from our side towards the client", () => {
  const trusted = createTrustedProxies(["127.0.0.1", "::1", "10.0.0.0/8", "2001:db8::/32"]);
  // The proxy appended the peer it accepted, so a value the client injected to
  // its left is never the address we record.
  assert.equal(resolveClientAddress("127.0.0.1", "203.0.113.9, 198.51.100.4", trusted), "198.51.100.4");
  // Both hops are trusted, so keep walking towards the client.
  assert.equal(resolveClientAddress("127.0.0.1", "203.0.113.9, 10.1.2.3", trusted), "203.0.113.9");
  // The same walk over IPv6: a trusted hop, then the client.
  assert.equal(resolveClientAddress("::1", "2001:db9::9, 2001:db8::5", trusted), "2001:db9::9");
  // Array form is the same chain.
  assert.equal(resolveClientAddress("127.0.0.1", ["203.0.113.9", "10.1.2.3"], trusted), "203.0.113.9");
});

test("a direct client cannot choose the address recorded for it", () => {
  const trusted = loopback();
  assert.equal(resolveClientAddress("192.0.2.7", "203.0.113.9", trusted), "192.0.2.7");
  assert.equal(resolveClientAddress("192.0.2.7", undefined, trusted, "203.0.113.9"), "192.0.2.7",
    "X-Real-IP from an undeclared peer is ignored as well");
  assert.equal(resolveClientAddress("::ffff:192.0.2.7", "203.0.113.9", trusted), "192.0.2.7",
    "an IPv4 peer arrives in mapped form and is still the address we must record");
});

test("X-Real-IP is used only for a trusted single-hop proxy", () => {
  const trusted = loopback();
  assert.equal(resolveClientAddress("127.0.0.1", undefined, trusted, "203.0.113.9"), "203.0.113.9");
  assert.equal(resolveClientAddress("127.0.0.1", "203.0.113.9", trusted, "198.51.100.4"), "203.0.113.9",
    "the appended chain wins over the single-value header");
});

test("an all-trusted chain reports the furthest address instead of inventing one", () => {
  const trusted = loopback();
  assert.equal(resolveClientAddress("127.0.0.1", "127.0.0.1", trusted), "127.0.0.1");
  assert.equal(resolveClientAddress("127.0.0.1", undefined, trusted), "127.0.0.1");
  assert.equal(resolveClientAddress(undefined, undefined, trusted), "unknown");
});

test("unparseable forwarding values are dropped rather than recorded", () => {
  const trusted = loopback();
  assert.equal(resolveClientAddress("127.0.0.1", "not-an-ip", trusted), "127.0.0.1");
  assert.equal(resolveClientAddress("127.0.0.1", "not-an-ip, 203.0.113.9", trusted), "203.0.113.9");
});

test("the default trust list is loopback only", () => {
  const trusted = loopback();
  assert.equal(resolveClientAddress("127.0.0.1", "203.0.113.9", trusted), "203.0.113.9");
  assert.equal(resolveClientAddress("::1", "203.0.113.9", trusted), "203.0.113.9");
  // A bridge address belongs to a proxy we have not been told about, so its
  // headers are ignored and the connection is logged from the proxy.
  assert.equal(resolveClientAddress("172.17.0.1", "203.0.113.9", trusted), "172.17.0.1");
});

test("a declared trusted proxy accepts CIDR and mapped forms", () => {
  const cidr = createTrustedProxies(["10.0.0.0/8", "fd00::/8"]);
  assert.equal(resolveClientAddress("10.9.8.7", "203.0.113.9", cidr), "203.0.113.9");
  assert.equal(resolveClientAddress("fd00::7", "2001:db8::9", cidr), "2001:db8::9");

  // Mapped entries are unwrapped, so they match both the plain and the mapped
  // form of the same peer address.
  const mapped = createTrustedProxies(["::ffff:192.0.2.1"]);
  assert.equal(resolveClientAddress("192.0.2.1", "203.0.113.9", mapped), "203.0.113.9");
  assert.equal(resolveClientAddress("::ffff:192.0.2.1", "203.0.113.9", mapped), "203.0.113.9");
});

test("an invalid trust list is rejected instead of silently ignored", () => {
  for (const entry of ["not-an-ip", "10.0.0.0/33", "fd00::/129", "10.0.0.0/x", "10.0.0.0/-1"]) {
    assert.throws(() => createTrustedProxies([entry]), /WEBSPEAK_TRUSTED_PROXIES/, entry);
  }
});

test("trusting every address has to be asked for explicitly", () => {
  const trusted = createTrustedProxies(["0.0.0.0/0", "::/0"]);
  assert.equal(resolveClientAddress("192.0.2.7", "203.0.113.9", trusted), "203.0.113.9");
});

test("the operator switches map to the expected trust lists", () => {
  // Undeclared proxy: nothing is believable, which is the documented default
  // for a directly exposed gateway.
  assert.equal(isTrustedProxyPeer("127.0.0.1", createConfiguredTrustedProxies({})), false);
  // WEBSPEAK_TRUST_PROXY=1 means the same-host proxy.
  const sameHost = createConfiguredTrustedProxies({ trustProxy: true });
  assert.equal(isTrustedProxyPeer("127.0.0.1", sameHost), true);
  assert.equal(isTrustedProxyPeer("::ffff:127.0.0.1", sameHost), true);
  assert.equal(isTrustedProxyPeer("10.0.0.5", sameHost), false);
  // An explicit list overrides the flag, so a proxy elsewhere works and
  // loopback is no longer implied.
  const declared = createConfiguredTrustedProxies({ trustProxy: true, entries: ["10.0.0.0/8"] });
  assert.equal(isTrustedProxyPeer("10.0.0.5", declared), true);
  assert.equal(isTrustedProxyPeer("127.0.0.1", declared), false);
});

test("IPv4-mapped socket addresses stay IPv4 so limiting cannot merge all v4 peers", () => {
  assert.equal(resolveClientAddress("::ffff:203.0.113.7", undefined, NO_TRUSTED_PROXIES), "203.0.113.7");
  assert.equal(rateLimitPeerKey(resolveClientAddress("::ffff:203.0.113.7", undefined, NO_TRUSTED_PROXIES)), "203.0.113.7");
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
