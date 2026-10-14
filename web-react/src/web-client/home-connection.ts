import { combineTeamSpeakTarget, isValidTeamSpeakPort, suggestedTeamSpeakPort } from "@/services/teamspeak-target";
import type { StoreApi } from "zustand";

import type { HomeStore } from "./home-store";

/** 语音视图里连接逻辑消费的最小切面（真实实现 = session-controller 的 view store）。 */
export interface VoiceConnectionView {
  errorCode: string;
  errorMessage: string;
  channelSwitchedChannelId: string;
  selfMovedChannelId: string;
}

export interface ChannelLike {
  id: string;
  name: string;
  members: Array<{ id: number }>;
}

interface Options {
  store: StoreApi<HomeStore>;
  /** 语音视图 store：订阅四个连接相关字段的变更（Vue watch 的平价订阅点）。 */
  voiceStore: StoreApi<VoiceConnectionView>;
  connect(target: string, channel: string, nickname: string, password: string, identity: string, remember: boolean): void;
  disconnect(): void;
  isConnecting(): boolean;
  switchChannel(channelId: string, password?: string): Promise<void>;
  clearError(): void;
  getChannels(): ChannelLike[];
  getClientId(): number;
  saveNickname(nickname: string): void;
  showToast(message: string, tone?: "info" | "warn"): void;
  localizedMessage(message: string): string;
  t(key: string): string;
  initialized(): boolean;
  accessMode(): "fixed" | "open";
}

