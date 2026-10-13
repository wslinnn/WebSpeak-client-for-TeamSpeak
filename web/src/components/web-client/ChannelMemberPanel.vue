<template>
  <aside
    :class="['member-panel', { 'mobile-section-visible': mobileVisible }]"
    data-ws-part="voice.member-panel"
  >
    <div
      class="member-server-header"
      data-ws-part="voice.server-header"
    ><strong>{{ serverLabel }}</strong><button
        ref="switcherTriggerEl"
        type="button"
        class="member-server-menu"
        data-ws-part="voice.server-switcher.trigger"
        :aria-expanded="switcherOpen"
        :aria-label="t('favoriteServers')"
        :title="t('favoriteServers')"
        @click="toggleSwitcher"
      ><Icon
          name="menu"
          :size="16" /></button></div>
    <div
      class="member-server-meta"
      data-ws-part="voice.server-meta"
    ><span
        class="member-server-kind"
      >TeamSpeak</span><button
        type="button"
        class="status-button"
        :class="{ active: away }"
        :aria-pressed="!away"
        @click="toggleAway"
        ><span class="status-dot"></span>{{ away ? t("away") : t("available") }}</button
      ><button
        type="button"
        class="member-search-toggle"
        :aria-expanded="searchOpen"
        :aria-label="t('searchMembers')"
        :title="t('searchMembers')"
        @click="toggleSearch"
      ><Icon
          name="search"
          :size="15" /></button></div>
    <div
      v-if="welcomeMessage"
      class="member-server-welcome"
      data-ws-part="voice.server-welcome"
    >
      <span
        class="member-server-welcome-icon"
        aria-hidden="true"
        ><Icon
          name="message"
          :size="13" /></span>
      <div>
        <strong>{{ t("serverWelcome") }}</strong>
        <p>{{ welcomeMessage }}</p>
      </div>
    </div>
    <div
      class="member-panel-heading"
      data-ws-part="voice.member-panel.heading"
      ><div
        ><h2>{{ t("people") }}</h2></div
    ></div>
    <div
      class="member-search"
      :class="{ 'search-open': searchOpen || memberQuery.trim().length > 0 }"
      data-ws-part="voice.member-panel.search"
      ><Icon
        name="search"
        :size="15" /><input
        ref="searchInputEl"
        v-model="memberQuery"
        :placeholder="t('searchMembers')"
        :aria-label="t('searchMembers')"
    /></div>
    <div
      ref="memberTreeEl"
      class="member-tree"
      data-ws-part="voice.member-panel.channels"
    >
      <div
        class="member-group-label"
        data-ws-part="voice.group-label"
      >{{ t("voiceGroup") }}</div>
      <section
        v-for="channelItem in filteredMemberChannels"
        :key="channelItem.id"
        :class="[
          'member-channel-group',
          {
            current: currentChannelId === channelItem.id,
            selected: selectedChannelId === channelItem.id,
            'drag-over': dragOverChannelId === channelItem.id,
            folded: isFolded(channelItem.id),
          },
        ]"
        data-ws-part="voice.channel-group"
        :data-ws-state="
          currentChannelId === channelItem.id
            ? 'current'
            : dragOverChannelId === channelItem.id
              ? 'drag-over'
              : 'idle'
        "
        :data-member-channel-id="channelItem.id"
        :style="{ marginLeft: `${channelItem.depth * 14}px` }"
        @pointermove="onTreePointerMove($event)"
        @pointerup="onTreePointerEnd($event)"
        @pointercancel="onTreePointerCancel($event)"
      >
        <div
          class="member-channel-heading-row"
          data-ws-part="voice.channel-group.heading-row"
        >
          <button
            class="member-channel-heading"
            data-ws-part="voice.channel-group.heading"
            :data-ws-state="channelItem.id === currentChannelId ? 'current' : 'idle'"
            :aria-current="channelItem.id === currentChannelId ? 'true' : undefined"
            :title="t('switchChannel')"
            @click="selectedChannelId = channelItem.id"
            @dblclick="emit('selectChannel', channelItem)"
            @keydown.enter.prevent="emit('selectChannel', channelItem)"
          >
            <Icon
              name="volume"
              :size="17"
            />
            <span>{{ channelItem.name }}</span>
            <small>{{ channelItem.members.length }}</small>
            <em
              v-if="selectedChannelId === channelItem.id && channelItem.id !== currentChannelId"
              class="member-channel-join-hint"
            >{{ t("doubleClickToJoin") }}</em>
          </button>
          <button
            type="button"
            class="member-channel-fold"
            data-ws-part="voice.channel-group.fold"
            :aria-expanded="!isFolded(channelItem.id)"
            :aria-label="isFolded(channelItem.id) ? t('expandChannel') : t('collapseChannel')"
            @click="emit('toggleFold', channelItem.id)"
          ><Icon
              name="chevron-down"
              :size="14"
          /></button>
        </div>
        <!-- Fold branch: kept mounted so its single grid row can interpolate
             between 1fr and 0fr (see .member-channel-branch). -->
        <div
          class="member-channel-branch"
          :data-expanded="isFolded(channelItem.id) ? 'false' : 'true'"
        >
          <div class="member-channel-branch-content">
        <div
          v-if="channelItem.members.length"
          class="member-list"
          data-ws-part="voice.channel-group.members"
          role="list"
        >
          <div
            v-for="member in channelItem.members"
            :key="`${channelItem.id}-${member.id}`"
            v-memo="[
              member.nickname,
              member.avatar,
              member.isSelf,
              member.away,
              member.inputMuted,
              member.outputMuted,
              member.channelCommander,
              isSpeaking(member),
              draggedMember?.id === member.id,
              volumes[member.id] ?? 1,
            ]"
            :class="['member-row', { dragging: draggedMember?.id === member.id }]"
            data-ws-part="voice.member-row"
            role="listitem"
            :data-ws-state="
              draggedMember?.id === member.id
                ? 'dragging'
                : isSpeaking(member)
                  ? 'speaking'
                  : 'connected'
            "
            @pointerdown="onMemberPointerDown(member, $event)"
            @pointermove="onTreePointerMove($event)"
            @pointerup="onTreePointerEnd($event)"
            @pointercancel="onTreePointerCancel($event)"
            @contextmenu="onMemberContextMenu(member, $event)"
          >
            <div
              :class="['member-avatar', { speaking: isSpeaking(member) }]"
              data-ws-part="voice.member-row.avatar"
              :style="avatarStyle(member.nickname, member.isSelf, member.avatar)"
              >{{ member.avatar ? "" : avatarInitial(member.nickname)
              }}<span class="member-presence"></span
            ></div>
            <div
              class="member-copy"
              data-ws-part="voice.member-row.copy"
              ><strong
                v-if="member.isSelf"
                >{{ member.nickname }}<em
                  class="member-self-tag"
                >{{ t("you") }}</em></strong
              ><button
                v-else
                type="button"
                class="member-name-button"
                :aria-label="t('moreMemberOptions')"
                @click.stop="openMemberActions(member)"
                >{{ memberDisplayName(member) }}</button
              ><span
                v-if="member.away === true || isSpeaking(member)"
                >{{ member.away === true ? t("away") : t("speaking") }}</span
              ></div
            >
            <div
              class="member-flags"
              data-ws-part="voice.member-row.flags"
              :aria-label="t('memberStates')"
              ><span
                v-if="member.away"
                :title="t('away')"
                :aria-label="t('away')"
                ><Icon
                  name="clock"
                  :size="13" /></span
              ><span
                v-if="member.inputMuted"
                :title="t('inputMuted')"
                :aria-label="t('inputMuted')"
                ><Icon
                  name="mic-off"
                  :size="13" /></span
              ><span
                v-if="member.outputMuted"
                :title="t('outputMuted')"
                :aria-label="t('outputMuted')"
                ><Icon
                  name="volume-off"
                  :size="13" /></span
              ><span
                v-if="member.channelCommander"
                :title="t('channelCommander')"
                :aria-label="t('channelCommander')"
                ><Icon
                  name="shield"
                  :size="13" /></span
            ></div>
            <div
              class="member-volume"
              data-ws-part="voice.member-row.volume"
              @pointerdown.stop
              ><Icon
                :name="(volumes[member.id] ?? 1) === 0 ? 'volume-off' : 'volume'"
                :size="14" /><input
                type="range"
                min="0"
                max="400"
                step="5"
                :value="(volumes[member.id] ?? 1) * 100"
                :style="rangeStyle((volumes[member.id] ?? 1) / 4, 1)"
                :aria-label="`${t('memberVolume')} ${Math.round((volumes[member.id] ?? 1) * 100)}%`"
                @input="emit('volumeInput', member.id, $event)"
              /><span class="member-volume-value">{{ Math.round((volumes[member.id] ?? 1) * 100) }}%</span></div>
            <button
              v-if="isMobileViewport && !member.isSelf"
              type="button"
              class="member-action-button"
              :aria-label="t('moreMemberOptions')"
              @click.stop="openMemberActions(member)"
              ><Icon
                name="more"
                :size="18"
            /></button>
          </div>
        </div>
        <div
          v-else
          class="channel-no-members"
          >{{ t("noMembersInChannel") }}</div
        >
          </div>
        </div>
      </section>
    </div>
    <div
      v-if="!filteredMemberChannels.length"
      class="member-empty"
      >{{ t("noMatchingMembers") }}</div
    >
    <slot />
    <Teleport to=".web-client">
      <template v-if="switcherOpen">
        <div
          class="member-server-switcher-backdrop"
          data-ws-part="voice.server-switcher-backdrop"
          @click="switcherOpen = false"
        ></div>
        <div
          ref="switcherMenuEl"
          class="member-server-switcher"
          data-ws-part="voice.server-switcher"
          role="menu"
          tabindex="-1"
          :style="switcherMenuStyle"
          @keydown.esc="switcherOpen = false"
        >
          <button
            v-for="server in switcherServers"
            :key="server.id"
            type="button"
            role="menuitem"
            class="member-server-switcher-item"
            :data-ws-state="server.address === currentAddress ? 'current' : 'idle'"
            @click="pickSwitcher(server)"
          ><span
              class="member-server-switcher-icon"
              :style="avatarStyle(server.label, false, '')"
            >{{ avatarInitial(server.label) }}</span><span
              class="member-server-switcher-label"
            >{{ server.label }}</span></button>
        </div>
      </template>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import Icon from "../Icon.vue";
