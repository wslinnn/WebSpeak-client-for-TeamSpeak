import type { VoiceSessionController } from "@/voice/session-controller";

/** 冒烟测试桥句柄：把前端置进房态（种子）或复位回首页态。 */
export interface WebSpeakTestHooks {
  seedRoomState(): void;
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
export function installTestHooks(voice: VoiceSessionController): void {
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
