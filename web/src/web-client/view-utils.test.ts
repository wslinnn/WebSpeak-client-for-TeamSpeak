// @vitest-environment node
// 进房视图层共享小工具的钉子：时钟格式化器按语言缓存复用（报告 21 F1 的量化点：
// 500 次构造+格式化 ≈35ms，复用 ≈0.4ms——聊天列表每次按键重建曾把这里变成热点）。
import { afterEach, expect, test, vi } from "vitest";

import type { ChannelMember, ChatMessage } from "@shared/voice-models";
import type { Language } from "@/i18n/web-client";
import { formatFullTimestamp, formatTime, resolveMessageAvatar } from "./view-utils";

afterEach(() => {
  vi.restoreAllMocks();
});

const LANGUAGES: Array<[Language, string]> = [
  ["zh", "zh-CN"], ["en", "en-US"],
];

/** 相对「运行期今天」造时间戳：分档判定锚定当下，避免固定 UTC 日期跨天漂档。 */
function dayAt(dayOffset: number, hours: number, minutes: number): number {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

test("formatTime shows clock time only for today", () => {
  const timestamp = dayAt(0, 9, 30);
  for (const [language, locale] of LANGUAGES) {
    const expected = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
    expect(formatTime(timestamp, language)).toBe(expected);
  }
});

test("formatTime labels yesterday and in-year dates without the year", () => {
  const yesterday = dayAt(-1, 9, 30);
  expect(formatTime(yesterday, "zh")).toMatch(/^昨天 /);
  expect(formatTime(yesterday, "en")).toMatch(/^Yesterday /);
  const inYear = (() => { const date = new Date(); date.setMonth(4, 18); date.setHours(9, 30, 0, 0); return date.getTime(); })();
  for (const [language, locale] of LANGUAGES) {
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(inYear);
    const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(inYear);
    expect(formatTime(inYear, language)).toBe(`${date} ${time}`);
  }
});

test("formatTime brings the year back once out of the current year", () => {
  const old = (() => { const date = new Date(); date.setFullYear(date.getFullYear() - 1); date.setMonth(0, 8); date.setHours(9, 30, 0, 0); return date.getTime(); })();
  for (const [language, locale] of LANGUAGES) {
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(old);
    const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(old);
    expect(formatTime(old, language)).toBe(`${date} ${time}`);
  }
});

test("formatTime reuses one formatter per language instead of rebuilding per call", () => {
  const spy = vi.spyOn(Intl, "DateTimeFormat");
  const timestamp = dayAt(0, 9, 30);
  formatTime(timestamp, "en");
  const constructionsAfterWarmup = spy.mock.calls.length;
  for (let index = 0; index < 20; index += 1) formatTime(timestamp + index * 1_000, "en");
  expect(spy.mock.calls.length).toBe(constructionsAfterWarmup);

  // 另一语言首次使用才新建一枚；再调用同样不再构造。
  formatTime(timestamp, "zh");
  const constructionsAfterSecondLanguage = spy.mock.calls.length;
  formatTime(timestamp, "zh");
  expect(spy.mock.calls.length).toBe(constructionsAfterSecondLanguage);
});

test("formatFullTimestamp renders local yyyy-MM-dd HH:mm:ss", () => {
  expect(formatFullTimestamp(new Date(2026, 0, 3, 7, 5, 9).getTime())).toBe("2026-01-03 07:05:09");
});

test("resolveMessageAvatar matches by client id then uid and tolerates unlinked senders", () => {
  const members: ChannelMember[] = [
    { id: 7, uid: "uid-a", nickname: "A", avatar: "avatar-a" },
    { id: 9, uid: "uid-b", nickname: "B", avatar: "avatar-b" },
  ];
  const sample = (patch: Partial<ChatMessage>): ChatMessage => ({
    id: "m", scope: "channel", invokerName: "A", message: "hi", timestamp: 1, ...patch,
  });
  expect(resolveMessageAvatar(sample({ senderId: 7 }), members)).toBe("avatar-a");
  expect(resolveMessageAvatar(sample({ senderUid: "uid-b" }), members)).toBe("avatar-b");
  expect(resolveMessageAvatar(sample({ senderId: 404, senderUid: "uid-unknown" }), members)).toBe("");
});
