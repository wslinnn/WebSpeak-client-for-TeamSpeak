import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import "../styles/web-client.css";

import type { FavoriteServerDraft } from "@/components/web-client/favorite-server-dialog";
import { JoinPage } from "@/components/web-client/join-page";
import { RootDialogs } from "@/components/web-client/root-dialogs";
import { VoiceShell } from "@/components/web-client/voice-shell";
import { VoiceSessionProvider, useVoiceSession, useVoiceView } from "@/hooks/useVoiceSession";
import { useI18n, useWebClientMessages } from "@/hooks/use-i18n";
import { pendingWebClientMessages } from "@/i18n/messages";
import { getThemeController } from "@/web-client/theme-controller";
import { readMobileGateSignals, shouldShowMobileGate, storeMobileGateChoice } from "@/services/mobile-gate";
import { createMobileAwayController, type MobileAwayController } from "@/services/mobile-away";
import { createScreenWakeLockController, getScreenWakeLockApi, type ScreenWakeLockSnapshot } from "@/services/screen-wake-lock";
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
import { clearVoiceSessionIntent, readVoiceSessionIntent } from "@/voice/session-intent";
import { useInRoomControllers } from "@/web-client/use-inroom-controllers";
import { useAudioSettingsState } from "@/components/web-client/use-audio-settings";
import { useWebClientControllers } from "@/web-client/use-web-client-controllers";
import { useRetryCountdown } from "@/web-client/use-retry-countdown";
import { installTestHooks } from "@/web-client/test-hooks";
import { cn } from "@/lib/utils";
import type { Language } from "@/i18n/web-client";

export default function WebClient() {  // 控制器随路由组件生灭：离开 web-client 路由 = 断开语音会话（平价旧 onUnmounted disconnect）。
  return (
    <VoiceSessionProvider>
      <WebClientRoot />
    </VoiceSessionProvider>
  );
}

// 模块级实时桥（use-inroom-controllers liveI18nBox 同款纪律）：WebClient 路由
// 单实例，移动端判定只在 away 控制器的事件回调里读取，渲染路径不经过；不能进
// useMemo 工厂闭包读 ref（Compiler 判渲染期 ref 访问）。
const mobileClientFlagBox: { current: boolean } = { current: false };

