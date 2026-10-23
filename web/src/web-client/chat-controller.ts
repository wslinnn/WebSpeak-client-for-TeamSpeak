import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand";

import type { ChannelInfo, ChannelMember, ChatMessage } from "@shared/voice-models";
import { loadChatHistory, normalizeChatHistoryServerKey, saveChatHistoryMessage } from "@/services/local-persistence";
import type { MobileSection } from "./mobile-section";
import type { WebClientChatTab } from "./home-store";

export type { WebClientChatTab as ChatTab };

interface PrivateConversation {
  id: number;
  key: string;
  name: string;
  lastMessage: number;
}

export interface ChatStore {
  privateClientId: number;
  privateConversationKey: string;
  messageDraft: string;
  sending: boolean;
  sendError: string;
}

/** 滚动容器切面（旧 listElement ref）：视图传 HTMLElement，测试传桩。 */
export interface ChatScrollerAspect {
  clientHeight: number;
  scrollTop: number;
  scrollHeight: number;
  scrollTo(point: { top: number; behavior?: "auto" }): void;
}

interface Options {
  /** 页签权威在 home store（home-connection 的 selectChannel 乐观补位也写它）。 */
  home: StoreApi<{ chatTab: WebClientChatTab }>;
  /** 会话目录/消息快照 store（chatMessages/members/epoch）。 */
  session: StoreApi<{ chatMessages: ChatMessage[]; members: ChannelMember[]; epoch: number }>;
  voice: StoreApi<{ connected: boolean }>;
  getClientId(): number;
  getServerKey(): string;
  getCurrentChannel(): ChannelInfo | undefined;
  getCurrentChannelName(): string;
  getSelectedChannelId(): string;
  isMobileViewport(): boolean;
  getMobileSection(): MobileSection;
  setMobileSection(section: MobileSection): void;
  closeMemberMenu(): void;
  sendTextMessage(text: string, targetId?: string): Promise<void>;
  sendServerMessage(text: string): Promise<void>;
  sendPrivateMessage(clientId: number, text: string, conversationId?: string, expectedKey?: string): Promise<void>;
  notifyPrivateMessage(): void;
  t(key: string, variables?: Record<string, string | number>): string;
  getList(): ChatScrollerAspect | null;
}

/** 聊天控制器（旧 useWebClientChat 平价）：页签/草稿/发送中的代际纪律、按目标
 *  维度的 pending/error 隔离、历史消息持久化、滚动跟随。滚动容器的 DOM 操作经
 *  切面注入；视图在页签/移动分段/视口高度变化时调 onDestinationChanged 类钩子。 */
