import { createVoiceConnection } from "./connection";
import { clearVoiceSessionIntent, readVoiceSessionIntent, writeVoiceSessionIntent } from "./session-intent";
import { closeErrorCode, closeReason, connectionFailureMessage, joinTicketReason, normalizedClientErrorCode } from "./error-messages";
import { splitTeamSpeakTarget } from "../services/teamspeak-target";
import type { VoiceSessionView } from "./session-model";

export interface LastConnection {
  target: string;
  channel: string;
  nickname: string;
  serverPassword: string;
  identity?: string;
  rememberIdentity: boolean;
}

/** 连接生命周期簇（自 session-controller 平移）：join/断开、浏览器级重连预算
 *  （1/2/4 秒逐档、限流独立档）、reconnect ticket 的存取与刷新恢复、socket
 *  所有权。消息与音频帧回调仍由门面分发（onMessage/onAudio 注入）。 */

interface ConnectionLifecycleDeps {
  V(): VoiceSessionView;
  patch(partial: Partial<VoiceSessionView>): void;
  onMessage(raw: unknown): void;
  onAudio(data: Uint8Array): void;
  syncVoiceTransport(): void;
  resetSessionState(): void;
  releaseSessionResources(sendScreenStop?: boolean): void;
  clearMicrophoneError(): void;
  clearAudioNotice(): void;
  playNotification(kind: "connected" | "disconnected" | "poke" | "private" | "reconnectFailed"): void;
  /** connect 起始握手等待的偏好装载 promise（取值时机在 start 调用刻）。 */
  audioPreferencesReady(): Promise<void>;
}

