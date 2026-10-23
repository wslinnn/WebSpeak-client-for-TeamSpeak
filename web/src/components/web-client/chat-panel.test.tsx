// 聊天面板渲染隔离的钉子（报告 21 F1）：草稿每敲一字面板必重渲（受控输入框 +
// 发送按钮状态），但消息行走 memo 子组件，不得随按键重建整列（重建会重跑时间
// 格式化与头像解析，500 行 ≈35ms/按键）。
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { ChannelMember, ChatMessage } from "@shared/voice-models";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createChatController } from "@/web-client/chat-controller";
import type { WebClientChatTab } from "@/web-client/home-store";
import { formatTime, resolveMessageAvatar } from "@/web-client/view-utils";
import { ChatPanel } from "./chat-panel";

vi.mock("@/web-client/view-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/web-client/view-utils")>();
  return {
    ...actual,
    formatTime: vi.fn(actual.formatTime),
    resolveMessageAvatar: vi.fn(actual.resolveMessageAvatar),
  };
});

const message = (id: string, patch: Partial<ChatMessage> = {}): ChatMessage => ({
  id, scope: "channel", invokerName: `User ${id}`, message: `Message ${id}`,
  timestamp: 1_760_000_000_000, ...patch,
});

function harness(messages: ChatMessage[], members: ChannelMember[] = []) {
  const home = createStore<{ chatTab: WebClientChatTab }>(() => ({ chatTab: "channel" }));
  const session = createStore<{ chatMessages: ChatMessage[]; members: ChannelMember[]; epoch: number }>(
    () => ({ chatMessages: messages, members, epoch: 0 }),
  );
  const voice = createStore<{ connected: boolean }>(() => ({ connected: true }));
  const chat = createChatController({
    home,
    session,
    voice,
    getClientId: () => 1,
    getServerKey: () => "example.test:9987",
    getCurrentChannel: () => ({ id: "1", parentID: "0", name: "Lobby" }),
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
    getList: () => null,
  });
  return { chat, session };
}

function renderPanel(chat: ReturnType<typeof createChatController>, members: ChannelMember[] = []) {
  // 发送/收起钮的提示走 Tooltip 原语，独立渲染必须自带 Provider（应用壳里在 App 根）。
  return render(
    <TooltipProvider>
      <ChatPanel
        chat={chat}
        tab="channel"
        language="zh"
        currentChannelName="Lobby"
        mobileHidden={false}
        serverEvents={[]}
        members={members}
        onListElement={() => {}}
        onCollapse={() => {}}
        t={(key) => key}
      />
    </TooltipProvider>,
  );
}

test("typing a draft re-renders the composer but never rebuilds message rows", () => {
  const messages = [
    message("m1", { senderUid: "u1" }),
    message("m2", { senderUid: "u2" }),
    message("m3", { senderUid: "u3" }),
  ];
  const { chat } = harness(messages);
  const view = renderPanel(chat);
  expect(view.container.querySelectorAll(".message-row")).toHaveLength(3);
  expect(view.container.querySelectorAll(".message-meta time")).toHaveLength(3);

  const clockCallsAfterRender = vi.mocked(formatTime).mock.calls.length;
  const avatarCallsAfterRender = vi.mocked(resolveMessageAvatar).mock.calls.length;
  expect(clockCallsAfterRender).toBeGreaterThan(0);

  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  const sendButton = screen.getByRole("button", { name: "send" });
  expect(sendButton).toBeDisabled();
  for (const value of ["h", "he", "hel", "hell", "hello"]) {
    fireEvent.change(textarea, { target: { value } });
  }
  // 正向对照：面板确实随草稿重渲（按钮由禁用转可用），不是「事件没送达」的假通过。
  expect(textarea.value).toBe("hello");
  expect(sendButton).toBeEnabled();

  // 列表未被重建：时间格式化与头像解析的调用次数不随按键增长（memo 子组件拦下）。
  expect(vi.mocked(formatTime).mock.calls.length).toBe(clockCallsAfterRender);
  expect(vi.mocked(resolveMessageAvatar).mock.calls.length).toBe(avatarCallsAfterRender);
});

test("incoming messages reach the memoized list and every row renders avatar+meta", async () => {
  const { chat, session } = harness([message("m1", { senderUid: "u1" })]);
  const view = renderPanel(chat);
  expect(view.container.querySelectorAll(".message-row")).toHaveLength(1);

  session.setState({
    chatMessages: [
      message("m1", { senderUid: "u1" }),
      message("m1-reply", { senderUid: "u1", timestamp: 1_760_000_000_030 }),
    ],
  });
  await waitFor(() => expect(view.container.querySelectorAll(".message-row")).toHaveLength(2));
  // 每条消息固定渲染头像+名/时间（2026-10-23 拍板撤除合并态：占位行只剩空圈，
  // 信息密度反而低）；旧合并逻辑的 spacer 类随分支一并清退。
  expect(view.container.querySelectorAll(".message-avatar")).toHaveLength(2);
  expect(view.container.querySelectorAll(".message-avatar-spacer")).toHaveLength(0);
  expect(view.container.querySelectorAll(".message-meta")).toHaveLength(2);
});
