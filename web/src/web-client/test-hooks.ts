import type { VoiceSessionController } from "@/voice/session-controller";
import type { createHomeStore } from "@/web-client/home-store";

/** 冒烟测试桥句柄：把前端置进房态（种子）、开受密频道/服务器密码/身份导入弹窗，或复位回首页态。 */
export interface WebSpeakTestHooks {
  seedRoomState(): void;
  /** 直写会话 store 的频道消息（无真 TS 服务器时探针滚动/回滚场景用）。 */
  seedChatMessages(count: number): void;
  /** 断线横幅家族：mode=warning 渲染重连中（warning 变体），mode=failed 渲染重连失败（destructive 变体）。 */
  seedVoiceBanners(mode: "warning" | "failed"): void;
  seedChannelPasswordDialog(): void;
  seedServerPasswordDialog(): void;
  seedIdentityImportDialog(): void;
  resetState(): void;
}

declare global {
  interface Window {
    __wsTestHooks?: WebSpeakTestHooks;
  }
}

/**
 * 受控 E2E 桥：仅当构建期注入 VITE_WS_E2E=1 且页面开启 localStorage
 * webspeak:e2e 时才注册 window.__wsTestHooks。双开关缺一不可——普通构建里
 * 常量折叠使本函数成为死分支，桥代码不进产物；e2e 构建的页面也必须显式开启
 * 运行期开关。种子只写 store 状态让房间壳渲染，不建立任何真实语音连接。
 */
export function installTestHooks(voice: VoiceSessionController, homeStore?: ReturnType<typeof createHomeStore>): void {
  if (import.meta.env.VITE_WS_E2E !== "1") return;
  if (window.localStorage.getItem("webspeak:e2e") !== "1") return;
  if (window.__wsTestHooks) return;
  window.__wsTestHooks = {
    seedRoomState() {
      voice.store.setState({
        connected: true,
        connecting: false,
        reconnecting: false,
        reconnectFailed: false,
        tsClientId: 1,
        error: "",
        errorCode: "",
        retryNotUntil: 0,
      });
      // 两频道 + 一名可交互成员：成员菜单/右键/移人子菜单的探针靶子。
      voice.session.store.setState({
        channels: [
          { id: "1", parentID: "0", name: "语音大厅", members: [{ id: 1, nickname: "你", isSelf: true }, { id: 7, nickname: "Probe 成员" }] },
          { id: "2", parentID: "0", name: "音乐房", members: [] },
        ],
        members: [{ id: 1, nickname: "你", isSelf: true }, { id: 7, nickname: "Probe 成员" }],
      });
    },
    seedChatMessages(count) {
      const now = Date.now();
      voice.session.store.setState({
        chatMessages: Array.from({ length: count }, (_, i) => ({
          id: `probe-${i}`,
          scope: "channel",
          invokerName: i % 3 === 0 ? "你" : `压测成员${i % 7}`,
          message: `压测消息第 ${i + 1} 条：把消息列表撑出滚动阈值，再多写几个字保证换行占行。`,
          timestamp: now - (count - i) * 30_000,
          isSelf: i % 3 === 0,
        })),
      });
    },
    // 断线横幅同样需要真实网络故障才出现；种子直接置 store 的三态字段。
    seedVoiceBanners(mode) {
      voice.store.setState({
        connected: true,
        connecting: false,
        reconnecting: mode === "warning",
        reconnectFailed: mode === "failed",
        reconnectAttempt: 2,
        error: mode === "failed" ? "probe banner detail text" : "",
        errorCode: mode === "failed" ? "CANNOT_CONNECT" : "",
      });
    },
    // 受密频道弹窗经真实链路需要真 TS 服务器回报受密频道，探针直接开弹窗态。
    seedChannelPasswordDialog() {
      homeStore?.setState({
        channelPasswordDialog: { open: true, channelId: "1", password: "", error: "", submitting: false },
      });
    },
    seedServerPasswordDialog() {
      homeStore?.setState({
        serverPasswordDialog: { open: true, password: "", errorCode: "SERVER_PASSWORD_REQUIRED" },
      });
    },
    seedIdentityImportDialog() {
      homeStore?.setState({
        identityDialog: { open: true, text: "", error: "", busy: false, reading: false, exporting: false },
      });
    },
    resetState() {
      voice.store.setState({
        connected: false,
        connecting: false,
        reconnecting: false,
        reconnectFailed: false,
        tsClientId: 0,
        error: "",
        errorCode: "",
        retryNotUntil: 0,
      });
    },
  };
}
