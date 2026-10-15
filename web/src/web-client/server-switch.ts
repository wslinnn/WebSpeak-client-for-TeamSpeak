import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand";

// 语音内切服横幅：切换挂起期间语音壳保持挂载，用户看状态横幅而不是 join 表单闪烁。
// 本状态机拥有 pending/failed 横幅对与安全定时器；视图喂生命周期事件（begin/error/connect/leave）。
const SWITCH_SAFETY_TIMEOUT_MS = 20_000;
// 服务器密码提示由服务器密码弹窗持有：弹窗打开期间切换保持挂起，经 connect 或取消结算。
const PASSWORD_DIALOG_CODES = new Set(["SERVER_PASSWORD_REQUIRED", "INVALID_SERVER_PASSWORD"]);

export interface ServerSwitchStore {
  pending: string | null;
  failed: string | null;
}

interface Options {
  voiceStore: StoreApi<{ errorCode: string }>;
}

export function createVoiceServerSwitch(options: Options) {
  const store = createStore<ServerSwitchStore>(() => ({ pending: null, failed: null }));
  let safetyTimer: ReturnType<typeof setTimeout> | undefined;

  function clearSafetyTimer(): void {
    if (safetyTimer !== undefined) clearTimeout(safetyTimer);
    safetyTimer = undefined;
  }
  // 幂等：空闲横幅（或已失败横幅）保持不动。
  function fail(): void {
    if (!store.getState().pending) return;
    clearSafetyTimer();
    store.setState({ failed: store.getState().pending, pending: null });
  }
  function begin(name: string): void {
    clearSafetyTimer();
    store.setState({ failed: null, pending: name });
    // 安全网：永不应答的网关不能一直扣住语音壳。
    safetyTimer = setTimeout(fail, SWITCH_SAFETY_TIMEOUT_MS);
  }
  // 终态事件（连上新服务器或离开房间）结束切换；更早尝试的失败横幅不会存活。
  function settle(): void {
    clearSafetyTimer();
    store.setState({ pending: null, failed: null });
  }

  let lastErrorCode = options.voiceStore.getState().errorCode;
  const unsubscribe = options.voiceStore.subscribe((snapshot) => {
    const code = snapshot.errorCode;
    if (code === lastErrorCode) return;
    lastErrorCode = code;
    if (!code || PASSWORD_DIALOG_CODES.has(code)) return;
    fail();
  });

  function dispose(): void {
    clearSafetyTimer();
    unsubscribe();
  }

  const active = () => Boolean(store.getState().pending || store.getState().failed);
  return { store, active, begin, fail, settle, dispose };
}

export type VoiceServerSwitch = ReturnType<typeof createVoiceServerSwitch>;
