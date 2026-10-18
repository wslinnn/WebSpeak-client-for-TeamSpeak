// @vitest-environment node
// 进房视图层共享小工具的钉子：时钟格式化器按语言缓存复用（报告 21 F1 的量化点：
// 500 次构造+格式化 ≈35ms，复用 ≈0.4ms——聊天列表每次按键重建曾把这里变成热点）。
import { afterEach, expect, test, vi } from "vitest";

import type { ChannelMember, ChatMessage } from "@shared/voice-models";
import type { Language } from "@/i18n/web-client";
import { formatTime, resolveMessageAvatar } from "./view-utils";

afterEach(() => {
  vi.restoreAllMocks();
});

const LANGUAGES: Array<[Language, string]> = [
  ["zh", "zh-CN"], ["en", "en-US"],
];

test("formatTime maps every language to its locale", () => {
  const timestamp = Date.UTC(2026, 9, 15, 9, 30);
  for (const [language, locale] of LANGUAGES) {
    const expected = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
    expect(formatTime(timestamp, language)).toBe(expected);
  }
});

test("formatTime reuses one formatter per language instead of rebuilding per call", () => {
  const spy = vi.spyOn(Intl, "DateTimeFormat");
  const timestamp = Date.UTC(2026, 9, 15, 9, 30);
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
