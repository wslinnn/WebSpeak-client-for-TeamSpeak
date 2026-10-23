import { useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Icon } from "./icon";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
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
  theme: { dark: boolean; onToggle(): void; label: string };
}

/** 首页头（旧 WebClientHeader.vue 平价）：品牌锁扣 + 网关状态 + download/admin 链接 +
 *  日/夜切换 + 语言切换器 + ≤740 「更多」折叠。 */
export function JoinHeader({ brandName, brandSubtitle, gatewayStatus, downloadLabel, adminLabel, moreLabel, language, onLanguageChange, languageMenuLabel, theme }: JoinHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <header className="join-header" data-ws-part="home.header">
      <div className="brand-lockup" data-ws-part="home.brand">
        <BrandMark className="brand-mark" />
        <div>
          <strong>{brandName}</strong>
          <small>{brandSubtitle}</small>
        </div>
      </div>
      <div className="header-tools" data-ws-part="home.header-tools">
        <div className="header-note" data-ws-part="home.gateway-status"><span className="tiny-dot"></span> {gatewayStatus}</div>
        <div className={cn("header-links", { open: moreOpen })}>
          <Button asChild variant="outline">
            <a className="guide-button" href="/download" data-ws-part="home.download-button" aria-label={downloadLabel}>
              <Icon name="download" size={15} />
              <span>{downloadLabel}</span>
            </a>
          </Button>
          <Button asChild variant="outline">
            <a className="guide-button" href="/admin" aria-label={adminLabel}>
              <Icon name="settings" size={15} />
              <span>{adminLabel}</span>
            </a>
          </Button>
        </div>
        <ThemeToggle dark={theme.dark} onToggle={theme.onToggle} label={theme.label} className="join-theme-toggle" />
        <LanguageSwitcher language={language} onChange={onLanguageChange} menuLabel={languageMenuLabel} />
      </div>
      <Button variant="ghost"
        type="button"
        className="header-more"
        data-ws-part="home.header-more"
        aria-expanded={moreOpen}
        aria-label={moreLabel}
        onClick={() => setMoreOpen((open) => !open)}
      >
        <Icon name="more" size={17} />
      </Button>
      {moreOpen && (
        <Button variant="ghost"
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
