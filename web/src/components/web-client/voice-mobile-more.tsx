import { Icon } from "./icon";
import { SkinSwitcher } from "./skin-switcher";
import type { SkinSwitcherState } from "./skin-switcher";

interface VoiceMobileMoreProps {
  onLeave(): void;
  onOpenAudioSettings(): void;
  skinSwitcher: SkinSwitcherState;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 移动端 more 页签面板（旧 mobile-more-panel 平价）：音频设置、皮肤切换、
 *  语言菜单与退出（皮肤切换器为 mobile-skin-switcher 变体）。 */
export function VoiceMobileMore(props: VoiceMobileMoreProps) {
  const { t } = props;
  return (
    <section className="mobile-more-panel" data-ws-part="voice.mobile-more">
      <span className="section-kicker">{t("voiceActivity")}</span>
      <h2>{t("mobileMore")}</h2>
      <p className="more-group-label">{t("audioGroup")}</p>
      <button type="button" onClick={props.onOpenAudioSettings}>
        <Icon name="settings" size={18} />
        {" "}
        {t("audioSettings")}
      </button>
      <p className="more-group-label">{t("appearanceGroup")}</p>
      <SkinSwitcher
        value={props.skinSwitcher.value}
        options={props.skinSwitcher.options}
        menuLabel={props.skinSwitcher.menuLabel}
        className="mobile-skin-switcher"
        onChange={props.skinSwitcher.onChange}
      />
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
