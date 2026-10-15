import type { ReactNode } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import type { VoiceSessionController } from "@/voice/session-controller";
import { rangeStyle } from "@/web-client/view-utils";

interface AudioDockModel {
  microphoneMuted: boolean;
  inputVolume: number;
  outputVolume: number;
  outputMuted: boolean;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  autoGainControlEnabled: boolean;
  accompanimentActive: boolean;
}

interface AudioDockControls {
  toggleMicrophone(): void;
  onInputVolume(event: { target: { value: string } }): void;
  onOutputVolume(event: { target: { value: string } }): void;
  onNoiseSuppressionToggle(event: { target: { checked: boolean } }): void;
  onEchoCancellationToggle(event: { target: { checked: boolean } }): void;
  onAutoGainControlToggle(event: { target: { checked: boolean } }): void;
  toggleAccompaniment(): void;
}

interface AudioDockProps {
  model: AudioDockModel;
  controls: AudioDockControls;
  /** 电平 20–50Hz 写 store，只订在坞自身——壳层不得因电平跳动重渲。 */
  voice: VoiceSessionController;
  share: { active: boolean; starting: boolean };
  t(key: string): string;
  channelName: string;
  onSettings(): void;
  onOutputMute(): void;
  onDisconnect(): void;
  onStartShare(): void;
  onStopShare(): void;
  onShareSettings(): void;
  /** status 位渲染性能面板触发器（旧 #status slot 平价）。 */
  children?: ReactNode;
}

/** 桌面音频坞（旧 AudioDock.vue 平价）：共享行（开播以持久化预设直发、齿轮开
 *  设置弹窗）、伴奏钮。坞是「我是否被听见」的表面：静音时电平钉零由视图层
 *  displayMicLevel 承担，设置弹窗里仍看得到原始采集电平。 */
