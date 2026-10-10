import { computed, reactive, ref, type Ref } from "vue";
import type { ChannelMember } from "./useVoiceWebSocket.js";
import type { TreeChannel } from "./useWebClientChannels.js";

export interface MemberMenuState {
  member: ChannelMember;
  x: number;
  y: number;
}

interface UseWebClientMembersOptions {
  channels: Readonly<Ref<TreeChannel[]>>;
  currentChannel: Readonly<Ref<TreeChannel | undefined>>;
  members: ChannelMember[];
  speakingIds: Set<number>;
  whisperTargetIds: Set<number>;
  moveClient: (clientId: number, targetChannelId: string) => Promise<void>;
  setWhisperTargets: (clientIds: number[]) => void;
  sendPoke: (clientId: number, message: string) => void;
  setAway: (away: boolean, message: string) => void;
  onManualStatusChange?: () => void;
  stopWhisperTalk: () => void;
  localizedMessage: (message: string) => string;
  showToast: (message: string, tone?: "info" | "warn") => void;
  t: (key: string) => string;
}

export function useWebClientMembers({
  channels,
  currentChannel,
  speakingIds,
  whisperTargetIds,
  moveClient,
  setWhisperTargets,
  sendPoke,
  setAway,
  onManualStatusChange,
  stopWhisperTalk,
  localizedMessage,
  showToast,
  t,
}: UseWebClientMembersOptions) {
  const away = ref(false);
  const awayMessage = ref("");
  const memberMenu = ref<MemberMenuState | null>(null);
  const memberMoveMenuOpen = ref(false);
  const draggedMember = ref<ChannelMember | null>(null);
  const dragOverChannelId = ref("");
  const memberPointerDrag = reactive({
    member: null as ChannelMember | null,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    active: false,
    targetChannelId: "",
  });

  const memberMoveMenuCurrentChannel = computed<TreeChannel | null>(() => {
    const member = memberMenu.value?.member;
    const selected = currentChannel.value;
    if (!member || !selected || selected.id === "__current__") return null;
    return selected;
  });
  const memberMoveMenuCurrentSameChannel = computed(() => {
    const member = memberMenu.value?.member;
    const currentId = memberMoveMenuCurrentChannel.value?.id;
    if (!member || !currentId) return false;
    return channels.value.find((item) => item.members.some((candidate) => candidate.id === member.id))?.id === currentId;
  });
  const memberMoveMenuOtherChannels = computed<TreeChannel[]>(() => {
    const member = memberMenu.value?.member;
    if (!member) return [];
    const sourceChannelId = channels.value.find((item) => item.members.some((candidate) => candidate.id === member.id))?.id ?? "";
    const currentChannelId = memberMoveMenuCurrentChannel.value?.id;
    return channels.value.filter((item) => item.id !== "__current__" && item.id !== sourceChannelId && item.id !== currentChannelId);
  });

  function openMemberMenu(member: ChannelMember, event: Event): void {
    if (member.isSelf) return;
    memberMoveMenuOpen.value = false;
    const point = event instanceof MouseEvent ? event : undefined;
    memberMenu.value = {
      member,
      x: Math.min(point?.clientX ?? 20, Math.max(12, window.innerWidth - 210)),
      y: Math.min(point?.clientY ?? 20, Math.max(12, window.innerHeight - 170)),
    };
  }

  function openMemberActions(member: ChannelMember): void {
    if (member.isSelf) return;
    memberMoveMenuOpen.value = false;
    memberMenu.value = { member, x: 0, y: 0 };
  }

  function toggleMemberMoveMenu(): void {
    memberMoveMenuOpen.value = true;
  }

  async function moveMemberDirect(member: ChannelMember, targetChannelId: string): Promise<void> {
    if (member.isSelf || !targetChannelId || targetChannelId === "__current__") return;
    const sourceChannel = channels.value.find((item) => item.members.some((candidate) => candidate.id === member.id));
    if (sourceChannel?.id === targetChannelId) {
      memberMenu.value = null;
      memberMoveMenuOpen.value = false;
      return;
    }
    memberMenu.value = null;
    memberMoveMenuOpen.value = false;
    try {
      // Member moves are server-admin operations; never request or forward a channel password.
      await moveClient(member.id, targetChannelId);
      showToast(t("moveMemberSuccess"));
    } catch (error: unknown) {
      showToast(localizedMessage(error instanceof Error ? error.message : "操作失败"), "warn");
    }
  }

  /** Right-click on the row itself opens the member menu; on controls and on
   *  the user's own row the browser menu stays available. */
  function onMemberContextMenu(member: ChannelMember, event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (member.isSelf || target?.closest("input,button,select,textarea,a")) return;
    event.preventDefault();
    openMemberMenu(member, event);
  }

  function resetMemberDragState(): void {
    draggedMember.value = null;
    dragOverChannelId.value = "";
  }

  function onMemberPointerDown(member: ChannelMember, event: PointerEvent): void {
    if (member.isSelf || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input,button")) return;
    event.preventDefault();
    memberPointerDrag.member = member;
    memberPointerDrag.pointerId = event.pointerId;
    memberPointerDrag.startX = event.clientX;
    memberPointerDrag.startY = event.clientY;
    memberPointerDrag.active = false;
    memberPointerDrag.targetChannelId = "";
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function onMemberPointerMove(event: PointerEvent): void {
    if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - memberPointerDrag.startX, event.clientY - memberPointerDrag.startY);
    if (!memberPointerDrag.active && distance < 6) return;
    event.preventDefault();
    memberPointerDrag.active = true;
    draggedMember.value = memberPointerDrag.member;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-channel-id]");
    const targetChannelId = target?.dataset.memberChannelId ?? "";
    const sourceChannel = channels.value.find((item) => item.members.some((candidate) => candidate.id === memberPointerDrag.member?.id));
    if (!sourceChannel || !targetChannelId || targetChannelId === sourceChannel.id) {
      memberPointerDrag.targetChannelId = "";
      dragOverChannelId.value = "";
      return;
    }
    memberPointerDrag.targetChannelId = targetChannelId;
    dragOverChannelId.value = targetChannelId;
  }

  function onMemberPointerUp(event: PointerEvent): void {
    if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
    const member = memberPointerDrag.member;
    const targetChannelId = memberPointerDrag.targetChannelId;
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.releasePointerCapture?.(event.pointerId);
    memberPointerDrag.member = null;
    memberPointerDrag.pointerId = null;
    memberPointerDrag.active = false;
    memberPointerDrag.targetChannelId = "";
    resetMemberDragState();
    if (targetChannelId) void moveMemberDirect(member, targetChannelId);
  }

  function onMemberPointerCancel(event: PointerEvent): void {
    if (!memberPointerDrag.member || memberPointerDrag.pointerId !== event.pointerId) return;
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.releasePointerCapture?.(event.pointerId);
    memberPointerDrag.member = null;
    memberPointerDrag.pointerId = null;
    memberPointerDrag.active = false;
    memberPointerDrag.targetChannelId = "";
    resetMemberDragState();
  }

  function toggleWhisperTarget(member: ChannelMember): void {
    if (member.isSelf) return;
    const targets = new Set(whisperTargetIds);
    if (targets.has(member.id)) {
      targets.delete(member.id);
      setWhisperTargets([...targets]);
      showToast(t("removeWhisperTarget"));
    } else if (targets.size < 8) {
      targets.add(member.id);
      setWhisperTargets([...targets]);
      showToast(t("setWhisperTarget"));
    } else {
      // A silent no-op used to announce itself as "removed" — say why instead.
      showToast(t("whisperTargetLimitReached"), "warn");
    }
  }

  function clearWhisperTargets(): void {
    stopWhisperTalk();
    setWhisperTargets([]);
  }

  function pokeMember(member: ChannelMember): void {
    sendPoke(member.id, window.prompt(t("pokeMessagePrompt"), "") ?? "");
    showToast(t("pokeSent"));
  }

  function copyMemberName(member: ChannelMember): void {
    navigator.clipboard?.writeText(member.nickname).then(
      () => showToast(t("copiedNickname")),
      () => showToast(t("copyFailedToast")),
    );
  }

  function toggleAway(): void {
    onManualStatusChange?.();
    away.value = !away.value;
    awayMessage.value = away.value ? (window.prompt(t("awayPrompt"), awayMessage.value) ?? "") : "";
    setAway(away.value, awayMessage.value);
  }

  function setAutomaticAway(value: boolean): void {
    away.value = value;
    if (!value) awayMessage.value = "";
    setAway(value, awayMessage.value);
  }

  function isSpeaking(member: ChannelMember): boolean {
    return speakingIds.has(member.id);
  }

  function memberDisplayName(member: ChannelMember): string {
    return member.isSelf ? `${member.nickname}${t("selfSuffix")}` : member.nickname;
  }

  return {
    away,
    memberMenu,
    memberMoveMenuOpen,
    draggedMember,
    dragOverChannelId,
    memberPointerDrag,
    memberMoveMenuCurrentChannel,
    memberMoveMenuCurrentSameChannel,
    memberMoveMenuOtherChannels,
    openMemberMenu,
    openMemberActions,
    setAutomaticAway,
    toggleMemberMoveMenu,
    moveMemberDirect,
    onMemberContextMenu,
    onMemberPointerDown,
    onMemberPointerMove,
    onMemberPointerUp,
    onMemberPointerCancel,
    toggleWhisperTarget,
    clearWhisperTargets,
    pokeMember,
    copyMemberName,
    toggleAway,
    isSpeaking,
    memberDisplayName,
  };
}
