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
  // 只看连接来源的失败码：任何普通错误帧（命令失败等）落 errorCode，不该误报切服失败。
  voiceStore: StoreApi<{ connectionFailureCode: string }>;
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

  let lastFailureCode = options.voiceStore.getState().connectionFailureCode;
  const unsubscribe = options.voiceStore.subscribe((snapshot) => {
    const code = snapshot.connectionFailureCode;
    if (code === lastFailureCode) return;
    lastFailureCode = code;
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

/** 连接成功即结算切服横幅（旧 WebClient.vue 的 connected watcher 平价：成功或
 *  被取代都算切换结束）。做成独立助手是为了让「connected → settle」这条接线
 *  有单测钉住——此前的 React 移植漏掉调用点，成功切服 20s 后必弹假失败横幅。 */
export function settleSwitchOnConnected(
  voiceStore: StoreApi<{ connected: boolean }>,
  serverSwitch: Pick<VoiceServerSwitch, "settle">,
): () => void {
  let lastConnected = voiceStore.getState().connected;
  return voiceStore.subscribe((snapshot) => {
    if (snapshot.connected && !lastConnected) serverSwitch.settle();
    lastConnected = snapshot.connected;
  });
}
