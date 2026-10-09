<template>
  <form
    class="join-form"
    data-ws-part="home.form"
    @submit.prevent="emit('connect')"
  >
    <div
      v-if="accessMode === 'open'"
      class="field-grid target-fields"
      data-ws-part="home.server-target"
    >
      <label
        class="field-label"
        data-ws-part="home.field-label"
        for="server-address"
        ><span>{{ t("serverAddress") }}</span
        ><div
          class="field-wrap"
          data-ws-part="home.field"
          ><Icon
            name="server"
            :size="17" /><input
            id="server-address"
            v-model="serverHost"
            autocomplete="url"
            inputmode="url"
            autocapitalize="none"
            autocorrect="off"
            :spellcheck="false"
            enterkeyhint="next"
            :placeholder="t('serverAddressPlaceholder')" /></div
      ></label>
      <label
        class="field-label"
        data-ws-part="home.field-label"
        for="server-port"
        ><span>{{ t("serverPort") }}</span
        ><div
          class="field-wrap"
          data-ws-part="home.field"
          ><Icon
            name="hash"
            :size="17" /><input
            id="server-port"
            v-model="serverPort"
            inputmode="numeric"
            enterkeyhint="next"
            type="text"
            maxlength="5"
            :placeholder="t('serverPortPlaceholder')" /></div
      ></label>
    </div>
    <div
      v-if="openTargetPrefillBlocked"
      class="notice warning-notice"
      data-ws-part="home.notice"
      data-ws-state="target-prefill-blocked"
      ><span class="notice-symbol">i</span
      ><span>{{ t("openTargetDefaultNotPrefilled") }}</span></div
    >
    <div
      v-if="accessMode === 'open' && (favoriteServers.length || recentServers.length)"
      class="local-servers"
      data-ws-part="home.server-history"
    >
      <div
        v-if="favoriteServers.length"
        class="local-server-group"
        data-ws-part="home.server-history.group"
        data-ws-state="favorite"
        ><span>{{ t("favoriteServers") }}</span
        ><button
          v-for="favorite in favoriteServers"
          :key="favorite.id"
          type="button"
          @click="emit('selectServer', favorite.address, favorite.nickname)"
          >{{ favorite.label }}</button
        ></div
      >
      <div
        v-if="recentServers.length"
        class="local-server-group"
        data-ws-part="home.server-history.group"
        data-ws-state="recent"
        ><span>{{ t("recentServers") }}</span
        ><button
          v-for="recent in recentServers"
          :key="recent.id"
          type="button"
          @click="emit('selectServer', recent.address, recent.nickname)"
          >{{ recent.address }}</button
        ></div
      >
    </div>
    <button
      v-if="accessMode === 'open' && serverHost.trim()"
      type="button"
      class="favorite-toggle"
      data-ws-part="home.favorite-toggle"
      @click="emit('toggleFavorite')"
      >{{ isFavorite ? t("removeFavorite") : t("saveFavorite") }}</button
    >

    <label
      class="field-label"
      data-ws-part="home.field-label"
      for="server-password"
      >{{ t("serverPassword") }} <span>{{ t("optional") }}</span></label
    >
    <div
      class="field-wrap"
      data-ws-part="home.field"
      ><Icon
        name="lock"
        :size="17" /><input
        id="server-password"
        v-model="serverPassword"
        type="password"
        autocomplete="new-password"
        :placeholder="t('optionalPassword')"
    /></div>

    <div
      class="device-setup"
      data-ws-part="home.device-setup"
    >
      <button
        type="button"
        class="identity-action-button"
        data-ws-part="home.device-setup.open"
        @click="emit('openDeviceSettings')"
        ><Icon
          name="mic"
          :size="15"
        />{{ t("joinDeviceSetupAction") }}</button
      >
      <p
        v-if="!outputPickerSupported"
        class="device-setup-hint"
        >{{ t("outputUnsupportedHint") }}</p
      >
    </div>

    <label
      class="field-label"
      data-ws-part="home.field-label"
      for="nickname"
      >{{ t("nickname") }}</label
    >
    <div
      class="field-wrap"
      data-ws-part="home.field"
    >
      <Icon
        name="users"
        :size="17"
      />
      <input
        id="nickname"
        v-model="nickname"
        autocomplete="nickname"
        maxlength="30"
        :placeholder="t('nicknamePlaceholder')"
        :autofocus="autofocusNickname"
      />
    </div>

    <div
      class="identity-options"
      data-ws-part="home.identity"
      ><label
        class="field-label"
        data-ws-part="home.field-label"
        for="channel"
        >{{ t("targetChannel") }} <span>{{ t("optional") }}</span></label
      ><div class="field-wrap" data-ws-part="home.field"><Icon name="hash" :size="17" /><input
        id="channel"
        v-model="channel"
        :placeholder="t('emptyDefault')"
      /></div
      ><div class="identity-controls"
        ><label class="remember-identity"
          ><input
            v-model="rememberIdentity"
            type="checkbox"
          /><span
            ><strong>{{ t("rememberIdentity") }}</strong
            ><small>{{ t("rememberIdentityHint") }}</small></span
          ></label
        ><div
          class="identity-actions"
          data-ws-part="home.identity-actions"
          ><button
            type="button"
            class="identity-action-button"
            data-ws-part="home.identity-import.open"
            @click="emit('importIdentity')"
            >{{ t("identityImport") }}</button
          ><button
            type="button"
            class="identity-action-button"
            data-ws-part="home.identity-export.button"
            :disabled="identityExportBusy || !rememberIdentity || !hasIdentity"
            @click="emit('exportIdentity')"
            >{{ t("identityExport") }}</button
          ></div
        ></div
      ></div
    ><p
      v-if="rememberIdentity"
      class="identity-warning"
      >{{ t("rememberIdentityConcurrentWarning") }}</p
    >

    <button
      class="primary-button connect-button"
      data-ws-part="home.connect"
      :disabled="joinDisabled"
      type="submit"
    >
      <span
        v-if="connecting"
        class="button-spinner"
      ></span>
      <span v-if="joinRetrySeconds > 0">{{ t("retryLater", { seconds: joinRetrySeconds }) }}</span>
      <span v-else>{{ connecting ? t("connecting") : t("enterVoice") }}</span>
      <Icon
        v-if="!connecting"
        name="chevron-right"
        :size="17"
      />
    </button>
    <button
      v-if="connecting"
      type="button"
      class="cancel-connect-button"
      @click="emit('disconnect')"
      >{{ t("cancel") }}</button
    >
  </form>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "../Icon.vue";
