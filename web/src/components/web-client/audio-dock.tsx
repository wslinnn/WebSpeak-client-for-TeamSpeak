import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { MAX_INPUT_VOLUME, type VoiceSessionController } from "@/voice/session-controller";
import { rangeStyle } from "@/web-client/view-utils";

interface AudioDockModel {
  microphoneMuted: boolean;
  /* input/output 音量不进 model：拖动每 tick 打满整壳重渲，移动端滑条被
   * 主线程饿到划不动（2026-10-18）——两只滑条自行窄订阅（下方）。 */
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

const CLOSE_DELAY_MS = 80;

/* 坞内悬浮控件：受控 Popover 悬停驱动（UI 迁移批 1）。触发钮保留自有点击
 * 语义（静音切换等），面板开关全由 hover/focus 驱动——锚定用 PopoverAnchor
 * （不用 Trigger，不接管点击）；radix portal 到 body，坞挂进成员面板的
 * overflow:hidden 裁切与 ui-scale 坐标换算一并消失（碰撞归 popper）。 */
function DockHoverControl({ part, label, button, panelClassName, panelPart, children }: {
  part: string;
  label: string;
  button: ReactNode;
  panelClassName: string;
  panelPart: string;
  children: ReactNode;
}) {
  const controlRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const cancelClose = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openUp = (): void => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = (): void => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  // 键盘焦点进出走 focus/blur 冒泡：relatedTarget 仍落在控件或面板内就不收。
  const keepIfInside = (next: EventTarget | null): boolean => Boolean(
    next instanceof Element && (controlRef.current?.contains(next) || panelRef.current?.contains(next)),
  );
  useEffect(() => cancelClose, []);
  return (
    <Popover open={open} onOpenChange={(next) => { if (!next) setOpen(false); }}>
      <PopoverAnchor asChild>
        <div
          ref={controlRef}
          className="dock-hover-control"
          data-ws-part={part}
          onMouseEnter={openUp}
          onMouseLeave={scheduleClose}
          onFocus={(event) => { if (!keepIfInside(event.relatedTarget)) openUp(); }}
          onBlur={(event) => { if (!keepIfInside(event.relatedTarget)) scheduleClose(); }}
        >
          {button}
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={panelRef}
        side="top"
        align="center"
        sideOffset={10}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        data-ws-part={panelPart}
        role="dialog"
        aria-label={label}
        className={panelClassName}
      >{children}</PopoverContent>
    </Popover>
  );
}

/** 桌面音频坞（旧 AudioDock.vue 平价）：共享行（开播以持久化预设直发、齿轮开
 *  设置弹窗）、伴奏钮。坞是「我是否被听见」的表面：静音时电平钉零由视图层
 *  displayMicLevel 承担，设置弹窗里仍看得到原始采集电平。 */
export function AudioDock({ model, controls, voice, share, t, channelName, onSettings, onOutputMute, onDisconnect, onStartShare, onStopShare, onShareSettings, children }: AudioDockProps) {
  const micLevel = useStore(voice.store, (view) => view.micLevel);
  // 拖动热的两只音量窄订阅：不随 shell 视图整包走（拖动每 tick 打满整壳
  // 重渲会让移动端滑条划不动）。
  const inputVolume = useStore(voice.store, (view) => view.inputVolume);
  const outputVolume = useStore(voice.store, (view) => view.outputVolume);
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
        <DockHoverControl
          part="voice.audio-dock.microphone"
          label={t("microphone")}
          panelClassName="dock-microphone-panel"
          panelPart="voice.audio-dock.microphone-panel"
          button={
            <button
              type="button"
              className="desktop-audio-dock-control"
              data-muted={model.microphoneMuted ? "true" : undefined}
              title={model.microphoneMuted ? t("unmuteMic") : t("muteMic")}
              aria-label={model.microphoneMuted ? t("microphoneMuted") : t("microphoneActive")}
              aria-pressed={!model.microphoneMuted}
              onClick={controls.toggleMicrophone}
            ><Icon name="mic" size={18} /></button>
          }
        >
          <div className="dock-slider-heading"
            ><span>{t("inputVolume")}</span
            ><strong>{Math.round(inputVolume * 100)}%</strong></div
          >
          <input
            className="dock-slider"
            type="range"
            min={0}
            max={MAX_INPUT_VOLUME * 100}
            step={5}
            value={inputVolume * 100}
            style={rangeStyle(inputVolume, MAX_INPUT_VOLUME)}
            aria-label={t("inputVolume")}
            onChange={(event) => controls.onInputVolume({ target: event.target })}
          />
          <div className="audio-level-row"
            ><span>{t("micLevel")}</span
            ><strong>{Math.round(displayMicLevel * 100)}%</strong></div
          >
          <div className="audio-level-track dock-level-track"
            ><i style={{ transform: `scaleX(${Math.max(0, displayMicLevel)})` }}></i></div>
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
        </DockHoverControl>
        <DockHoverControl
          part="voice.audio-dock.output"
          label={t("overallVolume")}
          panelClassName="dock-output-panel"
          panelPart="voice.audio-dock.output-panel"
          button={
            <button
              type="button"
              className="desktop-audio-dock-control"
              data-muted={model.outputMuted ? "true" : undefined}
              title={model.outputMuted ? t("unmuteOutput") : t("muteOutput")}
              aria-label={model.outputMuted ? t("unmuteOutput") : t("muteOutput")}
              aria-pressed={!model.outputMuted}
              onClick={onOutputMute}
            ><Icon name="volume" size={18} /></button>
          }
        >
          <div className="dock-slider-heading"
            ><span>{t("overallVolume")}</span
            ><strong>{Math.round(outputVolume * 100)}%</strong></div
          >
          <input
            className="dock-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={outputVolume * 100}
            style={rangeStyle(outputVolume, 1)}
            aria-label={t("overallVolume")}
            onChange={(event) => controls.onOutputVolume({ target: event.target })}
          />
        </DockHoverControl>
      </div>
    </div>
  );
}
