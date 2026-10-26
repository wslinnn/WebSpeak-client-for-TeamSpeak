import type { AdminConnectionRecord } from "@shared/admin-responses";
import type { SiteLanguage } from "@shared/site-copy";

import { copy, type AdminTranslationKey } from "./admin";

// SiteLanguage 是共享协议类型（后端欢迎语文案仍是五语数据模型），但 UI 语言已
// 收缩为 zh/en：已下架语言别名到 en 兜底，切换器不再产生这些取值。
const translations: Record<SiteLanguage, Record<AdminTranslationKey, string>> = {
  zh: copy.zh, en: copy.en, de: copy.en, ru: copy.en, ja: copy.en,
};
const locales: Record<SiteLanguage, string> = { zh: "zh-CN", en: "en-US", de: "de-DE", ru: "ru-RU", ja: "ja-JP" };
const sessionLabels: Record<string, AdminTranslationKey> = {
  connecting: "sessionConnecting", authenticating: "sessionAuthenticating", syncing: "sessionSyncing",
  connected: "sessionConnected", interrupted: "sessionInterrupted", reconnecting: "sessionReconnecting",
  disconnecting: "sessionDisconnecting", failed: "sessionFailed", idle: "sessionIdle",
};
const connectionLabels: Record<AdminConnectionRecord["status"], AdminTranslationKey> = {
  active: "connectionActive", connecting: "connectionConnecting", disconnected: "connectionDisconnected", failed: "connectionFailed",
};
const eventLabels: Record<string, AdminTranslationKey> = {
  ADMIN_LOGIN_FAILED: "adminLoginFailedEvent", CONNECTION_TEST_SUCCEEDED: "connectionTestSucceededEvent", CONNECTION_TEST_FAILED: "connectionTestFailedEvent",
  ADMIN_LOGIN_SUCCEEDED: "loginEvent", ADMIN_LOGOUT: "logoutEvent", SETTINGS_CHANGED: "settingsEvent",
  ADMIN_INITIALIZED: "initializedEvent", LEGACY_CONFIG_IMPORTED: "importedEvent", CONNECTION_TEST: "testEvent",
  ADMIN_PASSWORD_CHANGED: "passwordChangedEvent", ADMIN_BACKUP_EXPORTED: "backupExportedEvent",
  ADMIN_SESSION_TERMINATED: "sessionTerminatedEvent",
  INVITE_CREATED: "inviteCreatedEvent", INVITE_REVOKED: "inviteRevokedEvent", INVITE_CONSUMED: "inviteConsumedEvent",
};
const errorLabels: Record<string, AdminTranslationKey> = {
  INVALID_PASSWORD: "invalidPassword", INVALID_ADMIN_PASSWORD: "setupPasswordShort", PASSWORD_CHANGE_REQUIRED: "changePasswordLead", RATE_LIMITED: "rateLimited",
  INVALID_WEBRTC_PUBLIC_HOST: "invalidWebRtcNetworkError", INVALID_WEBRTC_STUN_SERVER: "invalidWebRtcNetworkError", INVALID_WEBRTC_IPV6: "invalidWebRtcNetworkError",
  INVALID_WEBRTC_PORT_RANGE: "invalidWebRtcPortRangeError", WEBRTC_PORT_LOCKED: "webRtcPortLockedError",
  INVALID_SCREEN_SHARE_ICE: "screenShareIceInvalidError",
  INVALID_TARGET: "invalidTargetError", PING_UNAVAILABLE: "icmpUnavailableError", HOST_NOT_FOUND: "probeHostNotFoundError",
  UNREACHABLE: "probeUnreachableError", TIMEOUT: "probeTimeoutError", PROTOCOL_NEGOTIATION_FAILED: "probeProtocolError",
  SERVER_REJECTED: "probeRejectedError", TARGET_NOT_ALLOWED: "targetNotAllowedError",
};
const connectionErrors: Record<string, AdminTranslationKey> = {
  PASSWORD_REQUIRED: "serverPasswordRequiredError", SERVER_PASSWORD_REQUIRED: "serverPasswordRequiredError",
  INVALID_PASSWORD: "invalidServerPasswordError", INVALID_SERVER_PASSWORD: "invalidServerPasswordError",
  INVALID_TARGET: "serverAddress", INVALID_NICKNAME: "invalidNicknameError", HOST_NOT_FOUND: "hostNotFoundError",
  UNREACHABLE: "networkUnreachableError", CONNECTION_REFUSED: "connectionRefusedError", CONNECTION_RESET: "connectionResetError",
  TIMEOUT: "networkTimeoutError", PROTOCOL_NEGOTIATION_FAILED: "protocolFailureError", SERVER_REJECTED: "serverRejectedError",
  PING_UNAVAILABLE: "pingUnavailableError", CONNECTION_FAILED: "connectionFailed",
};
// 网关日志的 pino 消息是英文短语；zh 界面按这张表说人话，未知消息回落英文原文。
// 新增网关日志消息后此处按需补翻译，漏了不会报错只是显示英文。
const zhLogMessages: Record<string, string> = {
  "Administrator login failed": "管理员登录失败",
  "Client session torn down": "会话已结束",
  "Connected to TeamSpeak": "已连上 TeamSpeak 服务器",
  "Connecting through TeamSpeak adapter": "正在通过 TeamSpeak 适配器连接",
  "Could not create Opus encoder": "无法创建 Opus 编码器",
  "Could not create TeamSpeak client": "无法创建 TeamSpeak 客户端",
  "Could not discover existing TeamSpeak screen streams": "无法发现已有的 TeamSpeak 屏幕流",
  "Could not read TeamSpeak channel flags": "无法读取 TeamSpeak 频道标志",
  "Could not recreate Opus encoder for the resumed socket": "无法为恢复的连接重建 Opus 编码器",
  "Could not refresh TeamSpeak member statuses": "无法刷新 TeamSpeak 成员状态",
  "Could not stop native screen publication": "无法停止原生屏幕发布",
  "Could not synchronize initial microphone mute state": "无法同步初始麦克风静音状态",
  "Fatal error:": "致命错误：",
  "HTTPS enabled": "HTTPS 已启用",
  "Legacy config imported; WebSpeak settings are now managed from /admin": "旧配置已导入，设置改由管理台管理",
  "Max clients reached": "已达服务器最大人数",
  "Offer contains remote ICE candidates rejected by the address policy": "Offer 含被地址策略拒绝的远程 ICE 候选",
  "Opus encoder unavailable for the browser uplink": "浏览器上行 Opus 编码器不可用",
  "Per-peer session limit reached": "已达单对端会话上限",
  "Resume grace window elapsed; releasing the kept session": "恢复宽限已过，释放保留的会话",
  "Resume target no longer attachable; rebuilding the session on this connection": "恢复目标不可附加，正在此连接上重建会话",
  "Session state initialization failed": "会话状态初始化失败",
  "Shutting down": "正在关机",
  "Starting WebSpeak server": "WebSpeak 服务启动中",
  "Stored TeamSpeak password could not be decrypted": "已存的 TeamSpeak 密码无法解密",
  "TS connect failed": "TS 连接失败",
  "TeamSpeak identity already in use": "TeamSpeak 身份已被占用",
  "TeamSpeak probe cleanup failed": "TeamSpeak 探测清理失败",
  "TeamSpeak session ended by kick/ban": "会话被踢出/封禁而结束",
  "TeamSpeak transport disconnected": "TeamSpeak 连接已断开",
  "Voice WebSocket endpoint ready at /ws/voice": "语音 WebSocket 端点就绪",
  "Voice WebSocket server error": "语音 WebSocket 服务器错误",
  "Voice session resumed onto kept TeamSpeak connection": "语音会话已在保留的连接上恢复",
  "Web server started": "Web 服务器已启动",
  "WebClient connecting": "浏览器端正在连接",
  "Web client connected to TeamSpeak": "已连接到 TeamSpeak",
  "WebRTC audio negotiation completed": "WebRTC 音频协商完成",
  "WebRTC audio negotiation failed": "WebRTC 音频协商失败",
  "WebRTC connection state changed": "WebRTC 连接状态变化",
  "WebSocket closed": "WebSocket 已关闭",
  "WebSocket error": "WebSocket 错误",
};
// 日志 context 键的展示顺序与中文标签；entryId 是内部关联 id，不对外展示。
const logContextOrder = ["nickname", "target", "clientIp", "channel", "code", "reason", "attempt", "reconnect", "port", "component"] as const;
const logContextLabels: Record<string, AdminTranslationKey> = {
  nickname: "ctxNickname", target: "ctxTarget", clientIp: "ctxClientIp", channel: "ctxChannel",
  code: "ctxCode", reason: "ctxReason", attempt: "ctxAttempt", reconnect: "ctxReconnect",
  port: "ctxPort", component: "ctxComponent",
};
const keyFor = (labels: Record<string, AdminTranslationKey>, code: string) => Object.hasOwn(labels, code) ? labels[code]! : undefined;