// 旧 useWebClientConnection 平价：join 触发、服务器/频道密码弹窗、乐观选台与回滚。
// Vue 的 flush:sync watch 在这里显式化：地址变更带动端口建议；语音视图四字段经
// store 订阅驱动弹窗开关（语义等价，时机点同旧 watch）。
export function createHomeConnection(options: Options) {
  const state = () => options.store.getState();
  const patch = (partial: Partial<HomeStore>) => options.store.setState(partial);

  function canJoin(): boolean {
    const snapshot = state();
    return Boolean(
      options.initialized()
      && snapshot.nickname.trim()
      && (options.accessMode() === "fixed" || (snapshot.serverHost.trim() && isValidTeamSpeakPort(snapshot.serverPort))),
    );
  }

  function setHost(address: string): void {
    const previous = state().serverHost;
    if (previous === address) return;
    patch({ serverHost: address, serverPort: suggestedTeamSpeakPort(previous, address, state().serverPort) });
  }
  function setPort(port: string): void {
    patch({ serverPort: port });
  }
  function setServerPassword(password: string): void {
    patch({ serverPassword: password });
  }
  function setNickname(nickname: string): void {
    patch({ nickname });
  }
  function setChannelName(channelName: string): void {
    patch({ channelName });
  }

  function currentServerTarget(): string {
    return combineTeamSpeakTarget(state().serverHost, state().serverPort);
  }

  function doConnect(): void {
    const snapshot = state();
    if (!canJoin() || options.isConnecting()) return;
    options.clearError();
    const trimmedNickname = snapshot.nickname.trim();
    patch({ nickname: trimmedNickname });
    options.saveNickname(trimmedNickname);
    let host = snapshot.serverHost;
    let port = snapshot.serverPort;
    if (options.accessMode() === "open") {
      host = host.trim();
      port = port.trim();
      patch({ serverHost: host, serverPort: port });
    }
    patch({ selectedChannelId: "" });
    // 管理员托管目标上密码保留以供重试。
    options.connect(
      currentServerTarget(),
      snapshot.channelName.trim(),
      trimmedNickname,
      snapshot.serverPassword,
      snapshot.rememberIdentity ? snapshot.identityMaterial : "",
      snapshot.rememberIdentity,
    );
  }

  function doDisconnect(): void {
    // 取消挂起中的 join 从未进房：toast 说「已取消」而不是「已离开」。
    const wasConnecting = options.isConnecting();
    options.disconnect();
    patch({ selectedChannelId: "" });
    options.showToast(options.t(wasConnecting ? "cancelConnectToast" : "leftToast"));
  }

  function submitServerPassword(): void {
    const dialog = state().serverPasswordDialog;
    if (!dialog.open || !dialog.password) return;
    patch({ serverPassword: dialog.password, serverPasswordDialog: { open: false, password: "", errorCode: "" } });
    doConnect();
  }

  function cancelServerPassword(): void {
    patch({ serverPasswordDialog: { open: false, password: "", errorCode: "" } });
    options.clearError();
  }

  async function selectChannel(channel: ChannelLike): Promise<void> {
    // 空目录占位行不是 TeamSpeak 频道；网关会以 INVALID_CHANNEL_ID 拒绝。
    if (channel.id === "__current__") return;
    const previous = { selectedChannelId: state().selectedChannelId, channelName: state().channelName };
    patch({ selectedChannelId: channel.id, channelName: channel.name, chatTab: "channel" });
    try {
      await options.switchChannel(channel.id);
    } catch (error) {
      // 密码弹窗拥有这次失败：其订阅会重开弹窗，乐观选台必须存活供重试落点。
      if (error instanceof Error && (error as Error & { code?: string }).code === "CHANNEL_PASSWORD_REQUIRED") return;
      patch({ selectedChannelId: previous.selectedChannelId, channelName: previous.channelName });
      options.showToast(options.localizedMessage(error instanceof Error && error.message ? error.message : "切换频道失败"), "warn");
    }
  }

  function submitChannelPassword(): void {
    const dialog = state().channelPasswordDialog;
    if (!dialog.open || dialog.submitting || !dialog.channelId || !dialog.password) return;
    patch({ channelPasswordDialog: { ...dialog, error: "", submitting: true } });
    // 失败经 errorCode 订阅回到弹窗；只有不携带错误码的超时会卡住转圈——这里兜底。
    options.switchChannel(dialog.channelId, dialog.password).catch(() => {
      if (!options.voiceStore.getState().errorCode) {
        patch({ channelPasswordDialog: { ...state().channelPasswordDialog, submitting: false } });
      }
    });
  }

  function cancelChannelPassword(): void {
    const ownChannel = options.getChannels().find((item) => item.members.some((member) => member.id === options.getClientId()));
    patch({
      ...(ownChannel ? { selectedChannelId: ownChannel.id } : {}),
      channelPasswordDialog: { open: false, channelId: "", password: "", error: "", submitting: false },
    });
    options.clearError();
  }

  function selectChannelById(): void {
    const channel = options.getChannels().find((item) => item.id === state().selectedChannelId);
    if (channel) void selectChannel(channel);
  }

  // —— 语音视图订阅（旧 watch(errorCode/channelSwitchedChannelId/selfMovedChannelId) 群的平价） ——
  let lastErrorCode = options.voiceStore.getState().errorCode;
  let lastSwitched = options.voiceStore.getState().channelSwitchedChannelId;
  let lastSelfMoved = options.voiceStore.getState().selfMovedChannelId;
  const unsubscribe = options.voiceStore.subscribe((snapshot) => {
    const codeChanged = snapshot.errorCode !== lastErrorCode;
    const switchedChanged = snapshot.channelSwitchedChannelId !== lastSwitched;
    const selfMovedChanged = snapshot.selfMovedChannelId !== lastSelfMoved;
    lastErrorCode = snapshot.errorCode;
    lastSwitched = snapshot.channelSwitchedChannelId;
    lastSelfMoved = snapshot.selfMovedChannelId;
    if (codeChanged) {
      handleErrorCode(snapshot.errorCode, snapshot.errorMessage);
      handleServerPasswordCode(snapshot.errorCode);
    }
    if (switchedChanged) handleChannelSwitched(snapshot.channelSwitchedChannelId);
    if (selfMovedChanged) handleSelfMoved(snapshot.selfMovedChannelId);
  });

  function handleErrorCode(code: string, errorMessage: string): void {
    const dialog = state().channelPasswordDialog;
    if (code && code !== "CHANNEL_PASSWORD_REQUIRED" && dialog.open && dialog.submitting) {
      patch({ channelPasswordDialog: { ...dialog, error: errorMessage, submitting: false } });
      options.clearError();
      return;
    }
    if (code !== "CHANNEL_PASSWORD_REQUIRED" || !state().selectedChannelId) return;
    patch({
      channelPasswordDialog: { open: true, channelId: state().selectedChannelId, password: "", error: options.t("channelPasswordRetry"), submitting: false },
    });
    options.clearError();
    queueMicrotask(() => document.getElementById("channel-password-input")?.focus());
  }

  function handleServerPasswordCode(code: string): void {
    if (code !== "SERVER_PASSWORD_REQUIRED" && code !== "INVALID_SERVER_PASSWORD") return;
    patch({ serverPasswordDialog: { open: true, password: "", errorCode: code } });
    options.clearError();
    queueMicrotask(() => document.getElementById("retry-server-password-input")?.focus());
  }

  function handleChannelSwitched(channelId: string): void {
    const dialog = state().channelPasswordDialog;
    if (!dialog.open || !channelId || channelId !== dialog.channelId) return;
    patch({ channelPasswordDialog: { open: false, channelId: "", password: "", error: "", submitting: false } });
  }

  function handleSelfMoved(channelId: string): void {
    if (!channelId) return;
    const movedChannel = options.getChannels().find((item) => item.id === channelId);
    if (!movedChannel) return;
    patch({ selectedChannelId: movedChannel.id, channelName: movedChannel.name });
  }

  function dispose(): void {
    unsubscribe();
  }

  return {
    canJoin,
    setHost,
    setPort,
    setServerPassword,
    setNickname,
    setChannelName,
    currentServerTarget,
    doConnect,
    doDisconnect,
    submitServerPassword,
    cancelServerPassword,
    selectChannel,
    submitChannelPassword,
    cancelChannelPassword,
    selectChannelById,
    dispose,
  };
}

export type HomeConnection = ReturnType<typeof createHomeConnection>;
