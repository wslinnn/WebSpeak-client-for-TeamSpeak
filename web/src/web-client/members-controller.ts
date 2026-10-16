import { createStore } from "zustand/vanilla";

import type { ChannelMember } from "@shared/voice-models";
import type { TreeChannel } from "./channel-tree";

export interface MemberMenuState {
  member: ChannelMember;
  x: number;
  y: number;
}

interface MemberDragState {
  member: ChannelMember | null;
  pointerId: number | null;
  startX: number;
  startY: number;
  active: boolean;
  targetChannelId: string;
}

export interface MembersStore {
  away: boolean;
  awayMessage: string;
  memberMenu: MemberMenuState | null;
  memberMoveMenuOpen: boolean;
  draggedMember: ChannelMember | null;
  dragOverChannelId: string;
}

interface Options {
  /** 频道目录读取（含成员注入的展示树）。 */
  getChannels(): TreeChannel[];
  /** 当前频道（移人子菜单的「回到我的频道」语义）。 */
  getCurrentChannel(): TreeChannel | undefined;
  moveClient(clientId: number, targetChannelId: string): Promise<void>;
  setWhisperTargets(clientIds: number[]): void;
  sendPoke(clientId: number, message: string): Promise<void>;
  setAway(away: boolean, message: string): void;
  onManualStatusChange?(): void;
  stopWhisperTalk(): void;
  /** 耳语目标集合读取（toggle 需要最新集合）。 */
  getWhisperTargetIds(): ReadonlySet<number>;
  localizedMessage(message: string): string;
  showToast(message: string, tone?: "info" | "warn"): void;
  t(key: string, variables?: Record<string, string | number>): string;
  /** 测试注入点：生产用 window.prompt。 */
  prompt?(message: string, initial?: string): string | null;
}

/** 成员交互控制器（旧 useWebClientMembers 平价）：成员菜单/管理员移人/耳语目标
 *  （≤8 上限）/poke/离开状态/昵称复制/成员拖拽换频道。指针拖拽直接操作 DOM
 *  （elementFromPoint + pointer capture），不进 store 的只有瞬时拖拽轨迹。 */
