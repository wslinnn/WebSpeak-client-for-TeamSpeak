import { deCopy as germanCopy } from "./admin/de";
import { enCopy } from "./admin/en";
import { jaCopy as japaneseCopy } from "./admin/ja";
import { ruCopy as russianCopy } from "./admin/ru";
import { zhCopy } from "./admin/zh";

export const copy = {
  zh: zhCopy,
  en: enCopy,
} as const;

export { germanCopy, japaneseCopy, russianCopy };
export type AdminTranslationKey = keyof typeof zhCopy;
