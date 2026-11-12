import type { BlockList } from "node:net";
import type { IncomingMessage } from "node:http";
import { normalizeTeamSpeakError } from "../../errors.js";
import type { Logger } from "../../logger.js";
import { isAllowedUpgradeOrigin } from "../../security/same-origin.js";
import type { ServerMessage } from "../../shared/server-messages.js";
import { isTrustedProxyPeer, resolveClientAddress } from "../client-ip.js";

export function publicFailureDetail(error: ReturnType<typeof normalizeTeamSpeakError>): string | undefined {
  const serverMessage = error.diagnostics.serverMessage?.trim();
  const serverId = error.diagnostics.id?.trim();
  const detail = [serverMessage, serverId ? `server error id=${serverId}` : ""].filter(Boolean).join("; ");
  const safe = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return safe || undefined;
}

export function resolveClientIp(request: IncomingMessage, trustedProxies: BlockList): string {
  return resolveClientAddress(
    request.socket.remoteAddress,
    request.headers["x-forwarded-for"],
    trustedProxies,
    request.headers["x-real-ip"],
  );
}

export function resolveWebRtcPublicHost(request: IncomingMessage, trustedProxies: BlockList): string | undefined {
  // S2（报告 21）：转发头只在声明了可信反代、且对端确实是该代理时采信；
  // 直连部署只看 Host。请求派生的值在 voice-rtc 里还只允许 IP 字面量
  // ——网关不替客户端触发 DNS 解析。
  const trustedPeer = isTrustedProxyPeer(request.socket.remoteAddress, trustedProxies);
  const candidates = trustedPeer
    ? [firstHeader(request.headers.origin), firstHeader(request.headers["x-forwarded-host"]), firstHeader(request.headers.host)]
    : [firstHeader(request.headers.host)];
  for (const candidate of candidates) {
    const host = normalizeWebRtcHost(candidate);
    if (host) return host;
  }
  return undefined;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeWebRtcHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.split(",", 1)[0]?.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return undefined;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname || undefined;
  } catch {
    return undefined;
  }
}

export function sendProtocolError(sendJson: (message: ServerMessage) => void, code: string, message: string, requestId?: string): void {
  sendJson({ type: "error", ...(requestId ? { requestId } : {}), error: { code, message, recoverable: false } });
}

/**
 * 浏览器的跨源 upgrade 直接拒绝（1008），且必须发生在消费 join
 * 票据之前——被拒的跨源尝试不该烧掉浏览器手里的票。缺 Origin 的是非浏览器
 * 客户端（冒烟/诊断脚本），仍由一次性票据兜底。返回 true 表示已拒绝。
 */
export function rejectCrossOriginUpgrade(
  ws: { close(code: number, reason: string): void },
  request: IncomingMessage,
  logger: Pick<Logger, "warn">,
): boolean {
  const origin = firstHeader(request.headers.origin);
  const host = firstHeader(request.headers.host);
  if (isAllowedUpgradeOrigin(origin, host)) return false;
  logger.warn({ origin, host }, "Rejected a cross-origin voice WebSocket upgrade");
  ws.close(1008, "ORIGIN_REJECTED");
  return true;
}
