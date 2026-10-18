import { Icon } from "./icon";
import { SkinSwitcher } from "./skin-switcher";
import type { SkinSwitcherState } from "./skin-switcher";
import { LanguageSwitcher } from "./language-switcher";
import type { Language } from "@/i18n/web-client-language";

interface VoiceMobileMoreProps {
  onLeave(): void;
  onOpenAudioSettings(): void;
  skinSwitcher: SkinSwitcherState;
  language: Language;
  onChangeLanguage(language: Language): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 移动端 more 页签面板（旧 mobile-more-panel 平价）：音频设置、皮肤切换、
 *  语言菜单与退出（皮肤/语言切换器为 fixedBelow 悬浮变体——文档流内展开会
 *  把面板其余项挤下去，2026-10-18 用户拍板改悬浮）。 */
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
        fixedBelow
        onChange={props.skinSwitcher.onChange}
      />
      {/* 原 Vue 版这里可点开语言菜单；React 平移时曾退化成静态 div，移动端
       *  语言切换完全不可达（2026-10-18 用户报告）。 */}
      <LanguageSwitcher
        language={props.language}
        onChange={props.onChangeLanguage}
        menuLabel={t("languageMenu")}
        className="mobile-language-switcher"
        fixedBelow
      />
      <div className="more-panel-separator" aria-hidden="true" />
      <button type="button" className="danger" onClick={props.onLeave}>
        <Icon name="door" size={18} />
        {" "}
        {t("exit")}
      </button>
    </section>
  );
}
