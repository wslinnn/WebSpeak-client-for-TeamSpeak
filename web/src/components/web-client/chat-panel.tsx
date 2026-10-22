import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { Icon } from "./icon";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import type { ChatController, ChatScrollerAspect } from "@/web-client/chat-controller";
import { formatTime, resolveMessageAvatar } from "@/web-client/view-utils";
import type { ChannelMember, ChatMessage, ServerEvent } from "@shared/voice-models";
import type { Language } from "@/i18n/web-client";
import type { WebClientChatTab } from "@/web-client/home-store";
import { Button } from "@/components/ui/button";

interface ChatPanelProps {
  chat: ChatController;
  /** 页签权威在 home store，由父组件订阅后传入（旧 props.model.tab 平价）。 */
  tab: WebClientChatTab;
  language: Language;
  currentChannelName: string;
  mobileHidden: boolean;
  collapsible?: boolean;
  serverEvents: readonly ServerEvent[];
  members: ChannelMember[];
  /** 消息列表滚动容器：页签/成员行变化时保持同一控制器，列表 ref 重挂。 */
  onListElement(element: ChatScrollerAspect | null): void;
  onCollapse(): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

const MESSAGE_MAX_LENGTH = 500;
// 同一发送者在窗口内的连续消息合并为一组：头像与名/时间只在首行。
const MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;

function isGroupedMessage(messages: readonly ChatMessage[], index: number): boolean {
  const current = messages[index];
  const previous = messages[index - 1];
  if (!current || !previous || previous.isSelf !== current.isSelf) return false;
  const currentKey = current.senderUid ?? `id:${current.senderId}`;
  const previousKey = previous.senderUid ?? `id:${previous.senderId}`;
  if (currentKey !== previousKey) return false;
  return current.timestamp - previous.timestamp < MESSAGE_GROUP_WINDOW_MS;
}

interface ChatMessageListProps {
  chat: ChatController;
  members: ChannelMember[];
  language: Language;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

/** 消息行独立成 memo 组件：输入框受控，草稿每敲一字面板必重渲，但本组件 props
 *  （chat/members/language/t 引用）不随草稿变，memo 拦下整列重建——否则每次按键
 *  重跑时间格式化与头像解析（报告 21 F1：500 行 ≈35ms/按键）。 */
const ChatMessageList = memo(function ChatMessageList({ chat, members, language, t }: ChatMessageListProps) {
  // 消息/成员/代际跨读 session store，必须显式订阅（React Compiler 的 props memo
  // 会漏）；订阅自持在 memo 内，父面板重渲被拦下时列表变化仍能自行更新。
  const { chatMessages } = useStore(chat.sessionStore, useShallow((state) => ({ chatMessages: state.chatMessages, members: state.members, epoch: state.epoch })));
  // 跟随滚动必须在 React 提交之后执行（layout effect）：控制器 microtask 版跑在
  // DOM 增长前，新行撑高后 48px 距底判定把跟随关死——感知为「消息接收延迟」。
  useLayoutEffect(() => { chat.scrollToEndIfFollowing(); }, [chat, chatMessages]);
  const visibleMessages = chat.visibleMessages();
  return (
    <>
      {visibleMessages.map((message, index) => {
        const grouped = isGroupedMessage(visibleMessages, index);
        // 合并行不渲染头像：解析（O(成员数) find）只在首行做（报告 21 F1）。
        const avatar = grouped ? "" : resolveMessageAvatar(message, members);
        return (
          <article
            key={message.id}
            className={message.isSelf ? "message-row mine" : grouped ? "message-row grouped" : "message-row"}
            data-ws-part="voice.chat.message"
            data-ws-state={message.isSelf ? "mine" : "other"}
          >
            {!grouped ? (
              <div
                className="message-avatar"
                data-ws-part="voice.chat.message-avatar"
                style={avatarStyle(message.invokerName, Boolean(message.isSelf), avatar)}
              >
                {avatar ? "" : avatarInitial(message.invokerName)}
              </div>
            ) : (
              <div className="message-avatar message-avatar-spacer" aria-hidden="true" />
            )}
            <div className="message-body" data-ws-part="voice.chat.message-body">
              {!grouped && (
                <div className="message-meta">
                  <strong>{message.isSelf ? t("you") : message.invokerName}</strong>
                  <time>{formatTime(message.timestamp, language)}</time>
                </div>
              )}
              <div className="message-bubble" data-ws-part="voice.chat.message-bubble">{message.message}</div>
            </div>
          </article>
        );
      })}
    </>
  );
});

/** 聊天面板（旧 ChatPanel.vue 平价）：页签行/标题/消息列表/输入区。控制器状态经
 *  store 订阅；草稿与提交纪律在 chat-controller。 */
export function ChatPanel({ chat, tab, language, currentChannelName, mobileHidden, collapsible, serverEvents, members, onListElement, onCollapse, t }: ChatPanelProps) {
  // 草稿/发送态用窄选择器：整店订阅会让 chat store 的任何变化都重渲面板；sending/
  // sendError 不直接读，留在选择器里只为驱动 canSend/status 的重算。
  const chatUi = useStore(chat.store, useShallow((state) => ({
    messageDraft: state.messageDraft,
    sending: state.sending,
    sendError: state.sendError,
    privateConversationKey: state.privateConversationKey,
  })));
  // title/conversations/visibleMessages/canSend/status 跨读 session/voice store，
  // 但那些变化不动本组件任何 prop——React Compiler 的 props memo 会跳过重渲，
  // 表现为刷新后历史/私聊页签消失、标题不更新。这里显式订阅两个 store 的相关切片。
  useStore(chat.sessionStore, useShallow((state) => ({ chatMessages: state.chatMessages, members: state.members, epoch: state.epoch })));
  useStore(chat.voiceStore, (state) => state.connected);
  const conversations = chat.conversations();
  // 计数与空态判断用；行渲染在 ChatMessageList 内自算（那里的数组不能每渲新建）。
  const visibleMessages = chat.visibleMessages();
  const [composing, setComposing] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // 旧 listElement ref 平价：把渲染出来的滚动容器交给控制器切面（卸载时解绑）。
  // 页签切换会卸载/重挂滚动容器（TabsContent 惰性渲染），切换后必须重新绑定，
  // 否则控制器持有已脱离文档的旧节点（滚动跟随全部失效）。
  useEffect(() => {
    onListElement(listRef.current);
    return () => onListElement(null);
  }, [onListElement, tab, chatUi.privateConversationKey]);

  // 输入框随草稿自动增高，上限 120px。依赖带 mobileHidden：移动端面板在
  // display:none 下挂载时 scrollHeight 恒 0，会把 textarea 钉成 0 高点不开
  // （切一次 tab 重新挂载才恢复）——可见性翻转时重算。
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [chatUi.messageDraft, mobileHidden, tab, chatUi.privateConversationKey]);

