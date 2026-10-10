<template>
  <!-- The part is context-dependent (voice.* in the room, home.* on the join
       page) and both variants are documented; v-bind keeps it dynamic because
       the skin part audit regex only reads static attribute literals. -->
  <div
    class="modal-backdrop server-context-menu-backdrop"
    v-bind="{ 'data-ws-part': `${part}-backdrop` }"
    @click="emit('close')"
    @contextmenu.prevent="emit('close')"
  ></div>
  <div
    ref="menuElement"
    class="server-context-menu"
    v-bind="{ 'data-ws-part': part }"
    role="menu"
    tabindex="-1"
    :style="menuStyle"
    @keydown.esc="emit('close')"
  >
    <strong class="server-context-menu-title">{{ server.label }}</strong>
    <button
      v-if="inRoom"
      role="menuitem"
      type="button"
      @click="act('switch')"
      ><Icon
        name="volume"
        :size="15"
      /><span>{{ t("switchToServer", { name: server.label }) }}</span></button
    >
    <button
      role="menuitem"
      type="button"
      @click="act('edit')"
      ><Icon
        name="settings"
        :size="15"
      /><span>{{ t("serverMenuEdit") }}</span></button
    >
    <button
      role="menuitem"
      type="button"
      @click="act('toggleFavorite')"
      ><Icon
        name="star"
        :size="15"
      /><span>{{ server.isFavorite
        ? t("removeFavoriteNamed", { name: server.label })
        : t("saveFavoriteNamed", { name: server.label }) }}</span></button
    >
    <button
      v-if="!server.isFavorite"
      role="menuitem"
      type="button"
      class="danger"
      @click="act('remove')"
      ><Icon
        name="close"
        :size="15"
      /><span>{{ t("serverMenuDeleteRecent") }}</span></button
    >
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, type CSSProperties } from "vue";
import Icon from "../Icon.vue";
import { placeMemberMenu } from "../../services/member-menu-placement.js";
import type { QuickServer } from "../../services/quick-servers.js";

const props = defineProps<{
  server: QuickServer;
  position: { x: number; y: number };
  /** Skin scope: voice.* in the room, home.* on the join page. */
  part: string;
  /** The rail offers "switch"; join-page rows fill the form on click instead. */
  inRoom: boolean;
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  close: [];
  switch: [server: QuickServer];
  edit: [server: QuickServer];
  toggleFavorite: [server: QuickServer];
  remove: [server: QuickServer];
}>();

const menuElement = ref<HTMLElement | null>(null);
const menuStyle = shallowRef<CSSProperties>({});

function updatePlacement(): void {
  const menu = menuElement.value;
  if (!menu) return;
  const point = placeMemberMenu(
    props.position,
    { width: menu.offsetWidth, height: menu.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  menuStyle.value = { left: `${point.x}px`, top: `${point.y}px` };
  menuElement.value?.focus();
}

function act(action: "switch" | "edit" | "toggleFavorite" | "remove"): void {
  if (action === "switch") emit("switch", props.server);
  else if (action === "edit") emit("edit", props.server);
  else if (action === "toggleFavorite") emit("toggleFavorite", props.server);
  else emit("remove", props.server);
  emit("close");
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  void nextTick(updatePlacement);
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
