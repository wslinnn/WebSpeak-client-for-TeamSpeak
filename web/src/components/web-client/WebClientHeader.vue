<template>
  <header
    class="join-header"
    data-ws-part="home.header"
  >
    <div
      class="brand-lockup"
      data-ws-part="home.brand"
    >
      <img
        class="brand-mark"
        src="/favicon.jpg"
        alt="WebSpeak"
      />
      <div>
        <strong :title="brandName">{{ brandName }}</strong>
        <small>{{ t("browserWorkspace") }}</small>
      </div>
    </div>
    <div
      class="header-tools"
      data-ws-part="home.header-tools"
    >
      <div
        class="header-note"
        data-ws-part="home.gateway-status"
        ><span class="tiny-dot"></span> {{ t("secureGateway") }}</div
      >
      <div
        :class="['header-links', { open: moreOpen }]"
      >
        <a
          class="guide-button"
          href="/download"
          data-ws-part="home.download-button"
          :title="t('downloadPage')"
          :aria-label="t('downloadPage')"
        >
          <Icon
            name="download"
            :size="15"
          /><span>{{ t("downloadPage") }}</span>
        </a>
        <a
          class="guide-button"
          href="/admin"
          :title="t('adminConsole')"
          :aria-label="t('adminConsole')"
        >
          <Icon
            name="settings"
            :size="15"
          /><span>{{ t("adminConsole") }}</span>
        </a>
      </div>
      <SkinSwitcher
        v-model="skinId"
        class="join-skin-switcher"
        :menu-label="t('skinSelector')"
        :options="skinOptions"
        @change="emit('skinChange', $event)"
      />
      <LanguageSwitcher
        v-model="language"
        class="join-language-switcher"
        :menu-label="t('languageMenu')"
        @change="emit('languageChange')"
      />
    </div>
    <button
      type="button"
      class="header-more"
      data-ws-part="home.header-more"
      :aria-expanded="moreOpen"
      :aria-label="t('mobileMore')"
      @click="moreOpen = !moreOpen"
    >
      <Icon
        name="more"
        :size="17"
      />
    </button>
    <button
      v-if="moreOpen"
      type="button"
      class="header-tools-backdrop"
      aria-hidden="true"
      tabindex="-1"
      @click="moreOpen = false"
    ></button>
  </header>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Icon from "../Icon.vue";
import SkinSwitcher, { type SkinOption } from "../SkinSwitcher.vue";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import type { Language } from "../../i18n/web-client.js";

defineProps<{
  brandName: string;
  skinOptions: SkinOption[];
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();
const language = defineModel<Language>("language", { required: true });
const skinId = defineModel<string>("skinId", { required: true });
const emit = defineEmits<{
  skinChange: [value: string];
  languageChange: [];
}>();
const moreOpen = ref(false);
</script>

<style scoped>
.brand-lockup { min-width: 0; max-width: 100%; }
.brand-lockup > div { min-width: 0; }
.brand-mark { flex: 0 0 auto; }
.brand-lockup strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-note .tiny-dot { display: inline-block; flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--wsd-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--wsd-accent) 14%, transparent); }
</style>
