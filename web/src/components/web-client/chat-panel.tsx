import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import type { ChatController, ChatScrollerAspect } from "@/web-client/chat-controller";
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

function formatClock(timestamp: number, language: Language): string {
  const locale = language === "zh" ? "zh-CN" : language === "de" ? "de-DE" : language === "ru" ? "ru-RU" : language === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function resolveMessageAvatar(message: ChatMessage, members: ChannelMember[]): string {
  const member = members.find((candidate) =>
    (typeof message.senderId === "number" && candidate.id === message.senderId)
    || (Boolean(message.senderUid) && candidate.uid === message.senderUid),
  );
  return member?.avatar ?? "";
}

/** 聊天面板（旧 ChatPanel.vue 平价）：页签行/标题/消息列表/输入区。控制器状态经
 *  store 订阅；草稿与提交纪律在 chat-controller。 */
export function ChatPanel({ chat, tab, language, currentChannelName, mobileHidden, collapsible, serverEvents, members, onListElement, onCollapse, t }: ChatPanelProps) {
  const chatState = useStore(chat.store);
  const conversations = chat.conversations();
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
  }, [chatState.messageDraft]);

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
    if (chat.canSend() && chatState.messageDraft.trim()) void chat.submitMessage();
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
          const active = tab === "private" && chatState.privateConversationKey === conversation.key;
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
      <div className="section-heading chat-heading" data-ws-part="voice.chat.heading">
        <div>
          <span className="section-kicker">{chat.tabLabel()}</span>
          <h2>
            <Icon name={tab === "server" ? "server" : tab === "events" ? "bell" : tab === "private" ? "message" : "hash"} size={20} />
            {" "}
            {chat.title()}
          </h2>
        </div>
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
                <time>{formatClock(event.timestamp, language)}</time>
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
          visibleMessages.map((message, index) => {
            const grouped = isGroupedMessage(visibleMessages, index);
            const avatar = resolveMessageAvatar(message, members);
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
                      <time>{formatClock(message.timestamp, language)}</time>
                    </div>
                  )}
                  <div className="message-bubble" data-ws-part="voice.chat.message-bubble">{message.message}</div>
                </div>
              </article>
            );
          })
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
            value={chatState.messageDraft}
            onChange={(event) => chat.setDraft(event.target.value)}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            enterKeyHint="send"
            autoComplete="off"
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={onComposerKeydown}
            placeholder={chat.placeholder()}
            aria-label={t("messageInput")}
          />
          {chatState.messageDraft.length > 450 && (
            <span className="composer-count" aria-live="off">{MESSAGE_MAX_LENGTH - chatState.messageDraft.length}</span>
          )}
          <button
            className="send-button"
            type="submit"
            disabled={!chat.canSend() || !chatState.messageDraft.trim()}
            title={t("send")}
            aria-label={t("send")}
          >
            <Icon name="send" size={18} />
          </button>
        </form>
      )}
      {chat.status() && (
        <p className="chat-status" data-ws-part="voice.chat.status" role="status">{chat.status()}</p>
      )}
    </section>
  );
}
