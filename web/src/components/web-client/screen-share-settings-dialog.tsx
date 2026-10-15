import { Icon } from "./icon";
import { useDialogFocus } from "@/web-client/use-dialog-focus";
import {
  SCREEN_SHARE_BITRATE_OPTIONS,
  SCREEN_SHARE_FRAME_RATE_OPTIONS,
  SCREEN_SHARE_RESOLUTION_OPTIONS,
  type ScreenShareBitratePreset,
  type ScreenSharePresets,
  type ScreenShareResolutionPreset,
} from "@/web-client/screen-share-view";

interface ScreenShareSettingsDialogProps {
  presets: ScreenSharePresets;
  onPresetsChange(presets: ScreenSharePresets): void;
  /** 开始共享（旧 startWithSettings：持久化 + 关弹窗 + getDisplayMedia）。 */
  onSubmit(presets: ScreenSharePresets): void;
  onClose(): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 共享输出设置弹窗（旧 ScreenShareSettingsDialog.vue 平价）：分辨率/帧率/码率
 *  三下拉；提交才持久化，取消保持当前会话内选择。 */
export function ScreenShareSettingsDialog({ presets, onPresetsChange, onSubmit, onClose, t }: ScreenShareSettingsDialogProps) {
  const { dialogRef, onDialogKeydown } = useDialogFocus<HTMLElement>({ close: onClose });
  return (
    <div className="modal-backdrop screen-share-settings-backdrop">
      <section
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={onDialogKeydown}
        className="screen-share-settings-modal"
        data-ws-part="voice.screen-share-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-share-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="screen-share-settings-close"
          aria-label={t("close")}
          title={t("close")}
          onClick={onClose}
        ><Icon name="close" size={17} /></button>
        <div className="screen-share-settings-heading" data-ws-part="voice.screen-share-settings.heading">
          <span className="card-kicker">{t("screenShare")}</span>
          <h2 id="screen-share-settings-title">{t("screenShareSettings")}</h2>
          <p>{t("screenShareSettingsHint")}</p>
        </div>
        <div className="screen-share-settings-fields" data-ws-part="voice.screen-share-settings.fields">
          <label>
            <span>{t("screenShareResolution")}</span>
            <select
              value={presets.resolutionPreset}
              aria-label={t("screenShareResolution")}
              onChange={(event) => onPresetsChange({ ...presets, resolutionPreset: event.target.value as ScreenShareResolutionPreset })}
            >
              {SCREEN_SHARE_RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("screenShareFrameRate")}</span>
            <select
              value={presets.frameRate}
              aria-label={t("screenShareFrameRate")}
              onChange={(event) => onPresetsChange({ ...presets, frameRate: Number(event.target.value) })}
            >
              {SCREEN_SHARE_FRAME_RATE_OPTIONS.map((fps) => (
                <option key={fps} value={fps}>{fps} FPS</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("screenShareBitrate")}</span>
            <select
              value={presets.bitratePreset}
              aria-label={t("screenShareBitrate")}
              onChange={(event) => onPresetsChange({ ...presets, bitratePreset: event.target.value as ScreenShareBitratePreset })}
            >
              {SCREEN_SHARE_BITRATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="screen-share-settings-note" data-ws-part="voice.screen-share-settings.note">{t("screenShareSettingsNote")}</p>
        <footer className="screen-share-settings-footer" data-ws-part="voice.screen-share-settings.actions">
          <button type="button" className="text-button" onClick={onClose}>{t("cancel")}</button>
          <button type="button" className="primary-button screen-share-settings-start" onClick={() => onSubmit(presets)}>
            <Icon name="monitor" size={14} />
            {" "}
            {t("startScreenShare")}
          </button>
        </footer>
      </section>
    </div>
  );
}