export function createConnectionLifecycle(deps: ConnectionLifecycleDeps) {
  const { V, patch } = deps;
  let socket: WebSocket | null = null;
  const voiceConnection = createVoiceConnection({
    onSocket: value => { socket = value; },
    onMessage: deps.onMessage,
    onAudio: deps.onAudio,
    onClose(event) {
      deps.releaseSessionResources();
      patch({ connected: false, connecting: false, reconnecting: false, tsClientId: 0 });
      deps.syncVoiceTransport();
      if (!V().reconnectFailed) deps.resetSessionState();
      if (event.code !== 1000 && !V().reconnectFailed && !V().errorCode) {
        const code = closeErrorCode(event.code, event.reason);
        patch({ errorCode: code, connectionFailureCode: code, error: closeReason(event.code, event.reason) });
      }
      deps.clearMicrophoneError();
      deps.clearAudioNotice();
      const retryableDrop = BROWSER_RECONNECTABLE_CLOSE_CODES.has(event.code);
      if (!retryableDrop) {
        // Terminal gateway codes (bad ticket, bad target, identity conflicts)
        // would repeat after a resume: drop the ticket and stop any loop.
        browserReconnectActive = false;
        if (BROWSER_TERMINAL_CLOSE_CODES.has(event.code)) dropReconnectTicket();
        return;
      }
      if (!reconnectTicket || V().connected || V().reconnectFailed) return;
      // A retryable transport drop with a live ticket reconnects in place —
      // the reconnect banner replaces the kick back to the join form.
      browserReconnectActive = true;
      scheduleBrowserReconnect();
    },
    onFailure({ code, detail, cause, retryAfterMs }) {
      const errorCode = normalizedClientErrorCode(code, "REQUEST_FAILED");
      patch({
        connecting: false,
        errorCode,
        connectionFailureCode: errorCode,
        error: cause instanceof Error ? cause.message : joinTicketReason(errorCode, detail),
        ...(errorCode === "PASSWORD_RETRY_LATER" ? {
          retryNotUntil: Date.now() + (typeof retryAfterMs === "number" && retryAfterMs > 0 ? retryAfterMs : 60_000),
        } : {}),
      });
      if (!browserReconnectActive) return;
      if (V().errorCode === "RECONNECT_INVALID") {
        // The gateway no longer knows this session (TTL passed, server
        // restarted): give up quietly unless the room is on screen.
        abandonBrowserReconnect();
        return;
      }
      if (errorCode === "RATE_LIMITED") {
        // 网关限流不是会话故障：按 Retry-After 等窗口过去，且不消耗重连预算
        // （盲重试会在群体重连里把预算烧光并弹假失败横幅——报告 21 F5）。
        scheduleBrowserReconnect({ throttled: true, retryAfterMs: typeof retryAfterMs === "number" ? retryAfterMs : 0 });
        return;
      }
      // Transient exchange failures (offline, timeout) get the next slot in the
      // reconnect budget.
      scheduleBrowserReconnect();
    },
  });
  // A pending browser-reconnect timer must not fire into a disposed page.
  // React hosts call dispose() from their teardown effect; tests may skip it.
  let lastConnection: LastConnection | null = null;
  // 展示用目标（无凭据）：随 reconnect intent 持久化，刷新恢复后首页
  // store（header 收藏匹配 / 折叠记忆 serverKey）才有真实目标可回填。
  let lastConnectTarget: { address: string; port: string } | null = null;
  // Browser-level reconnect: when the gateway WebSocket itself drops (network
  // loss, proxy timeout, server restart) the reconnect ticket restores the
  // whole session. Delays mirror the gateway's
  // own TeamSpeak-reconnect pacing; after the budget the user retries manually.
  const BROWSER_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000];
  // 限流（429）不计入 1/2/4 秒重连预算：延迟改由网关 Retry-After 决定，但设独立
  // 上限——持续限流最终仍回落普通预算，不让重连无限续命（报告 21 F5）。
  const MAX_THROTTLED_RECONNECTS = 3;
  /** ±20% 抖动：共享限流键（同 NAT、反代漏设 TRUST_PROXY）的群体重连不再同拍敲门。 */
  const jitteredReconnectDelay = (baseMs: number): number => Math.round(baseMs * (0.8 + Math.random() * 0.4));
  const BROWSER_RECONNECTABLE_CLOSE_CODES = new Set([1006, 1011, 4004]);
  // 4006（单网络并发上限，报告 21 S3）在本网络缓解前重连必然再撞墙，按终态处理。
  const BROWSER_TERMINAL_CLOSE_CODES = new Set([4001, 4002, 4003, 4005, 4006]);
  // reconnectFailed codes that cannot succeed unchanged: automatic resume must
  // stop offering the session after these and leave the next move to the user.
  const TERMINAL_RECONNECT_FAILURE_CODES = new Set([
    "BANNED", "KICKED", "INVALID_TARGET", "INVALID_NICKNAME", "NICKNAME_IN_USE",
    "INVALID_SERVER_PASSWORD", "SERVER_PASSWORD_REQUIRED", "IDENTITY_REJECTED",
    "IDENTITY_IN_USE", "IDENTITY_SECURITY_LEVEL_TOO_LOW", "IDENTITY_LIMIT_REACHED",
    "CLIENT_VERSION_OUTDATED",
  ]);
  let reconnectTicket = "";
  let browserReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let browserReconnectActive = false;
  let throttledReconnects = 0;
  let connectedThisLoad = false;

  function connect(target: string, channel: string, nickname: string, serverPassword = "", identity = "", rememberIdentity = false): void {
    const switchingServer = lastConnection !== null && lastConnection.target !== target;
    let started = false;
    const startJoin = (): void => {
      if (started) return;
      started = true;
      lastConnection = { target, channel, nickname, serverPassword, ...(identity ? { identity } : {}), rememberIdentity };
      lastConnectTarget = splitTeamSpeakTarget(target);
      patch({
        identityMaterial: identity,
        error: "",
        errorCode: "",
        retryNotUntil: 0,
        // Audio diagnostics belong to the previous session, never to the new one.
        connecting: true,
        reconnecting: false,
        reconnectAttempt: 0,
        reconnectFailed: false,
      });
      deps.clearMicrophoneError();
      deps.clearAudioNotice();
      voiceConnection.start(JSON.stringify({
        target, nickname, channel, serverPassword,
        ...(rememberIdentity && identity ? { identity } : {}),
        ...(rememberIdentity ? { rememberIdentity: true } : {}),
      }), deps.audioPreferencesReady());
    };
    if (!switchingServer) {
      disconnect(true);
      startJoin();
      return;
    }
    // 切换服务器先完整退出：等旧 socket 的 close 握手落地——网关收到 1000 即
    // 启动旧 TS 会话 teardown——再开新 join。并行赛跑会让同身份在 TS 服务器侧
    // 撞上尚未退场的旧连接，新连接挂到 8s 连接超时由浏览器重试兜底。400ms 上限
    // 只防 close 事件丢失，正常路径即达。
    const safety = setTimeout(startJoin, 400);
    disconnect(true, () => { clearTimeout(safety); startJoin(); });
  }

  function disconnect(preserveConnection = false, onClosed?: () => void): void {
    const keepRememberedIdentity = lastConnection?.rememberIdentity === true;
    if (!preserveConnection) {
      lastConnection = null;
      dropReconnectTicket();
    }
    cancelBrowserReconnect();
    deps.clearMicrophoneError();
    deps.clearAudioNotice();
    patch({
      connected: false, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false,
      tsClientId: 0, errorCode: "", connectionFailureCode: "", channelSwitchedChannelId: "",
      ...(keepRememberedIdentity ? {} : { identityMaterial: "" }),
    });
    // 标志位补丁必须在 stop 之前落地：切服串行化时 onClosed 会在 stop 内同步
    // 触发 startJoin（connecting:true），若补丁在其后会把新 join 的状态翻回
    // false——（voiceConnection.stop 的 onClosed 语义，2026-10-18）。
    voiceConnection.stop(() => deps.releaseSessionResources(!preserveConnection), onClosed);
    deps.syncVoiceTransport();
    deps.resetSessionState();
    patch({ volumes: {} });
  }

  // --- Browser-level reconnect machinery ---------------------------------
  function storeReconnectTicket(token: string): void {
    reconnectTicket = token;
    writeVoiceSessionIntent({
      reconnectToken: token,
      savedAt: Date.now(),
      ...(lastConnectTarget ? { target: lastConnectTarget } : {}),
    });
  }

  function dropReconnectTicket(): void {
    reconnectTicket = "";
    clearVoiceSessionIntent();
  }

  function cancelBrowserReconnect(): void {
    if (browserReconnectTimer !== null) {
      clearTimeout(browserReconnectTimer);
      browserReconnectTimer = null;
    }
    browserReconnectActive = false;
    throttledReconnects = 0;
  }

  function scheduleBrowserReconnect(options: { throttled?: boolean; retryAfterMs?: number } = {}): void {
    if (!reconnectTicket || V().connected || V().reconnectFailed) {
      browserReconnectActive = false;
      return;
    }
    if (browserReconnectTimer !== null) return;
    const retryAfterMs = Math.max(0, options.retryAfterMs ?? 0);
    const throttled = options.throttled === true && throttledReconnects < MAX_THROTTLED_RECONNECTS;
    if (throttled) throttledReconnects += 1;
    // 限流重试停在当前档位（不消耗 1/2/4 秒预算），其余尝试逐档递增。
    const attempt = throttled ? Math.max(1, V().reconnectAttempt) : V().reconnectAttempt + 1;
    patch({ reconnecting: true, connecting: false, reconnectAttempt: attempt });
    if (attempt > BROWSER_RECONNECT_DELAYS_MS.length) {
      abandonBrowserReconnect();
      return;
    }
    // 限流档以 Retry-After 为准（仍加抖动：同一限流窗口的客户端别同拍再来）。
    const base = throttled
      ? Math.max(retryAfterMs, BROWSER_RECONNECT_DELAYS_MS[0]!)
      : BROWSER_RECONNECT_DELAYS_MS[attempt - 1]!;
    browserReconnectTimer = setTimeout(() => {
      browserReconnectTimer = null;
      attemptBrowserReconnect();
    }, jitteredReconnectDelay(base));
  }

  function attemptBrowserReconnect(): void {
    if (!reconnectTicket || V().connected) {
      browserReconnectActive = false;
      patch({ reconnecting: false });
      return;
    }
    browserReconnectActive = true;
    patch({ connecting: true });
    voiceConnection.start(JSON.stringify({ reconnect: reconnectTicket }), deps.audioPreferencesReady());
  }

  /** Budget exhausted or the gateway forgot the session. A page that never
   *  connected this load (reload resume with a stale token) falls back to the
   *  join form silently; an established session shows the failure banner. */
  function abandonBrowserReconnect(): void {
    cancelBrowserReconnect();
    dropReconnectTicket();
    if (!connectedThisLoad) {
      patch({ connecting: false, reconnecting: false, reconnectAttempt: 0, error: "", errorCode: "" });
      return;
    }
    const code = "GATEWAY_NETWORK_LOST";
    patch({
      connecting: false,
      reconnecting: false,
      reconnectFailed: true,
      errorCode: code,
      connectionFailureCode: code,
      error: connectionFailureMessage(code),
    });
    deps.playNotification("reconnectFailed");
  }

  /** Page-load recovery: exchange the stored reconnect token for a fresh join
   *  ticket and rebuild the session. Returns false when there is nothing to
   *  resume, leaving the normal join form untouched. */
  function tryResumeVoiceSession(): boolean {
    if (V().connected || V().connecting || V().reconnecting) return false;
    const intent = readVoiceSessionIntent();
    if (!intent) return false;
    // 本加载从未 connect 过：目标只能来自上次会话的 intent，续票成功后
    // storeReconnectTicket 才能把同一目标写回 intent。
    if (intent.target) lastConnectTarget = intent.target;
    reconnectTicket = intent.reconnectToken;
    patch({
      error: "", errorCode: "", retryNotUntil: 0, reconnectFailed: false, reconnectAttempt: 0, reconnecting: true,
    });
    deps.clearMicrophoneError();
    deps.clearAudioNotice();
    attemptBrowserReconnect();
    return true;
  }

  function reconnectNow(): void {
    if (V().connecting) return;
    if (reconnectTicket) {
      // Prefer the ticket: it restores the exact session payload, unlike a
      // manual form reconnect.
      cancelBrowserReconnect();
      patch({
        reconnectFailed: false, reconnectAttempt: 0, reconnecting: true, error: "", errorCode: "",
      });
      attemptBrowserReconnect();
      return;
    }
    if (!lastConnection) return;
    connect(lastConnection.target, lastConnection.channel, lastConnection.nickname, lastConnection.serverPassword, lastConnection.rememberIdentity ? V().identityMaterial || lastConnection.identity : "", lastConnection.rememberIdentity);
  }

  /** Releases reconnect timers; React hosts call this from their teardown. */
  function dispose(): void {
    cancelBrowserReconnect();
  }

  /** 门面 handleMessage 的 connected 分支调用：会话建立后浏览器级重连循环作废、
   *  限流预算清零、本加载「已连上」标记立起（影响 abandon 的静默降级路径）。 */
  function notifyConnected(): void {
    browserReconnectActive = false;
    throttledReconnects = 0;
    connectedThisLoad = true;
  }

  return {
    socket: (): WebSocket | null => socket,
    voiceConnection,
    notifyConnected,
    connect,
    disconnect,
    reconnectNow,
    tryResumeVoiceSession,
    dispose,
    storeReconnectTicket,
    dropReconnectTicket,
    isTerminalReconnectFailure: (code: string): boolean => TERMINAL_RECONNECT_FAILURE_CODES.has(code),
    lastConnection: (): LastConnection | null => lastConnection,
  };
}

export type ConnectionLifecycle = ReturnType<typeof createConnectionLifecycle>;
