// 重语言包聚合：本模块只允许出现在路由级 chunk（web-client/download），
// 入口图一律引 @/i18n/web-client-language（见该文件头注释）。
import { de } from "./web-client/de";
import { en } from "./web-client/en";
import { ja } from "./web-client/ja";
import { ru } from "./web-client/ru";
import { zh } from "./web-client/zh";

export type { Language } from "./web-client-language";

export const webClientTranslations: Record<string, Record<string, string>> = {
  zh,
  en,
  de,
  ru,
  ja,
};

