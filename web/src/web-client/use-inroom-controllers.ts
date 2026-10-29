import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import type { VoiceSessionController } from "@/voice/session-controller";
import { showBackgroundTabNotification, readDesktopNotificationSetting } from "@/services/desktop-notifications";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/services/teamspeak-target";
import type { FavoriteServer } from "@/services/local-persistence";
import { buildChannelTree, findCurrentChannel } from "@/web-client/channel-tree";
import { createAudioControls } from "@/web-client/audio-controls";
import { createChannelFold } from "@/web-client/channel-fold";
import { createChatController, type ChatScrollerAspect } from "@/web-client/chat-controller";
import { createMembersController } from "@/web-client/members-controller";
import { createPerformanceMonitor } from "@/web-client/performance-monitor";
import { createVoiceServerSwitch, settleSwitchOnConnected } from "@/web-client/server-switch";
import type { HomeConnection } from "@/web-client/home-connection";
import type { HomeStoreController } from "@/web-client/home-store";
import type { MobileSection } from "@/web-client/mobile-section";

interface InRoomOptions {
  voice: VoiceSessionController;
  store: HomeStoreController;
  connection: HomeConnection;
  isMobileViewport: boolean;
  viewportHeight: number;
  /** 音频设置弹窗开关（根 state；设置请求代际读它判定「还在当前弹窗」）。 */
  getSettingsOpen(): boolean;
  /** 用户手动改 away 时回调（根用它让自动 away 控制器放弃自己的标记）。 */
  onManualStatusChange?(): void;
  showToast(message: string, tone?: "info" | "warn"): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
}

// 模块级实时桥（liveMessages 同款纪律与仓内先例）：WebClient 路由单实例，桥只在
// 事件/订阅回调里被读取，渲染路径不经过；effect 落账当次语言与视口。不随语言/视口
// 重建控制器——重建会丢草稿、菜单与滚动状态。const 盒字段写入而非 let 重赋值：
// React Compiler 禁止「渲染结束后重赋值变量」，字段写入不受此限。
interface LiveI18n {
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
}
const liveI18nBox: { current: LiveI18n } = { current: { t: (key) => key, localizedMessage: (message) => message } };
const liveViewportBox: { current: { isMobile: boolean; section: MobileSection } } = { current: { isMobile: false, section: "channels" } };
const chatListBox: { current: ChatScrollerAspect | null } = { current: null };

/** 进房控制器装配（旧 WebClient.vue 根部 chat/members/fold/serverSwitch 装配平价）。
 *  控制器在根创建：切服/断线期间语音壳与首页互换挂载，草稿/折叠记忆/菜单状态必须
 *  跨两态存活。 */