import type { TreeChannel } from "../../composables/useWebClientChannels.js";
import type { useWebClientMembers } from "../../composables/useWebClientMembers.js";
import type { FavoriteServer } from "../../services/local-persistence.js";

type MemberPanelModel = Pick<ReturnType<typeof useWebClientMembers>,
  | "away"
  | "draggedMember"
  | "dragOverChannelId"
  | "toggleAway"
  | "isSpeaking"
  | "memberDisplayName"
  | "openMemberActions"
  | "onMemberContextMenu"
  | "onMemberPointerDown"
  | "onMemberPointerMove"
  | "onMemberPointerUp"
  | "onMemberPointerCancel"
>;
const memberQuery = defineModel<string>("query", { required: true });
const props = defineProps<{
  model: MemberPanelModel;
  serverLabel: string;
  welcomeMessage: string;
  filteredMemberChannels: readonly TreeChannel[];
  currentChannelId?: string;
  mobileVisible: boolean;
  isMobileViewport: boolean;
  volumes: Record<number, number>;
  foldedChannels: ReadonlySet<string>;
  switcherServers: readonly FavoriteServer[];
  currentAddress: string;
  avatarStyle: (name: string, isSelf?: boolean, avatar?: string) => CSSProperties;
  avatarInitial: (name: string) => string;
  rangeStyle: (value: number, max: number) => CSSProperties;
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  selectChannel: [channel: TreeChannel];
  toggleFold: [channelId: string];
  volumeInput: [clientId: number, event: Event];
  switchServer: [server: FavoriteServer];
}>();

