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
