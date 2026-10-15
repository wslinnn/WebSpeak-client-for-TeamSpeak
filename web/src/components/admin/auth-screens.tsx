import { HouseIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "zustand";

import { useI18n } from "@/hooks/use-i18n";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/web-client/language-switcher";
import type { AdminController } from "@/admin/admin-controller";
import type { AdminMessages } from "@/i18n/admin-messages";

// 旧 AdminView.vue 的 login / change-password 两屏平价（类名保留，样式在 admin.css）。
export function LoginScreen({ controller, messages }: { controller: AdminController; messages: AdminMessages }) {
  const { language, setLanguage } = useI18n();
  const { tr } = messages;
  const view = useStore(controller.store);
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="admin-brand centered">
          <BrandMark className="size-[28px] [color:var(--admin-accent)]" aria-hidden="true" />
          <div><strong>WebSpeak</strong><small>{tr("adminConsole")}</small></div>
        </div>
        <header>
          <h1>{tr("welcomeAdmin")}</h1>
          <p>{tr("loginLead")}</p>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); void controller.login(); }}>
          {view.errorMessage && <div className="alert error">{view.errorMessage}</div>}
          <label>
            <span>{tr("adminUsername")}</span>
            <input value={view.loginUsername} autoComplete="username" autoFocus
              onChange={(event) => controller.setLoginUsername(event.target.value.trim())} />
          </label>
          <label>
            <span>{tr("adminPassword")}</span>
            <input value={view.loginPassword} type="password" autoComplete="current-password"
              onChange={(event) => controller.setLoginPassword(event.target.value)} />
          </label>
          <button className="primary-button wide" disabled={view.submitting} type="submit">
            {view.submitting && <span className="spinner small" aria-hidden="true" />}
            {tr("login")}
          </button>
        </form>
        <div className="login-actions">
          <Link to="/" className="home-link">
            <HouseIcon size={15} aria-hidden="true" />
            {tr("backHome")}
          </Link>
          <LanguageSwitcher language={language} onChange={setLanguage} menuLabel={tr("languageMenu")} />
        </div>
      </section>
    </main>
  );
}

export function ChangePasswordScreen({ controller, messages }: { controller: AdminController; messages: AdminMessages }) {
  const { language, setLanguage } = useI18n();
  const { tr } = messages;
  const view = useStore(controller.store);
  const strength = Math.min(100, Math.max(8, view.newPassword.length * 5 + (/[\s\W]/.test(view.newPassword) ? 15 : 0)));
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="admin-brand centered">
          <BrandMark className="size-[28px] [color:var(--admin-accent)]" aria-hidden="true" />
          <div><strong>WebSpeak</strong><small>{tr("adminConsole")}</small></div>
        </div>
        <header>
          <h1>{tr("changePasswordTitle")}</h1>
          <p>{tr("changePasswordLead")}</p>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); void controller.changePassword(); }}>
          {view.errorMessage && <div className="alert error">{view.errorMessage}</div>}
          <label>
            <span>{tr("newPassword")}</span>
            <input value={view.newPassword} type="password" autoComplete="new-password" maxLength={1024} autoFocus
              placeholder={tr("passwordPlaceholder")}
              onChange={(event) => controller.setNewPassword(event.target.value)} />
          </label>
          <label>
            <span>{tr("confirmPassword")}</span>
            <input value={view.confirmNewPassword} type="password" autoComplete="new-password" maxLength={1024}
              onChange={(event) => controller.setConfirmNewPassword(event.target.value)} />
          </label>
          <div className="strength"><i style={{ width: `${strength}%` }} /></div>
          <button className="primary-button wide" disabled={view.submitting} type="submit">
            {view.submitting && <span className="spinner small" aria-hidden="true" />}
            {tr("savePassword")}
          </button>
        </form>
        <p className="security-note">{tr("defaultCredentialNotice")}</p>
        <LanguageSwitcher language={language} onChange={setLanguage} menuLabel={tr("languageMenu")} />
      </section>
    </main>
  );
}
