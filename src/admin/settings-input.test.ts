import assert from "node:assert/strict";
import test from "node:test";
import { readSettingsInput } from "./admin-router.js";

const valid = {
  target: "8.8.8.8#9988", accessMode: "open", siteName: "WebSpeak", welcomeText: "",
  webRtcEnabled: true,
};

test("the settings input narrows the untyped body to the declared contract", () => {
  const input = readSettingsInput({ ...valid, webRtcPublicHost: "voice.example.com", webRtcIpv6Enabled: false });
  assert.equal(input.webRtcEnabled, true);
  assert.equal(input.webRtcPublicHost, "voice.example.com");
  assert.equal(input.webRtcIpv6Enabled, false);
  assert.equal(input.accessMode, "open");
});

test("a missing or non-boolean WebRTC switch is refused instead of silently disabled", () => {
  // 以前 `body.webRtcEnabled === true` 会把 "true"/缺省静默变成 false——语音会
  // 悄悄退到兼容传输而没有任何提示。现在按声明类型拒绝，错误码与 AdminService
  // 一致。
  for (const value of [undefined, "true", 1, null]) {
    assert.throws(
      () => readSettingsInput({ ...valid, webRtcEnabled: value }),
      (error: unknown) => (error as { code?: string }).code === "INVALID_WEBRTC_ENABLED",
      `webRtcEnabled=${String(value)}`,
    );
  }
});

test("other typed fields keep their own rejection codes", () => {
  assert.throws(() => readSettingsInput({ ...valid, accessMode: "weird" }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_ACCESS_MODE");
  assert.throws(() => readSettingsInput({ ...valid, webRtcPublicHost: 5 }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_WEBRTC_PUBLIC_HOST");
  assert.throws(() => readSettingsInput({ ...valid, webRtcIpv6Enabled: "yes" }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_WEBRTC_IPV6");
  assert.throws(() => readSettingsInput({ ...valid, webRtcStunServer: {} }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_WEBRTC_STUN_SERVER");
});
