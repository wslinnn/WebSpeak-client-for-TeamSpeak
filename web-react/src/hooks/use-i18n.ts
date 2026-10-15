import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createWebClientMessages } from "@/i18n/messages";
import { getInitialLanguage, type Language } from "@/i18n/web-client";

export interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  messages: ReturnType<typeof createWebClientMessages>;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useLanguageState(): I18nContextValue {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  // html lang 随语言同步（旧版根节点 :lang 平价到文档层）。渲染期不得
  // 改外部值（Compiler 禁），走 effect。
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return useMemo<I18nContextValue>(() => ({
    language,
    messages: createWebClientMessages(language),
    setLanguage: (next) => {
      // SPEC §15 存储契约：webspeak:language 持久化（旧版仅 WebClient/AdminView 写、
      // Download 页切换不持久化——怪癖不随迁，见 SPEC §19-1）。
      try {
        localStorage.setItem("webspeak:language", next);
      } catch {
        // 隐私模式下持久化失败不阻断切换，会话内仍生效。
      }
      setLanguage(next);
    },
  }), [language]);
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return value;
}
