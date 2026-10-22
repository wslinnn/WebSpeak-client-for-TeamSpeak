import { Button } from "@/components/ui/button";

interface JoinNoticesProps {
  voiceError: string;
  retryWaiting: boolean;
  retrySeconds: number;
  errorCode: string;
  browserError: string;
  browserWarning: string;
  unconfigured: boolean;
  configLoadFailed: boolean;
  storageUnavailable: boolean;
  onRetryConfig(): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
  visibleErrorCode(code: string): string;
}

/** join 卡告示区（旧 WebClient.vue 六枚 notice 的平价顺序）：连接错误（含退避倒计时）、
 *  浏览器阻断/降级提示、未配置、配置加载失败（可重试）、本地存储不可用。 */
export function JoinNotices(props: JoinNoticesProps) {
  const { t, localizedMessage, visibleErrorCode } = props;
  return (
    <>
      {props.voiceError && (
        <div className="notice error-notice" data-ws-part="home.notice" data-ws-state="error">
          <span className="notice-symbol">!</span>
          <span className="notice-content">
            {props.retryWaiting
              ? <span>{t("retryLater", { seconds: props.retrySeconds })}</span>
              : <span>{localizedMessage(props.voiceError)}</span>}
            {props.errorCode && <code>{t("errorCode")}: {visibleErrorCode(props.errorCode)}</code>}
          </span>
        </div>
      )}
      {props.browserError && (
        <div className="notice warning-notice" data-ws-part="home.notice" data-ws-state="warning">
          <span className="notice-symbol">i</span>
          <span>{localizedMessage(props.browserError)}</span>
        </div>
      )}
      {props.browserWarning && (
        <div className="notice warning-notice" data-ws-part="home.notice" data-ws-state="warning">
          <span className="notice-symbol">i</span>
          <span>{localizedMessage(props.browserWarning)}</span>
        </div>
      )}
      {props.unconfigured && (
        <div className="notice warning-notice" data-ws-part="home.notice" data-ws-state="unconfigured">
          <span className="notice-symbol">i</span>
          <span>{t("notConfigured")} <a href="/admin">{t("configureNow")}</a></span>
        </div>
      )}
      {props.configLoadFailed && (
        <div className="notice warning-notice" data-ws-part="home.notice" data-ws-state="warning">
          <span className="notice-symbol">!</span>
          <span>{t("configLoadFailed")} <Button type="button" variant="ghost" onClick={props.onRetryConfig}>{t("retryAction")}</Button></span>
        </div>
      )}
      {props.storageUnavailable && (
        <div className="notice warning-notice" data-ws-part="home.notice" data-ws-state="storage-warning">
          <span className="notice-symbol">i</span>
          <span>{t("localPersistenceUnavailable")}</span>
        </div>
      )}
    </>
  );
}
