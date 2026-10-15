import { ActivityIcon, CompassIcon, DoorOpenIcon, InfoIcon, MoonIcon, ServerIcon, ShareIcon, SunIcon, UsersIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "zustand";

import { createAdminController } from "@/admin/admin-controller";
import { AdminServerSettings } from "@/components/admin/server-settings";
import { AdminOperations } from "@/components/admin/operations";
import { AdminSkins } from "@/components/admin/skins";
import { ChangePasswordScreen, LoginScreen } from "@/components/admin/auth-screens";
import { AdminOverview } from "@/components/admin/overview";
import { LanguageSwitcher } from "@/components/web-client/language-switcher";
import { createAdminMessages } from "@/i18n/admin-messages";
import { useI18n } from "@/hooks/use-i18n";
import { useThemeMode } from "@/hooks/use-theme";
import { isDarkTheme, nextTheme, saveTheme } from "@/services/theme";

import "../styles/admin.css";

// 旧 AdminView.vue 平价：loading → login | change-password | admin 三态；
// 会话状态机/401 双轨/代际失效全部在 admin-controller（22 条 characterization 钉死）。
export default function AdminView() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { language, setLanguage } = useI18n();
  // 控制器只创建一次；当次渲染的 navigate/路径/语言经 bind 注入（无 ref）。
  const [controller] = useState(() => createAdminController({
    navigate: () => { /* bind 前不会被调用（loadAdminView 在 bind 之后） */ },
    getCurrentPath: () => "/admin",
    getLanguage: () => "zh",
  }));
  const messages = useMemo(() => createAdminMessages(language), [language]);

  useEffect(() => {
    controller.bind({ navigate, getCurrentPath: () => pathname, getLanguage: () => language });
  }, [controller, navigate, pathname, language]);

  useEffect(() => {
    void controller.loadAdminView();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    controller.handleRouteChange(pathname);
  }, [controller, pathname]);

  const view = useStore(controller.store);
  const { tr } = messages;
  const themeMode = useThemeMode();
  const themeDark = isDarkTheme(themeMode);

  const currentPageTitle = pathname === "/admin/server" ? tr("server")
    : pathname === "/admin/operations" ? tr("operations")
    : pathname === "/admin/skins" ? tr("skinLibrary") : tr("overview");

  if (view.loading) {
    return (
      <div className="admin-root">
        <div className="center-card compact">
          <span className="spinner" aria-hidden="true" />
          <p>{tr("loading")}</p>
        </div>
      </div>
    );
  }
  if (view.screen === "change-password") {
    return (
      <div className="admin-root">
        <ChangePasswordScreen controller={controller} messages={messages} />
      </div>
    );
  }
  if (view.screen === "login") {
    return (
      <div className="admin-root">
        <LoginScreen controller={controller} messages={messages} />
      </div>
    );
  }

  const webrtcPortRange = `${controller.serverSettings.store.getState().form.webRtcUdpStart}–${controller.serverSettings.store.getState().form.webRtcUdpEnd}`;
  return (
    <div className="admin-root">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <img src="/favicon.jpg" alt="WebSpeak" className="size-[26px] rounded-[7px]" aria-hidden="true" />
            <div><strong>WebSpeak</strong><small>{tr("adminConsole")}</small></div>
          </div>
          <nav>
            <NavLink to="/admin" end className={({ isActive }) => (isActive ? "active" : "")}>
              <ActivityIcon size={18} aria-hidden="true" />
              {tr("overview")}
            </NavLink>
            <NavLink to="/admin/server" className={({ isActive }) => (isActive ? "active" : "")}>
              <ServerIcon size={18} aria-hidden="true" />
              {tr("server")}
            </NavLink>
            <NavLink to="/admin/operations" className={({ isActive }) => (isActive ? "active" : "")}>
              <UsersIcon size={18} aria-hidden="true" />
              {tr("operations")}
            </NavLink>
            <NavLink to="/admin/skins" className={({ isActive }) => (isActive ? "active" : "")}>
              <CompassIcon size={18} aria-hidden="true" />
              {tr("skinLibrary")}
            </NavLink>
          </nav>
          <div className="sidebar-bottom">
            <a href="/" target="_blank">
              <ShareIcon size={16} aria-hidden="true" />
              {tr("openGuest")}
            </a>
            <button type="button" disabled={view.loggingOut} onClick={() => void controller.logout()}>
              <DoorOpenIcon size={16} aria-hidden="true" />
              {tr("logout")}
            </button>
          </div>
        </aside>

        <main className="admin-main" inert={view.loggingOut || undefined} aria-busy={view.loggingOut}>
          <header className="admin-topbar">
            <div className="admin-page-title">
              <small>{tr("adminConsole")}</small>
              <h1>{currentPageTitle}</h1>
            </div>
            <div className="admin-tools">
              <span className="gateway-status" role="status" title={tr("gatewayRunning")}>
                <span className="running-dot" aria-hidden="true" />
                <span className="gateway-status-label">{tr("gatewayRunning")}</span>
              </span>
              <button type="button" className="theme-toggle" title={themeDark ? tr("switchToLightTheme") : tr("switchToDarkTheme")}
                aria-label={themeDark ? tr("switchToLightTheme") : tr("switchToDarkTheme")}
                onClick={() => saveTheme(nextTheme(themeMode))}>
                {themeDark ? <SunIcon size={17} aria-hidden="true" /> : <MoonIcon size={17} aria-hidden="true" />}
                <span>{themeDark ? tr("switchToLightTheme") : tr("switchToDarkTheme")}</span>
              </button>
              <LanguageSwitcher language={language} onChange={setLanguage} menuLabel={tr("languageMenu")} />
            </div>
          </header>

          {view.errorMessage && <div className="alert error page-alert">{view.errorMessage}</div>}
          {pathname === "/admin/server" && (
            <AdminServerSettings model={controller.serverSettings} messages={messages} onWebRtcToggle={() => controller.handleWebRtcToggle()} />
          )}
          {pathname === "/admin/operations" && <AdminOperations model={controller.operations} messages={messages} />}
          {pathname === "/admin/skins" && <AdminSkins model={controller.skins} messages={messages} />}
          {pathname !== "/admin/server" && pathname !== "/admin/operations" && pathname !== "/admin/skins" && (
            <AdminOverview
              overview={view.overview}
              messages={messages}
              onDismissLegacyNotice={() => void controller.dismissLegacyNotice()}
            />
          )}

          {view.webrtcPortNoticeOpen && (
            <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) controller.closeWebrtcPortNotice(); }}>
              <section className="modal-card" role="dialog" aria-modal="true" aria-label={tr("webrtcPortNoticeTitle")}>
                <div className="modal-icon"><InfoIcon size={21} aria-hidden="true" /></div>
                <h2>{tr("webrtcPortNoticeTitle")}</h2>
                <p>{tr("webrtcPortNotice", { range: webrtcPortRange })}</p>
                <button className="primary-button wide" type="button" onClick={() => controller.closeWebrtcPortNotice()}>
                  {tr("gotIt")}
                </button>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
