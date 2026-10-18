import { ChevronRightIcon, DownloadIcon, ServerIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/web-client/language-switcher";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useI18n, useWebClientMessages } from "@/hooks/use-i18n";
import { pendingWebClientMessages } from "@/i18n/messages";
import {
  fetchAndroidRelease,
  formatApkSize,
  type AndroidRelease,
} from "@/services/android-release";

// header-note/tiny-dot/language-switcher 是 web-client 样式家族的类，本路由必须
// 自己带上聚合样式（与 views/web-client.tsx 同一份；路由级 css 不串 admin）。
import "../styles/web-client.css";

type ReleaseState =
  | { status: "loading" }
  | { status: "ready"; release: AndroidRelease }
  | { status: "unavailable" };

// SPEC §17：download 页布局（1060 容器、双卡 auto-fit、640 断点 header 折行）；
// 视觉走 token 语义类，data-ws-part 钩子按契约重置登记（Phase 4-7 统一注册）。
export default function DownloadView() {
  const { language, setLanguage } = useI18n();
  // 语言包异步加载（模块级单例 import）：就绪前渲染 null，与路由 chunk 加载窗口重合。
  const messages = useWebClientMessages();
  const { t } = messages ?? pendingWebClientMessages;
  const [releaseState, setReleaseState] = useState<ReleaseState>({ status: "loading" });
  const [gatewayOnline, setGatewayOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 网关状态点与 home/admin 同源语义：public-config 可达即在线。
    void fetch("/api/public-config").then((res) => {
      if (!cancelled) setGatewayOnline(res.ok);
    }).catch(() => {
      if (!cancelled) setGatewayOnline(false);
    });
    fetchAndroidRelease().then((release) => {
      if (!cancelled) setReleaseState(release ? { status: "ready", release } : { status: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const release = releaseState.status === "ready" ? releaseState.release : null;
  // 语言包就绪前不渲染任何用户可见文案（hook 已全部执行完，此处分支安全）。
  if (!messages) return null;
  return (
    <main className="download-page ws-skin-root min-h-dvh bg-background px-[clamp(12px,3vw,44px)] pb-11 pt-[clamp(14px,2vw,30px)] text-foreground" data-ws-page="download">
      <header className="mx-auto flex max-w-[1060px] flex-wrap items-center justify-between gap-3.5 max-[640px]:flex-col max-[640px]:items-stretch" data-ws-part="download.header">
        <div className="flex min-w-0 items-center gap-2.5" data-ws-part="download.brand">
          <BrandMark className="size-[38px] [color:var(--wsd-accent,#2b5cd9)]" />
          <div>
            <strong className="block text-lg">WebSpeak</strong>
            <small className="block text-sm text-muted-foreground">{t("browserWorkspace")}</small>
          </div>
        </div>
        <div className="flex items-center gap-2 max-[640px]:justify-between">
          <div className="header-note" data-ws-part="download.gateway-status" role="status">
            <span className="tiny-dot" aria-hidden="true"></span>
            {gatewayOnline ? t("secureGateway") : t("gatewayOffline")}
          </div>
          <LanguageSwitcher language={language} onChange={setLanguage} menuLabel={t("languageMenu")} />
          <a
            className="inline-flex items-center gap-1.5 rounded-lg border bg-secondary px-3 py-2 text-base hover:bg-accent hover:text-accent-foreground"
            href="/"
          >
            <ServerIcon size={15} aria-hidden="true" />
            <span>{t("backToHome")}</span>
          </a>
        </div>
      </header>

      <section className="mx-auto mt-[clamp(26px,4vw,54px)] mb-[clamp(18px,2.6vw,30px)] max-w-[1060px]" data-ws-part="download.hero">
        <h1 className="mb-2 text-2xl tracking-tight">{t("downloadTitle")}</h1>
        <p className="m-0 max-w-[560px] text-base text-muted-foreground">{t("downloadIntro")}</p>
      </section>

      <div className="mx-auto grid max-w-[1060px] grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" data-ws-part="download.card">
          <div className="flex items-center gap-2.5" data-ws-part="download.card.head">
            <span className="flex size-[34px] items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DownloadIcon size={20} aria-hidden="true" />
            </span>
            <h2 className="m-0 text-lg">{t("downloadOfficialTitle")}</h2>
          </div>
          <p className="m-0 text-base text-muted-foreground">{t("downloadOfficialDescription")}</p>
          <Button asChild className="mt-auto">
            <a href="https://teamspeak.com/en/downloads/" target="_blank" rel="noopener noreferrer">
              {t("downloadOfficialAction")}
              <ChevronRightIcon size={16} aria-hidden="true" />
            </a>
          </Button>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" data-ws-part="download.card">
          <div className="flex items-center gap-2.5" data-ws-part="download.card.head">
            <span className="flex size-[34px] items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DownloadIcon size={20} aria-hidden="true" />
            </span>
            <h2 className="m-0 text-lg">{t("downloadAndroidTitle")}</h2>
          </div>
          <p className="m-0 text-base text-muted-foreground">{t("downloadAndroidDescription")}</p>
          {releaseState.status === "loading" ? (
            <p className="m-0 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-sm">{t("downloadLoading")}</p>
          ) : release ? (
            <>
              <dl className="m-0 grid gap-1.5 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-sm" data-ws-part="download.card.meta">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <dt className="shrink-0 text-muted-foreground">{t("downloadVersion")}</dt>
                  <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{release.version}</dd>
                </div>
                {release.apkSizeBytes > 0 && (
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <dt className="shrink-0 text-muted-foreground">{t("downloadSize")}</dt>
                    <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{formatApkSize(release.apkSizeBytes)}</dd>
                  </div>
                )}
                {release.apkSha256 && (
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <dt className="shrink-0 text-muted-foreground">{t("downloadSha256")}</dt>
                    <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">
                      <code className="text-xs text-muted-foreground">{release.apkSha256}</code>
                    </dd>
                  </div>
                )}
              </dl>
              <Button asChild className="mt-auto">
                <a href={release.apkUrl} target="_blank" rel="noopener noreferrer">
                  {t("downloadAndroidAction")}
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </a>
              </Button>
            </>
          ) : (
            <>
              <p className="m-0 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-sm">{t("downloadUnavailable")}</p>
              <Button asChild variant="secondary" className="mt-auto">
                <a href="https://github.com/wslinnn/TS6_Droid_CN/releases" target="_blank" rel="noopener noreferrer">
                  {t("downloadViewReleases")}
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </a>
              </Button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