/** 管理台 i18n 纯函数层（旧 useAdminI18n 去框架化：Vue Ref → 语言参数）。 */
export function createAdminMessages(language: SiteLanguage) {
  function tr(key: AdminTranslationKey, vars: Record<string, string | number> = {}): string {
    let value = translations[language][key];
    for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{{${name}}}`, String(replacement));
    return value;
  }
  function formatDate(value: string | null) {
    return value ? new Intl.DateTimeFormat(locales[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  }
  function formatUptime(seconds: number) {
    return tr("uptimeText", { hours: Math.floor(seconds / 3600), minutes: Math.floor((seconds % 3600) / 60) });
  }
  function formatAge(seconds: number | null) {
    if (seconds == null) return "—";
    if (seconds < 60) return tr("ageSeconds", { seconds });
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return tr("ageMinutes", { minutes });
    return tr("ageHoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  }
  function sessionStateLabel(state: string) { const key = keyFor(sessionLabels, state); return key ? tr(key) : state; }
  function connectionStatusLabel(status: AdminConnectionRecord["status"]) { return tr(connectionLabels[status]); }
  function eventName(event: string) {
    const key = keyFor(eventLabels, event);
    return key ? tr(key) : language === "zh" ? tr("systemEvent") : event.replaceAll("_", " ");
  }
  function errorText(code?: string) { return tr(keyFor(errorLabels, code || "") ?? "requestFailed"); }
  function connectionFailureText(code?: string) { const key = keyFor(connectionErrors, code || ""); return key ? tr(key) : errorText(code); }
  const relativeFormatter = new Intl.RelativeTimeFormat(locales[language], { numeric: "auto" });
  /** 一周内说相对时间（悬停有完整时刻兜底），更久回落「M-d HH:mm」短格式。 */
  function formatRelative(value: string | null): string {
    if (!value) return "—";
    const seconds = Math.floor((Date.now() - Date.parse(value)) / 1000);
    if (!Number.isFinite(seconds)) return "—";
    if (seconds < 60) return tr("justNow");
    if (seconds < 3600) return relativeFormatter.format(-Math.floor(seconds / 60), "minute");
    if (seconds < 86400) return relativeFormatter.format(-Math.floor(seconds / 3600), "hour");
    if (seconds < 7 * 86400) return relativeFormatter.format(-Math.floor(seconds / 86400), "day");
    return formatShort(value);
  }
  function formatShort(value: string): string {
    return new Intl.DateTimeFormat(locales[language], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  /** 日志行的紧凑时刻：当天的只给 HH:mm:ss，跨天补 MM-dd，等宽列可纵向扫读。 */
  function formatLogTime(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const pad = (input: number) => String(input).padStart(2, "0");
    const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    return sameDay ? clock : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock}`;
  }
  function logMessage(message: string): string {
    return language === "zh" ? zhLogMessages[message] ?? message : message;
  }
  function logContextParts(context: Record<string, string | number | boolean>): string[] {
    const parts: string[] = [];
    for (const key of logContextOrder) {
      if (key in context) parts.push(`${tr(logContextLabels[key]!)} ${String(context[key])}`);
    }
    for (const [key, value] of Object.entries(context)) {
      if (!(logContextOrder as readonly string[]).includes(key) && key !== "entryId") parts.push(`${key}=${String(value)}`);
    }
    return parts;
  }
  /** 审计事件的细节一句话（details 在源头随事件写入，白名单字段、无敏感值）。 */
  function auditDetail(event: string, details: Record<string, string | number>): string {
    const parts: string[] = [];
    const labeled = (label: AdminTranslationKey, value: string | number) => parts.push(`${tr(label)} ${value}`);
    if (event === "CONNECTION_TEST_SUCCEEDED") {
      if (details.latencyMs != null) parts.push(`${tr("ctxLatencyMs")} ${details.latencyMs} ms`);
      if (details.protocol != null) labeled("ctxProtocol", details.protocol);
    } else if (event === "CONNECTION_TEST_FAILED") {
      if (details.code != null) parts.push(connectionFailureText(String(details.code)));
    } else if (event === "SETTINGS_CHANGED" || event === "ADMIN_INITIALIZED") {
      if (details.accessMode != null) parts.push(`${tr("ctxAccessMode")} ${details.accessMode === "fixed" ? tr("fixedMode") : tr("openMode")}`);
      if (details.target != null) labeled("ctxTarget", details.target);
    } else if (event === "ADMIN_SESSION_TERMINATED") {
      if (details.id != null) labeled("ctxSessionId", `#${details.id}`);
    } else if (event === "ADMIN_LOGIN_SUCCEEDED" || event === "ADMIN_LOGIN_FAILED") {
      if (details.clientIp != null) parts.push(`${tr("ctxClientIp")} ${details.clientIp}`);
    } else {
      for (const [key, value] of Object.entries(details)) parts.push(`${key}=${String(value)}`);
    }
    return parts.join(" · ");
  }
  return { tr, formatDate, formatUptime, formatAge, sessionStateLabel, connectionStatusLabel, eventName, errorText, connectionFailureText, formatRelative, formatLogTime, logMessage, logContextParts, auditDetail };
}

export type AdminMessages = ReturnType<typeof createAdminMessages>;
