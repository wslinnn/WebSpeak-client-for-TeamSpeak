import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getInitialLanguage, type Language } from "@/i18n/web-client-language";
import type { WebClientMessages } from "@/i18n/messages";

export interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

// 语言包动态 import 的进程级单例 promise：入口图不含任何语言包数据（~85KB
// 源码只进路由级 chunk）。视图层经 useWebClientMessages 订阅，就绪前渲染 null
// ——窗口与路由 chunk 本身的加载重合，与旧版路由 chunk 内含语言包的首屏空白等价。
let translationsPromise: Promise<typeof import("@/i18n/messages")> | null = null;
export function loadTranslations(): Promise<typeof import("@/i18n/messages")> {
  translationsPromise ??= import("@/i18n/messages");
  return translationsPromise;
}

export function useLanguageState(): I18nContextValue {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  // html lang 随语言同步（旧版根节点 :lang 平价到文档层）。渲染期不得
  // 改外部值（Compiler 禁），走 effect。
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return useMemo<I18nContextValue>(() => ({
    language,
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

/** 语言包消息订阅：模块加载完成前返回 null（调用方渲染 null，不得输出用户可见
 *  文案）。语言切换时模块已就绪，同步重建。 */
export function useWebClientMessages(): WebClientMessages | null {
  const { language } = useI18n();
  const [module, setModule] = useState<typeof import("@/i18n/messages") | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadTranslations().then((loaded) => {
      if (!cancelled) setModule(loaded);
    });
    return () => { cancelled = true; };
  }, []);
  return useMemo(() => module?.createWebClientMessages(language) ?? null, [module, language]);
}
