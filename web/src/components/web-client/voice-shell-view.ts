import type { VoiceSessionView } from "@/voice/session-controller";
import type { VoiceSessionSnapshot } from "@/voice/session-state";

/** 壳层语音视图切片：刻意不含 micLevel（20–50Hz 写，只订在 AudioDock 与
 * 设置弹窗自身）；字段集合即 VoiceShell 渲染实际消费面，新增消费须登记。 */
export function selectVoiceShellView(view: VoiceSessionView) {
  return {
    tsClientId: view.tsClientId,
    connecting: view.connecting,
    reconnecting: view.reconnecting,
    reconnectFailed: view.reconnectFailed,
    reconnectAttempt: view.reconnectAttempt,
    error: view.error,
    audioNotice: view.audioNotice,
    audioNoticeCode: view.audioNoticeCode,
    microphoneError: view.microphoneError,
    microphoneErrorCode: view.microphoneErrorCode,
    volumes: view.volumes,
    whisperTargetIds: view.whisperTargetIds,
    whisperActive: view.whisperActive,
    microphoneMuted: view.microphoneMuted,
    outputMuted: view.outputMuted,
    noiseSuppressionEnabled: view.noiseSuppressionEnabled,
    echoCancellationEnabled: view.echoCancellationEnabled,
    autoGainControlEnabled: view.autoGainControlEnabled,
    accompanimentActive: view.accompanimentActive,
  };
}

/** 壳层会话切片：整包订阅会让每条聊天消息、每个事件都重渲整个进房壳（壳被
 *  React Compiler 跳过优化，没有自动 memo 兜底）。字段集合即 VoiceShell 渲染
 * 实际消费面，新增消费须在此登记。 */
export function selectVoiceShellSession(state: VoiceSessionSnapshot) {
  return {
    channels: state.channels,
    members: state.members,
    pokeNotifications: state.pokeNotifications,
    serverEvents: state.serverEvents,
  };
}
