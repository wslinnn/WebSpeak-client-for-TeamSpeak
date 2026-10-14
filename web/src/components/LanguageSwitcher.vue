<template>
  <div ref="root" class="language-switcher" :class="{ open, tile }" @keydown.esc="close">
    <button
      type="button"
      class="language-trigger"
      data-ws-part="language.trigger"
      :aria-label="menuLabel"
      :title="tile ? menuLabel : undefined"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :data-ws-state="open ? 'open' : 'closed'"
      :aria-controls="menuId"
      @click.stop="toggle"
    >
      <span class="language-current-flag" aria-hidden="true">{{ currentLanguage.flag }}</span>
      <span v-if="!tile" class="language-current-code">{{ currentLanguage.code }}</span>
      <Icon v-if="!tile" name="chevron-down" :size="13" />
    </button>

    <div v-if="open" ref="dropdown" :id="menuId" class="language-dropdown" data-ws-part="language.menu" role="listbox" :aria-label="menuLabel" @click.stop>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="language-option"
        data-ws-part="language.option"
        :data-ws-language="option.value"
        :class="{ selected: modelValue === option.value }"
        role="option"
        :aria-selected="modelValue === option.value"
        @pointerdown.stop.prevent="select(option.value, $event)"
        @keydown.enter.prevent="select(option.value)"
        @keydown.space.prevent="select(option.value)"
      >
        <span class="language-option-flag" aria-hidden="true">{{ option.flag }}</span>
        <span class="language-option-copy">
          <strong>{{ option.label }}</strong>
          <small>{{ option.code }}</small>
        </span>
        <Icon v-if="modelValue === option.value" name="check" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";
import { placeDropdownBesideTile, placeDropdownClamped } from "../services/dropdown-place.js";

type Language = "zh" | "en" | "de" | "ru" | "ja";

const props = withDefaults(defineProps<{
  modelValue: Language;
  menuLabel?: string;
  tile?: boolean;
}>(), {
  menuLabel: "Language",
});

const emit = defineEmits<{
  "update:modelValue": [value: Language];
  change: [value: Language];
}>();

const options: Array<{ value: Language; code: string; label: string; flag: string }> = [
  { value: "zh", code: "ZH", label: "中文", flag: "🇨🇳" },
  { value: "en", code: "EN", label: "English", flag: "🇬🇧" },
  { value: "de", code: "DE", label: "Deutsch", flag: "🇩🇪" },
  { value: "ru", code: "RU", label: "Русский", flag: "🇷🇺" },
  { value: "ja", code: "JA", label: "日本語", flag: "🇯🇵" },
];

const root = ref<HTMLElement | null>(null);
const dropdown = ref<HTMLElement | null>(null);
const open = ref(false);
const menuId = `language-menu-${Math.random().toString(36).slice(2, 9)}`;
const currentLanguage = computed(() => options.find((option) => option.value === props.modelValue) ?? options[0]);

function placeDropdown(): void {
  const rootEl = root.value;
  const dropdownEl = dropdown.value;
  if (!rootEl || !dropdownEl) return;
  if (props.tile) placeDropdownBesideTile(rootEl, dropdownEl);
  else placeDropdownClamped(rootEl, dropdownEl);
}

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    placeDropdown();
  }
}

function close() {
  open.value = false;
}

let clickGuardArmed = false;

/**
 * Selecting unmounts the menu under the finger: the gesture's trailing click
 * can then synthesize on whatever element the tap now covers — on the phone's
 * "more" panel that is the exit button directly below the menu, so picking a
 * language could disconnect the user. One capture-phase, one-shot swallow of
 * that trailing click; the timeout releases the guard when no click follows.
 * Only pointer selections arm it — keyboard activation has no trailing click.
 */
function armClickGuard(): void {
  if (clickGuardArmed) return;
  clickGuardArmed = true;
  const swallow = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => {
    document.removeEventListener("click", swallow, { capture: true });
    clickGuardArmed = false;
  }, 400);
}

function select(value: Language, gesture?: Event) {
  if (gesture instanceof PointerEvent) armClickGuard();
  emit("update:modelValue", value);
  emit("change", value);
  close();
}

function onDocumentPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

// Viewport changes invalidate the clamped placement; close instead of drifting.
function onViewportChange(): void {
  if (open.value) close();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange, true);
});
</script>

<style scoped>
.language-switcher {
  position: relative;
  z-index: var(--ws-z-dropdown);
  flex: 0 0 auto;
  color: #4f9e0c;
  font-family: inherit;
}

.language-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 70px;
  min-height: 32px;
  padding: 0 9px;
  color: #4f9e0c;
  background: #eef6db;
  border: 1px solid #d9e9bd;
  border-radius: 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: color .16s, background .16s, border-color .16s, box-shadow .16s;
}

