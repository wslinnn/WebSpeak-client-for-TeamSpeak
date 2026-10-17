import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVoiceMediaHost, normalizeVoiceStunServer } from "../shared/voice-ice.js";
import { isAcceptableRemoteIceCandidate, resolveVoiceMediaAddresses } from "./webrtc-config.js";

test("media hosts accept DNS and IPv4/IPv6, reject web URLs, ports and injected components", () => {
  for (const [input, expected] of [["", ""], [" MEDIA.example.com ", "media.example.com"], ["192.0.2.1", "192.0.2.1"], ["[2001:db8::1]", "2001:db8::1"], ["::1", "::1"]]) {
    assert.equal(normalizeVoiceMediaHost(input), expected);
  }
  for (const input of [null, 5, "https://media.example.com", "media.example.com:443", "user@media.example.com", "[::1]?x", "[::1]/x", "[::1]:443", "a\r\nb", "-invalid", "x".repeat(254)]) {
    assert.equal(normalizeVoiceMediaHost(input), null, String(input));
  }
});

test("voice STUN accepts supported UDP URLs and rejects TURN credentials and other protocols", () => {
  assert.equal(normalizeVoiceStunServer(" STUN:stun.example.com "), "stun:stun.example.com:3478");
  assert.equal(normalizeVoiceStunServer("stun:[2001:db8::1]:3478"), null);
  assert.equal(normalizeVoiceStunServer(""), "");
  for (const value of [null, [], "turn:example.com", "stuns:example.com", "https://example.com", "stun:user:pass@example.com", "stun:example.com:0", "stun:example.com:65536", "stun:example.com?transport=tcp", "stun:example.com/path"]) {
    assert.equal(normalizeVoiceStunServer(value), null, String(value));
  }
});

test("media DNS produces literal candidates and honors IPv6 without disabling IPv4", async () => {
  const resolve = async (host: string) => {
    assert.equal(host, "media.example.com");
    return [{ address: "2001:db8::1", family: 6 }, { address: "192.0.2.1", family: 4 }, { address: "192.0.2.1", family: 4 }];
  };
  assert.deepEqual(await resolveVoiceMediaAddresses("media.example.com", false, resolve), ["192.0.2.1"]);
  assert.deepEqual(await resolveVoiceMediaAddresses("media.example.com", true, resolve), ["2001:db8::1", "192.0.2.1"]);
  assert.deepEqual(await resolveVoiceMediaAddresses("[2001:db8::1]", false, resolve), []);
  assert.deepEqual(await resolveVoiceMediaAddresses("[2001:db8::1]", true, resolve), ["2001:db8::1"]);
  assert.deepEqual(await resolveVoiceMediaAddresses("192.0.2.1", false, resolve), ["192.0.2.1"]);
  assert.deepEqual(await resolveVoiceMediaAddresses("media.example.com", true, async () => { throw new Error("DNS unavailable"); }), []);
});

// S1（报告 21）：远端候选地址策略——网关绝不向探测原语类地址发起 STUN 检查。
test("remote ICE policy accepts LAN, CGNAT, public unicast and ULA candidates", () => {
  for (const address of ["192.168.1.10", "10.20.30.40", "172.16.0.9", "172.31.255.1", "100.64.0.1", "100.127.255.254", "8.8.8.8", "1.1.1.1"]) {
    assert.equal(isAcceptableRemoteIceCandidate(address, 40000), true, address);
  }
  for (const address of ["fd00::5", "2606:4700:4700::1111"]) {
    assert.equal(isAcceptableRemoteIceCandidate(address, 40000), true, address);
  }
});

test("remote ICE policy rejects loopback, link-local, multicast, reserved, mapped and hostname candidates", () => {
  for (const address of [
    "0.0.0.0", "0.1.2.3", "127.0.0.1", "127.8.8.8",
    "169.254.169.254", "169.254.0.1",
    "192.0.0.5", "192.0.2.9", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.99",
    "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "febf::abcd", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:c0a8:101", "::192.0.2.1",
    "scanner.example.com", "a88b9c5d-4e4c.local",
  ]) {
    assert.equal(isAcceptableRemoteIceCandidate(address, 40000), false, address);
  }
  for (const port of [0, -1, 65536, Number.NaN]) {
    assert.equal(isAcceptableRemoteIceCandidate("8.8.8.8", port), false, String(port));
  }
});
