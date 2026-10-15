import type { SkinHomeCopy } from "@/services/skin-pack";
import type { InstalledSkin } from "@/services/skin-pack";
import type { Language } from "@/i18n/web-client";

/** 皮肤包首页文案与消息覆盖解析（旧 WebClient.vue 内联函数平移）：候选语言按
 *  包内 defaultLocale → 界面语言 → 全量 locale 合并，后到者覆盖先到者。 */
function skinContentCandidates(locale: Language): string[] {
  const fullLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : locale === "de" ? "de-DE" : locale === "ru" ? "ru-RU" : "ja-JP";
  return [locale, fullLocale];
}

export function resolveSkinHomeCopy(skin: InstalledSkin | null, locale: Language): SkinHomeCopy {
  const content = skin?.contentData;
  if (!content) return {};
  const result: SkinHomeCopy = {};
  for (const candidate of [content.defaultLocale, ...skinContentCandidates(locale)]) {
    Object.assign(result, content.locales[candidate]?.home ?? {});
  }
  return result;
}

export function resolveSkinMessages(skin: InstalledSkin | null, locale: Language): Record<string, string> {
  const content = skin?.contentData;
  if (!content) return {};
  const result: Record<string, string> = {};
  for (const candidate of [content.defaultLocale, ...skinContentCandidates(locale)]) {
    Object.assign(result, content.locales[candidate]?.messages ?? {});
  }
  return result;
}