// KAAK-style join interaction: a single click selects the channel, a double
// click (or Enter) commits the move. Selection clears once the move lands.
const selectedChannelId = ref<string | null>(null);
watch(() => props.currentChannelId, () => {
  selectedChannelId.value = null;
});

// KAAK-style header: the ≡ opens a server switcher over the rail favorites,
// and the search field collapses behind the magnifier toggle.
const switcherOpen = ref(false);
const switcherTriggerEl = ref<HTMLElement | null>(null);
const switcherMenuEl = ref<HTMLElement | null>(null);
const switcherMenuStyle = ref<CSSProperties>({});
const searchOpen = ref(false);
const searchInputEl = ref<HTMLInputElement | null>(null);

function toggleSwitcher(): void {
  switcherOpen.value = !switcherOpen.value;
  if (switcherOpen.value) void nextTick(updateSwitcherPlacement);
}

function updateSwitcherPlacement(): void {
  const menu = switcherMenuEl.value;
  const trigger = switcherTriggerEl.value;
  if (!menu || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8));
  const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8));
  switcherMenuStyle.value = { left: `${left}px`, top: `${top}px` };
  menu.focus();
}

function pickSwitcher(server: FavoriteServer): void {
  switcherOpen.value = false;
  emit("switchServer", server);
}

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) void nextTick(() => searchInputEl.value?.focus());
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") switcherOpen.value = false;
}
onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onUnmounted(() => window.removeEventListener("keydown", onGlobalKeydown));