export function AudioDock({ model, controls, voice, share, t, channelName, onSettings, onOutputMute, onDisconnect, onStartShare, onStopShare, onShareSettings, children }: AudioDockProps) {
  const micLevel = useStore(voice.store, (view) => view.micLevel);
  const displayMicLevel = model.microphoneMuted ? 0 : micLevel;
  return (
    <div
      className="desktop-audio-dock"
      data-ws-part="voice.audio-dock"
      role="toolbar"
      aria-label={t("desktopAudioControls")}
    >
      <div className="desktop-audio-dock-heading">
        <i className="desktop-audio-dock-dot"></i>
        <strong>{channelName}</strong>
        {children}
        <button
          type="button"
          className="desktop-audio-dock-power"
          aria-label={t("exit")}
          title={t("exit")}
          onClick={onDisconnect}
        ><Icon name="power" size={20} /></button>
      </div>
      <div className="desktop-audio-dock-share-row">
        <div className={share.active ? "desktop-audio-dock-share is-stop" : "desktop-audio-dock-share"}>
          {!share.active ? (
            <button
              type="button"
              className="desktop-audio-dock-share-main"
              disabled={share.starting}
              onClick={onStartShare}
            ><Icon name="monitor" size={17} />{t("startScreenShare")}</button>
          ) : (
            <button
              type="button"
              className="desktop-audio-dock-share-main"
              onClick={onStopShare}
            ><Icon name="close" size={14} />{t("stopScreenShare")}</button>
          )}
          <button
            type="button"
            className="desktop-audio-dock-share-gear"
            aria-label={t("screenShareSettings")}
            title={t("screenShareSettings")}
            onClick={onShareSettings}
          ><Icon name="settings" size={13} /></button>
        </div>
        <button
          type="button"
          className="desktop-audio-dock-accompaniment"
          aria-pressed={model.accompanimentActive}
          title={model.accompanimentActive ? t("stopAccompaniment") : t("startAccompaniment")}
          aria-label={model.accompanimentActive ? t("stopAccompaniment") : t("startAccompaniment")}
          onClick={() => void controls.toggleAccompaniment()}
        ><Icon name="music" size={16} /></button>
      </div>
      <div
        className="desktop-audio-dock-controls"
        data-ws-part="voice.audio-dock.controls"
      >
        <button
          type="button"
          className="desktop-audio-dock-control desktop-audio-dock-settings"
          title={t("audioSettings")}
          aria-label={t("audioSettings")}
          onClick={onSettings}
        ><Icon name="settings" size={15} /><span>{t("audioSettings")}</span></button>
        <button
          type="button"
          className="desktop-audio-dock-control desktop-audio-dock-noise"
          aria-pressed={model.noiseSuppressionEnabled}
          data-off={model.noiseSuppressionEnabled ? undefined : "true"}
          title={t("noiseSuppression")}
          aria-label={t("noiseSuppression")}
          onClick={() => void controls.onNoiseSuppressionToggle({ target: { checked: !model.noiseSuppressionEnabled } })}
        ><Icon name="waveform" size={18} /></button>
        <div
          className="dock-hover-control"
          data-ws-part="voice.audio-dock.microphone"
        >
          <button
            type="button"
            className="desktop-audio-dock-control"
            data-muted={model.microphoneMuted ? "true" : undefined}
            title={model.microphoneMuted ? t("unmuteMic") : t("muteMic")}
            aria-label={model.microphoneMuted ? t("microphoneMuted") : t("microphoneActive")}
            aria-pressed={!model.microphoneMuted}
            onClick={controls.toggleMicrophone}
          ><Icon name="mic" size={18} /></button>
          <div
            className="dock-hover-panel dock-microphone-panel"
            data-ws-part="voice.audio-dock.microphone-panel"
            role="dialog"
            aria-label={t("microphone")}
          >
            <div className="dock-slider-heading"
              ><span>{t("inputVolume")}</span
              ><strong>{Math.round(model.inputVolume * 100)}%</strong></div
            >
            <input
              className="dock-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={model.inputVolume * 100}
              style={rangeStyle(model.inputVolume, 1)}
              aria-label={t("inputVolume")}
              onChange={(event) => controls.onInputVolume({ target: event.target })}
            />
            <div className="audio-level-row"
              ><span>{t("micLevel")}</span
              ><strong>{Math.round(displayMicLevel * 100)}%</strong></div
            >
            <div className="audio-level-track dock-level-track"
              ><i style={{ width: `${Math.round(displayMicLevel * 100)}%` }}></i></div>
            <div className="dock-panel-divider"></div>
            <label className="dock-switch-row"
              ><span
                ><strong>{t("noiseSuppression")}</strong></span
              ><input
                type="checkbox"
                checked={model.noiseSuppressionEnabled}
                aria-label={t("noiseSuppression")}
                onChange={(event) => controls.onNoiseSuppressionToggle({ target: event.target })}
            /></label>
            <label className="dock-switch-row"
              ><span
                ><strong>{t("echoCancellation")}</strong></span
              ><input
                type="checkbox"
                checked={model.echoCancellationEnabled}
                aria-label={t("echoCancellation")}
                onChange={(event) => controls.onEchoCancellationToggle({ target: event.target })}
            /></label>
            <label className="dock-switch-row"
              ><span
                ><strong>{t("autoGainControl")}</strong></span
              ><input
                type="checkbox"
                checked={model.autoGainControlEnabled}
                aria-label={t("autoGainControl")}
                onChange={(event) => controls.onAutoGainControlToggle({ target: event.target })}
            /></label>
          </div>
        </div>
        <div
          className="dock-hover-control"
          data-ws-part="voice.audio-dock.output"
        >
          <button
            type="button"
            className="desktop-audio-dock-control"
            data-muted={model.outputMuted ? "true" : undefined}
            title={model.outputMuted ? t("unmuteOutput") : t("muteOutput")}
            aria-label={model.outputMuted ? t("unmuteOutput") : t("muteOutput")}
            aria-pressed={!model.outputMuted}
            onClick={onOutputMute}
          ><Icon name="volume" size={18} /></button>
          <div
            className="dock-hover-panel dock-output-panel"
            data-ws-part="voice.audio-dock.output-panel"
            role="dialog"
            aria-label={t("overallVolume")}
          >
            <div className="dock-slider-heading"
              ><span>{t("overallVolume")}</span
              ><strong>{Math.round(model.outputVolume * 100)}%</strong></div
            >
            <input
              className="dock-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={model.outputVolume * 100}
              style={rangeStyle(model.outputVolume, 1)}
              aria-label={t("overallVolume")}
              onChange={(event) => controls.onOutputVolume({ target: event.target })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
