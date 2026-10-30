import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { toast } from "sonner";

import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useWebClientMessages } from "@/hooks/use-i18n";
import { readVoiceSessionIntent } from "@/voice/session-intent";
import { saveLocalPreferences, saveStoredIdentity, removeStoredIdentity } from "@/services/local-persistence";
import { createHomeConnection } from "@/web-client/home-connection";
import { createHomeFavorites } from "@/web-client/home-favorites";
import { createHomeIdentity } from "@/web-client/home-identity";
import { createHomeStore } from "@/web-client/home-store";
import { createIdentityPersistence } from "@/web-client/identity-persistence";
import { createPublicConfig } from "@/web-client/public-config";
import { initialServerTarget } from "@/web-client/initial-target";
import { readFixedServerPassword, saveFixedServerPassword } from "@/web-client/fixed-server-password";
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
    () => createPublicConfig({
      applyPrefill: (host, port) => store.setState({ serverHost: host, serverPort: port }),
      shouldSkipPrefill: () => {
        // 挂载序列先回填恢复意图目标、后异步 loadPublicConfig：open+屏蔽预填的
        // 清空若不设防，会把刚回填的真实 host 清成 ""（服务器名行裸奔 ":9987"）。
        const voiceSnapshot = voice.store.getState();
        if (voiceSnapshot.connected || voiceSnapshot.connecting || voiceSnapshot.reconnecting) return true;
        return Boolean(readVoiceSessionIntent()?.target);
      },
      t: (key) => liveMessages?.t(key) ?? key,
    }),
    [store, voice],
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
  // 密码不得作为「记住的」存留）。fixed 模式走独立密码键，不借收藏当键。
  useEffect(() => {
    let lastConnected = voice.store.getState().connected;
    return voice.store.subscribe((snapshot) => {
      if (snapshot.connected && !lastConnected) {
        voice.playNotification("connected");
        if (publicConfig.store.getState().accessMode === "fixed") {
          saveFixedServerPassword(store.getState().serverPassword);
        } else {
          void favorites.syncFavoriteConnection();
        }
      }
      lastConnected = snapshot.connected;
    });
  }, [voice, favorites, publicConfig, store]);
  // 进房可见（含重连/失败横幅态）即同步复位身份操作（旧 flush:sync watch 平价）。
  useEffect(() => {
    let lastVisible = false;
    return voice.store.subscribe((snapshot) => {
      const visible = snapshot.connected || snapshot.reconnecting || snapshot.reconnectFailed;
      if (visible && !lastVisible) identity.reset();
      lastVisible = visible;
    });
  }, [voice, identity]);
  // fixed 模式无服务器页签：连接前从独立键回填记忆密码，进房保持一键。
  useEffect(() => {
    function prefill(): void {
      // 会话进行中（含刷新恢复）不回填：open+屏蔽预填模式会把 host 清成
      // ""，覆盖恢复意图带回的真实目标（member-server-header 裸奔事故）。
      const voiceSnapshot = voice.store.getState();
      if (voiceSnapshot.connected || voiceSnapshot.connecting || voiceSnapshot.reconnecting) return;
      const snapshot = store.getState();
      if (publicConfig.store.getState().accessMode !== "fixed" || snapshot.serverPassword) return;
      const stored = readFixedServerPassword();
      if (stored) store.setState({ serverPassword: stored });
    }
    prefill();
    // publicConfig 也要订阅：fixed+无参数部署的 config 落地不写 home store，
    // 不订阅则记忆密码要等用户第一次动表单才回填。
    const unsubscribeHome = store.subscribe(prefill);
    const unsubscribePublic = publicConfig.store.subscribe(prefill);
    return () => {
      unsubscribeHome();
      unsubscribePublic();
    };
  }, [store, publicConfig, voice.store]);

  return { voice, store, home, publicConfig, favorites, identity, connection, identityPersistence, showToast };
}