.language-trigger:hover,
.language-switcher.open .language-trigger {
  color: #fff;
  background: #4f9e0c;
  border-color: #4f9e0c;
  box-shadow: 0 7px 16px rgba(79, 158, 12, .18);
}

.language-trigger .ui-icon {
  margin-left: auto;
  transition: transform .16s;
}

.language-switcher.open .language-trigger .ui-icon {
  transform: rotate(180deg);
}

.language-current-flag,
.language-option-flag {
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  line-height: 1;
}

.language-current-flag {
  font-size: 15px;
}

.language-current-code {
  letter-spacing: .02em;
}

.language-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(38px, max-content);
  align-items: start;
  align-content: start;
  gap: 3px;
  width: min(360px, calc(100vw - 16px));
  height: auto;
  max-height: none;
  padding: 7px;
  overflow: visible;
  background: #fff;
  border: 1px solid #e0e8d2;
  border-radius: 13px;
  box-shadow: 0 16px 36px rgba(56, 82, 34, .16), 0 3px 8px rgba(56, 82, 34, .06);
  animation: language-menu-in .14s ease-out;
}

.language-option {
  display: flex;
  align-items: center;
  align-self: start;
  min-width: 0;
  gap: 8px;
  min-height: 38px;
  padding: 6px 8px;
  color: #344540;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: color .14s, background .14s, border-color .14s;
}

.language-option:hover,
.language-option:focus-visible,
.language-option.selected {
  color: #4f9e0c;
  background: #eef6db;
  border-color: #d9e9bd;
}

.language-option-flag {
  flex: 0 0 auto;
  font-size: 17px;
}

.language-option-copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
  flex: 1;
  gap: 8px;
}

.language-option strong,
.language-option small {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.language-option strong {
  flex: 0 0 auto;
  font-size: 12px;
}

.language-option small {
  flex: 0 0 auto;
  color: #91a19c;
  font-size: 10px;
  font-weight: 700;
}

.language-option > .ui-icon {
  flex: 0 0 auto;
}

@keyframes language-menu-in {
  from { opacity: 0; transform: translateY(-4px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

:global(html[data-theme="dark"] .admin-root) .language-trigger,
:global(:root[data-theme="dark"] .admin-root) .language-trigger {
  color: #a3d163;
  background: #26331b;
  border-color: #3e5230;
}

:global(html[data-theme="dark"] .admin-root) .language-trigger:hover,
:global(html[data-theme="dark"] .admin-root) .language-switcher.open .language-trigger,
:global(:root[data-theme="dark"] .admin-root) .language-trigger:hover,
:global(:root[data-theme="dark"] .admin-root) .language-switcher.open .language-trigger {
  color: #14230a;
  background: #6cbf00;
  border-color: #6cbf00;
}

:global(html[data-theme="dark"] .admin-root) .language-dropdown,
:global(:root[data-theme="dark"] .admin-root) .language-dropdown {
  background: #1a2315;
  border-color: #31402b;
  box-shadow: 0 16px 36px rgba(0, 0, 0, .32);
}

:global(html[data-theme="dark"] .admin-root) .language-option,
:global(:root[data-theme="dark"] .admin-root) .language-option {
  color: #dbe7cf;
}

:global(html[data-theme="dark"] .admin-root) .language-option:hover,
:global(html[data-theme="dark"] .admin-root) .language-option:focus-visible,
:global(html[data-theme="dark"] .admin-root) .language-option.selected,
:global(:root[data-theme="dark"] .admin-root) .language-option:hover,
:global(:root[data-theme="dark"] .admin-root) .language-option:focus-visible,
:global(:root[data-theme="dark"] .admin-root) .language-option.selected {
  color: #a3d163;
  background: #26331b;
  border-color: #3e5230;
}

/* Rail tile variant: the trigger turns into a 58px rail tile; the dropdown
   keeps its light surface and opens to the right of the rail. */
.language-switcher.tile .language-trigger {
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

.language-switcher.tile .language-trigger:hover,
.language-switcher.tile.open .language-trigger {
  color: var(--wsd-text);
  background: var(--wsd-hover);
  border-color: transparent;
  box-shadow: none;
}

.language-switcher.tile .language-current-flag {
  font-size: 22px;
}

.language-switcher.tile .language-dropdown {
  right: auto;
  left: 0;
}

@media (max-width: 520px) {
  .language-trigger {
    min-width: 62px;
    min-height: 30px;
    padding-inline: 7px;
  }

  .language-dropdown {
    width: min(360px, calc(100vw - 16px));
  }
}
</style>
