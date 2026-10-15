import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import "../styles/web-client.css";

import type { FavoriteServerDraft } from "@/components/web-client/favorite-server-dialog";
import { Icon } from "@/components/web-client/icon";
import { JoinPage } from "@/components/web-client/join-page";
import { RootDialogs } from "@/components/web-client/root-dialogs";
import type { SkinOption } from "@/components/web-client/skin-switcher";
import { VoiceShell } from "@/components/web-client/voice-shell";
import { VoiceSessionProvider, useVoiceSession, useVoiceView } from "@/hooks/useVoiceSession";
import { useI18n } from "@/hooks/use-i18n";
import { BUILTIN_DARK_SKIN, BUILTIN_LIGHT_SKIN } from "@/services/skin-runtime";
import { isPublicSkinEnabled } from "@/services/skin-catalog";
import { resolveSkinHomeCopy, resolveSkinMessages } from "@/web-client/skin-copy";
import { createSkinController, type SkinController } from "@/web-client/skin-controller";
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
import { useInRoomControllers } from "@/web-client/use-inroom-controllers";
import { useAudioSettingsState } from "@/web-client/use-audio-settings";
import { useWebClientControllers } from "@/web-client/use-web-client-controllers";
import { useRetryCountdown } from "@/web-client/use-retry-countdown";
import { cn } from "@/lib/utils";
import type { Language } from "@/i18n/web-client";

export default function WebClient() {  // 控制器随路由组件生灭：离开 web-client 路由 = 断开语音会话（平价旧 onUnmounted disconnect）。
  return (
    <VoiceSessionProvider>
      <WebClientRoot />
    </VoiceSessionProvider>
  );
}

// 皮肤控制器路由级单例（见 WebClientRoot 内注释）。
let webClientSkin: SkinController | null = null;

