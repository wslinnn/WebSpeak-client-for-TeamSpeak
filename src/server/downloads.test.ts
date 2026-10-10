import assert from "node:assert/strict";
import test from "node:test";
import { createAndroidReleaseLookup, parseRelease } from "./downloads.js";

const releasePayload = {
  tag_name: "v1.4.2",
  assets: [
    { name: "sources.zip", browser_download_url: "https://example.com/sources.zip", size: 1024 },
    {
      name: "TS6Droid-1.4.2.apk",
      browser_download_url: "https://github.com/x/y/releases/download/v1.4.2/TS6Droid-1.4.2.apk",
      size: 18_432,
      digest: "sha256:" + "ab".repeat(32),
    },
  ],
};

test("parseRelease picks the APK asset with version, size and sha256", () => {
  const info = parseRelease(releasePayload);
  assert.equal(info?.version, "v1.4.2");
  assert.equal(info?.apkName, "TS6Droid-1.4.2.apk");
  assert.equal(info?.apkSizeBytes, 18_432);
  assert.equal(info?.apkSha256, "ab".repeat(32));
});

test("parseRelease tolerates a missing digest and rejects unusable payloads", () => {
  const noDigest = parseRelease({ tag_name: "v1", assets: [{ name: "a.apk", browser_download_url: "https://x/a.apk" }] });
  assert.equal(noDigest?.apkSha256, "");
  assert.equal(parseRelease(null), null);
  assert.equal(parseRelease({ tag_name: "" }), null);
  assert.equal(parseRelease({ tag_name: "v1", assets: [{ name: "readme.txt", browser_download_url: "https://x/r.txt" }] }), null);
  assert.equal(parseRelease({ tag_name: "v1", assets: [{ name: "evil.apk", browser_download_url: "http://insecure/evil.apk" }] }), null);
});

test("the lookup caches successes and retries failures sooner", async () => {
  let calls = 0;
  const responses: unknown[] = [releasePayload, new Error("rate limited")];
  const lookup = createAndroidReleaseLookup({
    cacheTtlMs: 2,
    failureTtlMs: 2,
    fetchJson: async () => {
      const current = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      if (current instanceof Error) throw current;
      return current;
    },
  });
  assert.equal((await lookup())?.version, "v1.4.2");
  assert.equal((await lookup())?.version, "v1.4.2", "second call inside the TTL serves the cache");
  assert.equal(calls, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await lookup(), null, "a failed lookup reports unavailable");
  assert.equal(await lookup(), null, "the failure is cached for its short TTL too");
  assert.equal(calls, 2);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await lookup(), null, "once the failure TTL passes the fetch runs again (and still fails)");
  assert.equal(calls, 3);
});
