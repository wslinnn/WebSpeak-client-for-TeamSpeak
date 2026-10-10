import { computed, reactive, ref, type Ref } from "vue";
import { DEFAULT_TEAM_SPEAK_PORT, splitTeamSpeakTarget } from "../services/teamspeak-target.js";
import type { Language } from "../i18n/web-client.js";

type Translator = (key: string, variables?: Record<string, string | number>) => string;

interface UseWebClientPublicConfigOptions {
  serverHost: Ref<string>;
  serverPort: Ref<string>;
  language: Ref<Language>;
  t: Translator;
}

export function useWebClientPublicConfig({
  serverHost,
  serverPort,
  language,
  t,
}: UseWebClientPublicConfigOptions) {
  const accessMode = ref<"fixed" | "open">("fixed");
  const initialized = ref(false);
  const siteName = ref("WebSpeak");
  const appVersion = ref("0.2.6");
  const openTargetPrefillBlocked = ref(false);
  const serverConfigLoading = ref(true);
  /** Distinguishes "gateway unreachable" from "genuinely not configured" — the two states used to share one misleading UI. */
  const publicConfigFailed = ref(false);
  const welcomeTexts = reactive<Record<Language, string>>({ zh: "", en: "", de: "", ru: "", ja: "" });
  const localizedWelcomeText = computed(() => welcomeTexts[language.value] || t("joinDescription"));

  async function loadPublicConfig(): Promise<void> {
    const query = new URLSearchParams(location.search);
    publicConfigFailed.value = false;
    try {
      const response = await fetch("/api/public-config", { headers: { accept: "application/json" } });
      if (!response.ok) {
        publicConfigFailed.value = true;
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
      if (typeof config.version === "string" && config.version.trim()) appVersion.value = config.version.trim();
      initialized.value = config.initialized === true;
      if (typeof config.siteName === "string" && config.siteName.trim()) siteName.value = config.siteName.trim();
      if (typeof config.welcomeText === "string") welcomeTexts.zh = config.welcomeText;
      if (typeof config.welcomeTextEn === "string") welcomeTexts.en = config.welcomeTextEn;
      if (config.welcomeTexts && typeof config.welcomeTexts === "object" && !Array.isArray(config.welcomeTexts)) {
        const configuredTexts = config.welcomeTexts as Record<string, unknown>;
        for (const languageCode of ["zh", "en", "de", "ru", "ja"] as const) {
          const text = configuredTexts[languageCode];
          if (typeof text === "string") welcomeTexts[languageCode] = text;
        }
      }
      accessMode.value = config.accessMode === "open" ? "open" : "fixed";
      const hasInviteTarget = query.has("server") || query.has("target") || query.has("tsHost") || query.has("tsPort");
      openTargetPrefillBlocked.value = !hasInviteTarget && accessMode.value === "open" && config.targetPrefillBlocked === true;
      if (openTargetPrefillBlocked.value) {
        serverHost.value = "";
        serverPort.value = DEFAULT_TEAM_SPEAK_PORT;
      } else if (!hasInviteTarget && typeof config.target === "string" && config.target.trim()) {
        const target = splitTeamSpeakTarget(config.target);
        serverHost.value = target.address;
        serverPort.value = target.port;
      }
    } catch {
      // Gateway unreachable (restart, network blip): flag it so the page can
      // offer a retry instead of showing the misleading "not configured" hint.
      publicConfigFailed.value = true;
    } finally {
      serverConfigLoading.value = false;
    }
  }

  function reloadPublicConfig(): void {
    serverConfigLoading.value = true;
    void loadPublicConfig();
  }

  return {
    accessMode,
    initialized,
    siteName,
    appVersion,
    openTargetPrefillBlocked,
    serverConfigLoading,
    publicConfigFailed,
    localizedWelcomeText,
    loadPublicConfig,
    reloadPublicConfig,
  };
}
