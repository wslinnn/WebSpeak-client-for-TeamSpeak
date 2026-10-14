import { describe, expect, it } from "vitest";

import { formatApkSize, parseAndroidReleasePayload } from "./android-release";

describe("parseAndroidReleasePayload（校验口径平价旧版）", () => {
  it("完整 release 投影全部字段", () => {
    expect(parseAndroidReleasePayload({
      release: { version: "2.4.1", apkName: "app.apk", apkUrl: "/downloads/app.apk", apkSizeBytes: 2048, apkSha256: "abc" },
    })).toEqual({ version: "2.4.1", apkName: "app.apk", apkUrl: "/downloads/app.apk", apkSizeBytes: 2048, apkSha256: "abc" });
  });

  it("缺 version 或 apkUrl 整条拒绝", () => {
    expect(parseAndroidReleasePayload({ release: { version: "1", apkSizeBytes: 5 } })).toBeNull();
    expect(parseAndroidReleasePayload({ release: { apkUrl: "/a.apk" } })).toBeNull();
    expect(parseAndroidReleasePayload({ release: "not-an-object" })).toBeNull();
    expect(parseAndroidReleasePayload({})).toBeNull();
    expect(parseAndroidReleasePayload("junk")).toBeNull();
    expect(parseAndroidReleasePayload(null)).toBeNull();
  });

  it("可选字段类型不合法时归零/置空，不整条拒绝", () => {
    expect(parseAndroidReleasePayload({
      release: { version: "1", apkUrl: "/a.apk", apkName: 42, apkSizeBytes: "big", apkSha256: true },
    })).toEqual({ version: "1", apkName: "", apkUrl: "/a.apk", apkSizeBytes: 0, apkSha256: "" });
  });
});

describe("formatApkSize", () => {
  it("B/KB/MB 边界（KB 走四舍五入，MB 保留一位小数）", () => {
    expect(formatApkSize(0)).toBe("0 B");
    expect(formatApkSize(1023)).toBe("1023 B");
    expect(formatApkSize(1024)).toBe("1 KB");
    expect(formatApkSize(1536)).toBe("2 KB");
    expect(formatApkSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatApkSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
