import type { VoiceSessionView } from "@/voice/session-controller";

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
    serverName: view.serverName,
    serverWelcomeMessage: view.serverWelcomeMessage,
    volumes: view.volumes,
    whisperTargetIds: view.whisperTargetIds,
    whisperActive: view.whisperActive,
    microphoneMuted: view.microphoneMuted,
    inputVolume: view.inputVolume,
    outputVolume: view.outputVolume,
    outputMuted: view.outputMuted,
    noiseSuppressionEnabled: view.noiseSuppressionEnabled,
    echoCancellationEnabled: view.echoCancellationEnabled,
    autoGainControlEnabled: view.autoGainControlEnabled,
    accompanimentActive: view.accompanimentActive,
  };
}