export function createChatController(options: Options) {
  const store = createStore<ChatStore>(() => ({
    privateClientId: 0,
    privateConversationKey: "",
    messageDraft: "",
    sending: false,
    sendError: "",
  }));
  const state = () => store.getState();
  const patch = (partial: Partial<ChatStore>) => store.setState(partial);

  const drafts = new Map<string, string>();
  const pending = new Map<string, object>();
  const errors = new Map<string, string>();
  const persistedMessageIds = new Set<string>();
  let disposed = false;
  let followingLatest = true;
  let scrollGeneration = 0;
  let historyGeneration = 0;

  const tab = () => options.home.getState().chatTab;
  const setTab = (value: WebClientChatTab) => options.home.setState({ chatTab: value });

  const memberKey = (member: ChannelMember) => member.uid ? `uid:${member.uid}` : `client:${JSON.stringify([member.id, member.nickname])}`;
  const messageKey = (message: ChatMessage) => {
    if (message.scope !== "private") return `legacy:${message.id}`;
    if (message.conversationKey?.startsWith("uid:")) return message.conversationKey;
    if (message.senderUid && !message.isSelf) return `uid:${message.senderUid}`;
    const id = Number(message.conversationId) || message.senderId || 0;
    const name = message.conversationName || (message.isSelf ? "" : message.invokerName);
    return id ? `client:${JSON.stringify([id, name])}` : `legacy:${message.id}`;
  };
  const recipient = () => options.session.getState().members.find((member) => member.id === state().privateClientId && memberKey(member) === state().privateConversationKey);
  const destination = () =>
    `${options.session.getState().epoch}:${tab()}:${tab() === "private" ? state().privateConversationKey : tab() === "channel" ? options.getCurrentChannel()?.id ?? options.getSelectedChannelId() : ""}`;

  // —— 派生（视图订阅 store 后调用，必须把订阅值作实参传入）——
  // 参数化是编译器契约：React Compiler 把方法调用按实参缓存，零参调用的键里
  // 没有订阅值，store 更新后返回陈旧数组（2026-10-23 消息不上屏根因，产物
  // 代码实锤：缓存槽键 [chat, language, members, t] 无 chatMessages）。默认
  // 参数仅保留给控制器内部调用；组件侧一律传订阅到的数组。
  function conversations(
    messages: readonly ChatMessage[] = options.session.getState().chatMessages,
    members: readonly ChannelMember[] = options.session.getState().members,
  ): PrivateConversation[] {
    const byConversation = new Map<string, PrivateConversation>();
    for (const message of messages) {
      if (message.scope !== "private" || !message.conversationId) continue;
      const id = Number(message.conversationId);
      if (!id) continue;
      const key = messageKey(message);
      const member = members.find((candidate) => memberKey(candidate) === key);
      const existing = byConversation.get(key);
      byConversation.set(key, {
        id: member?.id ?? id, key,
        name: member?.nickname ?? message.conversationName ?? existing?.name ?? (message.isSelf ? options.t("privateMessage") : message.invokerName),
        lastMessage: Math.max(existing?.lastMessage ?? 0, message.timestamp),
      });
    }
    return [...byConversation.values()].sort((left, right) => right.lastMessage - left.lastMessage);
  }

  function visibleMessages(messages: readonly ChatMessage[] = options.session.getState().chatMessages): ChatMessage[] {
    if (tab() === "server") return messages.filter((message) => message.scope === "server");
    if (tab() === "private") return messages.filter((message) => message.scope === "private" && messageKey(message) === state().privateConversationKey);
    if (tab() !== "channel") return [];
    const channelId = options.getCurrentChannel()?.id;
    return messages.filter((message) => message.scope === "channel" && (!message.targetId || message.targetId === "0" || !channelId || message.targetId === channelId));
  }

  // 渲染期取值与 status/placeholder 同法：t 由组件传入活体翻译。控制器捕获的
  // tLive 首帧是身份回退（直连恢复/早进房时即停留该态），tabLabel 曾把裸键名
  // 「textChannel」常驻画上屏。
  function tabLabel(t: (key: string, variables?: Record<string, string | number>) => string): string {
    return tab() === "channel" ? t("textChannel") : tab() === "server" ? t("serverChat") : tab() === "private" ? t("privateMessage") : t("eventLog");
  }
  function title(t: (key: string, variables?: Record<string, string | number>) => string): string {
    if (tab() === "channel") return t("channelChat", { channel: options.getCurrentChannelName() });
    if (tab() === "server") return t("serverChat");
    if (tab() === "events") return t("eventLog");
    return recipient()?.nickname ?? conversations().find((conversation) => conversation.key === state().privateConversationKey)?.name ?? t("privateMessage");
  }
  // status/placeholder 在面板渲染期取值：t 由组件传入活体翻译（控制器捕获的
  // tLive 首帧是身份回退，会把裸键名画上屏——liveI18nBox 的 effect 换算救不了
  // 渲染路径）。事件路径的 toast/错误文案仍走 tLive，首帧陈旧无影响。
  function placeholder(t: (key: string, variables?: Record<string, string | number>) => string): string {
    return tab() === "private" ? t("privateMessagePlaceholder") : tab() === "server" ? t("serverMessagePlaceholder") : t("sendMessagePlaceholder");
  }
  function canSend(): boolean {
    return options.voice.getState().connected && !state().sending && tab() !== "events" && (tab() !== "private" || Boolean(recipient()));
  }
  function status(t: (key: string, variables?: Record<string, string | number>) => string): string {
    if (state().sendError) return t(state().sendError);
    if (state().sending) return t("chatSending");
    if (!options.voice.getState().connected) return t("chatNotConnected");
    if (tab() === "private" && !recipient()) return t("chatTargetUnavailable");
    return "";
  }

  // —— 滚动跟随（旧 scrollToEnd/onScroll/scrollIfFollowing 平价） ——
  function scrollToEnd(): void {
    const list = options.getList();
    if (!disposed && list && (!options.isMobileViewport() || options.getMobileSection() === "chat")) {
      followingLatest = true;
      list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
    }
  }
  function onScroll(): void {
    const list = options.getList();
    if (list && list.clientHeight > 0) followingLatest = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
  }
  function scrollIfFollowing(): void {
    if (!followingLatest) return;
    const generation = scrollGeneration;
    queueMicrotask(() => {
      if (generation === scrollGeneration && followingLatest) scrollToEnd();
    });
  }
  function scrollToEndIfFollowing(): void {
    if (followingLatest) scrollToEnd();
  }

  // —— 动作 ——
  function openPrivateChat(targetClientId: number): void {
    const member = options.session.getState().members.find((candidate) => candidate.id === targetClientId);
    if (!member || targetClientId === options.getClientId()) return;
    openConversation({ id: targetClientId, key: memberKey(member), name: member.nickname, lastMessage: 0 });
  }

  function openConversation(conversation: PrivateConversation): void {
    if (disposed) return;
    patch({ privateClientId: conversation.id, privateConversationKey: conversation.key });
    setTab("private");
    if (options.isMobileViewport()) options.setMobileSection("chat");
    options.closeMemberMenu();
    followingLatest = true;
    scrollIfFollowing();
  }

  async function submitMessage(): Promise<void> {
    if (disposed || state().sending || !state().messageDraft.trim() || tab() === "events") return;
    if (!options.voice.getState().connected) { patch({ sendError: "chatNotConnected" }); return; }
    if (tab() === "private" && !recipient()) { patch({ sendError: "chatTargetUnavailable" }); return; }
    const text = state().messageDraft;
    const key = destination();
    const operation = {};
    pending.set(key, operation);
    errors.delete(key);
    const isCurrent = () => !disposed && pending.get(key) === operation;
    patch({ sending: true, sendError: "" });
    try {
      if (tab() === "channel") await options.sendTextMessage(text, options.getCurrentChannel()?.id ?? options.getSelectedChannelId());
      else if (tab() === "server") await options.sendServerMessage(text);
      else await options.sendPrivateMessage(state().privateClientId, text, String(state().privateClientId), state().privateConversationKey);
      if (isCurrent()) {
        if (destination() === key && state().messageDraft === text) patch({ messageDraft: "" });
        else if (drafts.get(key) === text) drafts.set(key, "");
      }
    } catch (error) {
      if (isCurrent()) {
        const code = (error as { code?: string } | null)?.code;
        const feedback = code === "CLIENT_NOT_FOUND" ? "chatTargetUnavailable" : code === "CHANNEL_CHANGED" ? "chatChannelChanged" : "chatSendFailed";
        errors.set(key, feedback);
        if (destination() === key) patch({ sendError: feedback });
      }
    } finally {
      if (isCurrent()) {
        pending.delete(key);
        if (destination() === key) patch({ sending: false });
      }
    }
  }

  // —— 订阅（旧 watch 群平价） ——
  // 目的地切换：草稿/在途/错误按目的地隔离，滚动重置为跟随。
  let lastDestination = destination();
  const unsubscribeHome = options.home.subscribe(() => {
    void loadHistory();
    const next = destination();
    if (next === lastDestination) return;
    const previous = lastDestination;
    lastDestination = next;
    scrollGeneration++;
    followingLatest = true;
    scrollIfFollowing();
    drafts.set(previous, state().messageDraft);
    patch({ messageDraft: drafts.get(next) ?? "", sending: pending.has(next), sendError: errors.get(next) ?? "" });
  });
  // 会话代际重置（旧 flush:sync watch(epoch)）+ 历史装载触发（epoch 是旧
  // watch([connected, sessionEpoch, serverKey]) 的第三个源）。
  let lastEpoch = options.session.getState().epoch;
  const unsubscribeSession = options.session.subscribe((snapshot) => {
    if (snapshot.epoch !== lastEpoch) {
      lastEpoch = snapshot.epoch;
      historyGeneration++;
      persistedMessageIds.clear();
      drafts.clear();
      pending.clear();
      errors.clear();
      patch({ privateClientId: 0, privateConversationKey: "", messageDraft: "", sending: false, sendError: "" });
      setTab("channel");
      lastDestination = destination();
    }
    void loadHistory();
  });
  // 消息增量：历史持久化 + 私聊到达通知 + 自消息回底 + 未读跟随。
  let lastMessageCount = options.session.getState().chatMessages.length;
  const unsubscribeSessionMessages = options.session.subscribe((snapshot) => {
    const messages = snapshot.chatMessages;
    if (messages.length === lastMessageCount) return;
    const grew = messages.length > lastMessageCount;
    lastMessageCount = messages.length;
    persistNewMessages(messages);
    if (grew) {
      const latest = messages[messages.length - 1];
      if (latest && latest.scope === "private" && !latest.isSelf) options.notifyPrivateMessage();
    }
    const lastVisible = visibleMessages().at(-1);
    if (lastVisible?.isSelf) followingLatest = true;
    scrollIfFollowing();
  });
  // 历史装载（旧 watch([connected, sessionEpoch, serverKey], immediate)）：connected
  // 变更走 voice 订阅，serverKey 变更搭 home 订阅（目的地监听已在），epoch 走 session 订阅。
  let lastHistoryIdentity = "";
  const unsubscribeVoice = options.voice.subscribe(() => {
    void loadHistory();
  });
  void loadHistory();

  async function loadHistory(): Promise<void> {
    const connected = options.voice.getState().connected;
    const target = options.getServerKey();
    const identity = `${connected}:${options.session.getState().epoch}:${target}`;
    if (identity === lastHistoryIdentity) return;
    lastHistoryIdentity = identity;
    const generation = ++historyGeneration;
    persistedMessageIds.clear();
    if (!connected || !target) return;
    const normalizedKey = normalizeChatHistoryServerKey(target);
    const history = await loadChatHistory(normalizedKey);
    if (disposed || generation !== historyGeneration || !options.voice.getState().connected || normalizeChatHistoryServerKey(options.getServerKey()) !== normalizedKey) return;
    const messages = options.session.getState().chatMessages;
    const existingIds = new Set(messages.map((message) => message.id));
    const additions = history.filter((message) => !existingIds.has(message.id));
    if (additions.length) {
      options.session.setState({ chatMessages: [...messages, ...additions].sort((left, right) => left.timestamp - right.timestamp) });
    }
    for (const message of options.session.getState().chatMessages) if (!message.isHistory) persistedMessageIds.add(message.id);
  }

  function persistNewMessages(messages: ChatMessage[]): void {
    if (!options.voice.getState().connected || !options.getServerKey()) return;
    const key = normalizeChatHistoryServerKey(options.getServerKey());
    for (const message of messages) {
      if (message.isHistory || message.scope === "system" || persistedMessageIds.has(message.id)) continue;
      persistedMessageIds.add(message.id);
      void saveChatHistoryMessage(key, message);
    }
  }

  function dispose(): void {
    disposed = true;
    drafts.clear();
    pending.clear();
    errors.clear();
    patch({ sending: false });
    unsubscribeHome();
    unsubscribeSession();
    unsubscribeSessionMessages();
    unsubscribeVoice();
    // dispose 无生产调用点是有意的：控制器在进房根部 useMemo 单实例存活整个
    // 进房周期，StrictMode dev 双挂载会先 dispose 再复用同一实例（useMemo 不随
    // effect 重跑），接进 effect cleanup 反而会杀死存活的控制器。这里保持
    // 完整可释放（测试与未来宿主变更用）。
  }

  return {
    store,
    /** title/conversations/visibleMessages/canSend 跨读本 store 与 voice store
     *  （Vue computed 自动跨 store 追踪的等价物）——视图必须显式订阅两者；
     *  且 conversations/visibleMessages 必须把订阅值作实参传入（React Compiler
     *  把方法调用按实参缓存，零参调用在 store 更新后返回陈旧数组，2026-10-23
     *  消息不上屏根因）。 */
    sessionStore: options.session,
    voiceStore: options.voice,
    setTab,
    setDraft: (text: string) => patch({ messageDraft: text }),
    conversations,
    visibleMessages,
    tabLabel,
    title,
    placeholder,
    canSend,
    status,
    messageKey,
    recipient,
    destination,
    openPrivateChat,
    openConversation,
    submitMessage,
    scrollToEnd,
    onScroll,
    scrollIfFollowing,
    /** React 提交后的跟随滚动：控制器自带的 microtask 滚动跑在 DOM 增长之前
     *  （落点是旧底部），新行撑高后 48px 距底判定自杀、跟随永久失效——消息
     *  全部堆在折叠线下方被感知为「接收延迟」（2026-10-18 移植回归）。面板在
     *  useLayoutEffect 里调本方法，落点即真底部。 */
    scrollToEndIfFollowing,
    dispose,
  };
}

export type ChatController = ReturnType<typeof createChatController>;
