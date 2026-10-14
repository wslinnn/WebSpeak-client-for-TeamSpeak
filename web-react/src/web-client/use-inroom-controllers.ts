import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import type { VoiceSessionController } from "@/voice/session-controller";
import { showBackgroundTabNotification, readDesktopNotificationSetting } from "@/services/desktop-notifications";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/services/teamspeak-target";
import type { FavoriteServer } from "@/services/local-persistence";
import { buildChannelTree, findCurrentChannel } from "@/web-client/channel-tree";
import { createChannelFold } from "@/web-client/channel-fold";
import { createChatController, type ChatScrollerAspect } from "@/web-client/chat-controller";
import { createMembersController } from "@/web-client/members-controller";
import { createVoiceServerSwitch } from "@/web-client/server-switch";
import type { HomeConnection } from "@/web-client/home-connection";
import type { HomeStoreController } from "@/web-client/home-store";
import type { MobileSection } from "@/components/web-client/voice-shell";

interface InRoomOptions {
  voice: VoiceSessionController;
  store: HomeStoreController;
  connection: HomeConnection;
  isMobileViewport: boolean;
  viewportHeight: number;
  showToast(message: string, tone?: "info" | "warn"): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
}

// 模块级实时桥（liveMessages 同款纪律与仓内先例）：WebClient 路由单实例，桥只在
// 事件/订阅回调里被读取，渲染路径不经过；effect 落账当次语言与视口。不随语言/视口
// 重建控制器——重建会丢草稿、菜单与滚动状态。
interface LiveI18n {
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
}
let liveI18n: LiveI18n = { t: (key) => key, localizedMessage: (message) => message };
let liveViewport: { isMobile: boolean; section: MobileSection } = { isMobile: false, section: "channels" };
let chatListAspect: ChatScrollerAspect | null = null;

/** 进房控制器装配（旧 WebClient.vue 根部 chat/members/fold/serverSwitch 装配平价）。
 *  控制器在根创建：切服/断线期间语音壳与首页互换挂载，草稿/折叠记忆/菜单状态必须
 *  跨两态存活。 */
export function useInRoomControllers(options: InRoomOptions) {
  const { voice, store, connection } = options;

  const [mobileSection, setMobileSection] = useState<MobileSection>("channels");
  const [memberQuery, setMemberQuery] = useState("");
  useEffect(() => {
    liveI18n = { t: options.t, localizedMessage: options.localizedMessage };
  });
  useEffect(() => {
    liveViewport = { isMobile: options.isMobileViewport, section: mobileSection };
  }, [options.isMobileViewport, mobileSection]);
  const tLive = useCallback((key: string, variables?: Record<string, string | number>) => liveI18n.t(key, variables), []);
  const localizedLive = useCallback((message: string) => liveI18n.localizedMessage(message), []);

  const fold = useMemo(() => createChannelFold(), []);
  const serverSwitch = useMemo(() => createVoiceServerSwitch({ voiceStore: voice.store }), [voice]);
  useEffect(() => () => serverSwitch.dispose(), [serverSwitch]);
  const switchState = useStore(serverSwitch.store);

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
    // PTT 指针捕获释放随 P4-5 音频控制回归；核心的关耳语在此已平价。
    stopWhisperTalk: () => voice.setWhisperActive(false),
    getWhisperTargetIds: () => voice.store.getState().whisperTargetIds,
    localizedMessage: localizedLive,
    showToast: options.showToast,
    t: tLive,
  }), [voice, currentChannelOf, localizedLive, tLive, options.showToast]);

  const onChatListElement = useCallback((element: ChatScrollerAspect | null) => {
    chatListAspect = element;
  }, []);
  const chat = useMemo(() => createChatController({
    home: store,
    session: voice.session.store,
    voice: voice.store,
    getClientId: () => voice.store.getState().tsClientId,
    getServerKey: () => {
      const snapshot = store.getState();
      return combineTeamSpeakTarget(snapshot.serverHost, snapshot.serverPort);
    },
    getCurrentChannel: currentChannelOf,
    getCurrentChannelName: () => currentChannelOf()?.name ?? store.getState().channelName,
    getSelectedChannelId: () => store.getState().selectedChannelId,
    isMobileViewport: () => liveViewport.isMobile,
    getMobileSection: () => liveViewport.section,
    setMobileSection,
    closeMemberMenu: () => membersController.closeMemberMenu(),
    sendTextMessage: voice.sendTextMessage,
    sendServerMessage: voice.sendServerMessage,
    sendPrivateMessage: voice.sendPrivateMessage,
    notifyPrivateMessage: () => voice.playNotification("private"),
    t: tLive,
    getList: () => chatListAspect,
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
    // 先复位失败镜像：第二次尝试以同码失败也要能再次触发横幅。
    voice.store.setState({ errorCode: "" });
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