import type { FavoriteServer, RecentServer } from "../../services/local-persistence.js";

const serverHost = defineModel<string>("serverHost", { required: true });
const serverPort = defineModel<string>("serverPort", { required: true });
const serverPassword = defineModel<string>("serverPassword", { required: true });
const nickname = defineModel<string>("nickname", { required: true });
const channel = defineModel<string>("channel", { required: true });
const rememberIdentity = defineModel<boolean>("rememberIdentity", { required: true });

defineProps<{
  autofocusNickname?: boolean;
  accessMode: "fixed" | "open";
  openTargetPrefillBlocked: boolean;
  favoriteServers: readonly FavoriteServer[];
  recentServers: readonly RecentServer[];
  isFavorite: boolean;
  identityExportBusy: boolean;
  hasIdentity: boolean;
  connecting: boolean;
  joinDisabled: boolean;
  joinRetrySeconds: number;
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();

// iOS Safari has no output-device picker at all; say so before joining instead
// of hiding it inside the room settings dialog.
const outputPickerSupported = computed(() => typeof HTMLMediaElement === "undefined" || "setSinkId" in HTMLMediaElement.prototype);

const emit = defineEmits<{
  connect: [];
  disconnect: [];
  importIdentity: [];
  exportIdentity: [];
  toggleFavorite: [];
  selectServer: [address: string, nickname?: string];
  openDeviceSettings: [];
}>();
</script>