function WebClientRoot() {
  const voice = useVoiceSession();
  const { language, setLanguage } = useI18n();
  // 语言包异步加载（模块级单例 import）：就绪前渲染 null，与路由 chunk 加载窗口重合。
  const messages = useWebClientMessages();
  const { t: translate, localizedMessage, localizedAudioNotice, localizedMicrophoneError, visibleErrorCode } = messages ?? pendingWebClientMessages;
  const { store, home, publicConfig, favorites, identity, connection, showToast } = useWebClientControllers();
  const config = useStore(publicConfig.store);

  // 冒烟测试桥：函数体在普通构建里是常量折叠后的死分支，生产产物不含生效桥。
  useEffect(() => {
    installTestHooks(voice);
  }, [voice]);

  // —— 主题控制（皮肤系统下架后的唯一外观开关，日/夜二值）——
  const theme = getThemeController();
  const themeView = useStore(theme.store);
  const themeLabel = themeView.dark ? translate("switchToLightTheme") : translate("switchToDarkTheme");
  const t = translate;

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
  // 自动 away 控制器在 hook 返回后才创建（需要 membersController）；手动状态
  // 回调经盒晚绑（旧 mobileAwayController?. 平价）。
  const mobileAwayBox = useRef<MobileAwayController | null>(null);
  const onManualStatusChange = useCallback(() => mobileAwayBox.current?.preserveManualStatus(), []);
  const inRoom = useInRoomControllers({
    voice,
    store,
    connection,
    isMobileViewport,
    viewportHeight: mobileViewport.height,
    getSettingsOpen,
    onManualStatusChange,
    showToast,
    t,
    localizedMessage,
  });
  const { switchState, audioControls, membersController } = inRoom;

  // —— 音频设置弹窗（旧 settingsOpen 根 ref 平价）：首页设备设置按钮与进房
  // dock 的设置按钮共用一个实例；弹窗元素在模板根部两态可达。 ——
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
    audioControls.syncSettingsOpen(settingsOpen);
  }, [settingsOpen, audioControls]);
  const { dialog: audioSettingsDialog } = useAudioSettingsState({
    audioControls,
    voice,
    settingsOpen,
    closeSettings: () => setSettingsOpen(false),
    showToast,
    t,
    localizedMessage,
    localizedMicrophoneError,
  });

  // —— 移动端服务接线（旧 watch 三件套平价）：屏幕常亮、后台自动 away、
  // 设备插拔刷新。 ——
  const isMobileBox = mobileClientFlagBox;
  useEffect(() => {
    isMobileBox.current = isMobileViewport;
  }, [isMobileViewport, isMobileBox]);
  const mobileAway = useMemo(() => createMobileAwayController(document, window, {
    isMobileClient: () => isMobileBox.current,
    isConnected: () => voice.store.getState().connected,
    isAway: () => membersController.store.getState().away,
    setAway: (value) => membersController.setAutomaticAway(value),
  }), [voice, membersController, isMobileBox]);
  useEffect(() => {
    mobileAwayBox.current = mobileAway;
  }, [mobileAway]);
  useEffect(() => () => mobileAway.dispose(), [mobileAway]);
  useEffect(() => {
    mobileAway.sync();
  }, [mobileAway, voiceView.connected, isMobileViewport]);
  const shouldKeepScreenAwake = isMobileViewport && (voiceView.connected || voiceView.connecting || voiceView.reconnecting);
  const [wakeLockState, setWakeLockState] = useState<ScreenWakeLockSnapshot>(
    { supported: false, enabled: false, active: false, requesting: false, unavailable: false },
  );
  const wakeLock = useMemo(() => createScreenWakeLockController(getScreenWakeLockApi(), document, setWakeLockState), []);
  useEffect(() => () => wakeLock.dispose(), [wakeLock]);
  useEffect(() => {
    if (shouldKeepScreenAwake) wakeLock.enable();
    else wakeLock.disable();
  }, [wakeLock, shouldKeepScreenAwake]);
  // 常亮申请失败只提示一次：unavailable 翻真且此刻仍需要常亮（旧 watch 平价）。
  const wasUnavailableRef = useRef(false);
  useEffect(() => {
    const wasUnavailable = wasUnavailableRef.current;
    wasUnavailableRef.current = wakeLockState.unavailable;
    if (!wakeLockState.unavailable || wasUnavailable || !shouldKeepScreenAwake) return;
    showToast(t(wakeLockState.supported ? "screenWakeLockUnavailable" : "screenWakeLockUnsupported"));
  }, [wakeLockState, shouldKeepScreenAwake, showToast, t]);
  useEffect(() => {
    const onDeviceChange = () => { void voice.refreshAudioDevices().catch(() => undefined); };
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
  }, [voice]);

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
    else {
      // 恢复意图携带的展示目标回填首页 store：URL 参数/网关预填与真实目标
      // 无关（open+屏蔽预填甚至把 host 清成 ""），不回填则 header 裸奔成
      // ":9987"、收藏匹配与折叠记忆 serverKey 全部落空。
      const intent = readVoiceSessionIntent();
      if (intent?.target) store.setState({ serverHost: intent.target.address, serverPort: intent.target.port });
      voice.tryResumeVoiceSession();
    }
    void voice.watchMicrophonePermission();
    void publicConfig.loadPublicConfig();
    void identity.restore(async () => {
      const stored = await loadStoredIdentity();
      return stored && localStorage.getItem("webspeak:remember-identity") === "1" ? stored.privateMaterial : null;
    }).finally(() => setIdentityReady(true));
    void favorites.loadSavedServers();
    void loadLocalPreferences().then((preferences) => {
      if (!localStorage.getItem("webspeak:language") && (["zh", "en"] as const).includes(preferences.language as Language)) {
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
      // preserveConnection：卸载（刷新/路由离开）必须保留恢复票——刷新后
      // tryResumeVoiceSession 靠它领回 detached 的 TS 会话（Vue 时代靠
      // onUnmounted 在卸载时从不运行才碰巧工作；React 的 effect 清理会跑）。
      voice.disconnect(true);
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
    // add 路径留空（port 由弹窗自带 9987 默认值）：兜底预填当前表单是「编辑」
    // 语义——连接后已自动收藏，空白新增不应带出当前上下文（用户拍板 2026-10-18）。
    setFavoriteDialogInitial(initial ?? {});
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

  // 语言包就绪前不渲染任何用户可见文案（hook 已全部执行完，此处分支安全）。
  if (!messages) return null;

  return (
    <div
      className={cn("web-client", "ws-skin-root", `language-${language}`, { "keyboard-open": mobileViewport.keyboardOpen })}
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
          theme={{ dark: themeView.dark, onToggle: () => theme.set(!themeView.dark), label: themeLabel }}
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
          localizedMessage={localizedMessage}
          localizedAudioNotice={localizedAudioNotice}
          localizedMicrophoneError={localizedMicrophoneError}
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
          theme={{ dark: themeView.dark, onToggle: () => theme.set(!themeView.dark), label: themeLabel }}
        />
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
