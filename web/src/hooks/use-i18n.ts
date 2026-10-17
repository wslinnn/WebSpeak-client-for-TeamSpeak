import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getInitialLanguage, type Language } from "@/i18n/web-client-language";
import type { WebClientMessages } from "@/i18n/messages";

export interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

// F9（报告 21）：语言包按语言各自成 chunk（首屏只拉当前语言一份，五语言聚合
// 曾让 messages chunk 背着全部 85KB 源码）。入口图不含任何语言包数据——工厂
// 模块（messages.ts，仅翻译逻辑）也走动态 import。进程级缓存：同语言只加载一次。
const packLoaders: Record<Language, () => Promise<Record<string, string>>> = {
  zh: () => import("@/i18n/web-client/zh").then((module) => module.zh),
  en: () => import("@/i18n/web-client/en").then((module) => module.en),
  de: () => import("@/i18n/web-client/de").then((module) => module.de),
  ru: () => import("@/i18n/web-client/ru").then((module) => module.ru),
  ja: () => import("@/i18n/web-client/ja").then((module) => module.ja),
};

interface LoadedMessages {
  language: Language;
  messages: WebClientMessages;
}

const messagePromises = new Map<Language, Promise<LoadedMessages>>();

export function loadWebClientMessages(language: Language): Promise<LoadedMessages> {
  let promise = messagePromises.get(language);
  if (!promise) {
    promise = Promise.all([packLoaders[language](), import("@/i18n/messages")])
      .then(([pack, factory]) => ({ language, messages: factory.createWebClientMessages(language, pack) }));
    messagePromises.set(language, promise);
  }
  return promise;
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

/** 语言包消息订阅：当前语言加载完成前返回 null（调用方渲染 null，不得输出用户
 *  可见文案）。切换语言时保留上一语言的文案直到新包就绪——切换只换一次内容，
 *  不闪键名。 */
export function useWebClientMessages(): WebClientMessages | null {
  const { language } = useI18n();
  const [loaded, setLoaded] = useState<LoadedMessages | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadWebClientMessages(language).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => { cancelled = true; };
  }, [language]);
  return useMemo(() => loaded?.messages ?? null, [loaded]);
}