  function onComposerKeydown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter") return;
    // Android IME 与 Safari 可能用 Enter 确认候选词：那不是发送。
    if (composing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      event.preventDefault();
      return;
    }
    // Shift+Enter 保留换行；Enter 发送。
    if (event.shiftKey) return;
    event.preventDefault();
    if (chat.canSend() && chatUi.messageDraft.trim()) void chat.submitMessage();
  }

  // 页签值空间：私聊页签用 `private:<key>` 编码（radix Tabs 的 value 必须唯一标识
  // 每个触发器；私聊会话是动态多枚）。
  const activeTabValue = tab === "private" ? `private:${chatUi.privateConversationKey}` : tab;

  function onTabChange(value: string): void {
    if (value.startsWith("private:")) {
      const conversation = conversations.find((candidate) => `private:${candidate.key}` === value);
      if (conversation) chat.openConversation(conversation);
      return;
    }
    chat.setTab(value as WebClientChatTab);
  }

  // 消息面板被多个页签值复用（channel/server/私聊共用同一布局）；惰性渲染下同时
  // 只有一份挂载，共享同一 JSX 不会双挂。
  const messagesPanel = (
    <>
      <div ref={listRef} className="message-list" data-ws-part="voice.chat.messages" onScroll={() => chat.onScroll()}>
        {!visibleMessages.length ? (
          <div className="chat-empty" data-ws-part="voice.chat.empty" data-ws-state="messages-empty">
            <strong>{tab === "private" ? t("privateChatStart") : t("chatStart")}</strong>
            <span>{tab === "private" ? t("privateChatStartLead") : t("chatStartLead")}</span>
          </div>
        ) : (
          <ChatMessageList chat={chat} members={members} language={language} t={t} />
        )}
      </div>
      <form
        className="message-composer"
        data-ws-part="voice.chat.composer"
        onSubmit={(event) => { event.preventDefault(); if (!composing) void chat.submitMessage(); }}
      >
        <InputGroup>
          <InputGroupTextarea
            ref={composerRef}
            value={chatUi.messageDraft}
            onChange={(event) => chat.setDraft(event.target.value)}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-0 field-sizing-fixed"
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={onComposerKeydown}
            placeholder={chat.placeholder(t)}
            aria-label={t("messageInput")}
          />
          {chatUi.messageDraft.length > 450 && (
            <span className="composer-count" aria-live="off">{MESSAGE_MAX_LENGTH - chatUi.messageDraft.length}</span>
          )}
          <InputGroupAddon align="inline-end">
            <Button variant="ghost"
              className="send-button"
              type="submit"
              disabled={!chat.canSend() || !chatUi.messageDraft.trim()}
              aria-label={t("send")}
            >
              <Icon name="send" size={18} />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </>
  );

