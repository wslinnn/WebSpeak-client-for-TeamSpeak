import assert from "node:assert/strict";
import test from "node:test";
import { isRestrictedAddress, isSafeOpenTargetForPrefill } from "./open-target-policy.js";

test("open-mode target prefill follows the same allow/deny result as the join policy", async () => {
  assert.equal(await isSafeOpenTargetForPrefill({ host: "198.51.100.24", port: 9987 }, {
    resolveTarget: async (target) => target,
  }), true);
  assert.equal(await isSafeOpenTargetForPrefill({ host: "teamspeak", port: 9987 }, {
    resolveTarget: async () => { throw new Error("private or unresolved target"); },
  }), false);
});

test("open-mode target prefill fails closed when DNS validation stalls", async () => {
  const result = await isSafeOpenTargetForPrefill({ host: "internal.example", port: 9987 }, {
    timeoutMs: 10,
    resolveTarget: async () => new Promise(() => undefined),
  });
  assert.equal(result, false);
});

test("NAT64 translated addresses are rejected as restricted targets", () => {
  // 64:ff9b::/96 well-known prefix translates back into IPv4 space, so it can
  // reach intranet hosts just like a mapped literal.
  assert.equal(isRestrictedAddress("64:ff9b::192.0.2.1"), true);
  assert.equal(isRestrictedAddress("64:ff9b::c000:201"), true);
});

test("IPv6 transition and special-purpose ranges are restricted targets", () => {
  // 6to4 2002::/16 把 IPv4 嵌在第 16-47 位；Teredo 2001::/32 嵌服务器/客户端
  // IPv4；100::/64 是 discard-only。三者都继承 IPv4 段的判定。
  assert.equal(isRestrictedAddress("2002:7f00:1::"), true, "6to4 embedding 127.0.0.1");
  assert.equal(isRestrictedAddress("2002:c0a8:101::1"), true, "6to4 embedding 192.168.1.1");
  assert.equal(isRestrictedAddress("2002:808:808::"), true, "6to4 is refused even with a public IPv4 inside");
  assert.equal(isRestrictedAddress("2001::1"), true, "Teredo compressed form");
  assert.equal(isRestrictedAddress("2001:0:db8:1::1"), true, "Teredo expanded form");
  assert.equal(isRestrictedAddress("100::1"), true, "discard-only range");
  // 正常公网与文档段之外的全球单播不受影响。
  assert.equal(isRestrictedAddress("2001:4860:4860::8888"), false, "Google DNS stays allowed");
  assert.equal(isRestrictedAddress("2606:4700:4700::1111"), false, "Cloudflare DNS stays allowed");
  assert.equal(isRestrictedAddress("2001:db8::1"), true, "documentation range");
});