export function useInRoomControllers(options: InRoomOptions) {
  const { voice, store, connection } = options;

  const [mobileSection, setMobileSection] = useState<MobileSection>("channels");
  const [memberQuery, setMemberQuery] = useState("");
  useEffect(() => {
    liveI18nBox.current = { t: options.t, localizedMessage: options.localizedMessage };
  });
  useEffect(() => {
    liveViewportBox.current = { isMobile: options.isMobileViewport, section: mobileSection };
  }, [options.isMobileViewport, mobileSection]);
  const tLive = useCallback((key: string, variables?: Record<string, string | number>) => liveI18nBox.current.t(key, variables), []);
  const localizedLive = useCallback((message: string) => liveI18nBox.current.localizedMessage(message), []);

  const fold = useMemo(() => createChannelFold(), []);
  const serverSwitch = useMemo(() => createVoiceServerSwitch({ voiceStore: voice.store }), [voice]);
  useEffect(() => () => serverSwitch.dispose(), [serverSwitch]);
  // 连接成功即结算切换（旧 WebClient.vue connected watcher 的 settleFavoriteSwitch
  // 平价）：缺这条接线时，成功切服后挂起横幅只剩 20s 安全超时兜底，超时即假失败。
  useEffect(() => settleSwitchOnConnected(voice.store, serverSwitch), [voice, serverSwitch]);
  const switchState = useStore(serverSwitch.store);

  // 性能面板监视器：探针只在面板打开时采样（门控 connected && panelOpen）。
  // connected 半边在此内部订阅（旧 watch([connected, panelOpen]) 平价），
  // panelOpen 半边在 setPanelOpen/togglePanel 内自查。
  const monitor = useMemo(() => createPerformanceMonitor({
    isConnected: () => voice.store.getState().connected,
    measure: () => voice.measureVoiceAudioStatus(),
  }), [voice]);
  useEffect(() => {
    let lastConnected = voice.store.getState().connected;
    const unsubscribe = voice.store.subscribe((snapshot) => {
      if (snapshot.connected === lastConnected) return;
      lastConnected = snapshot.connected;
      monitor.syncGating();
    });
    return () => { unsubscribe(); monitor.dispose(); };
  }, [voice, monitor]);

  // 音频控制控制器（旧 useWebClientAudioControls 平价）：t/localizedMessage 经
  // live 桥（只在 toast/错误文案的事件回调里读），不随语言重建——重建会丢 PTT
  // 与麦克风测试状态。弹窗开关经 syncSettingsOpen 由根 effect 喂。
  const audioControls = useMemo(() => createAudioControls({
    getSettingsOpen: options.getSettingsOpen,
    getMicrophoneMuted: () => voice.store.getState().microphoneMuted,
    getMicLevel: () => voice.store.getState().micLevel,
    getMicrophoneTestActive: () => voice.store.getState().microphoneTestActive,
    getAccompanimentActive: () => voice.store.getState().accompanimentActive,
    getAccompanimentErrorCode: () => voice.store.getState().accompanimentErrorCode,
    getWhisperTargetCount: () => voice.store.getState().whisperTargetIds.size,
    prepareInputDevices: () => voice.prepareInputDevices(),
    setInputVolume: (value) => voice.setInputVolume(value),
    setAccompanimentVolume: (value) => voice.setAccompanimentVolume(value),
    setNoiseSuppressionEnabled: (enabled) => voice.setNoiseSuppressionEnabled(enabled),
    setEchoCancellationEnabled: (enabled) => voice.setEchoCancellationEnabled(enabled),
    setAutoGainControlEnabled: (enabled) => voice.setAutoGainControlEnabled(enabled),
    setOutputVolume: (value) => voice.setOutputVolume(value),
    setVoxThreshold: (value) => voice.setVoxThreshold(value),
    setNotificationVolume: (value) => voice.setNotificationVolume(value),
    setInputDevice: (deviceId) => voice.setInputDevice(deviceId),
    setOutputDevice: (deviceId) => voice.setOutputDevice(deviceId),
    setMicrophoneMuted: (muted) => voice.setMicrophoneMuted(muted),
    startMicrophoneTest: () => voice.startMicrophoneTest(),
    stopMicrophoneTest: () => voice.stopMicrophoneTest(),
    setMicrophoneTestPlayback: (active) => voice.setMicrophoneTestPlayback(active),
    startAccompaniment: () => voice.startAccompaniment(),
    stopAccompaniment: () => voice.stopAccompaniment(),
    setWhisperActive: (active) => voice.setWhisperActive(active),
    localizedMessage: localizedLive,
    showToast: options.showToast,
    t: tLive,
  }), [voice, options.getSettingsOpen, localizedLive, tLive, options.showToast]);
  useEffect(() => () => audioControls.dispose(), [audioControls]);

  // 频道投影根部版（shell 内 useMemo 是渲染期平价；这里是控制器回调读取的同一事实源）。
  const currentChannelOf = useCallback(() => {
    const clientId = voice.store.getState().tsClientId;
    const homeSnapshot = store.getState();
    return findCurrentChannel(
      buildChannelTree(voice.session.store.getState().channels, clientId),
      { selectedChannelId: homeSnapshot.selectedChannelId, channelName: homeSnapshot.channelName, clientId },
    );
  }, [voice, store]);

  const membersController = useMemo(() => createMembersController({
    getChannels: () => buildChannelTree(voice.session.store.getState().channels, voice.store.getState().tsClientId),
    getCurrentChannel: currentChannelOf,
    moveClient: (clientId, targetChannelId) => voice.moveClient(clientId, targetChannelId),
    setWhisperTargets: (clientIds) => voice.setWhisperTargets(clientIds),
    sendPoke: (clientId, message) => voice.sendPoke(clientId, message),
    setAway: (away, message) => voice.setAway(away, message),
    onManualStatusChange: options.onManualStatusChange,
    // PTT 指针捕获释放随 P4-5 音频控制回归；核心的关耳语在此已平价。
    stopWhisperTalk: () => voice.setWhisperActive(false),
    getWhisperTargetIds: () => voice.store.getState().whisperTargetIds,
    localizedMessage: localizedLive,
    showToast: options.showToast,
    t: tLive,
  }), [voice, currentChannelOf, localizedLive, tLive, options.showToast, options.onManualStatusChange]);

  const onChatListElement = useCallback((element: ChatScrollerAspect | null) => {
    chatListBox.current = element;
  }, []);
  const chat = useMemo(() => createChatController({
    home: store,
    session: voice.session.store,
    mergeChatHistory: voice.session.mergeChatHistory,
    voice: voice.store,
    getClientId: () => voice.store.getState().tsClientId,
    getServerKey: () => {
      const snapshot = store.getState();
      return combineTeamSpeakTarget(snapshot.serverHost, snapshot.serverPort);
    },
    getCurrentChannel: currentChannelOf,
    getCurrentChannelName: () => currentChannelOf()?.name ?? store.getState().channelName,
    getSelectedChannelId: () => store.getState().selectedChannelId,
    isMobileViewport: () => liveViewportBox.current.isMobile,
    getMobileSection: () => liveViewportBox.current.section,
    setMobileSection,
    closeMemberMenu: () => membersController.closeMemberMenu(),
    sendTextMessage: voice.sendTextMessage,
    sendServerMessage: voice.sendServerMessage,
    sendPrivateMessage: voice.sendPrivateMessage,
    notifyPrivateMessage: () => voice.playNotification("private"),
    t: tLive,
    getList: () => chatListBox.current,
  }), [voice, store, currentChannelOf, membersController, tLive]);

  // 视口高度变化（移动端键盘收展）后消息列表回底（旧 watch(mobileViewport.height) 平价）。
  useEffect(() => {
    chat.scrollIfFollowing();
  }, [chat, options.viewportHeight]);

  // poke 后台系统通知（旧 watch(pokeNotifications) 的系统通知半边；提示音与横幅
  // 自动消退归 VoiceBanners——旧代码里它们同源，拆分后各认一半防双音）。
  useEffect(() => {
    let lastLength = voice.session.store.getState().pokeNotifications.length;
    return voice.session.store.subscribe((snapshot) => {
      const length = snapshot.pokeNotifications.length;
      if (length <= lastLength) { lastLength = length; return; }
      lastLength = length;
      const latest = snapshot.pokeNotifications[length - 1];
      if (!latest) return;
      const body = `${latest.invokerName} ${tLive("pokedYou")}${latest.message ? tLive("pokeMessageSuffix", { message: latest.message }) : ""}`;
      showBackgroundTabNotification(readDesktopNotificationSetting(), tLive("poke"), body);
    });
  }, [voice, tLive]);

  // —— 进房动作（旧 switchServer/leaveVoiceWorkspace/onServerPasswordCancel 平价） ——
  function switchServer(server: FavoriteServer): void {
    if (serverSwitch.store.getState().pending || voice.store.getState().connecting) return;
    const snapshot = store.getState();
    // 同目标行点击不是切服；换频道走频道树。
    if (server.address === combineTeamSpeakTarget(snapshot.serverHost, snapshot.serverPort)) return;
    serverSwitch.begin(server.label || server.address);
    // 先复位失败镜像（镜像读 connectionFailureCode）：第二次尝试以同码失败也要能
    // 再次触发横幅；errorCode 一并清掉，延续上一轮「开新尝试先清展示错误码」的行为。
    voice.store.setState({ connectionFailureCode: "", errorCode: "" });
    const target = splitTeamSpeakTarget(server.address);
    store.setState({
      serverHost: target.address,
      serverPort: target.port,
      ...(server.nickname ? { nickname: server.nickname } : {}),
      channelName: server.lastChannelHint?.name ?? "",
      serverPassword: server.password ?? "",
    });
    // doConnect 对无效表单（如昵称为空）静默不动作：立刻挂失败横幅而不是干等安全超时。
    if (!connection.canJoin()) {
      serverSwitch.fail();
      return;
    }
    connection.doConnect();
  }
  function leaveVoiceWorkspace(): void {
    serverSwitch.settle();
    connection.doDisconnect();
  }
  function onServerPasswordCancel(): void {
    // 取消密码弹窗 = 结束这次切服尝试：立即结算挂起横幅，不等安全超时。
    serverSwitch.fail();
    connection.cancelServerPassword();
  }

  return {
    chat,
    membersController,
    fold,
    serverSwitch,
    switchState,
    monitor,
    audioControls,
    mobileSection,
    setMobileSection,
    memberQuery,
    setMemberQuery,
    onChatListElement,
    switchServer,
    leaveVoiceWorkspace,
    onServerPasswordCancel,
  };
}
