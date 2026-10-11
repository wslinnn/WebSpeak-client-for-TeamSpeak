export type Language = "zh" | "en" | "de" | "ru" | "ja";

import { de } from "./web-client/de.js";
import { en } from "./web-client/en.js";
import { ja } from "./web-client/ja.js";
import { ru } from "./web-client/ru.js";
import { zh } from "./web-client/zh.js";

export const webClientTranslations: Record<string, Record<string, string>> = {
  zh,
  en,
  de,
  ru,
  ja,
};

export function getInitialLanguage(): Language {
  const stored = localStorage.getItem("webspeak:language");
  if (stored === "zh" || stored === "en" || stored === "de" || stored === "ru" || stored === "ja") return stored;
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) return "zh";
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("de")) return "de";
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru")) return "ru";
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ja")) return "ja";
  return "en";
}