// Searching targets people, not structure: the fold memory is ignored while
// a query is active so every match stays visible.
const searchActive = computed(() => memberQuery.value.trim().length > 0);
function isFolded(id: string): boolean {
  return !searchActive.value && props.foldedChannels.has(id);
}

// While a member is being dragged, hovering near the tree's top/bottom edge
// scrolls the list so off-screen channels become drop targets. Speed ramps
// with edge proximity; the loop stops on drop, cancel and unmount.
const memberTreeEl = ref<HTMLElement | null>(null);
const DRAG_EDGE_PX = 44;
let autoScrollFrame = 0;
let autoScrollDelta = 0;
function stepAutoScroll(): void {
  autoScrollFrame = 0;
  const tree = memberTreeEl.value;
  if (!tree || !draggedMember.value || !autoScrollDelta) return;
  tree.scrollTop += autoScrollDelta;
  autoScrollFrame = requestAnimationFrame(stepAutoScroll);
}
function stopAutoScroll(): void {
  if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = 0;
  autoScrollDelta = 0;
}
function onTreePointerMove(event: PointerEvent): void {
  onMemberPointerMove(event);
  const tree = memberTreeEl.value;
  if (!tree || !draggedMember.value) {
    stopAutoScroll();
    return;
  }
  const rect = tree.getBoundingClientRect();
  if (event.clientY < rect.top + DRAG_EDGE_PX) {
    autoScrollDelta = -Math.ceil((rect.top + DRAG_EDGE_PX - event.clientY) / 6);
  } else if (event.clientY > rect.bottom - DRAG_EDGE_PX) {
    autoScrollDelta = Math.ceil((event.clientY - (rect.bottom - DRAG_EDGE_PX)) / 6);
  } else {
    stopAutoScroll();
    return;
  }
  if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(stepAutoScroll);
}
function onTreePointerEnd(event: PointerEvent): void {
  stopAutoScroll();
  onMemberPointerUp(event);
}
function onTreePointerCancel(event: PointerEvent): void {
  stopAutoScroll();
  onMemberPointerCancel(event);
}
onUnmounted(stopAutoScroll);

// The page retains the controller and slot content across mobile view changes.
const {
  away,
  draggedMember,
  dragOverChannelId,
  toggleAway,
  isSpeaking,
  memberDisplayName,
  openMemberActions,
  onMemberContextMenu,
  onMemberPointerDown,
  onMemberPointerMove,
  onMemberPointerUp,
  onMemberPointerCancel,
} = props.model;
</script>

<style scoped>
/* The switcher teleports to the app root — the channel pane clips fixed
 * descendants — so it carries its own scoped styles instead of relying on a
 * host scope attribute. */
.member-server-switcher-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--ws-z-menu-mask, 300);
  background: rgba(13, 29, 26, .38);
  backdrop-filter: blur(2px);
}

.member-server-switcher {
  position: fixed;
  z-index: var(--ws-z-menu, 310);
  display: grid;
  gap: 3px;
  width: min(250px, calc(100vw - 40px));
  max-height: min(340px, calc(100dvh - 120px));
  overflow: auto;
  padding: 6px;
  color: var(--wsd-text, #22262b);
  background: var(--wsd-raised, #fff);
  border: 1px solid var(--wsd-border, #dfe5e8);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .22);
}

.member-server-switcher-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 44px;
  padding: 5px 8px;
  border: 0;
  border-radius: 7px;
  color: inherit;
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.member-server-switcher-item:hover,
.member-server-switcher-item:focus-visible {
  background: var(--wsd-hover, #e9eef0);
  outline: none;
}

.member-server-switcher-item[data-ws-state="current"] {
  color: var(--wsd-accent, #4f9e0c);
  font-weight: 700;
}

.member-server-switcher-icon {
  display: grid;
  flex: 0 0 28px;
  place-items: center;
  width: 28px;
  height: 28px;
  overflow: hidden;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.member-server-switcher-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
