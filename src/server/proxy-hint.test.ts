import assert from "node:assert/strict";
import test from "node:test";
import { createProxyHint, firstForwardedAddress, isLoopbackAddress } from "./proxy-hint.js";

test("loopback detection covers v4, v6, mapped and scoped forms", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("[::1]"), true);
  assert.equal(isLoopbackAddress("::1%0"), true);
  assert.equal(isLoopbackAddress("192.168.1.10"), false);
  assert.equal(isLoopbackAddress("::2"), false);
  assert.equal(isLoopbackAddress(undefined), false);
  assert.equal(isLoopbackAddress(""), false);
});

test("first forwarded address must be a bare IP", () => {
  assert.equal(firstForwardedAddress("203.0.113.7, 10.0.0.1"), "203.0.113.7");
  assert.equal(firstForwardedAddress(["203.0.113.7, 10.0.0.1"]), "203.0.113.7");
  assert.equal(firstForwardedAddress("not-an-ip"), null);
  assert.equal(firstForwardedAddress(undefined), null);
  assert.equal(firstForwardedAddress(""), null);
});

test("the hint fires once for loopback peers with forwarded headers", () => {
  const messages: string[] = [];
  const hint = createProxyHint((message) => messages.push(message));
  hint("127.0.0.1", "203.0.113.7, 10.0.0.1");
  hint("127.0.0.1", "198.51.100.9");
  hint("192.168.1.10", "203.0.113.7");
  hint("127.0.0.1", undefined);
  hint("127.0.0.1", "garbage");
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /WEBSPEAK_TRUST_PROXY=1/);
});
