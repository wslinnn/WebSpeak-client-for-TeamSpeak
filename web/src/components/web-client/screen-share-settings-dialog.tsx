import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SCREEN_SHARE_BITRATE_OPTIONS,
  SCREEN_SHARE_CODEC_OPTIONS,
  SCREEN_SHARE_FRAME_RATE_OPTIONS,
  SCREEN_SHARE_PICTURE_PREFERENCE_OPTIONS,
  SCREEN_SHARE_RESOLUTION_OPTIONS,
  type ScreenShareBitratePreset,
  type ScreenShareCodecChoice,
  type ScreenSharePicturePreference,
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
 *  三下拉；提交才持久化，取消保持当前会话内选择。父级按 open 条件挂载；
 *  backdrop 点击不关闭（决策不变量）。 */
export function ScreenShareSettingsDialog({ presets, onPresetsChange, onSubmit, onClose, t }: ScreenShareSettingsDialogProps) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="screen-share-settings-modal"
        data-ws-part="voice.screen-share-settings"
        aria-labelledby="screen-share-settings-title"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="screen-share-settings-close"
            aria-label={t("close")}
          ><Icon name="close" size={17} /></Button>
        </DialogClose>
        <div className="screen-share-settings-heading" data-ws-part="voice.screen-share-settings.heading">
          <span className="card-kicker">{t("screenShare")}</span>
          <DialogTitle id="screen-share-settings-title">{t("screenShareSettings")}</DialogTitle>
          <p>{t("screenShareSettingsHint")}</p>
        </div>
        <div className="screen-share-settings-fields" data-ws-part="voice.screen-share-settings.fields">
          <label>
            <span>{t("screenShareResolution")}</span>
            <Select
              value={presets.resolutionPreset}
              onValueChange={(value) => onPresetsChange({ ...presets, resolutionPreset: value as ScreenShareResolutionPreset })}
            >
              <SelectTrigger className="w-full" aria-label={t("screenShareResolution")}><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                {SCREEN_SHARE_RESOLUTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>{t("screenShareFrameRate")}</span>
            <Select
              value={String(presets.frameRate)}
              onValueChange={(value) => onPresetsChange({ ...presets, frameRate: Number(value) })}
            >
              <SelectTrigger className="w-full" aria-label={t("screenShareFrameRate")}><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                {SCREEN_SHARE_FRAME_RATE_OPTIONS.map((fps) => (
                  <SelectItem key={fps} value={String(fps)}>{fps} FPS</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>{t("screenShareBitrate")}</span>
            <Select
              value={presets.bitratePreset}
              onValueChange={(value) => onPresetsChange({ ...presets, bitratePreset: value as ScreenShareBitratePreset })}
            >
              <SelectTrigger className="w-full" aria-label={t("screenShareBitrate")}><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                {SCREEN_SHARE_BITRATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>{t("screenSharePicturePreference")}</span>
            <Select
              value={presets.picturePreference}
              onValueChange={(value) => onPresetsChange({ ...presets, picturePreference: value as ScreenSharePicturePreference })}
            >
              <SelectTrigger className="w-full" aria-label={t("screenSharePicturePreference")}><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                {SCREEN_SHARE_PICTURE_PREFERENCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>{t("screenShareCodecChoice")}</span>
            <Select
              value={presets.codecChoice}
              onValueChange={(value) => onPresetsChange({ ...presets, codecChoice: value as ScreenShareCodecChoice })}
            >
              <SelectTrigger className="w-full" aria-label={t("screenShareCodecChoice")}><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                {SCREEN_SHARE_CODEC_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <p className="screen-share-settings-note" data-ws-part="voice.screen-share-settings.note">{t("screenShareSettingsNote")}</p>
        <footer className="screen-share-settings-footer" data-ws-part="voice.screen-share-settings.actions">
          <Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button type="button" onClick={() => onSubmit(presets)}>
            <Icon name="monitor" size={14} />
            {" "}
            {t("startScreenShare")}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
