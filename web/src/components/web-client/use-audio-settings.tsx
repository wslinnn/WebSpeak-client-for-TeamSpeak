import { useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { AudioSettingsDialog, type AudioSettingsModel } from "./audio-settings-dialog";
import { desktopNotificationPermission, readDesktopNotificationSetting, requestDesktopNotificationPermission, writeDesktopNotificationSetting } from "@/services/desktop-notifications";
import { useVoiceView } from "@/hooks/useVoiceSession";
import type { AudioControls } from "@/web-client/audio-controls";
import type { VoiceSessionController } from "@/voice/session-controller";

interface AudioSettingsStateOptions {
  audioControls: AudioControls;
  /** 电平只订在弹窗自身；根视图持 controller 仅为传递。 */
  voice: VoiceSessionController;
  settingsOpen: boolean;
  closeSettings(): void;
  showToast(message: string, tone?: "info" | "warn"): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
  localizedMicrophoneError(code: string, message: string): string;
}

/** 音频设置弹窗状态（旧 settingsOpen + desktopNotificationsEnabled 根 ref 平价）：
 *  弹窗模型切片、设置错误、桌面通知开关（借手势要权限、被拒回退落盘）。渲染的
 *  弹窗元素经 dialog 返回——弹窗在模板根部两态可达。 */
export function useAudioSettingsState(options: AudioSettingsStateOptions) {
  const { audioControls, voice, settingsOpen, closeSettings, showToast, t, localizedMessage, localizedMicrophoneError } = options;
  const audioModel = useVoiceAudioSettingsModel();
  const audioSettingsError = useStore(audioControls.store).settingsError;
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(() => readDesktopNotificationSetting());

  // 旧 onDesktopNotificationsToggle：开关即落盘；首次开启借手势要权限，被拒则
  // 静默回退存储标记并提示。
  function handleDesktopNotificationsToggle(checked: { target: { checked: boolean } }): void {
    const enabled = checked.target.checked;
    setDesktopNotificationsEnabled(enabled);
    writeDesktopNotificationSetting(enabled);
    if (!enabled || desktopNotificationPermission() === "granted") return;
    void requestDesktopNotificationPermission().then((permission) => {
      if (permission === "granted") {
        showToast(t("desktopNotificationsOn"));
        return;
      }
      setDesktopNotificationsEnabled(false);
      writeDesktopNotificationSetting(false);
      showToast(t("desktopNotificationsBlocked"), "warn");
    });
  }

  const dialog = settingsOpen ? (
    <AudioSettingsDialog
      model={audioModel}
      controls={audioControls}
      voice={voice}
      settingsError={audioSettingsError}
      desktopNotificationsEnabled={desktopNotificationsEnabled}
      onDesktopNotificationsToggle={handleDesktopNotificationsToggle}
      onClose={closeSettings}
      t={t}
      localizedMessage={localizedMessage}
      localizedMicrophoneError={localizedMicrophoneError}
    />
  ) : null;

  return { audioModel, audioSettingsError, desktopNotificationsEnabled, handleDesktopNotificationsToggle, dialog };
}

function useVoiceAudioSettingsModel(): AudioSettingsModel {
  return useVoiceView(useShallow((view): AudioSettingsModel => ({
    inputDevices: view.inputDevices,
    outputDevices: view.outputDevices,
    selectedInputDeviceId: view.selectedInputDeviceId,
    selectedOutputDeviceId: view.selectedOutputDeviceId,
    outputDeviceSupported: view.outputDeviceSupported,
    audioPermission: view.audioPermission,
    audioContextState: view.audioContextState,
    microphoneMuted: view.microphoneMuted,
    noiseSuppressionEnabled: view.noiseSuppressionEnabled,
    echoCancellationEnabled: view.echoCancellationEnabled,
    autoGainControlEnabled: view.autoGainControlEnabled,
    /* inputVolume/outputVolume 不进模型：模型挂在根视图，拖动每 tick 会整树
     * 重渲——两只音量由弹窗自行窄订阅（同 micLevel 模式）。 */
    voxThreshold: view.voxThreshold,
    notificationVolume: view.notificationVolume,
    microphoneTestActive: view.microphoneTestActive,
    testAudioUrl: view.testAudioUrl,
    microphoneProcessing: view.microphoneProcessing,
    microphoneError: view.microphoneError,
    microphoneErrorCode: view.microphoneErrorCode,
  })));
}
