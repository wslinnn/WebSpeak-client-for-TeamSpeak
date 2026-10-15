import { createStore } from "zustand/vanilla";

import type { Language } from "@/i18n/web-client";
import { DEFAULT_TEAM_SPEAK_PORT, splitTeamSpeakTarget } from "@/services/teamspeak-target";

type Translator = (key: string, variables?: Record<string, string | number>) => string;

export interface PublicConfigStore {
  accessMode: "fixed" | "open";
  initialized: boolean;
  siteName: string;
  appVersion: string;
  serverConfigLoading: boolean;
  /** 区分「网关不可达」与「真的没配置」——两种状态曾共用一个误导性 UI。 */
  publicConfigFailed: boolean;
  openTargetPrefillBlocked: boolean;
  welcomeTexts: Record<Language, string>;
}

interface Options {
  applyPrefill(host: string, port: string): void;
  t: Translator;
}

export function createPublicConfig(options: Options) {
  const store = createStore<PublicConfigStore>(() => ({
    accessMode: "fixed",
    initialized: false,
    siteName: "WebSpeak",
    appVersion: "0.2.6",
    serverConfigLoading: true,
    publicConfigFailed: false,
    openTargetPrefillBlocked: false,
    welcomeTexts: { zh: "", en: "", de: "", ru: "", ja: "" },
  }));

  async function loadPublicConfig(): Promise<void> {
    const query = new URLSearchParams(window.location.search);
    store.setState({ publicConfigFailed: false });
    try {
      const response = await fetch("/api/public-config", { headers: { accept: "application/json" } });
      if (!response.ok) {
        store.setState({ publicConfigFailed: true });
        return;
      }
      const config = await response.json() as {
        version?: unknown;
        initialized?: unknown;
        siteName?: unknown;
        welcomeText?: unknown;
        welcomeTextEn?: unknown;
        welcomeTexts?: unknown;
        accessMode?: unknown;
        target?: unknown;
        targetPrefillBlocked?: unknown;
      };
      const patch: Partial<PublicConfigStore> = {};
      if (typeof config.version === "string" && config.version.trim()) patch.appVersion = config.version.trim();
      patch.initialized = config.initialized === true;
      if (typeof config.siteName === "string" && config.siteName.trim()) patch.siteName = config.siteName.trim();
      const welcomeTexts = { ...store.getState().welcomeTexts };
      if (typeof config.welcomeText === "string") welcomeTexts.zh = config.welcomeText;
      if (typeof config.welcomeTextEn === "string") welcomeTexts.en = config.welcomeTextEn;
      if (config.welcomeTexts && typeof config.welcomeTexts === "object" && !Array.isArray(config.welcomeTexts)) {
        const configuredTexts = config.welcomeTexts as Record<string, unknown>;
        for (const languageCode of ["zh", "en", "de", "ru", "ja"] as const) {
          const text = configuredTexts[languageCode];
          if (typeof text === "string") welcomeTexts[languageCode] = text;
        }
      }
      patch.welcomeTexts = welcomeTexts;
      patch.accessMode = config.accessMode === "open" ? "open" : "fixed";
      const hasExplicitTarget = query.has("server") || query.has("target") || query.has("tsHost") || query.has("tsPort");
      patch.openTargetPrefillBlocked = !hasExplicitTarget && patch.accessMode === "open" && config.targetPrefillBlocked === true;
      store.setState(patch);
      if (patch.openTargetPrefillBlocked) {
        options.applyPrefill("", DEFAULT_TEAM_SPEAK_PORT);
      } else if (!hasExplicitTarget && typeof config.target === "string" && config.target.trim()) {
        const target = splitTeamSpeakTarget(config.target);
        options.applyPrefill(target.address, target.port);
      }
    } catch {
      // 网关不可达（重启、网络抖动）：置标志让页面提供重试，而不是误导性的「未配置」提示。
      store.setState({ publicConfigFailed: true });
    } finally {
      store.setState({ serverConfigLoading: false });
    }
  }

  function reloadPublicConfig(): void {
    store.setState({ serverConfigLoading: true });
    void loadPublicConfig();
  }

  return { store, loadPublicConfig, reloadPublicConfig };
}

export type PublicConfig = ReturnType<typeof createPublicConfig>;
