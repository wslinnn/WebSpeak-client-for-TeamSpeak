import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { AudioControls } from "@/web-client/audio-controls";
import { MAX_INPUT_VOLUME, type VoiceSessionController } from "@/voice/session-controller";

/** radix Select item 禁空串值：默认设备的哨兵（真 deviceId 不会是 @ 前缀）。 */
const DEFAULT_DEVICE_ITEM = "@default";

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
  /* inputVolume/outputVolume 不进模型（模型在根视图，拖动每 tick 会整树重渲）：
   * 两只音量由弹窗经 voice.store 窄订阅（同 micLevel 模式）。 */
  voxThreshold: number;
  notificationVolume: number;
  microphoneTestActive: boolean;
  testAudioUrl: string;
  /** 浏览器轨道的实际生效状态（track.getSettings()，null=未应用）：约束开关
   *  与实际生效可能不一致——设备/浏览器会忽略约束，回声排查以此为准。 */
  microphoneProcessing: { echoCancellation: boolean | null; noiseSuppression: boolean | null; autoGainControl: boolean | null; rnnoise: boolean | null };
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
  const micLevel = useStore(voice.store, (view) => view.micLevel);
  // 两只音量窄订阅：拖动 tick 不再整树重渲（模型在根视图，此前移动端滑条
  // 会被主线程饿到划不动）。
  const inputVolume = useStore(voice.store, (view) => view.inputVolume);
  const outputVolume = useStore(voice.store, (view) => view.outputVolume);
  const [testAudioError, setTestAudioError] = useState("");
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  // 持久化的 deviceId 可能已不在枚举列表（拔插、Safari 轮换 id）；回退默认项好过空白下拉。
  const listedValue = (deviceId: string, devices: Array<{ deviceId: string }>): string =>
    deviceId && devices.some((device) => device.deviceId === deviceId) ? deviceId : "";
  const inputSelectValue = listedValue(model.selectedInputDeviceId, model.inputDevices);
  const outputSelectValue = listedValue(model.selectedOutputDeviceId, model.outputDevices);
  // radix Select 不允许空串 item 值：默认设备用哨兵表达，Select 边界与 "" 互转
  // （控制器与 setSinkId 的默认设备语义仍是空串）。
  const toDeviceItem = (value: string): string => value || DEFAULT_DEVICE_ITEM;
  const fromDeviceItem = (value: string): string => (value === DEFAULT_DEVICE_ITEM ? "" : value);

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
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="settings-modal"
        data-ws-part="voice.audio-settings"
        aria-labelledby="settings-title"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="settings-main"
          ><header className="settings-header"
            ><DialogTitle id="settings-title">{t("audioConfiguration")}</DialogTitle
            ><DialogClose asChild
              ><Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("close")}
              ><Icon
                  name="close"
                  size={19} /></Button></DialogClose></header
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
              ><Select
                value={toDeviceItem(inputSelectValue)}
                disabled={model.inputDevices.length === 0}
                onValueChange={(value) => void controls.onInputDeviceChange({ target: { value: fromDeviceItem(value) } })}
              ><SelectTrigger id="input-device" className="settings-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_DEVICE_ITEM}>{t("defaultMicrophone")}</SelectItem>
                  {model.inputDevices.map((device, index) => (
                    <SelectItem key={device.deviceId || `microphone-${index}`} value={device.deviceId}>{device.label || t("microphoneNumber", { index: index + 1 })}</SelectItem>
                  ))}
                </SelectContent>
              </Select
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
                ><Button variant="ghost"
                  type="button"
                  className={model.microphoneMuted ? "microphone-toggle muted" : "microphone-toggle"}
                  aria-pressed={!model.microphoneMuted}
                  onClick={controls.toggleMicrophone}
                ><Icon
                    name={model.microphoneMuted ? "mic-off" : "mic"}
                    size={16}
                  />
                  {model.microphoneMuted ? t("unmuteMic") : t("muteMic")}</Button
                ></div
              ><div
                className="mobile-noise-toggle"
                ><span
                  ><strong>{t("noiseSuppression")}</strong
                  ><small>{t("noiseSuppressionHint")}</small></span
                ><Switch
                  checked={model.noiseSuppressionEnabled}
                  aria-label={t("noiseSuppression")}
                  onCheckedChange={(checked) => controls.onNoiseSuppressionToggle({ target: { checked } })}
                /></div
              ><div
                className="mobile-noise-toggle"
                ><span
                  ><strong>{t("echoCancellation")}</strong
                  ><small>{t("echoCancellationHint")}</small></span
                ><Switch
                  checked={model.echoCancellationEnabled}
                  aria-label={t("echoCancellation")}
                  onCheckedChange={(checked) => controls.onEchoCancellationToggle({ target: { checked } })}
                /></div
              >{model.microphoneProcessing.echoCancellation !== null && (
                <p className="settings-hint">
                  {model.microphoneProcessing.echoCancellation ? t("aecActiveHint") : t("aecInactiveHint")}
                </p>
              )}<div
                className="mobile-noise-toggle"
                ><span
                  ><strong>{t("autoGainControl")}</strong
                  ><small>{t("autoGainControlHint")}</small></span
                ><Switch
                  checked={model.autoGainControlEnabled}
                  aria-label={t("autoGainControl")}
                  onCheckedChange={(checked) => controls.onAutoGainControlToggle({ target: { checked } })}
                /></div
              ><div className="settings-range-row"
                ><label className="settings-label">{t("inputVolume")}</label
                ><strong>{Math.round(inputVolume * 100)}%</strong></div
              ><Slider
                value={[Math.round(inputVolume * 100)]}
                max={MAX_INPUT_VOLUME * 100}
                step={5}
                aria-label={t("inputVolume")}
                onValueChange={(values) => controls.onInputVolume({ target: { value: String(values[0]) } })}
              /><div className="settings-range-row"
                ><label className="settings-label">{t("voxThreshold")}</label
                ><strong>{(model.voxThreshold * 100).toFixed(1)}%</strong></div
              ><Slider
                value={[Math.round(model.voxThreshold * 1000)]}
                min={1}
                max={80}
                aria-label={t("voxThreshold")}
                onValueChange={(values) => controls.onVoxThreshold({ target: { value: String(values[0]) } })}
              /><div className="audio-level-row"
                ><span>{t("micLevel")}</span
                ><strong>{Math.round(micLevel * 100)}%</strong></div
              ><div className="audio-level-track"
                ><i style={{ transform: `scaleX(${Math.max(0, micLevel)})` }}></i></div
              ><div className="mic-test"
                ><div className="mic-test-header"
                  ><strong>{t("microphoneTest")}</strong
                  ><Button variant="ghost"
                    type="button"
                    onClick={() => void controls.toggleMicTest()}
                  >{model.microphoneTestActive ? t("stopTest") : t("startTest")}</Button
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
                    onPlay={() => controls.setMicTestPlayback(true)}
                    onPause={() => controls.setMicTestPlayback(false)}
                    onEnded={() => controls.setMicTestPlayback(false)}
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
                  ><Select
                    value={toDeviceItem(outputSelectValue)}
                    disabled={model.outputDevices.length === 0}
                    onValueChange={(value) => void controls.onOutputDeviceChange({ target: { value: fromDeviceItem(value) } })}
                  ><SelectTrigger id="output-device" className="settings-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_DEVICE_ITEM}>{t("defaultOutput")}</SelectItem>
                      {model.outputDevices.map((device, index) => (
                        <SelectItem key={device.deviceId || `speaker-${index}`} value={device.deviceId}>{device.label || t("speakerNumber", { index: index + 1 })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                ><strong>{Math.round(outputVolume * 100)}%</strong></div
              ><Slider
                value={[Math.round(outputVolume * 100)]}
                max={100}
                step={5}
                aria-label={t("outputVolume")}
                onValueChange={(values) => controls.onOutputVolume({ target: { value: String(values[0]) } })}
              /><div className="settings-range-row"
                ><label className="settings-label">{t("notificationVolume")}</label
                ><strong>{Math.round(model.notificationVolume * 100)}%</strong></div
              ><Slider
                value={[Math.round(model.notificationVolume * 100)]}
                max={100}
                step={5}
                aria-label={t("notificationVolume")}
                onValueChange={(values) => controls.onNotificationVolume({ target: { value: String(values[0]) } })}
              /><div
                className="desktop-notification-toggle"
                ><span
                  ><strong>{t("desktopNotifications")}</strong
                  ><small>{t("desktopNotificationsHint")}</small></span
                ><Switch
                  checked={desktopNotificationsEnabled}
                  aria-label={t("desktopNotifications")}
                  onCheckedChange={(checked) => onDesktopNotificationsToggle({ target: { checked } })}
                /></div
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
            ><Button
              size="lg"
              onClick={onClose}
            >{t("done")}</Button
            ></footer
          ></div
        >
      </DialogContent>
    </Dialog>
  );
}
