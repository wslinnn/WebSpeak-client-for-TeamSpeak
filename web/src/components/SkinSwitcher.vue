<template>
  <div ref="root" class="skin-switcher" :class="{ open, tile }" @keydown.esc="close">
    <button
      type="button"
      class="skin-trigger"
      data-ws-part="skin.trigger"
      :disabled="options.length === 0"
      :aria-label="menuLabel"
      :title="`${menuLabel}: ${selectedOption.label}`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :data-ws-state="open ? 'open' : 'closed'"
      :aria-controls="menuId"
      @click.stop="toggle"
    >
      <Icon :name="selectedOption.icon || 'compass'" :size="tile ? 22 : 15" />
      <span v-if="!tile">{{ menuLabel }}</span>
      <Icon v-if="!tile" name="chevron-down" :size="12" />
    </button>

    <div v-if="open" ref="dropdown" :id="menuId" class="skin-dropdown" data-ws-part="skin.menu" role="listbox" :aria-label="menuLabel" @click.stop>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="skin-option"
        data-ws-part="skin.option"
        :data-ws-skin-id="option.value"
        :class="{ selected: modelValue === option.value }"
        role="option"
        :aria-selected="modelValue === option.value"
        @click="select(option.value)"
      >
        <Icon :name="option.icon || 'compass'" :size="16" />
        <span>{{ option.label }}</span>
        <Icon v-if="modelValue === option.value" name="check" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import Icon from "./Icon.vue";
import { placeDropdownBesideTile, placeDropdownClamped } from "../services/dropdown-place.js";

export interface SkinOption {
  value: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  modelValue: string;
  menuLabel: string;
  options: SkinOption[];
  tile?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();

const options = computed(() => props.options);
const selectedOption = computed(() => options.value.find((option) => option.value === props.modelValue) ?? options.value[0] ?? {
  value: props.modelValue,
  label: props.menuLabel,
  icon: "compass",
});
const root = ref<HTMLElement | null>(null);
const dropdown = ref<HTMLElement | null>(null);
const open = ref(false);
const menuId = `skin-menu-${Math.random().toString(36).slice(2, 9)}`;

function toggle() { open.value = !open.value; }
function close() { open.value = false; }
function select(value: string) {
  emit("update:modelValue", value);
  emit("change", value);
  close();
}
function onDocumentPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

// Tile mode lives in the server rail, whose overflow clips absolutely
// positioned menus: the dropdown goes fixed beside the tile. Inline mode
// (join header, mobile panel) clamps into the viewport instead — a trigger
// at the screen edge otherwise pushes the right-anchored menu off-screen.
function placeDropdown(): void {
  const rootEl = root.value;
  const dropdownEl = dropdown.value;
  if (!rootEl || !dropdownEl) return;
  if (props.tile) placeDropdownBesideTile(rootEl, dropdownEl);
  else placeDropdownClamped(rootEl, dropdownEl);
}

watch(open, (isOpen) => {
  if (isOpen) void nextTick(placeDropdown);
});
function onWindowResize(): void {
  if (open.value) placeDropdown();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  window.addEventListener("resize", onWindowResize);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  window.removeEventListener("resize", onWindowResize);
});
</script>

<style scoped>
.skin-switcher {
  position: relative;
  z-index: var(--ws-z-dropdown);
  flex: 0 0 auto;
  color: var(--text-muted);
}

