// @vitest-environment node
// 旧 voice-session.test.mjs 聊天用例的重钉（DECISIONS #10）：滚动跟随、按目的地
// 隔离的草稿/在途/错误、会话代际重置、私聊身份不随 clientId 复用漂移、卸载退役。
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { ChannelInfo, ChannelMember, ChatMessage } from "@shared/voice-models";
import { createChatController, type ChatScrollerAspect } from "./chat-controller";
import type { WebClientChatTab } from "./home-store";

const CHANNEL: ChannelInfo = { id: "1", parentID: "0", name: "Lobby" };

function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve: () => resolve(undefined), reject };
}

function harness(overrides: Partial<Parameters<typeof createChatController>[0]> = {}) {
  const home = createStore<{ chatTab: WebClientChatTab }>(() => ({ chatTab: "channel" }));
  const session = createStore<{ chatMessages: ChatMessage[]; members: ChannelMember[]; epoch: number }>(() => ({
    chatMessages: [], members: [], epoch: 0,
  }));
  const voice = createStore<{ connected: boolean }>(() => ({ connected: true }));
  const scroller: ChatScrollerAspect & { calls: Array<{ top: number; behavior?: "auto" }> } = {
    scrollHeight: 1200, clientHeight: 400, scrollTop: 800, calls: [],
    scrollTo(point) { this.calls.push(point); this.scrollTop = this.scrollHeight - this.clientHeight; },
  };
  const controller = createChatController({
    home,
    session,
    voice,
    getClientId: () => 1,
    getServerKey: () => "example.test:9987",
    getCurrentChannel: () => CHANNEL,
    getCurrentChannelName: () => "Lobby",
    getSelectedChannelId: () => "1",
    isMobileViewport: () => false,
    getMobileSection: () => "chat",
    setMobileSection: () => {},
    closeMemberMenu: () => {},
    sendTextMessage: vi.fn(async () => undefined),
    sendServerMessage: vi.fn(async () => undefined),
    sendPrivateMessage: vi.fn(async () => undefined),
    notifyPrivateMessage: vi.fn(),
    t: (key) => key,
    getList: () => scroller,
    ...overrides,
  });
  return { controller, store: controller.store, home, session, voice, scroller };
}

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("chat controller（滚动跟随）", () => {
  it("incoming chat preserves history reading and follows again when the reader returns to the bottom", async () => {
    const { controller, session, scroller } = harness();
    scroller.scrollTop = 100;
    controller.onScroll();
    session.setState({ chatMessages: [{ id: "incoming-1", scope: "channel", invokerName: "Alice", message: "Hello", timestamp: 1 }] });
    await tick(); await tick();
    expect(scroller.calls.length).toBe(0);
    controller.scrollIfFollowing(); // 键盘弹起等视口变化也不得动阅读位置
    await tick();
    expect(scroller.calls.length).toBe(0);
    scroller.scrollTop = 800;
    controller.onScroll();
    session.setState({ chatMessages: [
      { id: "incoming-1", scope: "channel", invokerName: "Alice", message: "Hello", timestamp: 1 },
      { id: "incoming-2", scope: "channel", invokerName: "Alice", message: "Latest", timestamp: 2 },
    ] });
    await tick(); await tick();
    expect(scroller.calls).toEqual([{ top: 1200, behavior: "auto" }]);
  });

  it("own messages and conversation switches reveal the latest message, unrelated chat does not move the list", async () => {
    const { controller, home, session, scroller } = harness();
    scroller.scrollTop = 100;
    controller.onScroll();
    session.setState({ chatMessages: [{ id: "elsewhere", scope: "server", invokerName: "Bob", message: "Other conversation", timestamp: 1 }] });
    await tick(); await tick();
    expect(scroller.calls.length).toBe(0);
    session.setState({ chatMessages: [
      { id: "elsewhere", scope: "server", invokerName: "Bob", message: "Other conversation", timestamp: 1 },
      { id: "own", scope: "channel", invokerName: "Me", message: "Sent", timestamp: 2, isSelf: true },
    ] });
    await tick(); await tick();
    expect(scroller.calls.length).toBe(1);
    scroller.scrollTop = 100;
    controller.onScroll();
    home.setState({ chatTab: "server" });
    await tick(); await tick();
    expect(scroller.calls.length).toBeGreaterThan(1);
    expect(scroller.scrollTop).toBe(800);
  });

  it("hidden mobile chat defers scrolling until shown and ignores zero-height scroll events", async () => {
    let mobileSection: "channels" | "chat" | "voice" | "more" = "voice";
    const { controller, session, scroller } = harness({
      isMobileViewport: () => true,
      getMobileSection: () => mobileSection,
    });
    scroller.clientHeight = 0;
    controller.onScroll();
    session.setState({ chatMessages: [{ id: "mobile", scope: "channel", invokerName: "Alice", message: "Hello", timestamp: 1 }] });
    await tick(); await tick();
    expect(scroller.calls.length).toBe(0);
    scroller.clientHeight = 400;
    mobileSection = "chat";
    controller.scrollIfFollowing();
    await tick();
    expect(scroller.calls.length).toBe(1);
  });
});