  const eventsPanel = (
    <div ref={listRef} className="message-list" data-ws-part="voice.chat.messages" onScroll={() => chat.onScroll()}>
      {serverEvents.map((event) => (
        <article key={event.id} className="event-row" data-ws-part="voice.chat.event">
          <time>{formatTime(event.timestamp, language)}</time>
          <span>{event.message}</span>
        </article>
      ))}
      {!serverEvents.length && (
        <div className="chat-empty" data-ws-part="voice.chat.empty" data-ws-state="events-empty">
          <div className="chat-empty-icon"><Icon name="bell" size={24} /></div>
          <strong>{t("noEvents")}</strong>
          <span>{t("noEventsLead")}</span>
        </div>
      )}
    </div>
  );

  return (
    <section className={mobileHidden ? "chat-panel mobile-section-hidden" : "chat-panel"} data-ws-part="voice.chat">
      <div className="chat-conversation-heading" data-ws-part="voice.chat.title-row">
        <strong className="chat-conversation-title">{chat.tabLabel(t)}</strong>
        {collapsible && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" type="button" className="chat-collapse" data-ws-part="voice.chat.collapse" aria-label={t("closeChat")} onClick={onCollapse}>
                <Icon name="close" size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("closeChat")}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <Tabs value={activeTabValue} onValueChange={onTabChange}>
        <TabsList className="chat-tabs" data-ws-part="voice.chat.tabs" aria-label={t("chatTabs")}>
          <TabsTrigger value="channel" data-ws-part="voice.chat.tab" data-ws-state={tab === "channel" ? "active" : "idle"}>
            <Icon name="hash" size={15} />
            {" "}
            {currentChannelName}
          </TabsTrigger>
          <TabsTrigger value="server" data-ws-part="voice.chat.tab" data-ws-state={tab === "server" ? "active" : "idle"}>
            <Icon name="server" size={15} />
            {" "}
            {t("serverChat")}
          </TabsTrigger>
          {conversations.map((conversation) => (
            <TabsTrigger
              key={conversation.key}
              value={`private:${conversation.key}`}
              data-ws-part="voice.chat.tab"
              data-ws-state={tab === "private" && chatUi.privateConversationKey === conversation.key ? "active" : "idle"}
            >
              <Icon name="message" size={15} />
              {" "}
              {conversation.name}
            </TabsTrigger>
          ))}
          <TabsTrigger value="events" data-ws-part="voice.chat.tab" data-ws-state={tab === "events" ? "active" : "idle"}>
            <Icon name="bell" size={15} />
            {" "}
            {t("eventLog")}
          </TabsTrigger>
        </TabsList>
        {/* 标题/眉题已删（⑧拍板：页签行已表达位置语义）；计数器保留。 */}
        <div className="section-heading chat-heading" data-ws-part="voice.chat.heading">
          <span className="section-counter">
            {tab === "events"
              ? t("eventCount", { count: serverEvents.length })
              : t("messageCount", { count: visibleMessages.length })}
          </span>
        </div>
        <TabsContent value="channel">{messagesPanel}</TabsContent>
        <TabsContent value="server">{messagesPanel}</TabsContent>
        {conversations.map((conversation) => (
          <TabsContent key={conversation.key} value={`private:${conversation.key}`}>{messagesPanel}</TabsContent>
        ))}
        <TabsContent value="events">{eventsPanel}</TabsContent>
      </Tabs>
      {chat.status(t) && (
        <p className="chat-status" data-ws-part="voice.chat.status" role="status">{chat.status(t)}</p>
      )}
    </section>
  );
}
