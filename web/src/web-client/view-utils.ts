import type { ChannelMember, ChatMessage } from "@shared/voice-models";
import type { Language } from "@/i18n/web-client";

/** 进房视图层的共享小工具（旧 WebClient.vue 平价）。 */

function localeOf(language: Language): string {
  return language === "zh" ? "zh-CN" : "en-US";
}

/** 按语言×分档缓存格式化器：Intl 构造昂贵（500 次构造+格式化 ≈35ms，
 *  复用 ≈0.4ms——报告 21 F1），消息列表每次按键重建时这里是热点。格式化器无状态，
 *  跨渲染/跨组件共享安全。 */
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(language: Language, tier: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${language}:${tier}`;
  let formatter = timeFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(localeOf(language), options);
    timeFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

const relativeFormatters = new Map<Language, Intl.RelativeTimeFormat>();

function relativeFormatterFor(language: Language): Intl.RelativeTimeFormat {
  let formatter = relativeFormatters.get(language);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(localeOf(language), { numeric: "auto" });
    relativeFormatters.set(language, formatter);
  }
  return formatter;
}

function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** 消息时间智能分档：今天只显时分；昨天借 Intl.RelativeTimeFormat 出「昨天/yesterday」；
 *  今年「M月d日 HH:mm」；跨年带年份。悬停精度走 formatFullTimestamp。 */
export function formatTime(timestamp: number, language: Language): string {
  const time = formatterFor(language, "time", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
  const day = dayStart(timestamp);
  const today = dayStart(Date.now());
  if (day === today) return time;
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (day === yesterdayDate.getTime()) {
    const raw = relativeFormatterFor(language).format(-1, "day");
    return `${raw.charAt(0).toUpperCase()}${raw.slice(1)} ${time}`;
  }
  const sameYear = new Date(timestamp).getFullYear() === new Date().getFullYear();
  return `${formatterFor(language, sameYear ? "date" : "dateYear", sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" }).format(timestamp)} ${time}`;
}

/** 悬停完整时间戳（本地时区 yyyy-MM-dd HH:mm:ss），不进 Intl。 */
export function formatFullTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