.skin-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 34px;
  min-height: 32px;
  padding: 0 8px;
  /* Token surfaces with day fallbacks — same contract as LanguageSwitcher:
   * the client follows the skin attribute, admin keeps day + its dark block. */
  color: var(--wsd-accent, #4f9e0c);
  background: color-mix(in srgb, var(--wsd-accent, #4f9e0c) 8%, var(--wsd-panel, #fff));
  border: 1px solid color-mix(in srgb, var(--wsd-accent, #4f9e0c) 28%, var(--wsd-border, #dfe5e8));
  border-radius: 8px;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .06);
  transition: color .16s, background .16s, border-color .16s, box-shadow .16s;
}

.skin-trigger:hover,
.skin-switcher.open .skin-trigger {
  color: var(--wsd-accent-hover, #468f0a);
  background: color-mix(in srgb, var(--wsd-accent, #4f9e0c) 14%, var(--wsd-panel, #fff));
  border-color: color-mix(in srgb, var(--wsd-accent, #4f9e0c) 38%, var(--wsd-border, #dfe5e8));
  box-shadow: 0 6px 16px rgba(0, 0, 0, .08);
}

.skin-trigger > .ui-icon:last-child { margin-left: 1px; }

.skin-dropdown {
  position: absolute;
  top: calc(100% + 7px);
  right: 0;
  display: grid;
  gap: 3px;
  min-width: 176px;
  padding: 6px;
  color: var(--wsd-text, #2a3322);
  background: var(--wsd-panel, #fff);
  border: 1px solid var(--wsd-border, #dfe5e8);
  border-radius: 11px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, .16);
  backdrop-filter: blur(18px) saturate(1.12);
}

.skin-option {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 36px;
  padding: 0 9px;
  color: var(--wsd-text, #2a3322);
  background: var(--wsd-raised, #f2f5f6);
  border: 1px solid color-mix(in srgb, var(--wsd-accent, #4f9e0c) 22%, var(--wsd-border, #dfe5e8));
  border-radius: 7px;
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: color .18s, border-color .18s, box-shadow .18s, background .18s;
}

.skin-option > .ui-icon:first-child { color: var(--wsd-text-dim, #6b7568); }
.skin-option > .ui-icon:last-child { margin-left: auto; color: var(--wsd-accent, #4f9e0c); }
.skin-option:hover,
.skin-option:focus-visible {
  color: var(--wsd-accent, #4f9e0c);
  border-color: color-mix(in srgb, var(--wsd-accent, #4f9e0c) 45%, transparent);
  background: color-mix(in srgb, var(--wsd-accent, #4f9e0c) 12%, var(--wsd-panel, #fff));
  box-shadow: 0 4px 13px rgba(0, 0, 0, .08);
}

.skin-option.selected {
  color: var(--wsd-accent-hover, #468f0a);
  border-color: color-mix(in srgb, var(--wsd-accent, #4f9e0c) 55%, transparent);
  background: color-mix(in srgb, var(--wsd-accent, #4f9e0c) 18%, var(--wsd-panel, #fff));
  box-shadow: 0 5px 16px rgba(0, 0, 0, .1);
}

.skin-option.selected > .ui-icon:first-child,
.skin-option.selected > .ui-icon:last-child { color: var(--wsd-accent, #4f9e0c); }

@media (max-width: 520px) {
  .skin-trigger { min-height: 36px; }
  .skin-dropdown { min-width: 190px; }
}

/* Rail tile variant: the trigger turns into a 58px rail tile; the dropdown
   keeps its readable light surface and opens to the right of the rail. */
.skin-switcher.tile .skin-trigger {
  display: grid;
  place-items: center;
  width: 58px;
  min-width: 58px;
  height: 58px;
  min-height: 58px;
  padding: 0;
  color: var(--wsd-text);
  background: var(--wsd-raised);
  border: 2px solid transparent;
  border-radius: 18px;
  box-shadow: none;
}

.skin-switcher.tile .skin-trigger:hover,
.skin-switcher.tile.open .skin-trigger {
  color: var(--wsd-text);
  background: var(--wsd-hover);
  border-color: transparent;
  box-shadow: none;
}

.skin-switcher.tile .skin-dropdown {
  right: auto;
  left: 0;
}

.skin-switcher.mobile-skin-switcher .skin-trigger {
  width: 100%;
  min-height: 44px;
  justify-content: flex-start;
  padding-inline: 12px;
  font-size: 12px;
}

@media (max-width: 420px) {
  .skin-switcher.join-skin-switcher .skin-trigger {
    width: 28px;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
  }

  .skin-switcher.join-skin-switcher .skin-trigger > span,
  .skin-switcher.join-skin-switcher .skin-trigger > .ui-icon:last-child { display: none; }
}

@media (max-width: 740px) {
  .skin-switcher.mobile-skin-switcher .skin-dropdown {
    position: static;
    width: 100%;
    min-width: 0;
    max-height: min(45vh, 280px);
    margin-top: 8px;
    overflow-y: auto;
    box-sizing: border-box;
  }
}

@media (max-width: 740px) {
  .skin-switcher.mobile-skin-switcher .skin-dropdown {
    position: static;
    width: 100%;
    min-width: 0;
    max-height: min(45vh, 280px);
    margin-top: 8px;
    overflow-y: auto;
    box-sizing: border-box;
  }
}
</style>
