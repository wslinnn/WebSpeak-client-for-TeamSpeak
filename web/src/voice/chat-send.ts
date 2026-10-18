import type { ChatMessage } from "@shared/voice-models";
import type { ClientCommandPayloads, ClientCommandType } from "@shared/client-commands";
import type { createVoiceSessionState } from "./session-state";
import type { VoiceSessionView } from "./session-model";

type VoiceSessionState = ReturnType<typeof createVoiceSessionState>;

/** 聊天发送簇（自 session-controller 平移）：文案校验、乐观上屏（本地先追加，
 *  自回声在 session-state 被丢弃故无重复风险）、失败撤回、会话代际（断线释放
 *  推进，使在途发送的确认不再可信）。 */

interface ChatSendDeps {
  V(): VoiceSessionView;
  socket(): WebSocket | null;
  session(): VoiceSessionState;
  sendCommandAndWait<K extends ClientCommandType>(type: K, payload: ClientCommandPayloads[K], timeoutMs?: number): Promise<void>;
}

export function createChatSend(deps: ChatSendDeps) {
  const { V } = deps;
  let chatGeneration = 0;

  function chatText(message: string): string {
    if (!V().connected || deps.socket()?.readyState !== WebSocket.OPEN) {
      throw Object.assign(new Error("TeamSpeak 会话尚未就绪"), { code: "SESSION_NOT_READY" });
    }
    const text = message.trim();
    if (!text || text.length > 500) throw Object.assign(new Error("文字消息无效"), { code: "INVALID_TEXT_MESSAGE" });
    return text;
  }

  async function sendChat<K extends "sendTextMessage" | "sendServerMessage" | "sendPrivateMessage">(
    type: K, payload: ClientCommandPayloads[K], local: Pick<ChatMessage, "scope" | "targetId" | "conversationId" | "conversationKey" | "conversationName">,
  ): Promise<void> {
    const generation = chatGeneration;
    const senderId = V().tsClientId;
    // TS6_Droid 语义（2026-10-18）：本地先上屏——自回声在 session-state 被丢弃，
    // 无重复风险；服务器确认只用于错误反馈，慢确认不再拖住消息显示。
    const localMessage = deps.session().appendLocal({ ...local, senderId, invokerName: "你", message: payload.message });
    try {
      await deps.sendCommandAndWait(type, payload);
      if (generation !== chatGeneration || !V().connected) throw new Error("语音连接已关闭");
    } catch (error) {
      deps.session().retractLocal(localMessage.id);
      throw error;
    }
  }

  /** 断线/会话释放时推进：在途 sendChat 的成功确认视为失效，本地行撤回。 */
  function advanceGeneration(): void {
    chatGeneration++;
  }

  async function sendTextMessage(message: string, targetId = ""): Promise<void> {
    const text = chatText(message);
    await sendChat("sendTextMessage", { message: text, ...(targetId ? { channelId: targetId } : {}) },
      { scope: "channel", ...(targetId ? { targetId } : {}) });
  }

  async function sendServerMessage(message: string): Promise<void> {
    await sendChat("sendServerMessage", { message: chatText(message) }, { scope: "server" });
  }

  async function sendPrivateMessage(clientId: number, message: string, targetId = "", expectedKey?: string): Promise<void> {
    const text = chatText(message);
    const member = deps.session().store.getState().members.find(candidate => candidate.id === clientId);
    const key = deps.session().memberConversationKey(clientId);
    if (!member || clientId === V().tsClientId || (expectedKey !== undefined && key !== expectedKey)) {
      throw Object.assign(new Error("成员已离线或当前不可见"), { code: "CLIENT_NOT_FOUND" });
    }
    await sendChat("sendPrivateMessage", { clientId, message: text, ...(member.uid ? { clientUid: member.uid } : {}) },
      { scope: "private", targetId, conversationId: String(clientId), conversationKey: key, conversationName: member.nickname });
  }

  return { sendTextMessage, sendServerMessage, sendPrivateMessage, advanceGeneration };
}

export type ChatSend = ReturnType<typeof createChatSend>;
