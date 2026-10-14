// @vitest-environment jsdom
// 旧 useWebClientMembers 无专属旧测试（行为经视图消费），按移植体补行为级
// characterization：菜单开合、移人守卫、耳语上限、poke/away 的 prompt 纪律。
// jsdom：onMemberContextMenu 的 instanceof Element 守卫需要 DOM 类型。
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { ChannelMember } from "@shared/voice-models";
import { buildChannelTree, type TreeChannel } from "./channel-tree";
import { createMembersController } from "./members-controller";

function harness(channels: Partial<TreeChannel>[] = [], whisperIds: number[] = []) {
  const tree = buildChannelTree(channels as never, 1) as TreeChannel[];
  const whispers = createStore<{ ids: number[] }>(() => ({ ids: whisperIds }));
  const toasts: Array<[string, string?]> = [];
  const prompts: string[] = [];
  const controller = createMembersController({
    getChannels: () => tree,
      getCurrentChannel: () => undefined,
    moveClient: vi.fn(async () => undefined),
    setWhisperTargets: (ids) => whispers.setState({ ids }),
    sendPoke: vi.fn(),
    setAway: vi.fn(),
    stopWhisperTalk: vi.fn(),
    getWhisperTargetIds: () => new Set(whispers.getState().ids),
    localizedMessage: (message) => message,
    showToast: (message, tone) => toasts.push([message, tone]),
    t: (key) => key,
    prompt: (message) => { prompts.push(message); return "poke!"; },
  });
  const member = (id: number, nickname = `M${id}`): ChannelMember => ({ id, nickname, isSelf: id === 1 });
  return { controller, toasts, prompts, whispers, member };
}

describe("members controller（成员交互）", () => {
  it("self rows never open menus; openMemberActions clears the move submenu", () => {
    const { controller, member } = harness();
    controller.openMemberActions(member(1, "Me"));
    // id 1 = clientId → isSelf 在树构建时注入
    expect(controller.store.getState().memberMenu).toBeNull();
    controller.openMemberActions(member(9));
    expect(controller.store.getState().memberMenu?.member.id).toBe(9);
    controller.toggleMemberMoveMenu();
    expect(controller.store.getState().memberMoveMenuOpen).toBe(true);
    controller.openMemberActions(member(8));
    expect(controller.store.getState().memberMoveMenuOpen).toBe(false);
    expect(controller.store.getState().memberMenu?.member.id).toBe(8);
  });

  it("context menu on control elements keeps the browser menu; plain rows open the member menu", () => {
    const { controller, member } = harness();
    const control = document.createElement("button");
    const controlEvent = { target: control, preventDefault: vi.fn() } as unknown as MouseEvent;
    controller.onMemberContextMenu(member(9), controlEvent);
    expect(controlEvent.preventDefault).not.toHaveBeenCalled();
    expect(controller.store.getState().memberMenu).toBeNull();

    const plain = document.createElement("span");
    const plainEvent = { target: plain, preventDefault: vi.fn() } as unknown as MouseEvent;
    controller.onMemberContextMenu(member(9), plainEvent);
    expect(plainEvent.preventDefault).toHaveBeenCalled();
    expect(controller.store.getState().memberMenu?.member.id).toBe(9);
  });

  it("whisper toggling flips membership and the 8-target cap warns instead of lying", () => {
    const { controller, member, toasts, whispers } = harness([], [1, 2, 3, 4, 5, 6, 7, 8]);
    controller.toggleWhisperTarget(member(9));
    expect(toasts.at(-1)?.[0]).toBe("whisperTargetLimitReached");
    expect(toasts.at(-1)?.[1]).toBe("warn");
    expect(whispers.getState().ids).toHaveLength(8);
    controller.toggleWhisperTarget(member(8));
    expect(whispers.getState().ids).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(toasts.at(-1)?.[0]).toBe("removeWhisperTarget");
    controller.toggleWhisperTarget(member(8));
    expect(whispers.getState().ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(toasts.at(-1)?.[0]).toBe("setWhisperTarget");
  });

  it("a cancelled or empty poke prompt sends nothing", () => {
    const sendPoke = vi.fn();
    const tree = buildChannelTree([], 1) as TreeChannel[];
    const toasts: string[] = [];
    const controller = createMembersController({
      getChannels: () => tree,
      getCurrentChannel: () => undefined,
      moveClient: vi.fn(async () => undefined),
      setWhisperTargets: () => {},
      sendPoke,
      setAway: () => {},
      stopWhisperTalk: () => {},
      getWhisperTargetIds: () => new Set(),
      localizedMessage: (message) => message,
      showToast: (message) => toasts.push(message),
      t: (key) => key,
      prompt: () => "   ",
    });
    controller.pokeMember({ id: 9, nickname: "Nine" });
    expect(sendPoke).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it("moving a member within its own channel is a silent no-op; success toasts otherwise", async () => {
    const moveClient = vi.fn(async () => undefined);
    const tree = buildChannelTree([
      { id: "1", name: "Lobby", members: [{ id: 9, nickname: "Nine" }] },
      { id: "2", name: "Games" },
    ] as never, 1) as TreeChannel[];
    const toasts: Array<[string, string?]> = [];
    const controller = createMembersController({
      getChannels: () => tree,
      getCurrentChannel: () => undefined,
      moveClient,
      setWhisperTargets: () => {},
      sendPoke: () => {},
      setAway: () => {},
      stopWhisperTalk: () => {},
      getWhisperTargetIds: () => new Set(),
      localizedMessage: (message) => message,
      showToast: (message, tone) => toasts.push([message, tone]),
      t: (key) => key,
    });
    const nine = { id: 9, nickname: "Nine" };
    await controller.moveMemberDirect(nine, "1");
    expect(moveClient).not.toHaveBeenCalled();
    await controller.moveMemberDirect(nine, "2");
    expect(moveClient).toHaveBeenCalledWith(9, "2");
    expect(toasts.at(-1)?.[0]).toBe("moveMemberSuccess");
    // 菜单在两种路径下都收起
    expect(controller.store.getState().memberMenu).toBeNull();
  });

  it("toggleAway prompts only when going away; a dismissed prompt keeps the current status", () => {
    const setAway = vi.fn();
    const tree = buildChannelTree([], 1) as TreeChannel[];
    let answer: string | null = null;
    const controller = createMembersController({
      getChannels: () => tree,
      getCurrentChannel: () => undefined,
      moveClient: vi.fn(async () => undefined),
      setWhisperTargets: () => {},
      sendPoke: () => {},
      setAway,
      stopWhisperTalk: () => {},
      getWhisperTargetIds: () => new Set(),
      localizedMessage: (message) => message,
      showToast: () => {},
      t: (key) => key,
      prompt: () => answer,
    });
    controller.toggleAway();
    expect(controller.store.getState().away).toBe(false);
    expect(setAway).not.toHaveBeenCalled();
    answer = "brb";
    controller.toggleAway();
    expect(controller.store.getState().away).toBe(true);
    expect(setAway).toHaveBeenCalledWith(true, "brb");
    // 已离开状态再切换直接恢复在线，不弹 prompt
    controller.toggleAway();
    expect(controller.store.getState().away).toBe(false);
    expect(setAway).toHaveBeenLastCalledWith(false, "");
  });
});
