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
  return { tr, formatDate, formatUptime, formatAge, sessionStateLabel, connectionStatusLabel, eventName, errorText, connectionFailureText };
}

export type AdminMessages = ReturnType<typeof createAdminMessages>;
