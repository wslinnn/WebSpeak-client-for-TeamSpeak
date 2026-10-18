import { afterEach, describe, expect, it } from "vitest";

import { getInitialLanguage } from "./web-client-language";

/*
 * 首访语言自动检测的优先级锁：存储偏好 > navigator.language 前缀（zh/de/ru/ja）
 * > en 兜底。改判定顺序或前缀匹配范围时在此红。
 */

function withEnvironment(stored: string | null, navigatorLanguage: string): void {
  if (stored === null) localStorage.removeItem("webspeak:language");
  else localStorage.setItem("webspeak:language", stored);
  Object.defineProperty(window.navigator, "language", { value: navigatorLanguage, configurable: true });
}

describe("getInitialLanguage 优先级", () => {
  afterEach(() => {
    localStorage.removeItem("webspeak:language");
    Object.defineProperty(window.navigator, "language", { value: "zh-CN", configurable: true });
  });

  it("存储的合法偏好压过 navigator（用户手动选择后跨刷新稳定）", () => {
    withEnvironment("de", "zh-CN");
    expect(getInitialLanguage()).toBe("de");
  });

  it("存储的非法值视为未存储，落到 navigator 检测", () => {
    withEnvironment("fr", "ja-JP");
    expect(getInitialLanguage()).toBe("ja");
  });

  it("无存储时按 navigator 前缀检测，地区变体归并到主语言", () => {
    withEnvironment(null, "zh-TW");
    expect(getInitialLanguage()).toBe("zh");
    withEnvironment(null, "de-AT");
    expect(getInitialLanguage()).toBe("de");
    withEnvironment(null, "ru-RU");
    expect(getInitialLanguage()).toBe("ru");
  });

  it("不支持的 navigator 语言回落 en", () => {
    withEnvironment(null, "fr-FR");
    expect(getInitialLanguage()).toBe("en");
    withEnvironment(null, "gsw-CH");
    expect(getInitialLanguage()).toBe("en");
  });
});