function WebClientRoot() {
  const voice = useVoiceSession();
  const { language, messages, setLanguage } = useI18n();
  const { t: translate, localizedMessage, localizedMicrophoneError, visibleErrorCode } = messages;
  const { store, home, publicConfig, favorites, identity, connection, showToast } = useWebClientControllers();
  const config = useStore(publicConfig.store);

  // —— 皮肤控制（旧 usePublicSkin + 皮肤消息/首页文案覆盖的根装配）。模块级
  // 单例：StrictMode 双挂载会先 dispose 再重跑 effect，挂在 cleanup 上的
  // dispose 会让重放的 initialize 因 disposed 直返、skin 永不就绪；voice
  // session 同款单例纪律，跨页迟到激活由 skin-runtime 的 pendingActivation
  // 守卫互相作废。 ——
  const skin = useMemo(() => {
    webClientSkin ??= createSkinController({ appVersion: () => publicConfig.store.getState().appVersion });
    return webClientSkin;
  }, [publicConfig]);
  useEffect(() => {
    void skin.initialize();
  }, [skin]);
  const skinView = useStore(skin.store);
  const skinOptions = useMemo<SkinOption[]>(() => [
    ...skinView.catalogSkins.map((entry): SkinOption => ({
      value: entry.id,
      label: entry.id === BUILTIN_LIGHT_SKIN ? translate("skinDay") : entry.id === BUILTIN_DARK_SKIN ? translate("skinNight") : entry.name,
      icon: entry.id === BUILTIN_LIGHT_SKIN ? "sun" : entry.id === BUILTIN_DARK_SKIN ? "moon" : "compass",
    })),
    ...skinView.installedSkins
      .filter((entry) => !skinView.catalogSkins.some((item) => item.id === entry.id) && isPublicSkinEnabled(entry.id))
      .map((entry): SkinOption => ({ value: entry.id, label: entry.name, icon: "compass" })),
  ], [skinView.catalogSkins, skinView.installedSkins, translate]);
  const skinHomeCopy = resolveSkinHomeCopy(skinView.activeSkin, language);
  const skinMessageOverrides = resolveSkinMessages(skinView.activeSkin, language);
  const skinSwitcherState = useMemo(() => ({
    value: skinView.activeSkinId,
    options: skinOptions,
    menuLabel: translate("skinSelector"),
    onChange: (id: string) => void skin.select(id),
  }), [skinView.activeSkinId, skinOptions, translate, skin]);
  // 皮肤包可整体替换文案与消息：非空覆盖优先，基线词典兜底（旧 t 包装平价）。
  const t = useCallback((key: string, variables: Record<string, string | number> = {}) => {
    const template = skinMessageOverrides[key];
    if (template === undefined || !template.trim()) return translate(key, variables);
    return Object.entries(variables).reduce((value, [name, replacement]) => value.replaceAll(`{{${name}}}`, String(replacement)), template);
  }, [translate, skinMessageOverrides]);

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

  // —— 进房态（控制器装配在 useInRoomControllers：草稿/折叠记忆/菜单跨两态存活） ——
  const settingsOpenRef = useRef(false);
  // 引用必须稳定：进 hook 的 useMemo deps 后，内联箭头会让 audioControls 每渲染
  // 重建，dispose/syncSettingsOpen effect 随之每渲染执行并 setState，成死循环。
  const getSettingsOpen = useCallback(() => settingsOpenRef.current, []);
  const inRoom = useInRoomControllers({
    voice,
    store,
    connection,
    isMobileViewport,
    viewportHeight: mobileViewport.height,
    getSettingsOpen,
    showToast,
    t,
    localizedMessage,
  });
  const { switchState, audioControls } = inRoom;

  // —— 音频设置弹窗（旧 settingsOpen 根 ref 平价）：首页设备设置按钮与进房
  // dock 的设置按钮共用一个实例；弹窗元素在模板根部两态可达。 ——
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
    audioControls.syncSettingsOpen(settingsOpen);
  }, [settingsOpen, audioControls]);
  const { dialog: audioSettingsDialog } = useAudioSettingsState({
    audioControls,
    settingsOpen,
    closeSettings: () => setSettingsOpen(false),
    showToast,
    t,
    localizedMessage,
    localizedMicrophoneError,
  });

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

  // 切服挂起期间语音壳保持挂载（横幅状态），不回闪首页表单（旧平价）。
  const voiceShellVisible = voiceView.connected || voiceView.reconnecting || voiceView.reconnectFailed
    || Boolean(switchState.pending || switchState.failed);
  const localizedWelcomeText = config.welcomeTexts[language] || t("joinDescription");

  return (
    <div
      className={cn("web-client", "ws-skin-root", `language-${language}`, { "skin-initializing": !skinView.skinReady, "keyboard-open": mobileViewport.keyboardOpen })}
      lang={language}
      style={{ "--ws-viewport-height": `${mobileViewport.height}px`, "--ws-viewport-top": `${mobileViewport.top}px` } as CSSProperties}
      data-ws-part="app"
      data-ws-page={voiceShellVisible ? "voice" : "home"}
    >
      {voiceShellVisible && (
        <VoiceShell
          voice={voice}
          home={store}
          chat={inRoom.chat}
          membersController={inRoom.membersController}
          fold={inRoom.fold}
          serverSwitch={inRoom.serverSwitch}
          audioControls={inRoom.audioControls}
          monitor={inRoom.monitor}
          skinSwitcher={skinSwitcherState}
          language={language}
          isMobileViewport={isMobileViewport}
          mobileSection={inRoom.mobileSection}
          onMobileSectionChange={inRoom.setMobileSection}
          memberQuery={inRoom.memberQuery}
          onMemberQueryChange={inRoom.setMemberQuery}
          onChatListElement={inRoom.onChatListElement}
          onSelectChannel={(channel) => void connection.selectChannel(channel)}
          onSwitchServer={inRoom.switchServer}
          onLeave={inRoom.leaveVoiceWorkspace}
          onReconnect={() => voice.reconnectNow()}
          onEditFavorite={editFavoriteServer}
          onRemoveFavorite={(server) => void favorites.removeFavoriteRow(server)}
          onOpenFavoriteDialog={() => openFavoriteServerDialog()}
          onOpenAudioSettings={() => setSettingsOpen(true)}
          onVolumeInput={(clientId, value) => voice.setVolume(clientId, value)}
          t={t}
          showToast={showToast}
        />
      )}

      {/* 连接/欢迎页。切服挂起期间两态并存（壳挂载、本页卸载）。 */}
      {!voiceShellVisible && (
        <JoinPage
          config={{
            siteName: config.siteName,
            accessMode: config.accessMode,
            initialized: config.initialized,
            serverConfigLoading: config.serverConfigLoading,
            publicConfigFailed: config.publicConfigFailed,
          }}
          language={language}
          onLanguageChange={setLanguage}
          mobileGateActive={mobileGateActive}
          onContinueMobile={continueOnMobile}
          welcomeText={localizedWelcomeText}
          storageAvailable={storageAvailable}
          browserError={browserError}
          browserWarning={browserWarning}
          voice={{ error: voiceView.error, errorCode: voiceView.errorCode, connecting: voiceView.connecting }}
          retryWaiting={retryWaiting}
          retrySeconds={retrySecondsShown}
          isMobileViewport={isMobileViewport}
          joinDisabled={joinDisabled}
          home={home}
          identity={identity}
          connection={connection}
          onRememberIdentityChange={(value) => store.setState({ rememberIdentity: value })}
          onSelectServer={favorites.selectLocalServer}
          onRemoveFavorite={(server) => void favorites.removeFavoriteRow(server)}
          onConnectServer={connectFromServerTab}
          onEditFavorite={editFavoriteServer}
          onOpenFavoriteDialog={openFavoriteServerDialog}
          onOpenDeviceSettings={() => setSettingsOpen(true)}
          onClearBrowserData={() => void clearBrowserData()}
          onRetryConfig={reloadPublicConfig}
          t={t}
          localizedMessage={localizedMessage}
          visibleErrorCode={visibleErrorCode}
          skin={{ ...skinSwitcherState, homeCopy: skinHomeCopy }}
        />
      )}

      {/* 根级浮层（皮肤通告）：连接页与进房态都可达（旧 v-if/v-else 分支外平价）。 */}
      {skinView.recoveryNotice && (
        <div className="skin-recovery-notice" data-ws-part="app.skin-recovery-notice" role="alert">
          <span>{t("skinRecoveryNotice")}</span>
          <button type="button" aria-label={t("close")} onClick={() => skin.store.setState({ recoveryNotice: false })}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {skinView.catalogUnavailableNotice && !skinView.recoveryNotice && (
        <div className="skin-recovery-notice" data-ws-part="app.skin-catalog-notice" role="alert">
          <span>{t("skinCatalogUnavailable")}</span>
          <button type="button" aria-label={t("close")} onClick={() => skin.store.setState({ catalogUnavailableNotice: false })}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <RootDialogs
        channelDialog={home.channelPasswordDialog}
        serverDialog={home.serverPasswordDialog}
        favoriteInitial={favoriteDialogInitial}
        favoriteKnownAddresses={home.favoriteServers.map((favorite) => favorite.address)}
        onChannelPasswordChange={(password) => store.setState({ channelPasswordDialog: { ...home.channelPasswordDialog, password } })}
        onChannelClose={connection.cancelChannelPassword}
        onChannelSubmit={connection.submitChannelPassword}
        onServerPasswordChange={(password) => store.setState({ serverPasswordDialog: { ...home.serverPasswordDialog, password } })}
        onServerClose={inRoom.onServerPasswordCancel}
        onServerSubmit={connection.submitServerPassword}
        onFavoriteClose={() => setFavoriteDialogInitial(null)}
        onFavoriteSave={saveFavoriteServerDraft}
        t={t}
      />

      {audioSettingsDialog}
    </div>
  );
}
