import { memo, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { Icon } from "./icon";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import type { ChatController, ChatScrollerAspect } from "@/web-client/chat-controller";
import { formatTime, resolveMessageAvatar } from "@/web-client/view-utils";
import type { ChannelMember, ChatMessage, ServerEvent } from "@shared/voice-models";
import type { Language } from "@/i18n/web-client";
import type { WebClientChatTab } from "@/web-client/home-store";

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
  useStore(chat.sessionStore, useShallow((state) => ({ chatMessages: state.chatMessages, members: state.members, epoch: state.epoch })));
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
  useEffect(() => {
    onListElement(listRef.current);
    return () => onListElement(null);
  }, [onListElement]);

  // 输入框随草稿自动增高，上限 120px。
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [chatUi.messageDraft]);

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

  return (
    <section className={mobileHidden ? "chat-panel mobile-section-hidden" : "chat-panel"} data-ws-part="voice.chat">
      <div className="chat-conversation-heading" data-ws-part="voice.chat.title-row">
        <strong className="chat-conversation-title">{chat.tabLabel()}</strong>
        {collapsible && (
          <button type="button" className="chat-collapse" data-ws-part="voice.chat.collapse" title={t("closeChat")} aria-label={t("closeChat")} onClick={onCollapse}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <div className="chat-tabs" data-ws-part="voice.chat.tabs" role="tablist" aria-label={t("chatTabs")}>
        <button
          type="button"
          role="tab"
          data-ws-part="voice.chat.tab"
          data-ws-state={tab === "channel" ? "active" : "idle"}
          className={tab === "channel" ? "active" : ""}
          aria-selected={tab === "channel"}
          onClick={() => chat.setTab("channel")}
        >
          <Icon name="hash" size={15} />
          {" "}
          {currentChannelName}
        </button>
        <button
          type="button"
          role="tab"
          data-ws-part="voice.chat.tab"
          data-ws-state={tab === "server" ? "active" : "idle"}
          className={tab === "server" ? "active" : ""}
          aria-selected={tab === "server"}
          onClick={() => chat.setTab("server")}
        >
          <Icon name="server" size={15} />
          {" "}
          {t("serverChat")}
        </button>
        {conversations.map((conversation) => {
          const active = tab === "private" && chatUi.privateConversationKey === conversation.key;
          return (
            <button
              key={conversation.key}
              type="button"
              role="tab"
              data-ws-part="voice.chat.tab"
              data-ws-state={active ? "active" : "idle"}
              className={active ? "active" : ""}
              aria-selected={active}
              onClick={() => chat.openConversation(conversation)}
            >
              <Icon name="message" size={15} />
              {" "}
              {conversation.name}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          data-ws-part="voice.chat.tab"
          data-ws-state={tab === "events" ? "active" : "idle"}
          className={tab === "events" ? "active" : ""}
          aria-selected={tab === "events"}
          onClick={() => chat.setTab("events")}
        >
          <Icon name="bell" size={15} />
          {" "}
          {t("eventLog")}
        </button>
      </div>
      {/* 标题/眉题已删（⑧拍板：页签行已表达位置语义）；计数器保留。 */}
      <div className="section-heading chat-heading" data-ws-part="voice.chat.heading">
        <span className="section-counter">
          {tab === "events"
            ? t("eventCount", { count: serverEvents.length })
            : t("messageCount", { count: visibleMessages.length })}
        </span>
      </div>
      <div ref={listRef} className="message-list" data-ws-part="voice.chat.messages" onScroll={() => chat.onScroll()}>
        {tab === "events" ? (
          <div>
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
        ) : !visibleMessages.length ? (
          <div className="chat-empty" data-ws-part="voice.chat.empty" data-ws-state="messages-empty">
            <strong>{tab === "private" ? t("privateChatStart") : t("chatStart")}</strong>
            <span>{tab === "private" ? t("privateChatStartLead") : t("chatStartLead")}</span>
          </div>
        ) : (
          <ChatMessageList chat={chat} members={members} language={language} t={t} />
        )}
      </div>
      {tab !== "events" && (
        <form
          className="message-composer"
          data-ws-part="voice.chat.composer"
          onSubmit={(event) => { event.preventDefault(); if (!composing) void chat.submitMessage(); }}
        >
          <textarea
            ref={composerRef}
            value={chatUi.messageDraft}
            onChange={(event) => chat.setDraft(event.target.value)}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            enterKeyHint="send"
            autoComplete="off"
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={onComposerKeydown}
            placeholder={chat.placeholder(t)}
            aria-label={t("messageInput")}
          />
          {chatUi.messageDraft.length > 450 && (
            <span className="composer-count" aria-live="off">{MESSAGE_MAX_LENGTH - chatUi.messageDraft.length}</span>
          )}
          <button
            className="send-button"
            type="submit"
            disabled={!chat.canSend() || !chatUi.messageDraft.trim()}
            title={t("send")}
            aria-label={t("send")}
          >
            <Icon name="send" size={18} />
          </button>
        </form>
      )}
      {chat.status(t) && (
        <p className="chat-status" data-ws-part="voice.chat.status" role="status">{chat.status(t)}</p>
      )}
    </section>
  );
}
