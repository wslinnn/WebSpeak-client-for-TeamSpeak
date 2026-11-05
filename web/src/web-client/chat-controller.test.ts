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
    mergeChatHistory: (additions) => {
      const known = new Set(session.getState().chatMessages.map((message) => message.id));
      session.setState({ chatMessages: [...session.getState().chatMessages, ...additions.filter((message) => !known.has(message.id))] });
    },
    removeChatMessages: (match) => {
      session.setState({ chatMessages: session.getState().chatMessages.filter((message) => !match(message)) });
    },
    deleteChatHistoryWhere: vi.fn(async () => undefined),
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
    // 身份分离的意图断言：旧匿名发送者的会话保留原名并按离线排尾；新成员的
    // seed 会话（成员键）独立成条，两者不得合并或互相顶替。
    const list = controller.conversations();
    const legacy = list.find((conversation) => conversation.name === "Unknown old sender");
    expect(legacy?.offline).toBe(true);
    expect(list.some((conversation) => conversation.key === `client:${JSON.stringify([7, "New legacy member"])}`)).toBe(true);
  });
});

describe("chat controller（私聊 seed 与未读）", () => {
  const peerMember = { id: 7, uid: "peer", nickname: "Peer" };
  const peerMessage = (id: string, timestamp: number): ChatMessage => ({
    id, scope: "private", senderId: 7, senderUid: "peer", invokerName: "Peer", message: `Hello ${id}`, timestamp, conversationId: "7",
  });

  it("an initiated private chat shows up before any messages exist", () => {
    const { controller, session } = harness();
    session.setState({ members: [peerMember] });
    controller.openPrivateChat(7);
    expect(controller.conversations()).toEqual([{ id: 7, key: "uid:peer", name: "Peer", lastMessage: 0, offline: false }]);
    expect(controller.visibleMessages()).toHaveLength(0);
  });

  it("the seeded conversation merges into the message-derived entry instead of duplicating", () => {
    const { controller, session } = harness();
    session.setState({ members: [peerMember] });
    controller.openPrivateChat(7);
    session.setState({ chatMessages: [peerMessage("m1", 5)] });
    const list = controller.conversations();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: "uid:peer", name: "Peer", lastMessage: 5, offline: false });
  });

  it("a seeded conversation whose peer left the channel is marked offline", () => {
    const { controller, session } = harness();
    session.setState({ members: [peerMember] });
    controller.openPrivateChat(7);
    session.setState({ members: [] });
    expect(controller.conversations()[0]?.offline).toBe(true);
  });

  it("a session epoch reset clears seeded conversations and unread counters", () => {
    const { controller, home, session, store } = harness();
    session.setState({ members: [peerMember] });
    controller.openPrivateChat(7);
    store.setState({ unreadPrivate: { "uid:peer": 3 } });
    session.setState({ epoch: 1 });
    expect(controller.conversations()).toHaveLength(0);
    expect(store.getState().unreadPrivate).toEqual({});
    expect(home.getState().chatTab).toBe("channel");
  });

  it("incoming private messages accumulate unread while not actively viewed", async () => {
    const { controller, session, store } = harness();
    session.setState({ members: [peerMember] });
    session.setState({ chatMessages: [peerMessage("m1", 1)] });
    await tick();
    // 默认在频道页签：会话未激活，未读累计
    expect(store.getState().unreadPrivate["uid:peer"]).toBe(1);
    session.setState({ chatMessages: [peerMessage("m1", 1), peerMessage("m2", 2)] });
    await tick();
    expect(store.getState().unreadPrivate["uid:peer"]).toBe(2);
    // 激活该会话（面板可见）后新消息不再累计
    controller.openPrivateChat(7);
    session.setState({ chatMessages: [peerMessage("m1", 1), peerMessage("m2", 2), peerMessage("m3", 3)] });
    await tick();
    expect(store.getState().unreadPrivate["uid:peer"]).toBe(2);
    expect(store.getState().unreadPrivate).toEqual({ "uid:peer": 2 });
  });

  it("a folded chat column still accumulates unread for the active conversation", async () => {
    const { controller, session, store } = harness();
    controller.setDesktopCollapsed(true);
    session.setState({ members: [peerMember] });
    controller.openPrivateChat(7);
    session.setState({ chatMessages: [peerMessage("m1", 1)] });
    await tick();
    expect(store.getState().unreadPrivate["uid:peer"]).toBe(1);
  });

  it("markPrivateRead clears the counter and tolerates repeated calls", () => {
    const { controller, store } = harness();
    store.setState({ unreadPrivate: { "uid:peer": 3, "uid:other": 1 } });
    controller.markPrivateRead("uid:peer");
    expect(store.getState().unreadPrivate).toEqual({ "uid:other": 1 });
    controller.markPrivateRead("uid:peer");
    expect(store.getState().unreadPrivate).toEqual({ "uid:other": 1 });
  });

  it("a single batch landing for two conversations counts each key separately", async () => {
    const { session, store } = harness();
    session.setState({ chatMessages: [peerMessage("m1", 1)] });
    await tick();
    session.setState({ chatMessages: [peerMessage("m1", 1), { ...peerMessage("m2", 2), senderId: 8, senderUid: "other", conversationId: "8" }] });
    await tick();
    expect(store.getState().unreadPrivate).toEqual({ "uid:peer": 1, "uid:other": 1 });
  });

  it("self-sent history without a stored key resolves the peer uid so the tab stays merged", async () => {
    const { controller, session } = harness();
    session.setState({ members: [peerMember] });
    // 对方旧 clid=7 的自发历史消息（无 conversationKey，旧版持久化数据形态）：
    // key 必须反查在册成员 uid 归并进 uid 锚会话，而不是分裂成 client:[7,""]。
    session.setState({
      chatMessages: [
        { ...peerMessage("s1", 1), isSelf: true, senderId: 1, message: "Sent old" },
        peerMessage("r1", 2),
      ],
    });
    await tick();
    const conversations = controller.conversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.key).toBe("uid:peer");
    controller.openPrivateChat(7);
    expect(controller.visibleMessages()).toHaveLength(2);
  });

  it("deleting a private conversation clears messages, seed, unread and exits the tab", async () => {
    const deleteSpy = vi.fn(async (_serverKey: string, _match: (key: string) => boolean) => undefined);
    const { controller, session, store, home } = harness({ deleteChatHistoryWhere: deleteSpy });
    session.setState({ members: [peerMember] });
    // 默认频道页签：他人私聊先到达，未读累计
    session.setState({ chatMessages: [peerMessage("m1", 1)] });
    await tick();
    expect(store.getState().unreadPrivate["uid:peer"]).toBe(1);
    // 激活会话后到达一条自发消息（对话完整），随后按页签删除
    controller.openPrivateChat(7);
    session.setState({
      chatMessages: [
        peerMessage("m1", 1),
        { ...peerMessage("s1", 2), isSelf: true, senderId: 1, conversationKey: "uid:peer" },
      ],
    });
    await tick();
    controller.deleteTabHistory("private", "uid:peer");
    expect(session.getState().chatMessages).toHaveLength(0);
    expect(store.getState().unreadPrivate).toEqual({});
    expect(store.getState().privateConversationKey).toBe("");
    expect(home.getState().chatTab).toBe("channel");
    // 持久化删除谓词：uid 直译键命中，旧 clid 锚键不误删
    const match = deleteSpy.mock.calls.at(-1)?.[1];
    expect(match?.("private:uid:peer")).toBe(true);
    expect(match?.("private:client:[7,\"\"]")).toBe(false);
  });

  it("channel and server tab deletions clear their scopes from memory and persistence", async () => {
    const deleteSpy = vi.fn(async (_serverKey: string, _match: (key: string) => boolean) => undefined);
    const { controller, session } = harness({ deleteChatHistoryWhere: deleteSpy });
    session.setState({
      chatMessages: [
        { id: "c1", scope: "channel", invokerName: "Alice", message: "Hi", timestamp: 1 },
        { id: "s1", scope: "server", invokerName: "Bob", message: "Yo", timestamp: 2 },
      ],
    });
    await tick();
    controller.deleteTabHistory("channel");
    controller.deleteTabHistory("server");
    expect(session.getState().chatMessages).toHaveLength(0);
    const channelMatch = deleteSpy.mock.calls[0]?.[1];
    expect(channelMatch?.("channel:1")).toBe(true);
    expect(channelMatch?.("channel:9")).toBe(true);
    expect(channelMatch?.("private:uid:peer")).toBe(false);
    const serverMatch = deleteSpy.mock.calls[1]?.[1];
    expect(serverMatch?.("server")).toBe(true);
    expect(serverMatch?.("channel:1")).toBe(false);
  });

  it("events tab has no history deletion (memory-only, no-op)", () => {
    const deleteSpy = vi.fn(async (_serverKey: string, _match: (key: string) => boolean) => undefined);
    const { controller, session } = harness({ deleteChatHistoryWhere: deleteSpy });
    session.setState({ chatMessages: [peerMessage("m1", 1)] });
    controller.deleteTabHistory("events");
    expect(session.getState().chatMessages).toHaveLength(1);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("history replay on refresh neither counts unread nor rings the arrival sound", async () => {
    const notify = vi.fn();
    const { session, store } = harness({ notifyPrivateMessage: notify });
    // 刷新后 loadHistory 经 mergeChatHistory 整段重放持久化历史（isHistory: true）：
    // 旧消息不是「到达」，不响提示音也不复活未读角标（2026-11-05 用户报告）。
    session.setState({
      chatMessages: [
        { ...peerMessage("h1", 1), isHistory: true },
        { ...peerMessage("h2", 2), isHistory: true },
      ],
    });
    await tick();
    expect(store.getState().unreadPrivate).toEqual({});
    expect(notify).not.toHaveBeenCalled();
    // 历史重放之后，真正的新到达照常累计并响铃。
    session.setState({
      chatMessages: [
        { ...peerMessage("h1", 1), isHistory: true },
        { ...peerMessage("h2", 2), isHistory: true },
        peerMessage("m3", 3),
      ],
    });
    await tick();
    expect(store.getState().unreadPrivate).toEqual({ "uid:peer": 1 });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
