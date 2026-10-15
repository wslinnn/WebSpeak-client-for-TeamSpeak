import { Icon } from "./icon";

interface VoiceDegradedBannersProps {
  audioNotice: string;
  audioNoticeCode: string;
  onClearAudioNotice(): void;
  microphoneError: string;
  microphoneErrorCode: string;
  onClearMicrophoneError(): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedAudioNotice(code: string, message: string): string;
  localizedMicrophoneError(code: string, message: string): string;
}

/** 降级提示横幅对（旧 WebClient.vue audio-status/microphone-status 平价）：
 *  WebRTC 回退/自动播放被阻等非致命音频降级，与麦克风失败提示。渲染条件是
 *  各自的非空消息，关闭按钮清空对应 store 字段。 */
export function VoiceDegradedBanners(props: VoiceDegradedBannersProps) {
  const { t } = props;
  return (
    <>
      {props.audioNotice && (
        <div className="reconnect-banner degraded" data-ws-part="voice.audio-status" role="status">
          <div className="reconnect-copy">
            <strong>{t("audioStatus")}</strong>
            <span>{props.localizedAudioNotice(props.audioNoticeCode, props.audioNotice)}</span>
          </div>
          <div className="reconnect-actions">
            <button
              type="button"
              className="text-button"
              data-ws-part="voice.audio-status-dismiss"
              aria-label={t("close")}
              onClick={props.onClearAudioNotice}
            ><Icon name="close" size={15} /></button>
          </div>
        </div>
      )}
      {props.microphoneError && (
        <div className="reconnect-banner degraded" data-ws-part="voice.microphone-status" role="status">
          <div className="reconnect-copy">
            <strong>{t("microphone")}</strong>
            <span>{props.localizedMicrophoneError(props.microphoneErrorCode, props.microphoneError)}</span>
          </div>
          <div className="reconnect-actions">
            <button type="button" className="text-button" onClick={props.onClearMicrophoneError}>{t("close")}</button>
          </div>
        </div>
      )}
    </>
  );
}
