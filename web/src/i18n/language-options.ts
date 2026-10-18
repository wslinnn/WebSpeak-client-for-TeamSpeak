import type { Language } from "./web-client";

/** 语言切换器的共享选项（flag/code/label）。独立于组件文件：语言切换器组件
 *  保持 only-export-components（react-refresh），此处也无 react 依赖。 */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: Language; code: string; label: string; flag: string }> = [
  { value: "zh", code: "ZH", label: "中文", flag: "🇨🇳" },
  { value: "en", code: "EN", label: "English", flag: "🇬🇧" },
];
