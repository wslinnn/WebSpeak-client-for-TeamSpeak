// 入口图安全切片：语言类型与初始语言判定不含任何语言包数据。语言包（五语言
// 全量）只允许被路由级 chunk 引用——use-i18n 经动态 import 挂起加载，防止
// ~85KB 源码的五语言包打进首屏 index chunk。
export type Language = "zh" | "en" | "de" | "ru" | "ja";

export function getInitialLanguage(): Language {
  const stored = localStorage.getItem("webspeak:language");
  if (stored === "zh" || stored === "en" || stored === "de" || stored === "ru" || stored === "ja") return stored;
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) return "zh";
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("de")) return "de";
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru")) return "ru";
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ja")) return "ja";
  return "en";
}
