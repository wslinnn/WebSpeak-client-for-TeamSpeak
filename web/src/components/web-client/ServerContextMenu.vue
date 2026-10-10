<template>
  <!-- Teleport to the app root: hosts may sit inside decorated surfaces (the
       join card's backdrop-filter turns it into a containing block for fixed
       descendants, which pushed the menu off screen). The root is high enough
       to escape every decorated ancestor while keeping skin selectors
       (.ws-skin-root [data-ws-part=…]) and the z-index ladder working. Styles
       live in this component's own scoped block so no host scope coupling can
       mute them. -->
  <Teleport to=".web-client">
    <!-- The part is context-dependent (voice.* in the room, home.* on the join
         page) and both variants are documented; v-bind keeps it dynamic because
         the skin part audit regex only reads static attribute literals. -->
    <div
      class="server-context-menu-backdrop"
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
        class="danger"
        @click="act('removeFavorite')"
        ><Icon
          name="star"
          :size="15"
        /><span>{{ t("removeFavoriteNamed", { name: server.label }) }}</span></button
      >
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, type CSSProperties } from "vue";
import Icon from "../Icon.vue";
import { placeMemberMenu } from "../../services/member-menu-placement.js";
import type { FavoriteServer } from "../../services/local-persistence.js";

const props = defineProps<{
  server: FavoriteServer;
  position: { x: number; y: number };
  /** Skin scope: voice.* in the room, home.* on the join page. */
  part: string;
  /** The rail offers "switch"; join-page rows fill the form on click instead. */
  inRoom: boolean;
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  close: [];
  switch: [server: FavoriteServer];
  edit: [server: FavoriteServer];
  removeFavorite: [server: FavoriteServer];
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

function act(action: "switch" | "edit" | "removeFavorite"): void {
  if (action === "switch") emit("switch", props.server);
  else if (action === "edit") emit("edit", props.server);
  else emit("removeFavorite", props.server);
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

<style scoped>
/* Own scoped styles instead of host :deep() rules: this component renders from
 * two hosts (rail and join form) and teleports to body, so no host scope
 * attribute can be relied on. z-index takes the shell ladder tokens with
 * literals as fallback because body is outside .web-client's scope. */
.server-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--ws-z-menu-mask, 300);
  background: rgba(13, 29, 26, .38);
  backdrop-filter: blur(2px);
}

.server-context-menu {
  position: fixed;
  z-index: var(--ws-z-menu, 310);
  display: grid;
  min-width: 210px;
  gap: 3px;
  padding: 8px;
  background: #fff;
  border: 1px solid #e0eae6;
  border-radius: 10px;
  box-shadow: 0 14px 35px rgba(20, 50, 44, .16);
}

.server-context-menu-title {
  padding: 4px 8px 7px;
  overflow: hidden;
  color: #2a3934;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.server-context-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  color: #3c4a45;
  background: transparent;
  border-radius: 7px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.server-context-menu button:hover {
  color: #006a64;
  background: #e5f3f0;
}

.server-context-menu button.danger {
  color: #a64038;
}

.server-context-menu button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 740px) {
  .server-context-menu {
    left: 12px !important;
    right: 12px;
    top: auto !important;
    bottom: calc(74px + env(safe-area-inset-bottom, 0px));
    min-width: 0;
    max-height: calc(100svh - 100px);
    padding: 12px;
    border-radius: 18px;
  }
  .server-context-menu button {
    min-height: 42px;
    font-size: 13px;
  }
}
</style>
