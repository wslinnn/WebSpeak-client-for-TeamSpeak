import { useState } from "react";

import { Icon } from "./icon";
import { LanguageSwitcher } from "./language-switcher";
import { SkinSwitcher, type SkinOption } from "./skin-switcher";
import { cn } from "@/lib/utils";
import type { Language } from "@/i18n/web-client";

interface JoinHeaderProps {
  brandName: string;
  brandSubtitle: string;
  gatewayStatus: string;
  downloadLabel: string;
  adminLabel: string;
  moreLabel: string;
  language: Language;
  onLanguageChange(language: Language): void;
  languageMenuLabel: string;
  skinValue: string;
  skinOptions: SkinOption[];
  onSkinChange(value: string): void;
  skinMenuLabel: string;
}

/** 首页头（旧 WebClientHeader.vue 平价）：品牌锁扣 + 网关状态 + download/admin 链接 +
 *  皮肤/语言切换器 + ≤740 「更多」折叠。 */
export function JoinHeader({ brandName, brandSubtitle, gatewayStatus, downloadLabel, adminLabel, moreLabel, language, onLanguageChange, languageMenuLabel, skinValue, skinOptions, onSkinChange, skinMenuLabel }: JoinHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <header className="join-header" data-ws-part="home.header">
      <div className="brand-lockup" data-ws-part="home.brand">
        <img className="brand-mark" src="/favicon.jpg" alt="WebSpeak" />
        <div>
          <strong title={brandName}>{brandName}</strong>
          <small>{brandSubtitle}</small>
        </div>
      </div>
      <div className="header-tools" data-ws-part="home.header-tools">
        <div className="header-note" data-ws-part="home.gateway-status"><span className="tiny-dot"></span> {gatewayStatus}</div>
        <div className={cn("header-links", { open: moreOpen })}>
          <a className="guide-button" href="/download" data-ws-part="home.download-button" title={downloadLabel} aria-label={downloadLabel}>
            <Icon name="download" size={15} />
            <span>{downloadLabel}</span>
          </a>
          <a className="guide-button" href="/admin" title={adminLabel} aria-label={adminLabel}>
            <Icon name="settings" size={15} />
            <span>{adminLabel}</span>
          </a>
        </div>
        <SkinSwitcher
          value={skinValue}
          options={skinOptions}
          menuLabel={skinMenuLabel}
          className="join-skin-switcher"
          onChange={onSkinChange}
        />
        <LanguageSwitcher language={language} onChange={onLanguageChange} menuLabel={languageMenuLabel} />
      </div>
      <button
        type="button"
        className="header-more"
        data-ws-part="home.header-more"
        aria-expanded={moreOpen}
        aria-label={moreLabel}
        onClick={() => setMoreOpen((open) => !open)}
      >
        <Icon name="more" size={17} />
      </button>
      {moreOpen && (
        <button
          type="button"
          className="header-tools-backdrop"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMoreOpen(false)}
        />
      )}
    </header>
  );
}
