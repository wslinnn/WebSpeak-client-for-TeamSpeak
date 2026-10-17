import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import { useDialogFocus } from "@/web-client/use-dialog-focus";
import type { AudioControls } from "@/web-client/audio-controls";
import { MAX_INPUT_VOLUME, type VoiceSessionController } from "@/voice/session-controller";
import { rangeStyle } from "@/web-client/view-utils";

export interface AudioSettingsModel {
  inputDevices: Array<{ deviceId: string; label: string }>;
  outputDevices: Array<{ deviceId: string; label: string }>;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  outputDeviceSupported: boolean;
  audioPermission: "unknown" | "granted" | "denied";
  audioContextState: string;
  microphoneMuted: boolean;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  autoGainControlEnabled: boolean;
  inputVolume: number;
  outputVolume: number;
  voxThreshold: number;
  notificationVolume: number;
  microphoneTestActive: boolean;
  testAudioUrl: string;
  microphoneError: string;
  microphoneErrorCode: string;
}

interface AudioSettingsDialogProps {
  model: AudioSettingsModel;
  controls: AudioControls;
  /** 电平 20–50Hz 写 store，只订在弹窗自身（弹窗关闭时不产生任何订阅）。 */
  voice: VoiceSessionController;
  settingsError: string;
  desktopNotificationsEnabled: boolean;
  onDesktopNotificationsToggle(event: { target: { checked: boolean } }): void;
  onClose(): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
  localizedMicrophoneError(code: string, message: string): string;
}

/** 音频设置弹窗（旧 AudioSettingsDialog.vue 平价）：输入/输出设备、降噪三开关、
 *  输入/Vox/输出/通知四滑杆、麦克风测试电平条、桌面通知开关与音频诊断。页持有
 *  稳定的 voice 视图与控制器，本弹窗只呈现。 */
