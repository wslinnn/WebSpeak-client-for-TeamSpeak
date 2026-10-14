import { Icon } from "./icon";

interface VoiceMobileMoreProps {
  onLeave(): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 移动端 more 页签面板（旧 mobile-more-panel 平价）：音频设置位随 P4-5 回归。 */
export function VoiceMobileMore(props: VoiceMobileMoreProps) {
  const { t } = props;
  return (
    <section className="mobile-more-panel" data-ws-part="voice.mobile-more">
      <span className="section-kicker">{t("voiceActivity")}</span>
      <h2>{t("mobileMore")}</h2>
      <p className="more-group-label">{t("audioGroup")}</p>
      <button type="button" disabled title={t("audioSettings") /* 音频设置随 P4-5 回归 */}>
        <Icon name="settings" size={18} />
        {" "}
        {t("audioSettings")}
      </button>
      <p className="more-group-label">{t("appearanceGroup")}</p>
      <div className="language-menu-row">
        <Icon name="globe" size={18} />
        <span>{t("languageMenu")}</span>
      </div>
      <div className="more-panel-separator" aria-hidden="true" />
      <button type="button" className="danger" onClick={props.onLeave}>
        <Icon name="door" size={18} />
        {" "}
        {t("exit")}
      </button>
    </section>
  );
}
