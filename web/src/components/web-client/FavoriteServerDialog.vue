<template>
  <div
    class="modal-backdrop favorite-server-backdrop"
    @click.self="emit('close')"
    tabindex="-1"
  >
    <section
      ref="dialog"
      class="favorite-server-dialog"
      data-ws-part="favorite-server.dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="favorite-server-title"
      tabindex="-1"
      @keydown="onDialogKeydown"
    >
      <header
        class="favorite-server-header"
        data-ws-part="favorite-server.header"
      >
        <h2 id="favorite-server-title">{{ t("addFavoriteServer") }}</h2>
        <button
          type="button"
          class="dialog-close"
          data-ws-part="favorite-server.close"
          :aria-label="t('close')"
          @click="emit('close')"
        ><Icon
            name="close"
            :size="18"
        /></button>
      </header>
      <form
        class="favorite-server-form"
        @submit.prevent="submit"
      >
        <label
          class="field-label"
          data-ws-part="favorite-server.field-label"
          for="favorite-label"
        ><span>{{ t("favoriteDisplayName") }}</span>
          <div
            class="field-wrap"
            data-ws-part="favorite-server.field"
          ><input
            id="favorite-label"
            v-model="label"
            autofocus
            maxlength="60"
            :placeholder="t('favoriteDisplayNamePlaceholder')"
          /></div>
        </label>
        <label
          class="field-label"
          data-ws-part="favorite-server.field-label"
          for="favorite-address"
        ><span>{{ t("serverAddress") }}</span>
          <div
            class="field-wrap"
            data-ws-part="favorite-server.field"
          ><Icon
            name="server"
            :size="16" /><input
            id="favorite-address"
            v-model="address"
            autocomplete="url"
            inputmode="url"
            autocapitalize="none"
            autocorrect="off"
            :spellcheck="false"
            required
          /></div>
        </label>
        <div class="favorite-server-columns">
          <label
            class="field-label"
            data-ws-part="favorite-server.field-label"
            for="favorite-port"
          ><span>{{ t("serverPort") }}</span>
            <div
              class="field-wrap"
              data-ws-part="favorite-server.field"
            ><Icon
              name="hash"
              :size="16" /><input
              id="favorite-port"
              v-model="port"
              inputmode="numeric"
              type="text"
              maxlength="5"
              required
            /></div>
          </label>
          <label
            class="field-label"
            data-ws-part="favorite-server.field-label"
            for="favorite-nickname"
          ><span>{{ t("nickname") }} <span>{{ t("optional") }}</span></span>
            <div
              class="field-wrap"
              data-ws-part="favorite-server.field"
            ><Icon
              name="users"
              :size="16" /><input
              id="favorite-nickname"
              v-model="nickname"
              maxlength="30"
              autocomplete="nickname"
            /></div>
          </label>
        </div>
        <label
          class="field-label"
          data-ws-part="favorite-server.field-label"
          for="favorite-channel"
        ><span>{{ t("targetChannel") }} <span>{{ t("optional") }}</span></span>
          <div
            class="field-wrap"
            data-ws-part="favorite-server.field"
          ><Icon
            name="hash"
            :size="16" /><input
            id="favorite-channel"
            v-model="channel"
            :placeholder="t('emptyDefault')"
          /></div>
        </label>
        <label
          class="field-label"
          data-ws-part="favorite-server.field-label"
          for="favorite-password"
        ><span>{{ t("serverPassword") }} <span>{{ t("optional") }}</span></span>
          <div
            class="field-wrap"
            data-ws-part="favorite-server.field"
          ><Icon
            name="lock"
            :size="16" /><input
            id="favorite-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            :placeholder="t('optionalPassword')"
          /></div>
        </label>
        <p class="favorite-server-hint">{{ t("favoritePasswordHint") }}</p>
        <p
          v-if="duplicateFavorite"
          class="favorite-server-hint warning"
          role="status"
        >{{ t("favoriteUpdateExisting") }}</p>
        <footer
          class="favorite-server-actions"
          data-ws-part="favorite-server.actions"
        >
          <button
            type="button"
            class="secondary-button"
            data-ws-part="favorite-server.cancel"
            @click="emit('close')"
          >{{ t("cancel") }}</button>
          <button
            type="submit"
            class="primary-button"
            data-ws-part="favorite-server.submit"
            :disabled="!address.trim() || !port.trim()"
          >{{ t("saveFavorite") }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "../Icon.vue";
import { useDialogFocus } from "../../composables/useDialogFocus.js";
import { useBodyScrollLock } from "../../composables/useBodyScrollLock.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "../../services/teamspeak-target.js";

export interface FavoriteServerDraft {
  label: string;
  address: string;
  port: string;
  nickname: string;
  channel: string;
  password: string;
}

const props = defineProps<{
  initial?: Partial<FavoriteServerDraft> | null;
  /** Stored favorite addresses; a normalized hit means saving will update it. */
  knownFavoriteAddresses?: readonly string[];
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  close: [];
  save: [draft: FavoriteServerDraft];
}>();

// The parent mounts this dialog fresh per open (v-if), so the draft is read
// once here and focus handling comes from the shared dialog composable.
const initial = props.initial ?? {};
const label = ref(initial.label ?? "");
const address = ref(initial.address ?? "");
const port = ref(initial.port ?? "9987");
const nickname = ref(initial.nickname ?? "");
const channel = ref(initial.channel ?? "");
const password = ref(initial.password ?? "");

const dialog = ref<HTMLElement | null>(null);
useBodyScrollLock(ref(true));
const { onDialogKeydown } = useDialogFocus(dialog, () => emit("close"),
  () => document.querySelector<HTMLElement>('[data-ws-part="voice.favorite-server-add"]')
    ?? document.querySelector<HTMLElement>('[data-ws-part="home.server-history.add"]'));

// Mirrors upsertFavoriteServer's normalization so the hint fires exactly when
// saving would update an existing favorite instead of creating a new one.
const duplicateFavorite = computed(() => {
  if (!address.value.trim() || !port.value.trim()) return false;
  const target = splitTeamSpeakTarget(`${address.value.trim()}:${port.value.trim()}`);
  const key = combineTeamSpeakTarget(target.address, target.port).trim().toLocaleLowerCase();
  return (props.knownFavoriteAddresses ?? []).some(item => item.trim().toLocaleLowerCase() === key);
});

function submit(): void {
  if (!address.value.trim() || !port.value.trim()) return;
  emit("save", {
    label: label.value.trim(),
    address: address.value.trim(),
    port: port.value.trim(),
    nickname: nickname.value.trim(),
    channel: channel.value.trim(),
    password: password.value,
  });
  emit("close");
}
</script>
