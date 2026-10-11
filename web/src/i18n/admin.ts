import { deCopy as germanCopy } from "./admin/de.js";
import { enCopy } from "./admin/en.js";
import { jaCopy as japaneseCopy } from "./admin/ja.js";
import { ruCopy as russianCopy } from "./admin/ru.js";
import { zhCopy } from "./admin/zh.js";

export const copy = {
  zh: zhCopy,
  en: enCopy,
} as const;

export { germanCopy, japaneseCopy, russianCopy };
export type AdminTranslationKey = keyof typeof zhCopy;