export function AudioSettingsDialog({ model, controls, voice, settingsError, desktopNotificationsEnabled, onDesktopNotificationsToggle, onClose, t, localizedMessage, localizedMicrophoneError }: AudioSettingsDialogProps) {
  const { dialogRef, onDialogKeydown } = useDialogFocus<HTMLElement>({ close: onClose });
  const micLevel = useStore(voice.store, (view) => view.micLevel);
  const [testAudioError, setTestAudioError] = useState("");
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  // 持久化的 deviceId 可能已不在枚举列表（拔插、Safari 轮换 id）；回退默认项好过空白下拉。
  const listedValue = (deviceId: string, devices: Array<{ deviceId: string }>): string =>
    deviceId && devices.some((device) => device.deviceId === deviceId) ? deviceId : "";
  const inputSelectValue = listedValue(model.selectedInputDeviceId, model.inputDevices);
  const outputSelectValue = listedValue(model.selectedOutputDeviceId, model.outputDevices);

  // 试听音频是独立播放端点：也钉到所选输出设备，否则选扬声器只管一半声音。
  useEffect(() => {
    const element = testAudioRef.current;
    if (!model.testAudioUrl || !element || !("setSinkId" in element)) return;
    void (element as HTMLAudioElement & { setSinkId(deviceId: string): Promise<void> }).setSinkId(outputSelectValue).catch(() => undefined);
  }, [model.testAudioUrl, outputSelectValue]);

  function onTestAudioError(): void {
    const mediaError = testAudioRef.current?.error;
    setTestAudioError(t("testPlaybackFailed", { code: mediaError?.code ?? 0 }));
  }

  const micMeterBars = Math.round(micLevel * controls.meterBars);
  const dialogError = testAudioError || settingsError;

  return (
    <div className="modal-backdrop">
      <section
        className="settings-modal"
        data-ws-part="voice.audio-settings"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={onDialogKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-main"
          ><header className="settings-header"
            ><h2 id="settings-title">{t("audioConfiguration")}</h2
            ><button
              className="round-icon"
              title={t("close")}
              onClick={onClose}
            ><Icon
                name="close"
                size={19} /></button></header
          ><div className="settings-content">
            <section className="settings-section"
              ><h3
                ><Icon
                  name="mic"
                  size={20}
                />
                {t("inputDevice")}</h3
              ><label
                className="settings-label"
                htmlFor="input-device"
              >{t("microphone")}</label
              ><select
                id="input-device"
                className="settings-select"
                value={inputSelectValue}
                disabled={model.inputDevices.length === 0}
                onChange={(event) => void controls.onInputDeviceChange({ target: event.target })}
              ><option value="">{t("defaultMicrophone")}</option
                >{model.inputDevices.map((device, index) => (
                  <option key={device.deviceId || `microphone-${index}`} value={device.deviceId}>{device.label || t("microphoneNumber", { index: index + 1 })}</option>
                ))}</select
              ><p
                className="settings-error"
                style={dialogError ? undefined : { display: "none" }}
                >{localizedMessage(dialogError)}</p
              ><p className="audio-diagnostic"
                ><span>{t("permission")}</span
                ><strong className={`permission-${model.audioPermission}`}>{{
                  granted: t("permissionGranted"),
                  denied: t("permissionDenied"),
                  unknown: t("permissionUnknown"),
                }[model.audioPermission]}</strong></p
              ><div className="microphone-control"
                ><div
                  ><label className="settings-label">{t("microphoneState")}</label
                  ><p className="settings-hint"
                    >{model.microphoneMuted ? t("microphoneMutedHint") : t("microphoneActiveHint")}</p></div
                ><button
                  type="button"
                  className={model.microphoneMuted ? "microphone-toggle muted" : "microphone-toggle"}
                  aria-pressed={!model.microphoneMuted}
                  onClick={controls.toggleMicrophone}
                ><Icon
                    name={model.microphoneMuted ? "mic-off" : "mic"}
                    size={16}
                  />
                  {model.microphoneMuted ? t("unmuteMic") : t("muteMic")}</button
                ></div
              ><label
                className="mobile-noise-toggle"
                ><span
                  ><strong>{t("noiseSuppression")}</strong
                  ><small>{t("noiseSuppressionHint")}</small></span
                ><input
                  type="checkbox"
                  checked={model.noiseSuppressionEnabled}
                  aria-label={t("noiseSuppression")}
                  onChange={(event) => controls.onNoiseSuppressionToggle({ target: event.target })}
                /></label
              ><label
                className="mobile-noise-toggle"
                ><span
                  ><strong>{t("echoCancellation")}</strong
                  ><small>{t("echoCancellationHint")}</small></span
                ><input
                  type="checkbox"
                  checked={model.echoCancellationEnabled}
                  aria-label={t("echoCancellation")}
                  onChange={(event) => controls.onEchoCancellationToggle({ target: event.target })}
                /></label
              ><label
                className="mobile-noise-toggle"
                ><span
                  ><strong>{t("autoGainControl")}</strong
                  ><small>{t("autoGainControlHint")}</small></span
                ><input
                  type="checkbox"
                  checked={model.autoGainControlEnabled}
                  aria-label={t("autoGainControl")}
                  onChange={(event) => controls.onAutoGainControlToggle({ target: event.target })}
                /></label
              ><div className="settings-range-row"
                ><label className="settings-label">{t("inputVolume")}</label
                ><strong>{Math.round(model.inputVolume * 100)}%</strong></div
              ><input
                className="settings-range"
                type="range"
                min={0}
                max={MAX_INPUT_VOLUME * 100}
                step={5}
                value={model.inputVolume * 100}
                style={rangeStyle(model.inputVolume, MAX_INPUT_VOLUME)}
                aria-label={t("inputVolume")}
                onChange={(event) => controls.onInputVolume({ target: event.target as HTMLInputElement })}
              /><div className="settings-range-row"
                ><label className="settings-label">{t("voxThreshold")}</label
                ><strong>{(model.voxThreshold * 100).toFixed(1)}%</strong></div
              ><input
                className="settings-range"
                type="range"
                min={1}
                max={80}
                value={model.voxThreshold * 1000}
                style={rangeStyle(model.voxThreshold, 0.08)}
                aria-label={t("voxThreshold")}
                onChange={(event) => controls.onVoxThreshold({ target: event.target as HTMLInputElement })}
              /><div className="audio-level-row"
                ><span>{t("micLevel")}</span
                ><strong>{Math.round(micLevel * 100)}%</strong></div
              ><div className="audio-level-track"
                ><i style={{ width: `${Math.round(micLevel * 100)}%` }}></i></div
              ><div className="mic-test"
                ><div className="mic-test-header"
                  ><strong>{t("microphoneTest")}</strong
                  ><button
                    type="button"
                    onClick={() => void controls.toggleMicTest()}
                  >{model.microphoneTestActive ? t("stopTest") : t("startTest")}</button
                  ></div
                ><div className="meter"
                  >{Array.from({ length: controls.meterBars }, (_, index) => (
                    <i
                      key={index}
                      className={model.microphoneTestActive && index + 1 <= micMeterBars ? "active" : undefined}
                      style={{ height: `${controls.meterBarHeight(index + 1)}px` }}
                    ></i>
                  ))}</div
                ><div className="meter-labels"
                  ><span>{t("silence")}</span
                  ><span>{t("optimal")}</span
                  ><span>{t("loud")}</span></div
                ><p className="settings-hint">{t("localMicTestHint")}</p
                >{model.testAudioUrl && (
                  <audio
                    ref={testAudioRef}
                    className="test-audio"
                    src={model.testAudioUrl}
                    controls
                    aria-label={t("microphoneTest")}
                    onError={onTestAudioError}
                  ></audio>
                )}</div
              ></section>
            <div className="settings-separator"></div
            ><section className="settings-section"
              ><h3
                ><Icon
                  name="volume"
                  size={20}
                />
                {t("outputVolume")}</h3
              >{model.outputDeviceSupported && (
                <>
                  <label
                    className="settings-label"
                    htmlFor="output-device"
                  >{t("outputDevice")}</label
                  ><select
                    id="output-device"
                    className="settings-select"
                    value={outputSelectValue}
                    disabled={model.outputDevices.length === 0}
                    onChange={(event) => void controls.onOutputDeviceChange({ target: event.target })}
                  ><option value="">{t("defaultOutput")}</option
                    >{model.outputDevices.map((device, index) => (
                      <option key={device.deviceId || `speaker-${index}`} value={device.deviceId}>{device.label || t("speakerNumber", { index: index + 1 })}</option>
                    ))}</select>
                </>
              )}
              {!model.outputDeviceSupported && (
                <p className="mode-note"
                  ><Icon
                    name="info"
                    size={16}
                  /><span>{t("outputDeviceUnsupported")}</span></p>
              )}
              <div className="settings-range-row"
                ><label className="settings-label">{t("speakers")}</label
                ><strong>{Math.round(model.outputVolume * 100)}%</strong></div
              ><input
                className="settings-range"
                type="range"
                min={0}
                max={100}
                step={5}
                value={model.outputVolume * 100}
                style={rangeStyle(model.outputVolume, 1)}
                aria-label={t("outputVolume")}
                onChange={(event) => controls.onOutputVolume({ target: event.target as HTMLInputElement })}
              /><div className="settings-range-row"
                ><label className="settings-label">{t("notificationVolume")}</label
                ><strong>{Math.round(model.notificationVolume * 100)}%</strong></div
              ><input
                className="settings-range"
                type="range"
                min={0}
                max={100}
                step={5}
                value={model.notificationVolume * 100}
                style={rangeStyle(model.notificationVolume, 1)}
                aria-label={t("notificationVolume")}
                onChange={(event) => controls.onNotificationVolume({ target: event.target as HTMLInputElement })}
              /><label
                className="desktop-notification-toggle"
                ><span
                  ><strong>{t("desktopNotifications")}</strong
                  ><small>{t("desktopNotificationsHint")}</small></span
                ><input
                  type="checkbox"
                  checked={desktopNotificationsEnabled}
                  aria-label={t("desktopNotifications")}
                  onChange={(event) => onDesktopNotificationsToggle({ target: event.target })}
                /></label
              ><div className="audio-diagnostic"
                ><span>{t("audioStatus")}</span
                ><strong
                  >{model.audioContextState === "running"
                    ? model.microphoneError
                      ? t("audioUnavailable")
                      : t("audioReady")
                    : model.audioContextState === "suspended"
                      ? t("audioSuspended")
                      : t("audioUnknown")}</strong></div
              ><p
                className="settings-error"
                style={model.microphoneError ? undefined : { display: "none" }}
                >{localizedMicrophoneError(model.microphoneErrorCode, model.microphoneError)}</p
              ><div className="mode-note"
                ><Icon
                  name="shield"
                  size={16}
                /><span>{t("audioPrivacy")}</span></div
              ></section
            > </div
          ><footer className="settings-footer"
            ><button
              className="primary-button save-button"
              onClick={onClose}
            >{t("done")}</button
            ></footer
          ></div
        >
      </section>
    </div>
  );
}