describe("chat controller（提交与代际）", () => {
  it("chat submission keeps rejected drafts, coalesces clicks and preserves newer typing", async () => {
    let pending = deferred();
    let calls = 0;
    const { controller, store } = harness({
      sendTextMessage: vi.fn(() => { calls++; return pending.promise; }) as never,
    });
    store.setState({ messageDraft: "Keep this" });
    const first = controller.submitMessage();
    const duplicate = controller.submitMessage();
    expect(calls).toBe(1);
    pending.reject(new Error("Rejected"));
    await Promise.all([first, duplicate]);
    expect(store.getState().messageDraft).toBe("Keep this");
    expect(store.getState().sendError).toBe("chatSendFailed");
    pending = deferred();
    const next = controller.submitMessage();
    store.setState({ messageDraft: "New typing" });
    pending.resolve();
    await next;
    expect(store.getState().messageDraft).toBe("New typing");
    pending = deferred();
    const final = controller.submitMessage();
    pending.resolve();
    await final;
    expect(store.getState().messageDraft).toBe("");
  });

  it("changing servers (session epoch bump) resets private selection and draft", async () => {
    const { controller, home, session, store } = harness();
    session.setState({ members: [{ id: 7, uid: "old", nickname: "Old" }] });
    controller.openPrivateChat(7);
    store.setState({ messageDraft: "Old private draft" });
    expect(store.getState().privateClientId).toBe(7);
    // 换服：代际递增 + 目录换新（旧 id 7 被新成员复用）
    session.setState({ epoch: 1, members: [{ id: 7, uid: "new", nickname: "New" }], chatMessages: [] });
    await tick();
    expect(store.getState().privateClientId).toBe(0);
    expect(home.getState().chatTab).toBe("channel");
    expect(store.getState().messageDraft).toBe("");
  });

  it("private history and selection do not follow a reused client ID", async () => {
    const { controller, session, store } = harness();
    session.setState({ members: [{ id: 7, uid: "old", nickname: "Old" }] });
    session.setState({ chatMessages: [{ id: "p1", scope: "private", senderId: 7, senderUid: "old", invokerName: "Old", message: "Old private message", timestamp: 1, conversationId: "7" }] });
    controller.openPrivateChat(7);
    store.setState({ messageDraft: "For old user" });
    // 旧成员离开、新成员复用 id 7：recipient 键失配 → 提交被拒且草稿保留
    session.setState({ members: [{ id: 7, uid: "new", nickname: "New" }] });
    await controller.submitMessage();
    expect(store.getState().sendError).toBe("chatTargetUnavailable");
    expect(store.getState().messageDraft).toBe("For old user");
    expect(controller.conversations()[0]?.name).toBe("Old");
    // 重开会话落在新成员的键上：不继承旧成员的私聊历史
    controller.openPrivateChat(7);
    expect(controller.visibleMessages()).toHaveLength(0);
    expect(store.getState().sendError).toBe("");
  });

  it("a disposed controller retires pending feedback and later submissions are no-ops", async () => {
    const pending = deferred();
    let calls = 0;
    const { controller, store } = harness({
      sendTextMessage: vi.fn(() => { calls++; return pending.promise; }) as never,
    });
    store.setState({ messageDraft: "Keep" });
    const sending = controller.submitMessage();
    controller.dispose();
    pending.reject(new Error("Late rejection"));
    await sending;
    await controller.submitMessage();
    expect(calls).toBe(1);
    expect(store.getState().messageDraft).toBe("Keep");
    expect(store.getState().sendError).toBe("");
  });

  it("returning to a pending conversation cannot submit it twice", async () => {
    const pending = deferred();
    let calls = 0;
    const { controller, home, store } = harness({
      sendTextMessage: vi.fn(() => { calls++; return pending.promise; }) as never,
    });
    store.setState({ messageDraft: "In flight" });
    const sending = controller.submitMessage();
    home.setState({ chatTab: "server" });
    store.setState({ messageDraft: "Server draft" });
    home.setState({ chatTab: "channel" });
    const duplicate = controller.submitMessage();
    expect(calls).toBe(1);
    home.setState({ chatTab: "server" });
    pending.resolve();
    await Promise.all([sending, duplicate]);
    expect(store.getState().messageDraft).toBe("Server draft");
    home.setState({ chatTab: "channel" });
    expect(store.getState().messageDraft).toBe("");
  });

  it("an unidentified private sender cannot become a later member with the same numeric ID", () => {
    const { controller, session } = harness();
    session.setState({ chatMessages: [{ id: "u1", scope: "private", senderId: 7, invokerName: "Unknown old sender", message: "Old", timestamp: 1, conversationId: "7" }] });
    session.setState({ members: [{ id: 7, nickname: "New legacy member" }] });
    controller.openPrivateChat(7);
    expect(controller.visibleMessages()).toHaveLength(0);
    expect(controller.conversations()[0]?.name).toBe("Unknown old sender");
  });
});