export function createMembersController(options: Options) {
  const store = createStore<MembersStore>(() => ({
    away: false,
    awayMessage: "",
    memberMenu: null,
    memberMoveMenuOpen: false,
    draggedMember: null,
    dragOverChannelId: "",
  }));
  const state = () => store.getState();
  const patch = (partial: Partial<MembersStore>) => store.setState(partial);
  const pointerDrag: MemberDragState = {
    member: null, pointerId: null, startX: 0, startY: 0, active: false, targetChannelId: "",
  };
  const prompt = options.prompt ?? ((message: string, initial?: string) => window.prompt(message, initial));

  function memberMoveMenuCurrentChannel(): TreeChannel | null {
    const member = state().memberMenu?.member;
    const currentChannel = options.getCurrentChannel();
    if (!member || !currentChannel || currentChannel.id === "__current__") return null;
    return currentChannel;
  }
  function memberMoveMenuCurrentSameChannel(): boolean {
    const member = state().memberMenu?.member;
    const currentId = memberMoveMenuCurrentChannel()?.id;
    if (!member || !currentId) return false;
    return options.getChannels().find((item) => item.members.some((candidate) => candidate.id === member.id))?.id === currentId;
  }
  function memberMoveMenuOtherChannels(): TreeChannel[] {
    const member = state().memberMenu?.member;
    if (!member) return [];
    const sourceChannelId = options.getChannels().find((item) => item.members.some((candidate) => candidate.id === member.id))?.id ?? "";
    const currentChannelId = memberMoveMenuCurrentChannel()?.id;
    return options.getChannels().filter((item) => item.id !== "__current__" && item.id !== sourceChannelId && item.id !== currentChannelId);
  }

  function openMemberMenu(member: ChannelMember, event?: MouseEvent): void {
    if (member.isSelf) return;
    patch({ memberMoveMenuOpen: false });
    patch({
      memberMenu: {
        member,
        x: Math.min(event?.clientX ?? 20, Math.max(12, window.innerWidth - 210)),
        y: Math.min(event?.clientY ?? 20, Math.max(12, window.innerHeight - 170)),
      },
    });
  }

  function openMemberActions(member: ChannelMember): void {
    if (member.isSelf) return;
    patch({ memberMoveMenuOpen: false, memberMenu: { member, x: 0, y: 0 } });
  }

  function closeMemberMenu(): void {
    patch({ memberMenu: null });
  }

  function toggleMemberMoveMenu(): void {
    patch({ memberMoveMenuOpen: !state().memberMoveMenuOpen });
  }

  async function moveMemberDirect(member: ChannelMember, targetChannelId: string): Promise<void> {
    if (member.isSelf || !targetChannelId || targetChannelId === "__current__") return;
    const sourceChannel = options.getChannels().find((item) => item.members.some((candidate) => candidate.id === member.id));
    if (sourceChannel?.id === targetChannelId) {
      patch({ memberMenu: null, memberMoveMenuOpen: false });
      return;
    }
    patch({ memberMenu: null, memberMoveMenuOpen: false });
    try {
      // 移人是服务器管理员操作：绝不请求或转发频道密码。
      await options.moveClient(member.id, targetChannelId);
      options.showToast(options.t("moveMemberSuccess"));
    } catch (error: unknown) {
      options.showToast(options.localizedMessage(error instanceof Error ? error.message : "操作失败"), "warn");
    }
  }

  /** 行内右键开成员菜单；控件与自己所在行保留浏览器原生菜单。 */
  function onMemberContextMenu(member: ChannelMember, event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (member.isSelf || target?.closest("input,button,select,textarea,a")) return;
    event.preventDefault();
    openMemberMenu(member, event);
  }

  function resetMemberDragState(): void {
    patch({ draggedMember: null, dragOverChannelId: "" });
  }

  function onMemberPointerDown(member: ChannelMember, event: PointerEvent): void {
    if (member.isSelf || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input,button")) return;
    event.preventDefault();
    pointerDrag.member = member;
    pointerDrag.pointerId = event.pointerId;
    pointerDrag.startX = event.clientX;
    pointerDrag.startY = event.clientY;
    pointerDrag.active = false;
    pointerDrag.targetChannelId = "";
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function onMemberPointerMove(event: PointerEvent): void {
    if (!pointerDrag.member || pointerDrag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.active && distance < 6) return;
    event.preventDefault();
    pointerDrag.active = true;
    patch({ draggedMember: pointerDrag.member });
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-member-channel-id]");
    const targetChannelId = target?.dataset.memberChannelId ?? "";
    const sourceChannel = options.getChannels().find((item) => item.members.some((candidate) => candidate.id === pointerDrag.member?.id));
    if (!sourceChannel || !targetChannelId || targetChannelId === sourceChannel.id) {
      pointerDrag.targetChannelId = "";
      patch({ dragOverChannelId: "" });
      return;
    }
    pointerDrag.targetChannelId = targetChannelId;
    patch({ dragOverChannelId: targetChannelId });
  }

  function onMemberPointerUp(event: PointerEvent): void {
    if (!pointerDrag.member || pointerDrag.pointerId !== event.pointerId) return;
    const member = pointerDrag.member;
    const targetChannelId = pointerDrag.targetChannelId;
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.releasePointerCapture?.(event.pointerId);
    pointerDrag.member = null;
    pointerDrag.pointerId = null;
    pointerDrag.active = false;
    pointerDrag.targetChannelId = "";
    resetMemberDragState();
    if (targetChannelId) void moveMemberDirect(member, targetChannelId);
  }

  function onMemberPointerCancel(event: PointerEvent): void {
    if (!pointerDrag.member || pointerDrag.pointerId !== event.pointerId) return;
    const currentTarget = event.currentTarget as HTMLElement | null;
    currentTarget?.releasePointerCapture?.(event.pointerId);
    pointerDrag.member = null;
    pointerDrag.pointerId = null;
    pointerDrag.active = false;
    pointerDrag.targetChannelId = "";
    resetMemberDragState();
  }

  function toggleWhisperTarget(member: ChannelMember): void {
    if (member.isSelf) return;
    const targets = new Set(options.getWhisperTargetIds());
    if (targets.has(member.id)) {
      targets.delete(member.id);
      options.setWhisperTargets([...targets]);
      options.showToast(options.t("removeWhisperTarget"));
    } else if (targets.size < 8) {
      targets.add(member.id);
      options.setWhisperTargets([...targets]);
      options.showToast(options.t("setWhisperTarget"));
    } else {
      // 静默 no-op 曾自我宣称「已移除」——改为说明原因。
      options.showToast(options.t("whisperTargetLimitReached"), "warn");
    }
  }

  function clearWhisperTargets(): void {
    options.stopWhisperTalk();
    options.setWhisperTargets([]);
  }

  function pokeMember(member: ChannelMember): void {
    // 只有「取消」不发送；空文本是合法 poke（TS 允许空消息），旧守卫把空串
    // 一并拦掉是错误继承——应答式失败本来就会把网关原因亮出来，无需前端预拦。
    const message = prompt(options.t("pokeMessagePrompt"), "");
    if (message === null) return;
    // 应答式：成功才报「已发送」，失败把网关原因（权限/离线/超时）直接亮出来。
    options.sendPoke(member.id, message).then(
      () => options.showToast(options.t("pokeSent")),
      (error: unknown) => options.showToast(
        error instanceof Error && error.message ? error.message : options.t("pokeFailed"),
        "warn",
      ),
    );
  }

  function copyMemberName(member: ChannelMember): void {
    navigator.clipboard?.writeText(member.nickname).then(
      () => options.showToast(options.t("copiedNickname")),
      () => options.showToast(options.t("copyFailedToast")),
    );
  }

  function toggleAway(): void {
    options.onManualStatusChange?.();
    if (!state().away) {
      // 取消的 prompt 保持现有状态不变；空留言是合法的「离开无备注」。
      const message = prompt(options.t("awayPrompt"), state().awayMessage);
      if (message === null) return;
      patch({ away: true, awayMessage: message });
      options.setAway(true, message);
      return;
    }
    patch({ away: false, awayMessage: "" });
    options.setAway(false, "");
  }

  function setAutomaticAway(value: boolean): void {
    const message = value ? state().awayMessage : "";
    patch({ away: value, awayMessage: message });
    options.setAway(value, message);
  }

  function memberDisplayName(member: ChannelMember): string {
    return member.isSelf ? `${member.nickname}${options.t("selfSuffix")}` : member.nickname;
  }

  return {
    store,
    memberMoveMenuCurrentChannel,
    memberMoveMenuCurrentSameChannel,
    memberMoveMenuOtherChannels,
    openMemberMenu,
    openMemberActions,
    closeMemberMenu,
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
    setAutomaticAway,
    memberDisplayName,
  };
}

export type MembersController = ReturnType<typeof createMembersController>;
