import type { IncomingMessage } from "node:http";
import { normalizeTeamSpeakError } from "../../errors.js";
import type { ServerMessage } from "../../shared/server-messages.js";
import { resolveClientAddress } from "../client-ip.js";

export function publicFailureDetail(error: ReturnType<typeof normalizeTeamSpeakError>): string | undefined {
  const serverMessage = error.diagnostics.serverMessage?.trim();
  const serverId = error.diagnostics.id?.trim();
  const detail = [serverMessage, serverId ? `server error id=${serverId}` : ""].filter(Boolean).join("; ");
  const safe = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return safe || undefined;
}

export function resolveClientIp(request: IncomingMessage, trustProxy: boolean): string {
  const header = request.headers["x-forwarded-for"];
  return resolveClientAddress(
    request.socket.remoteAddress,
    Array.isArray(header) ? header[0] : header,
    trustProxy,
  );
}

export function resolveWebRtcPublicHost(request: IncomingMessage, trustProxy: boolean): string | undefined {
  // S2（报告 21）：转发头只在声明了可信反代时采信，与 client-ip.ts 的语义
  // 对齐；直连部署只看 Host。请求派生的值在 voice-rtc 里还只允许 IP 字面量
  // ——网关不替客户端触发 DNS 解析。
  const candidates = trustProxy
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
