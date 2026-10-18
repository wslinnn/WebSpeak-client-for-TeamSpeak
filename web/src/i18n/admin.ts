import { enCopy } from "./admin/en";
import { zhCopy } from "./admin/zh";

export const copy = {
  zh: zhCopy,
  en: enCopy,
} as const;

export type AdminTranslationKey = keyof typeof zhCopy;
