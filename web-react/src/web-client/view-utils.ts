import type { ChannelMember, ChatMessage } from "@shared/voice-models";
import type { Language } from "@/i18n/web-client";

/** 进房视图层的共享小工具（旧 WebClient.vue 平价）。 */

/** 滑杆填充背景（KAAK 风格双色轨道）。 */
export function rangeStyle(value: number, max: number): Record<string, string> {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return {
    background: `linear-gradient(to right, var(--wsd-accent-fill) 0%, var(--wsd-accent-fill) ${percent}%, var(--wsd-border) ${percent}%, var(--wsd-border) 100%)`,
  };
}

export function formatTime(timestamp: number, language: Language): string {
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "ru" ? "ru-RU" : language === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

/** 消息头像：按发送者 uid 优先匹配成员头像。 */
export function resolveMessageAvatar(message: ChatMessage, members: ChannelMember[]): string {
  const member = members.find((candidate) =>
    (typeof message.senderId === "number" && candidate.id === message.senderId)
    || (Boolean(message.senderUid) && candidate.uid === message.senderUid),
  );
  return member?.avatar ?? "";
}

/** 当前频道正在说话的成员名（移动端聊天页签的说话横条）。 */
export function speakingNowNames(members: ChannelMember[], speakingIds: ReadonlySet<number>): string[] {
  return members.filter((member) => speakingIds.has(member.id)).map((member) => member.nickname);
}
