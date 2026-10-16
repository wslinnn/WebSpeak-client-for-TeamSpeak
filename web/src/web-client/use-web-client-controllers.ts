import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { toast } from "sonner";

import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useWebClientMessages } from "@/hooks/use-i18n";
import { saveLocalPreferences, saveStoredIdentity, removeStoredIdentity } from "@/services/local-persistence";
import { combineTeamSpeakTarget } from "@/services/teamspeak-target";
import { createHomeConnection } from "@/web-client/home-connection";
import { createHomeFavorites } from "@/web-client/home-favorites";
import { createHomeIdentity } from "@/web-client/home-identity";
import { createHomeStore } from "@/web-client/home-store";
import { createIdentityPersistence } from "@/web-client/identity-persistence";
import { createPublicConfig } from "@/web-client/public-config";
import { initialServerTarget } from "@/web-client/initial-target";
import type { createWebClientMessages } from "@/i18n/messages";

// 模块级 live i18n 桥。home-identity 控制器只创建一次（代际纪律的 downloads 表与
// generation 不可随语言重建），其 t 适配器经此读当次语言的消息集；只在事件与
// 订阅回调里被调用，渲染路径不经过。
let liveMessages: ReturnType<typeof createWebClientMessages> | null = null;

/** toast 侧通道（旧 showToast 平价，2800ms 自理的那枚 div 由 sonner 承担）。 */
function showToast(message: string, tone: "info" | "warn" = "info"): void {
  if (tone === "warn") toast.warning(message);
  else toast.success(message);
}

/** 首页控制器装配：store + 五控制器 + 语言桥刷新 + 跨 store 订阅（连接成功收藏、
 *  进房可见复位身份操作、fixed 模式密码预填）。React 视图只消费返回值与渲染。 */
export function useWebClientControllers() {
  const voice = useVoiceSession();
  const messages = useWebClientMessages();

  const store = useMemo(() => {
    const created = createHomeStore();
    const target = initialServerTarget(new URLSearchParams(window.location.search), window.location);
    created.setState({
      nickname: localStorage.getItem("webspeak:nickname") ?? "",
      serverHost: target.address,
      serverPort: target.port,
      rememberIdentity: localStorage.getItem("webspeak:remember-identity") !== "0",
    });
    return created;
  }, []);
  const home = useStore(store);

  const publicConfig = useMemo(
    () => createPublicConfig({ applyPrefill: (host, port) => store.setState({ serverHost: host, serverPort: port }), t: (key) => liveMessages?.t(key) ?? key }),
    [store],
  );
  const favorites = useMemo(
    () => createHomeFavorites({ store, t: (key, vars) => liveMessages?.t(key, vars) ?? key, showToast }),
    [store],
  );
  const identity = useMemo(
    () => createHomeIdentity({ store, t: (key) => liveMessages?.t(key) ?? key, showToast }),
    [store],
  );
  const identityPersistence = useMemo(
    () => createIdentityPersistence({ store, saveStoredIdentity, removeStoredIdentity }),
    [store],
  );
  const connection = useMemo(
    () => createHomeConnection({
      store,
      voiceStore: voice.store,
      connect: (target, channel, nickname, password, identityMaterial, remember) =>
        voice.connect(target, channel, nickname, password, identityMaterial, remember),
      disconnect: () => voice.disconnect(),
      isConnecting: () => voice.store.getState().connecting,
      switchChannel: (channelId, password) => voice.switchChannel(channelId, password),
      clearError: () => voice.clearError(),
      getChannels: () => voice.session.store.getState().channels,
      getClientId: () => voice.store.getState().tsClientId,
      saveNickname: (value) => {
        localStorage.setItem("webspeak:nickname", value);
        void saveLocalPreferences({ schemaVersion: 1, lastNickname: value });
      },
      showToast,
      localizedMessage: (message) => liveMessages?.localizedMessage(message) ?? message,
      t: (key) => liveMessages?.t(key) ?? key,
      initialized: () => publicConfig.store.getState().initialized,
      accessMode: () => publicConfig.store.getState().accessMode,
    }),
    [store, voice, publicConfig],
  );

  useEffect(() => { liveMessages = messages; }, [messages]);
  useEffect(() => () => identityPersistence.dispose(), [identityPersistence]);
  // 连接控制器的 voice-store 订阅随控制器实例走；实例异常重建时不泄漏订阅。
  useEffect(() => () => connection.dispose(), [connection]);

  // 连接成功：连接即收藏 + 通知音（存储的工作密码此刻才入收藏——此前输错的
  // 密码不得作为「记住的」存留）。
  useEffect(() => {
    let lastConnected = voice.store.getState().connected;
    return voice.store.subscribe((snapshot) => {
      if (snapshot.connected && !lastConnected) {
        voice.playNotification("connected");
        void favorites.syncFavoriteConnection();
      }
      lastConnected = snapshot.connected;
    });
  }, [voice, favorites]);
  // 进房可见（含重连/失败横幅态）即同步复位身份操作（旧 flush:sync watch 平价）。
  useEffect(() => {
    let lastVisible = false;
    return voice.store.subscribe((snapshot) => {
      const visible = snapshot.connected || snapshot.reconnecting || snapshot.reconnectFailed;
      if (visible && !lastVisible) identity.reset();
      lastVisible = visible;
    });
  }, [voice, identity]);
  // fixed 模式无服务器页签：管理员目标与收藏就绪后自动补记忆密码，进房保持一键。
  useEffect(() => {
    function prefill(): void {
      // 会话进行中（含刷新恢复）不回填：open+屏蔽预填模式会把 host 清成
      // ""，覆盖恢复意图带回的真实目标（member-server-header 裸奔事故）。
      const voiceSnapshot = voice.store.getState();
      if (voiceSnapshot.connected || voiceSnapshot.connecting || voiceSnapshot.reconnecting) return;
      const snapshot = store.getState();
      if (publicConfig.store.getState().accessMode !== "fixed" || snapshot.serverPassword) return;
      const id = combineTeamSpeakTarget(snapshot.serverHost, snapshot.serverPort).trim().toLocaleLowerCase();
      const favorite = snapshot.favoriteServers.find((item) => item.id === id);
      if (favorite?.password) store.setState({ serverPassword: favorite.password });
    }
    prefill();
    return store.subscribe(prefill);
  }, [store, publicConfig, voice.store]);

  return { voice, store, home, publicConfig, favorites, identity, connection, identityPersistence, showToast };
}
