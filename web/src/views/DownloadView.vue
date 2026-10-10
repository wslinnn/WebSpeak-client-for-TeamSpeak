<template>
  <main
    class="download-page ws-skin-root"
    data-ws-page="download"
  >
    <header
      class="download-header"
      data-ws-part="download.header"
    >
      <div
        class="brand-lockup"
        data-ws-part="download.brand"
      >
        <img
          class="brand-mark"
          src="/favicon.jpg"
          alt="WebSpeak"
        />
        <div>
          <strong>WebSpeak</strong>
          <small>{{ t("browserWorkspace") }}</small>
        </div>
      </div>
      <div class="download-header-tools">
        <LanguageSwitcher
          v-model="language"
          class="download-language-switcher"
          :menu-label="t('languageMenu')"
        />
        <a
          class="download-back"
          href="/"
        ><Icon
          name="server"
          :size="15"
        /><span>{{ t("backToHome") }}</span></a>
      </div>
    </header>

    <section
      class="download-hero"
      data-ws-part="download.hero"
    >
      <h1>{{ t("downloadTitle") }}</h1>
      <p>{{ t("downloadIntro") }}</p>
    </section>

    <div class="download-grid">
      <section
        class="download-card"
        data-ws-part="download.card"
      >
        <div
          class="download-card-head"
          data-ws-part="download.card.head"
        >
          <span class="download-card-icon"><Icon
            name="download"
            :size="20" /></span>
          <h2>{{ t("downloadOfficialTitle") }}</h2>
        </div>
        <p class="download-card-copy">{{ t("downloadOfficialDescription") }}</p>
        <a
          class="download-card-action"
          href="https://teamspeak.com/en/downloads/"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t("downloadOfficialAction") }}<Icon
          name="chevron-right"
          :size="16" /></a>
      </section>

      <section
        class="download-card"
        data-ws-part="download.card"
      >
        <div
          class="download-card-head"
          data-ws-part="download.card.head"
        >
          <span class="download-card-icon"><Icon
            name="download"
            :size="20" /></span>
          <h2>{{ t("downloadAndroidTitle") }}</h2>
        </div>
        <p class="download-card-copy">{{ t("downloadAndroidDescription") }}</p>
        <template v-if="releaseLoading">
          <p class="download-release-meta">{{ t("downloadLoading") }}</p>
        </template>
        <template v-else-if="release">
          <dl class="download-release-meta" data-ws-part="download.card.meta">
            <div><dt>{{ t("downloadVersion") }}</dt><dd>v{{ release.version }}</dd></div>
            <div v-if="release.apkSizeBytes > 0"><dt>{{ t("downloadSize") }}</dt><dd>{{ formattedSize }}</dd></div>
            <div
              v-if="release.apkSha256"
              class="download-sha-row"
            ><dt>{{ t("downloadSha256") }}</dt><dd><code>{{ release.apkSha256 }}</code></dd></div>
          </dl>
          <a
            class="download-card-action"
            :href="release.apkUrl"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t("downloadAndroidAction") }}<Icon
            name="chevron-right"
            :size="16" /></a>
        </template>
        <template v-else>
          <p class="download-release-meta">{{ t("downloadUnavailable") }}</p>
          <a
            class="download-card-action"
            href="https://github.com/wslinnn/TS6_Droid_CN/releases"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t("downloadViewReleases") }}<Icon
            name="chevron-right"
            :size="16" /></a>
        </template>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import { getInitialLanguage, type Language } from "../i18n/web-client.js";
import { useWebClientI18n } from "../composables/useWebClientI18n.js";
import { applyTheme, getStoredTheme } from "../services/theme.js";

interface AndroidRelease {
  version: string;
  apkName: string;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string;
}

const language = ref<Language>(getInitialLanguage());
const { t } = useWebClientI18n(language);
const releaseLoading = ref(true);
const release = ref<AndroidRelease | null>(null);

// The builtin skins scope their variables to .ws-skin-root elements; applying
// the stored theme here gives a directly-opened /download the same palette as
// the home page (custom skins remain a home-page concern).
onMounted(async () => {
  applyTheme(getStoredTheme());
  try {
    const response = await fetch("/api/downloads/android", { headers: { accept: "application/json" } });
    const raw: unknown = await response.json().catch(() => null);
    const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const info = record.release && typeof record.release === "object" ? record.release as Record<string, unknown> : null;
    if (response.ok && info && typeof info.version === "string" && typeof info.apkUrl === "string") {
      release.value = {
        version: info.version,
        apkName: typeof info.apkName === "string" ? info.apkName : "",
        apkUrl: info.apkUrl,
        apkSizeBytes: typeof info.apkSizeBytes === "number" ? info.apkSizeBytes : 0,
        apkSha256: typeof info.apkSha256 === "string" ? info.apkSha256 : "",
      };
    }
  } catch {
    // Falls through to the plain releases link.
  } finally {
    releaseLoading.value = false;
  }
});

const formattedSize = computed(() => {
  const bytes = release.value?.apkSizeBytes ?? 0;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
});
</script>

<style scoped>
.download-page {
  min-height: 100vh;
  padding: clamp(14px, 2vw, 30px) clamp(12px, 3vw, 44px) 44px;
  background: var(--surface-0);
  color: var(--text-primary);
  font-size: 13px;
}

.download-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  max-width: 1060px;
  margin: 0 auto;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
}

.brand-lockup strong {
  display: block;
  font-size: 15px;
}

.brand-lockup small {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
}

.download-header-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-back {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  color: var(--text-primary);
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 12px;
  text-decoration: none;
  transition: background .16s ease;
}

.download-back:hover { background: var(--surface-2); }

.download-language-switcher { max-width: 170px; }

.download-hero {
  max-width: 1060px;
  margin: clamp(26px, 4vw, 54px) auto clamp(18px, 2.6vw, 30px);
}

.download-hero h1 {
  margin: 0 0 8px;
  font-size: clamp(22px, 2.6vw, 30px);
  letter-spacing: -.01em;
}

.download-hero p {
  margin: 0;
  max-width: 560px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.download-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  max-width: 1060px;
  margin: 0 auto;
}

.download-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.download-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.download-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-radius: 10px;
}

.download-card-head h2 {
  margin: 0;
  font-size: 15px;
}

.download-card-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.download-release-meta {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 11px 13px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 11px;
  font-size: 11px;
}

.download-release-meta div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.download-release-meta dt {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.download-release-meta dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.download-release-meta code {
  font-size: 10px;
  color: var(--text-muted);
}

.download-card-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: auto;
  padding: 10px 16px;
  color: #ffffff;
  background: var(--accent);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  transition: filter .16s ease;
}

.download-card-action:hover { filter: brightness(1.08); }

@media (max-width: 640px) {
  .download-header { flex-wrap: wrap; }
  .download-header-tools { width: 100%; justify-content: space-between; }
}
</style>
