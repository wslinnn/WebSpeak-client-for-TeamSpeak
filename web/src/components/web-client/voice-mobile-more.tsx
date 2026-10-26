import { Icon } from "./icon";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import type { Language } from "@/i18n/web-client-language";
import { Button } from "@/components/ui/button";

interface VoiceMobileMoreProps {
  onLeave(): void;
  onOpenAudioSettings(): void;
  theme: { dark: boolean; onToggle(): void; label: string };
  language: Language;
  onChangeLanguage(language: Language): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 移动端 more 页签面板（旧 mobile-more-panel 平价）：音频设置、日/夜切换、
 *  语言菜单与退出（语言切换器为 fixedBelow 悬浮变体——文档流内展开会把
 *  面板其余项挤下去）。 */
export function VoiceMobileMore(props: VoiceMobileMoreProps) {
  const { t } = props;
  return (
    <section className="mobile-more-panel" data-ws-part="voice.mobile-more">
      <span className="section-kicker">{t("voiceActivity")}</span>
      <h2>{t("mobileMore")}</h2>
      <p className="more-group-label">{t("audioGroup")}</p>
      <Button variant="ghost" type="button" onClick={props.onOpenAudioSettings}>
        <Icon name="settings" size={18} />
        {" "}
        {t("audioSettings")}
      </Button>
      <p className="more-group-label">{t("appearanceGroup")}</p>
      <ThemeToggle
        dark={props.theme.dark}
        onToggle={props.theme.onToggle}
        label={props.theme.label}
        className="mobile-theme-toggle"
      >
        {props.theme.label}
      </ThemeToggle>
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
      <Button variant="ghost" type="button" className="danger" onClick={props.onLeave}>
        <Icon name="door" size={18} />
        {" "}
        {t("exit")}
      </Button>
    </section>
  );
}
