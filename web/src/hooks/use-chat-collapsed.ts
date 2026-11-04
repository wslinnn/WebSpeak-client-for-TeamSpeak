import { useEffect, useState } from "react";
import type { ChatController } from "@/web-client/chat-controller";

/** 桌面聊天列折叠态（持久化键 webspeak:chat-collapsed）：状态 + 落盘 +
 *  向聊天控制器的接线（折叠期间面板不可见，激活会话的新消息也要计未读——
 *  否则折叠收到私聊被静默豁免、徽标永远不亮）。 */
export function useChatCollapsed(chat: ChatController): [boolean, (collapsed: boolean) => void] {
  const [chatCollapsed, setChatCollapsed] = useState(() => localStorage.getItem("webspeak:chat-collapsed") === "1");
  useEffect(() => {
    if (chatCollapsed) localStorage.setItem("webspeak:chat-collapsed", "1");
    else localStorage.removeItem("webspeak:chat-collapsed");
  }, [chatCollapsed]);
  useEffect(() => {
    chat.setDesktopCollapsed(chatCollapsed);
  }, [chat, chatCollapsed]);
  return [chatCollapsed, setChatCollapsed];
}
