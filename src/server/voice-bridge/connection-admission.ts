import { WebSocket } from "ws";
import type { BlockList } from "node:net";
import type { IncomingMessage } from "node:http";
import { identityFromString } from "@echosixhiya/teamspeak-client";
import { MAX_SESSIONS_PER_PEER } from "../../constants.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../../domain/teamspeak-target.js";
import type { Logger as LoggerType } from "../../logger.js";
import type { JoinTicketPayload } from "../join-ticket.js";
import { rateLimitPeerKey } from "../client-ip.js";
import type { SessionManager } from "../session-manager.js";
import type { SessionTeardownReason } from "../session-manager.js";
import type { IdentityLeaseStore } from "../identity-lease.js";
import type { VoiceBridgeOptions, WebClientEntry } from "./types.js";
import { resolveClientIp, resolveWebRtcPublicHost } from "./connection-request.js";

/** Per-connection admission result: either the socket was closed inside
 *  (no entry was registered) or the caller receives the pieces the join
 *  flow keeps using for the whole session lifetime. */
export type AdmissionOutcome =
  | {
    ok: true;
    session: NonNullable<ReturnType<SessionManager["admit"]>>;
    clientIp: string;
    webrtcPublicHost: string | undefined;
    identity: ReturnType<typeof identityFromString> | undefined;
    identityLeaseKey: string;
  }
  | { ok: false };

export interface AdmissionDeps {
  entries: Map<string, WebClientEntry>;
  logger: LoggerType;
  options: VoiceBridgeOptions;
  sessionManager: SessionManager;
  identityLeases: IdentityLeaseStore;
  /** Declared proxies; forwarding headers from anyone else are ignored. */
  trustedProxies: BlockList;
}

/** Strictly ordered admission for one accepted socket: identity parse,
 *  session admit, predecessor/same-identity eviction, identity lease. Every
 *  failure branch reports to the browser and closes the socket itself. */
export async function admitConnection(
  deps: AdmissionDeps,
  input: {
    ws: WebSocket;
    req: IncomingMessage;
    connection: JoinTicketPayload;
    entryId: string;
    /** Teardown hook installed before admit so the first code path that can
     *  kill the session already cleans up the entry being assembled. */
    onTeardown: (reason: SessionTeardownReason) => Promise<void>;
  },
): Promise<AdmissionOutcome> {
  const { ws, req, connection, entryId } = input;
  const { target, nickname } = connection;
  const channelName = connection.channel;
  const clientIp = resolveClientIp(req, deps.trustedProxies);
  const webrtcPublicHost = resolveWebRtcPublicHost(req, deps.trustedProxies);
  let identity;
  try {
    identity = connection.identity ? identityFromString(connection.identity) : undefined;
  } catch {
    // Send a structured failure before the close so the browser can tell
    // an invalid remembered identity apart from a real connection failure.
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "connectionFailed", code: "IDENTITY_INVALID", detail: "Invalid identity" }));
    ws.close(4003, "IDENTITY_INVALID");
    return { ok: false };
  }
  // S3（报告 21）：per-IP(/64) 并发会话上限，键与限流同源（client-ip 聚合）。
  const session = deps.sessionManager.admit(entryId, input.onTeardown, rateLimitPeerKey(clientIp));
  if (!session) {
    if (deps.sessionManager.rejectReason === "peer-limit") {
      deps.logger.warn({ clientIp, max: MAX_SESSIONS_PER_PEER }, "Per-peer session limit reached");
      ws.close(4006, "PEER_SESSION_LIMIT");
      return { ok: false };
    }
    deps.logger.warn({ max: deps.sessionManager.maxSessions }, "Max clients reached");
    ws.close(4004, "GATEWAY_FULL");
    return { ok: false };
  }

  const identityLeaseKey = identity
    ? `${teamSpeakTargetKey(target)}:${identity.toString()}`
    : "";
  // A reconnect successor takes over its predecessor's session: the old
  // socket may be a zombie for up to a heartbeat interval, and without
  // this eviction the rebuilt connection would trip the identity lease.
  const predecessorEntryId = typeof connection.reconnectOfEntryId === "string" ? connection.reconnectOfEntryId : "";
  if (predecessorEntryId) {
    const predecessor = deps.entries.get(predecessorEntryId);
    if (predecessor && predecessor.id !== entryId) {
      // A hung TeamSpeak disconnect must not stall admission forever: the
      // explicit lease release below is idempotent and unblocks the lease
      // even if the full teardown is still waiting on the SDK.
      await Promise.race([
        deps.sessionManager.teardown(predecessor.id, "superseded"),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ]);
      if (predecessor.identityLeaseKey) deps.identityLeases.release(predecessor.identityLeaseKey, predecessor.id);
    }
  }
  // 同身份跨目标切换（两个收藏指向同一 TS 服务器的不同域名/端口）：旧 entry
  // 的 TS 客户端仍持着同一身份登在服务器上，新登录会被服务器拒身份冲突；
  // 旧世界只逐出同目标的 reconnect 前任。这里按身份部分匹配逐出所有前任
  // （2026-10-18 用户拍板：切服跟随实际连接成败，不做前端身份拦截）。
  if (identity) {
    const identitySuffix = `:${identity.toString()}`;
    for (const other of deps.entries.values()) {
      if (other.id === entryId || other.identityLeaseKey === identityLeaseKey) continue;
      if (!other.identityLeaseKey || !other.identityLeaseKey.endsWith(identitySuffix)) continue;
      await Promise.race([
        deps.sessionManager.teardown(other.id, "superseded"),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ]);
      deps.identityLeases.release(other.identityLeaseKey, other.id);
    }
  }
  if (identityLeaseKey && !deps.identityLeases.acquire(identityLeaseKey, entryId)) {
    // 同目标租约仍被占（另一浏览器页面的真实并发）：逐出持约者后重试一次，
    // 仍失败才终止——切服跟随实际连接成败，不做前端身份拦截。
    const holder = [...deps.entries.values()].find(
      (candidate) => candidate.identityLeaseKey === identityLeaseKey && candidate.id !== entryId);
    if (holder) {
      await Promise.race([
        deps.sessionManager.teardown(holder.id, "superseded"),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ]);
      deps.identityLeases.release(identityLeaseKey, holder.id);
    }
    if (!deps.identityLeases.acquire(identityLeaseKey, entryId)) {
      deps.logger.warn({ entryId, nickname, target: formatTeamSpeakTarget(target) }, "TeamSpeak identity already in use");
      void deps.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
      ws.close(4005, "IDENTITY_IN_USE");
      return { ok: false };
    }
  }

  deps.logger.info({
    entryId,
    nickname,
    clientIp,
    channel: channelName,
    target: formatTeamSpeakTarget(target),
  }, "WebClient connecting");
  return { ok: true, session, clientIp, webrtcPublicHost, identity, identityLeaseKey };
}

/** Guard shared by the connect failure paths: wrong server passwords are the
 *  one credential a browser client may guess freely, so they are counted per
 *  target in the shared guard and the join endpoint refuses user-supplied
 *  passwords while it cools down. Callers pass the target key
 *  (teamSpeakTargetKey) the guard is keyed by. */
export function notePasswordFailure(
  options: VoiceBridgeOptions,
  targetKey: string,
  failureCode: string | undefined,
): void {
  if (failureCode !== "SERVER_PASSWORD_REQUIRED" && failureCode !== "INVALID_SERVER_PASSWORD") return;
  options.serverPasswordGuard?.recordFailure(targetKey);
}
