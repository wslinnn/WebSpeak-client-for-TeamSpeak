import { useEffect, useState, type CSSProperties } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import "../styles/web-client.css";

import { ChannelPasswordDialog } from "@/components/web-client/channel-password-dialog";
import { FavoriteServerDialog, type FavoriteServerDraft } from "@/components/web-client/favorite-server-dialog";
import { Icon } from "@/components/web-client/icon";
import { IdentityImportDialog } from "@/components/web-client/identity-import-dialog";
import { JoinNotices } from "@/components/web-client/join-notices";
import { JoinForm } from "@/components/web-client/join-form";
import { JoinHeader } from "@/components/web-client/join-header";
import { MobileGate } from "@/components/web-client/mobile-gate";
import { ServerPasswordDialog } from "@/components/web-client/server-password-dialog";
import { VoiceSessionProvider, useVoiceSession, useVoiceView } from "@/hooks/useVoiceSession";
import { useI18n } from "@/hooks/use-i18n";
import { applyTheme, getStoredTheme } from "@/services/theme";
import { readMobileGateSignals, shouldShowMobileGate, storeMobileGateChoice } from "@/services/mobile-gate";
import { observeMobileViewport, type MobileViewport } from "@/services/mobile-viewport";
import {
  clearLocalData as clearStoredLocalData,
  clearNamespacedStorageEntries,
  isLocalPersistenceAvailable,
  loadLocalPreferences,
  loadStoredIdentity,
} from "@/services/local-persistence";
import type { FavoriteServer } from "@/services/local-persistence";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/services/teamspeak-target";
import { clearVoiceSessionIntent } from "@/voice/session-intent";
import { useWebClientControllers } from "@/web-client/use-web-client-controllers";
import { useRetryCountdown } from "@/web-client/use-retry-countdown";
import { cn } from "@/lib/utils";
import type { Language } from "@/i18n/web-client";

export default function WebClient() {
  // 控制器随路由组件生灭：离开 web-client 路由 = 断开语音会话（平价旧 onUnmounted disconnect）。
  return (
    <VoiceSessionProvider>
      <WebClientRoot />
    </VoiceSessionProvider>
  );
}

