// declareStereoOpusOffer 纯函数契约：只改 Opus 行、幂等、非 Opus 原样。
import assert from "node:assert/strict";
import { test } from "vitest";

import { declareStereoOpusOffer } from "./screen-share-sdp";

const STEREO = "stereo=1;maxaveragebitrate=510000";

test("appends the stereo capability to Opus fmtp lines only", () => {
  const sdp = [
    "v=0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "m=video 9 UDP/TLS/RTP/SAVPF 96",
    "a=rtpmap:96 VP8/90000",
    "a=fmtp:96 apt=111",
    "",
  ].join("\r\n");
  const out = declareStereoOpusOffer(sdp);
  assert.ok(out.includes(`a=fmtp:111 minptime=10;useinbandfec=1;${STEREO}`), "the opus line gains the share capability");
  assert.ok(out.includes("a=fmtp:96 apt=111\r\n"), "the rtx/other codec line is untouched");
  assert.equal(out.replace(`a=fmtp:111 minptime=10;useinbandfec=1;${STEREO}`, "").includes(STEREO), false, "no other line gains the capability");
});

test("a fmtp without an opus rtpmap stays untouched", () => {
  const sdp = "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fmtp:111 minptime=10\r\n";
  assert.equal(declareStereoOpusOffer(sdp), sdp);
});

test("an already-stereo declaration stays byte-identical", () => {
  const sdp = "a=fmtp:111 stereo=1;maxaveragebitrate=510000\r\n";
  assert.equal(declareStereoOpusOffer(sdp), sdp);
});

test("input without an opus fmtp passes through", () => {
  assert.equal(declareStereoOpusOffer("offer"), "offer");
  assert.equal(declareStereoOpusOffer(""), "");
  assert.equal(declareStereoOpusOffer("a=fmtp:96 apt=111"), "a=fmtp:96 apt=111");
});