function WebClientRoot() {
  const voice = useVoiceSession();
  const { language, messages, setLanguage } = useI18n();
  const { t, localizedMessage, visibleErrorCode } = messages;
  const { store, home, publicConfig, favorites, identity, connection, showToast } = useWebClientControllers();
  const config = useStore(publicConfig.store);

  // —— 视图状态 ——
  const [storageAvailable] = useState(() => isLocalPersistenceAvailable());
  const [identityReady, setIdentityReady] = useState(() => !isLocalPersistenceAvailable());
  const [browserError] = useState(() => voice.checkSupport() ?? "");
  const [browserWarning] = useState(() => voice.checkBrowserWarning() ?? "");
  const [mobileGateActive, setMobileGateActive] = useState(() => shouldShowMobileGate(readMobileGateSignals(window)));
  const [mobileViewport, setMobileViewport] = useState<MobileViewport>({ height: window.innerHeight, top: 0, keyboardOpen: false });
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia("(max-width: 740px)").matches);
  const [favoriteDialogInitial, setFavoriteDialogInitial] = useState<Partial<FavoriteServerDraft> | null>(null);

  const voiceView = useVoiceView(useShallow((view) => ({
    connected: view.connected,
    connecting: view.connecting,
    reconnecting: view.reconnecting,
    reconnectFailed: view.reconnectFailed,
    retryNotUntil: view.retryNotUntil,
    error: view.error,
    errorCode: view.errorCode,
  })));
  const { waiting: retryWaiting, secondsShown: retrySecondsShown } = useRetryCountdown(voiceView.retryNotUntil);

  const joinDisabled = !connection.canJoin()
    || config.serverConfigLoading
    || !identityReady
    || voiceView.connecting
    || retryWaiting
    || Boolean(browserError);

  // joinDisabled 的即时版：收藏行点击 = 填表 + 立即连接的既定决策，判定必须读
  // 填表后的最新状态（Vue computed 惰性重估平价），不能用本次渲染的闭包值。
  function joinDisabledNow(): boolean {
    return !connection.canJoin()
      || publicConfig.store.getState().serverConfigLoading
      || !identityReady
      || voice.store.getState().connecting
      || voice.store.getState().retryNotUntil > Date.now()
      || Boolean(browserError);
  }

  // —— 挂载序列（旧 onMounted 平价；StrictMode 双挂载下各步幂等） ——
  useEffect(() => {
    // Phase 4-7 皮肤运行时接线前，挂载后补一次 applyTheme：内置皮肤 CSS 作用域
    // 钉在 .ws-skin-root[data-ws-skin=…] 上，挂载前根元素尚不存在。
    applyTheme(getStoredTheme());
    // 显式 join 导航（共享服务器链接、直连参数）优先于陈旧的恢复意图。
    const joinIntentParams = new URLSearchParams(window.location.search);
    if (["server", "tsHost", "target"].some((key) => joinIntentParams.has(key))) clearVoiceSessionIntent();
    else voice.tryResumeVoiceSession();
    void publicConfig.loadPublicConfig();
    void identity.restore(async () => {
      const stored = await loadStoredIdentity();
      return stored && localStorage.getItem("webspeak:remember-identity") === "1" ? stored.privateMaterial : null;
    }).finally(() => setIdentityReady(true));
    void favorites.loadSavedServers();
    void loadLocalPreferences().then((preferences) => {
      if (!localStorage.getItem("webspeak:language") && (["zh", "en", "de", "ru", "ja"] as const).includes(preferences.language as Language)) {
        setLanguage(preferences.language as Language);
      }
    }).catch(() => undefined);
    const stopViewport = observeMobileViewport(window, (value) => setMobileViewport(value));
    const media = window.matchMedia("(max-width: 740px)");
    const onMedia = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches);
    media.addEventListener("change", onMedia);
    return () => {
      stopViewport();
      media.removeEventListener("change", onMedia);
      voice.disconnect();
      voice.dispose();
    };
    // 仅挂载语义：与旧 onMounted/onUnmounted 1:1。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 首页动作 ——
  function continueOnMobile(): void {
    storeMobileGateChoice("continue");
    setMobileGateActive(false);
  }
  function reloadPublicConfig(): void {
    publicConfig.reloadPublicConfig();
  }
  function openFavoriteServerDialog(initial?: Partial<FavoriteServerDraft>): void {
    setFavoriteDialogInitial(initial ?? favorites.buildFavoritePrefill());
  }
  function editFavoriteServer(server: FavoriteServer): void {
    // 右键/长按收藏行：以已存条目预填对话框，改指向或改名不必先连接。
    const target = splitTeamSpeakTarget(server.address);
    openFavoriteServerDialog({
      label: server.label,
      address: target.address,
      port: target.port,
      nickname: server.nickname ?? "",
      channel: server.lastChannelHint?.name ?? "",
      password: server.password ?? "",
    });
  }
  function saveFavoriteServerDraft(draft: FavoriteServerDraft): void {
    void favorites.upsertFavoriteServer(draft);
    // 对话框改的是已存上下文：指向当前表单目标时把草稿采纳进表单，下次连接用
    // 新值，连接后的收藏同步也不会把保存悄悄回退成旧表单值。
    const target = splitTeamSpeakTarget(`${draft.address}:${draft.port}`);
    const draftTarget = combineTeamSpeakTarget(target.address, target.port).trim().toLocaleLowerCase();
    const snapshot = store.getState();
    if (draftTarget !== combineTeamSpeakTarget(snapshot.serverHost, snapshot.serverPort).trim().toLocaleLowerCase()) return;
    store.setState({
      serverHost: target.address,
      serverPort: target.port,
      nickname: draft.nickname,
      channelName: draft.channel,
      serverPassword: draft.password,
    });
  }
  function connectFromServerTab(entry: { address: string; nickname?: string; channel?: string; password?: string }): void {
    favorites.selectLocalServer(entry);
    if (joinDisabledNow()) {
      if (!store.getState().nickname.trim()) queueMicrotask(() => document.getElementById("nickname")?.focus());
      return;
    }
    connection.doConnect();
  }
  async function clearBrowserData(): Promise<void> {
    if (!window.confirm(t("clearLocalDataConfirm"))) return;
    identity.reset();
    await clearStoredLocalData();
    // 命名空间清扫而非枚举清单：每个 webspeak:* 设置——过去与未来——都在这死，
    // 包括手机门选择、桌面通知开关和语音恢复令牌。
    clearNamespacedStorageEntries(localStorage);
    clearNamespacedStorageEntries(sessionStorage);
    store.setState({ identityMaterial: "", rememberIdentity: false });
    favorites.clearServerHistory();
    showToast(t("localDataCleared"));
  }

  const voiceShellVisible = voiceView.connected || voiceView.reconnecting || voiceView.reconnectFailed;
  const localizedWelcomeText = config.welcomeTexts[language] || t("joinDescription");

  return (
    <div
      className={cn("web-client", "ws-skin-root", `language-${language}`, { "keyboard-open": mobileViewport.keyboardOpen })}
      lang={language}
      style={{ "--ws-viewport-height": `${mobileViewport.height}px`, "--ws-viewport-top": `${mobileViewport.top}px` } as CSSProperties}
      data-ws-part="app"
      data-ws-page={voiceShellVisible ? "voice" : "home"}
    >
      {/* 连接/欢迎页。进房壳随 P4-4 落地；过渡期已连接时仍显示本页。 */}
      <section className="join-page" data-ws-part="home">
        <JoinHeader
          brandName={config.siteName}
          brandSubtitle={t("browserWorkspace")}
          gatewayStatus={t("secureGateway")}
          downloadLabel={t("downloadPage")}
          adminLabel={t("adminConsole")}
          moreLabel={t("mobileMore")}
          language={language}
          onLanguageChange={setLanguage}
          languageMenuLabel={t("languageMenu")}
        />

        {mobileGateActive ? (
          <MobileGate
            title={t("mobileGateTitle")}
            description={t("mobileGateDescription")}
            downloadLabel={t("mobileGateDownload")}
            continueLabel={t("mobileGateContinue")}
            hint={t("mobileGateHint")}
            onContinue={continueOnMobile}
          />
        ) : (
          <main className="join-content" data-ws-part="home.content">
            <div className="join-copy" data-ws-part="home.hero">
              <h1 data-ws-part="home.hero.title">
                {t("joinLine1")}
                <br />
                <em>{t("joinLine2")}</em>
              </h1>
              <p className="join-description" data-ws-part="home.hero.description">{localizedWelcomeText}</p>
            </div>

            <div className="join-card" data-ws-part="home.join-card">
              <div className="join-card-effects" aria-hidden="true">
                <span className="join-card-waveform" data-ws-part="home.join-card.waveform">
                  {Array.from({ length: 9 }, (_, bar) => <i key={bar} />)}
                </span>
                <span className="join-card-sonar" data-ws-part="home.join-card.sonar">
                  {Array.from({ length: 3 }, (_, ring) => <i key={ring} />)}
                </span>
              </div>
              <h2 data-ws-part="home.join-title">{t("welcomeBack")}</h2>
              <p className="card-lead" data-ws-part="home.join-description">{t("joinLead")}</p>

              <JoinNotices
                voiceError={voiceView.error}
                retryWaiting={retryWaiting}
                retrySeconds={retrySecondsShown}
                errorCode={voiceView.errorCode}
                browserError={browserError}
                browserWarning={browserWarning}
                unconfigured={!config.serverConfigLoading && !config.initialized && !config.publicConfigFailed}
                configLoadFailed={config.publicConfigFailed && !config.serverConfigLoading}
                storageUnavailable={!storageAvailable}
                onRetryConfig={reloadPublicConfig}
                t={t}
                localizedMessage={localizedMessage}
                visibleErrorCode={visibleErrorCode}
              />

              {config.initialized && (
                <JoinForm
                  autofocusNickname={!isMobileViewport}
                  accessMode={config.accessMode}
                  serverHost={home.serverHost}
                  serverPort={home.serverPort}
                  serverPassword={home.serverPassword}
                  nickname={home.nickname}
                  channel={home.channelName}
                  rememberIdentity={home.rememberIdentity}
                  onServerHostChange={connection.setHost}
                  onServerPortChange={connection.setPort}
                  onServerPasswordChange={connection.setServerPassword}
                  onNicknameChange={connection.setNickname}
                  onChannelChange={connection.setChannelName}
                  onRememberIdentityChange={(value) => store.setState({ rememberIdentity: value })}
                  favoriteServers={home.favoriteServers}
                  identityExportBusy={home.identityDialog.exporting}
                  hasIdentity={Boolean(home.identityMaterial)}
                  connecting={voiceView.connecting}
                  joinDisabled={joinDisabled}
                  joinRetrySeconds={retrySecondsShown}
                  onOpenDeviceSettings={() => { /* 设备设置弹窗随 P4-5 音频设置回归 */ }}
                  onConnect={connection.doConnect}
                  onDisconnect={connection.doDisconnect}
                  onConnectServer={connectFromServerTab}
                  onSelectServer={favorites.selectLocalServer}
                  onEditFavorite={editFavoriteServer}
                  onRemoveFavorite={(server) => void favorites.removeFavoriteRow(server)}
                  onOpenFavoriteDialog={openFavoriteServerDialog}
                  onImportIdentity={() => identity.show()}
                  onExportIdentity={() => void identity.exportIdentity()}
                  t={t}
                />
              )}
              <div className="join-meta" data-ws-part="home.security-note">
                <Icon name="lock" size={14} />
                {t("connectionAuthorized")}
              </div>
            </div>
          </main>
        )}

        {home.identityDialog.open && (
          <IdentityImportDialog
            text={home.identityDialog.text}
            onTextChange={identity.setText}
            busy={home.identityDialog.busy}
            reading={home.identityDialog.reading}
            error={home.identityDialog.error}
            closeLabel={t("close")}
            title={t("identityImportTitle")}
            description={t("identityImportDescription")}
            placeholder={t("identityImportPlaceholder")}
            dropZoneLabel={t("identityDropZone")}
            chooseFileLabel={t("identityChooseFile")}
            securityNote={t("identityImportSecurity")}
            cancelLabel={t("identityImportCancel")}
            connectingLabel={t("connecting")}
            submitLabel={t("identityImportSubmit")}
            onClose={identity.close}
            onSubmit={() => void identity.submit()}
            onFile={(file) => void identity.readFile(file)}
          />
        )}

        <footer className="join-footer" data-ws-part="home.footer">
          <span>{config.siteName}</span>
          <span className="footer-separator">·</span>
          <span>{t("teamSpeakClient")}</span>
          <span className="footer-spacer" />
          <button type="button" className="clear-local-button" onClick={() => void clearBrowserData()}>
            {t("clearLocalData")}
          </button>
        </footer>
      </section>

      {home.channelPasswordDialog.open && (
        <ChannelPasswordDialog
          password={home.channelPasswordDialog.password}
          onPasswordChange={(password) => store.setState({ channelPasswordDialog: { ...home.channelPasswordDialog, password } })}
          busy={home.channelPasswordDialog.submitting}
          error={home.channelPasswordDialog.error}
          onClose={connection.cancelChannelPassword}
          onSubmit={connection.submitChannelPassword}
          title={t("channelPasswordTitle")}
          lead={t("channelPasswordLead")}
          promptLabel={t("channelPasswordPrompt")}
          placeholder={t("channelPasswordPlaceholder")}
          cancelLabel={t("channelPasswordCancel")}
          submitLabel={t("channelPasswordSubmit")}
          closeLabel={t("close")}
        />
      )}
      {home.serverPasswordDialog.open && (
        <ServerPasswordDialog
          password={home.serverPasswordDialog.password}
          onPasswordChange={(password) => store.setState({ serverPasswordDialog: { ...home.serverPasswordDialog, password } })}
          errorCode={home.serverPasswordDialog.errorCode}
          onClose={connection.cancelServerPassword}
          onSubmit={connection.submitServerPassword}
          title={t("serverPasswordTitle")}
          invalidLead={t("serverPasswordInvalidLead")}
          requiredLead={t("serverPasswordRequiredLead")}
          promptLabel={t("serverPasswordPrompt")}
          placeholder={t("serverPasswordRetryPlaceholder")}
          cancelLabel={t("channelPasswordCancel")}
          retryLabel={t("serverPasswordRetry")}
          closeLabel={t("close")}
        />
      )}
      {favoriteDialogInitial !== null && (
        <FavoriteServerDialog
          initial={favoriteDialogInitial}
          knownFavoriteAddresses={home.favoriteServers.map((favorite) => favorite.address)}
          onClose={() => setFavoriteDialogInitial(null)}
          onSave={saveFavoriteServerDraft}
          t={t}
        />
      )}
    </div>
  );
}
