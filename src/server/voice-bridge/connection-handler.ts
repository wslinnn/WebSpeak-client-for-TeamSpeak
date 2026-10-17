import { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { identityFromString } from "@echosixhiya/teamspeak-client";
import { MAX_SESSIONS_PER_PEER } from "../../constants.js";
import { TSClient } from "../ts-client.js";
import type { Logger as LoggerType } from "../../logger.js";
import { clientConnectionFailureCode, describeTeamSpeakError, normalizeTeamSpeakError } from "../../errors.js";
import type { ServerMessage } from "../../shared/server-messages.js";
import { parseWebRtcClientMessage } from "../../shared/webrtc.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../../domain/teamspeak-target.js";
import type { JoinTicketPayload } from "../join-ticket.js";
import { SessionEventCoordinator } from "../session-events.js";
import type { SessionTeardownReason } from "../session-manager.js";
import { parseClientCommand } from "../voice-protocol.js";
import { isRecoverable, reconnectDelayMs, reconnectWindowOpen } from "../reconnect-policy.js";
import { parseServerInfoRow } from "./server-info.js";
import type { WebRtcAudioOptions, WebRtcSessionDescription } from "../webrtc-audio.js";
import { parseScreenShareMessage, type ScreenShareIceServer } from "../screen-share.js";
import { handleCommand } from "../voice-commands.js";
import { createAudioFlowStats } from "../audio-stats.js";
import { SessionAudioTransport } from "../session-audio.js";
import { createVoiceEncoder } from "../opus-codec.js";
import { CommandRateLimiter, shouldReportRateLimit } from "../command-rate-limit.js";
import { resolveClientAddress, rateLimitPeerKey } from "../client-ip.js";
import type { ScreenShareCoordinator } from "../screen-share-coordinator.js";
import type { SessionManager } from "../session-manager.js";
import type { IdentityLeaseStore } from "../identity-lease.js";
import type { AvatarService } from "../avatar-service.js";
import type { DetachedSessionPool } from "./detached-pool.js";
import type { ServerEvent, VoiceBridgeDependencies, VoiceBridgeOptions, WebClientEntry } from "./types.js";

/** 首连与重连共用的拨号上限：黑洞主机不再拖满系统级 TCP 超时（20s+），
 *  失败在 8 秒内浮出，重试节奏（1/2/4s 三轮）才有意义。 */
const CONNECT_TIMEOUT_MS = 8_000;

export interface VoiceConnectionHandlerDeps {
  entries: Map<string, WebClientEntry>;
  logger: LoggerType;
  /** Passed through as a whole: expanding it into individual fields would
   *  break the "options are immutable per bridge" contract. */
  options: VoiceBridgeOptions;
  dependencies: VoiceBridgeDependencies;
  sessionManager: SessionManager;
  identityLeases: IdentityLeaseStore;
  avatars: AvatarService;
  screenShares: ScreenShareCoordinator;
  detachedPool: DetachedSessionPool;
  resolveConnection: (url: URL) => JoinTicketPayload | null;
  cleanupEntry: (entry: WebClientEntry, reason: SessionTeardownReason) => Promise<void>;
  teardown: (entryId: string, reason: SessionTeardownReason) => Promise<void>;
  getWebRtcOptions: () => WebRtcAudioOptions | undefined;
  getScreenShareIceServers: () => ScreenShareIceServer[];
  stopWebRtc: (entry: WebClientEntry) => Promise<void>;
  handleWebRtcOffer: (entry: WebClientEntry, offer: WebRtcSessionDescription, sendJson: (message: ServerMessage) => void) => Promise<void>;
}

function publicFailureDetail(error: ReturnType<typeof normalizeTeamSpeakError>): string | undefined {
  const serverMessage = error.diagnostics.serverMessage?.trim();
  const serverId = error.diagnostics.id?.trim();
  const detail = [serverMessage, serverId ? `server error id=${serverId}` : ""].filter(Boolean).join("; ");
  const safe = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return safe || undefined;
}

function resolveClientIp(request: IncomingMessage, trustProxy: boolean): string {
  const header = request.headers["x-forwarded-for"];
  return resolveClientAddress(
    request.socket.remoteAddress,
    Array.isArray(header) ? header[0] : header,
    trustProxy,
  );
}

function resolveWebRtcPublicHost(request: IncomingMessage, trustProxy: boolean): string | undefined {
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

function sendProtocolError(sendJson: (message: ServerMessage) => void, code: string, message: string, requestId?: string): void {
  sendJson({ type: "error", ...(requestId ? { requestId } : {}), error: { code, message, recoverable: false } });
}

/** Builds the per-socket connection listener. The factory runs once per
 *  bridge; the returned closure runs once per connection and owns the whole
 *  join/resume/reconnect lifecycle through its own per-connection state. */
export function createVoiceConnectionHandler(deps: VoiceConnectionHandlerDeps): (ws: WebSocket, req: IncomingMessage) => Promise<void> {
  return async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
    const connection = deps.resolveConnection(url);
    if (!connection) {
      ws.close(4001, "Join ticket required");
      return;
    }

    // A resume ticket whose predecessor still sits in the detached pool
    // adopts the kept TeamSpeak session instead of building a new one: the
    // browser view reattaches and TeamSpeak never sees a reconnect.
    const resumeEntryId = typeof connection.resumeOfEntryId === "string" ? connection.resumeOfEntryId : "";
    const resumeTarget = resumeEntryId ? deps.entries.get(resumeEntryId) : undefined;
    if (resumeTarget?.detached === true && typeof resumeTarget.attachSocket === "function") {
      if (resumeTarget.attachSocket(ws)) {
        deps.logger.info({ entryId: resumeEntryId, nickname: resumeTarget.nickname, target: formatTeamSpeakTarget(resumeTarget.target) }, "Voice session resumed onto kept TeamSpeak connection");
        return;
      }
      // L5（报告 21）：票在铸造时判过 isDetachedResumable，但 attach 时刻可能
      // 已被宽限 sweep 或 TS 会话在挂起期掉线——判据与执行之间是毫秒级窗口。
      // 票自带完整 join 载荷，回落为本连接上的常规重建（先按 superseded 拆掉
      // 残留条目、释放身份租约），而不是丢票把用户赶回表单。
      deps.logger.warn({ entryId: resumeEntryId }, "Resume target no longer attachable; rebuilding the session on this connection");
      await Promise.race([
        deps.sessionManager.teardown(resumeEntryId, "superseded"),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ]);
    }

    const { target, serverPassword, nickname } = connection;
    const channelName = connection.channel;
    const clientIp = resolveClientIp(req, deps.options.trustProxy === true);
    const webrtcPublicHost = resolveWebRtcPublicHost(req, deps.options.trustProxy === true);
    let identity;
    try {
      identity = connection.identity ? identityFromString(connection.identity) : undefined;
    } catch {
      // Send a structured failure before the close so the browser can tell
      // an invalid remembered identity apart from a real connection failure.
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "connectionFailed", code: "IDENTITY_INVALID", detail: "Invalid identity" }));
      ws.close(4003, "IDENTITY_INVALID");
      return;
    }
    const entryId = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let entry: WebClientEntry | null = null;
    // S3（报告 21）：per-IP(/64) 并发会话上限，键与限流同源（client-ip 聚合）。
    const session = deps.sessionManager.admit(entryId, async (reason) => {
      if (entry) await deps.cleanupEntry(entry, reason);
    }, rateLimitPeerKey(clientIp));
    if (!session) {
      if (deps.sessionManager.rejectReason === "peer-limit") {
        deps.logger.warn({ clientIp, max: MAX_SESSIONS_PER_PEER }, "Per-peer session limit reached");
        ws.close(4006, "PEER_SESSION_LIMIT");
        return;
      }
      deps.logger.warn({ max: deps.sessionManager.maxSessions }, "Max clients reached");
      ws.close(4004, "GATEWAY_FULL");
      return;
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
    if (identityLeaseKey && !deps.identityLeases.acquire(identityLeaseKey, entryId)) {
      deps.logger.warn({ entryId, nickname, target: formatTeamSpeakTarget(target) }, "TeamSpeak identity already in use");
      void deps.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
      ws.close(4005, "IDENTITY_IN_USE");
      return;
    }

    deps.logger.info({
      entryId,
      nickname,
      clientIp,
      channel: channelName,
      target: formatTeamSpeakTarget(target),
    }, "WebClient connecting");
    let tsClient: TSClient;
    try {
      const createClient = deps.dependencies.createTeamSpeakClient ?? ((options, logger) => new TSClient(options, logger));
      tsClient = createClient({ target, nickname, serverPassword, defaultChannel: channelName, identity }, deps.logger);
    } catch (error: unknown) {
      if (identityLeaseKey) deps.identityLeases.release(identityLeaseKey, entryId);
      deps.logger.error({ err: error, entryId }, "Could not create TeamSpeak client");
      void deps.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
      // A 4003 with a bare close used to be reported as "identity rejected".
      // Send a structured failure so the browser says the TeamSpeak client
      // could not be created (server down / unreachable) instead.
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "connectionFailed", code: "TEAM_SPEAK_CLIENT_UNAVAILABLE", detail: "TeamSpeak client unavailable" }));
      ws.close(4003, "TEAM_SPEAK_CLIENT_UNAVAILABLE");
      return;
    }
    // One reconnect ticket per accepted socket: the browser holds it for a
    // page reload or a transport drop, and the `connected` message delivers
    // it. Single consumption plus the TTL bound replay.
    const reconnectTicketToken = deps.options.reconnectTickets?.issue(connection, entryId);
    entry = {
      id: entryId,
      session,
      tsClient,
      ws,
      nickname,
      rememberIdentity: connection.rememberIdentity === true,
      clientIp,
      target,
      ...(identityLeaseKey ? { identityLeaseKey } : {}),
      ...(webrtcPublicHost ? { webrtcPublicHost } : {}),
      ...(reconnectTicketToken ? { reconnectTicketToken } : {}),
      channelTree: [],
      members: new Map(),
      events: null,
      eventLog: [],
      audioTransport: null,
      whisperTargetIds: new Set(),
      whisperActive: false,
      isAlive: true,
      reconnectTimer: null,
      audio: createAudioFlowStats(),
      webrtc: null,
      webrtcGeneration: 0,
      lastLatencyProbeAt: 0,
      lastAudioStatsProbeAt: 0,
      commandLimiter: new CommandRateLimiter(),
      lastRateLimitNoticeAt: 0,
      connectedOnce: false,
      webrtcEverUsed: false,
      screenPeerId: entryId,
    };
    deps.entries.set(entryId, entry!);
    let tsReady = false;
    // The live join payload for this session: the reconnect store keeps it
    // channel-synced, and a resume re-issue must carry those updates too.
    let currentConnection = connection;
    // All browser-bound messages flow through the entry's CURRENT socket, so
    // an adopted resume socket transparently takes over every producer
    // (TeamSpeak events, reconnect notices, avatars) of the old closure.
    const sendJson = (message: ServerMessage) => {
      // Keep the reconnect payload's channel in sync with mid-session
      // switches so a rebuilt session rejoins where the user actually was.
      if (message.type === "channelSwitched" && entry?.reconnectTicketToken) {
        const channelName = entry.channelTree.find(item => item.id === String(message.channelId))?.name;
        if (channelName) {
          deps.options.reconnectTickets?.updateChannel(entryId, channelName);
          currentConnection = { ...currentConnection, channel: channelName };
        }
      }
      const socket = entry?.ws;
      if (deps.entries.get(entryId) === entry && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    const createAudioTransport = (socket: WebSocket): SessionAudioTransport => new SessionAudioTransport({
      audio: entry!.audio, socket, client: tsClient,
      isCurrent: () => deps.entries.get(entryId) === entry,
      isReady: () => tsReady && session.state === "connected",
      selfId: () => entry!.events?.selfId ?? 0,
      peer: () => entry!.webrtc,
      whisperTargets: () => entry!.whisperActive ? [...entry!.whisperTargetIds] : null,
      sendJson: message => sendJson(message),
    }, deps.dependencies.createEncoder?.() ?? createVoiceEncoder());
    try {
      entry.audioTransport = createAudioTransport(ws);
    } catch (error: unknown) {
      deps.logger.error({ err: error, entryId }, "Could not create Opus encoder");
      void deps.teardown(entryId, "teamSpeak-connect-failed");
      return;
    }

    let initialStateSent = false;
    let hasConnectedOnce = false;
    let reconnectStartedAt = 0;
    let reconnectAttempt = 0;
    const addServerEvent = (kind: ServerEvent["kind"], message: string) => {
      const event: ServerEvent = {
        id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        message,
        timestamp: Date.now(),
      };
      entry!.eventLog.push(event);
      if (entry!.eventLog.length > 200) entry!.eventLog.splice(0, entry!.eventLog.length - 200);
      if (initialStateSent) sendJson({ type: "serverEvent", event });
    };
    const sendInitialState = () => {
      if (initialStateSent || !tsReady || !events.ready || session.state !== "syncing") return;
      initialStateSent = true;
      entry!.connectedOnce = true;
      const wasReconnecting = hasConnectedOnce;
      hasConnectedOnce = true;
      reconnectAttempt = 0;
      reconnectStartedAt = 0;
      if (!wasReconnecting) {
        entry!.eventLog.push({ id: `event-${Date.now().toString(36)}-connected`, kind: "connection", message: "已连接到服务器", timestamp: Date.now() });
        deps.logger.info({
          entryId: entry!.id,
          nickname: entry!.nickname,
          clientIp: entry!.clientIp,
          target: formatTeamSpeakTarget(entry!.target),
        }, "Web client connected to TeamSpeak");
      }
      session.transition("connected");
      sendJson(connectedMessage());
      sendJson({ type: "channelList", channels: entry!.channelTree });
      void sendServerInfo();
      if (wasReconnecting) sendJson({ type: "reconnected" });
      events.attachAvatars();
    };

    /** The browser welcome card's data: fetched once per TeamSpeak connection
     *  (the entry caches it) and replayed instantly on resume reattach. A
     *  server that restricts `serverinfo` simply leaves the card absent. */
    const sendServerInfo = async (): Promise<void> => {
      if (entry!.serverInfo) {
        sendJson({ type: "serverInfo", ...entry!.serverInfo });
        return;
      }
      try {
        const rows = await tsClient.execCommandWithResponse("serverinfo", 3000);
        const info = parseServerInfoRow(rows[0]);
        if (info && initialStateSent) {
          entry!.serverInfo = info;
          sendJson({ type: "serverInfo", ...info });
        }
      } catch (error: unknown) {
        // 缺 serverinfo 只影响欢迎卡与服务器名展示，但失败必须留痕：静默
        // 会让「header 裸奔成裸地址」被误判成权限问题而查错方向。
        deps.logger.warn({
          entryId,
          err: error instanceof Error ? error.message : String(error),
        }, "TeamSpeak serverinfo lookup failed");
      }
    };

    /** The `connected` snapshot: used for the first join and identically for
     *  every resume reattach, where it carries a freshly re-issued token. */
    const connectedMessage = (): ServerMessage => ({
      type: "connected",
      tsClientId: events.selfId,
      members: Array.from(entry!.members.values()),
      serverEventLog: entry!.eventLog,
      whisperTargetIds: [...entry!.whisperTargetIds],
      whisperActive: entry!.whisperActive,
      webrtcAvailable: deps.getWebRtcOptions()?.enabled === true,
      webRtcStunServer: deps.getWebRtcOptions()?.stunServer ?? "",
      screenShareIceServers: deps.getScreenShareIceServers(),
      ...(entry!.reconnectTicketToken ? { reconnectTicket: entry!.reconnectTicketToken } : {}),
      ...(entry!.rememberIdentity ? { identity: tsClient.getIdentityString() } : {}),
    });

    /** Reattach a resume socket to this kept session: swap the entry's
     *  socket, re-register the handlers, recreate the audio transport and
     *  resend the full state. TeamSpeak never learns the view went away. */
    entry!.attachSocket = (next: WebSocket): boolean => {
      if (deps.entries.get(entryId) !== entry || !entry!.detached) return false;
      if (!tsReady || !initialStateSent || session.state !== "connected") return false;
      entry!.ws = next;
      entry!.detached = false;
      entry!.detachedAt = undefined;
      // The stale liveness flag belongs to the dead socket: a drop before the
      // last pong (RST, silent proxy drop) would otherwise make the next tick
      // terminate this fresh socket, which never received a ping to answer.
      entry!.isAlive = true;
      entry!.reconnectTicketToken = deps.options.reconnectTickets?.issue(currentConnection, entryId);
      bindSocketHandlers(next);
      try {
        entry!.audioTransport = createAudioTransport(next);
      } catch (error: unknown) {
        deps.logger.error({ err: error, entryId }, "Could not recreate Opus encoder for the resumed socket");
        void deps.teardown(entryId, "protocol-error");
        return false;
      }
      sendJson(connectedMessage());
      sendJson({ type: "channelList", channels: entry!.channelTree });
      void sendServerInfo();
      events.attachAvatars();
      return true;
    };

    const resetDirectoryForReconnect = () => {
      tsReady = false;
      events.reset();
      void deps.stopWebRtc(entry!);
      initialStateSent = false;
    };

    // Wrong server passwords are the one credential a browser client may
    // guess freely, so they are counted per target in the shared guard and
    // the join endpoint refuses user-supplied passwords while it cools down.
    const notePasswordFailure = (failureCode: string | undefined) => {
      if (failureCode !== "SERVER_PASSWORD_REQUIRED" && failureCode !== "INVALID_SERVER_PASSWORD") return;
      deps.options.serverPasswordGuard?.recordFailure(teamSpeakTargetKey(entry!.target));
    };

    const failReconnect = (normalized: ReturnType<typeof normalizeTeamSpeakError>) => {
      if (entry!.reconnectTimer) {
        clearTimeout(entry!.reconnectTimer);
        entry!.reconnectTimer = null;
      }
      try {
        if (session.state !== "disconnecting" && session.state !== "idle") session.transition("failed");
      } catch { /* teardown below remains authoritative */ }
      const failureCode = clientConnectionFailureCode(normalized, serverPassword);
      const failureDetail = publicFailureDetail(normalized);
      entry!.connectionFailureCode = failureCode;
      notePasswordFailure(failureCode);
      sendJson({ type: "reconnectFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
      void deps.teardown(entryId, "teamSpeak-connect-failed");
    };

    const scheduleReconnect = (normalized: ReturnType<typeof normalizeTeamSpeakError> | null) => {
      if (session.state === "disconnecting" || session.state === "idle" || session.state === "failed") return;
      if (!isRecoverable(normalized)) {
        failReconnect(normalized ?? normalizeTeamSpeakError(new Error("TeamSpeak connection failed")));
        return;
      }
      const now = Date.now();
      if (!reconnectStartedAt) reconnectStartedAt = now;
      reconnectAttempt += 1;
      if (!reconnectWindowOpen(reconnectStartedAt, now)) {
        failReconnect(normalized ?? normalizeTeamSpeakError(new Error("Reconnect window expired")));
        return;
      }
      if (session.state === "connected") session.transition("interrupted");
      if (session.state === "interrupted") session.transition("reconnecting");
      if (entry!.reconnectTimer) return;
      const delayMs = reconnectDelayMs(reconnectAttempt);
      sendJson({ type: "reconnecting", attempt: reconnectAttempt, delayMs });
      entry!.reconnectTimer = setTimeout(() => {
        entry!.reconnectTimer = null;
        if (session.state !== "reconnecting") return;
        try {
          session.transition("connecting");
          session.transition("authenticating");
        } catch {
          failReconnect(normalizeTeamSpeakError(new Error("Reconnect state initialization failed")));
          return;
        }
        void connectTeamSpeak(true);
      }, delayMs);
      entry!.reconnectTimer.unref?.();
    };

    /** 拨号包裹超时：超时分支里 SDK 的拨号仍在后台挂着，显式断开它，
     *  避免下一次尝试叠在幽灵连接上。 */
    const connectWithTimeout = async (): Promise<void> => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;
      try {
        await Promise.race([
          tsClient.connect(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(new Error(`TeamSpeak connect did not complete within ${CONNECT_TIMEOUT_MS / 1000}s`));
            }, CONNECT_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        if (timedOut) void tsClient.disconnect().catch(() => undefined);
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const connectTeamSpeak = async (isReconnect: boolean): Promise<void> => {
      try {
        await connectWithTimeout();
        if (session.state !== "authenticating") return;
        session.transition("syncing");
        tsReady = true;
        deps.options.serverPasswordGuard?.recordSuccess(teamSpeakTargetKey(entry!.target));
        events.syncSelf();
        sendInitialState();
        void deps.screenShares.discoverExistingStreams(entry!).catch((error: unknown) => {
          deps.logger.debug({ entryId, err: error instanceof Error ? error.message : String(error) }, "Could not discover existing TeamSpeak screen streams");
        });
      } catch (error: unknown) {
        const normalized = normalizeTeamSpeakError(error);
        const failureCode = clientConnectionFailureCode(normalized, serverPassword);
        const failureDetail = publicFailureDetail(normalized);
        entry!.connectionFailureCode = failureCode;
        notePasswordFailure(failureCode);
        deps.logger.warn({
          code: failureCode,
          normalizedCode: normalized.code,
          failureDetail: describeTeamSpeakError(normalized),
          ...(Object.keys(normalized.diagnostics).length ? { failureDiagnostics: normalized.diagnostics } : {}),
          entryId,
          reconnect: isReconnect,
          attempt: reconnectAttempt,
        }, "TS connect failed");
        if (!isReconnect) {
          try {
            if (session.state !== "disconnecting" && session.state !== "idle") session.transition("failed");
          } catch { /* teardown below remains authoritative */ }
          // Send the structured failure before closing. Some browsers and
          // reverse proxies do not preserve a WebSocket close reason, which
          // would otherwise collapse every failure into a generic message.
          sendJson({ type: "connectionFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
          if (ws.readyState === WebSocket.OPEN) ws.close(4003, failureCode);
          void deps.teardown(entryId, "teamSpeak-connect-failed");
          return;
        }
        if (isReconnect && isRecoverable(normalized)) {
          try {
            if (session.state !== "disconnecting" && session.state !== "idle") session.transition("reconnecting");
          } catch { /* teardown below remains authoritative */ }
          scheduleReconnect(normalized);
          return;
        }
        failReconnect(normalized);
      }
    };

    const events = new SessionEventCoordinator({
      state: entry, client: tsClient, nickname, requestedChannel: channelName,
      avatars: deps.avatars,
      isCurrent: () => deps.entries.get(entryId) === entry && session.state !== "disconnecting" && session.state !== "idle" && session.state !== "failed",
      acceptsDirectory: () => session.state === "authenticating" || session.state === "syncing" || session.state === "connected",
      isPublished: () => tsReady && initialStateSent,
      isConnected: () => tsReady && session.state === "connected",
      sendJson, addEvent: addServerEvent, onDirectoryReady: sendInitialState,
      onClientLeave: id => {
        deps.screenShares.onClientLeave(entry!, id);
      },
      onClientMove: (id, channelId) => deps.screenShares.onClientMove(entry!, id, channelId),
      onNotification: notification => deps.screenShares.handleNotification(entry!, notification),
      onVoice: data => entry!.audioTransport?.receiveTeamSpeak(data),
      onAvatarError: (clientId, uid, error) => deps.logger.debug({
        entryId, clientId, uid, err: error instanceof Error ? error.message : String(error),
      }, "TeamSpeak client avatar unavailable"),
      onKick: kick => {
        // A transport drop may arrive first and already start recovery. A
        // subsequent kick is still terminal and must cancel that recovery.
        if (!hasConnectedOnce) return;
        resetDirectoryForReconnect();
        const failureCode = clientConnectionFailureCode(kick, serverPassword);
        const failureDetail = publicFailureDetail(kick);
        entry!.connectionFailureCode = failureCode;
        notePasswordFailure(failureCode);
        deps.logger.warn({ entryId, code: failureCode, normalizedCode: kick.code, failureDetail: describeTeamSpeakError(kick) }, "TeamSpeak session ended by kick/ban");
        sendJson({ type: "connectionFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
        void deps.teardown(entryId, "teamSpeak-kicked");
      },
      onDisconnect: error => {
        if (!hasConnectedOnce || session.state !== "connected") return;
        deps.screenShares.removePeer(entryId);
        resetDirectoryForReconnect();
        const normalized = error ? normalizeTeamSpeakError(error) : null;
        sendJson({ type: "disconnected", recoverable: isRecoverable(normalized) });
        scheduleReconnect(normalized);
      },
    });
    entry.events = events;

    /** Register the browser-socket handlers. Runs for the initial join and
     *  again for every adopted resume socket; all state it touches is
     *  entry-level or closure-level, never socket-level. */
    const bindSocketHandlers = (socket: WebSocket): void => {
      socket.on("pong", () => { if (entry) entry.isAlive = true; });
      socket.on("message", (data: Buffer | string, isBinary: boolean) => {
        if (deps.entries.get(entryId) !== entry) return;
        if (isBinary) {
          entry!.audioTransport?.receivePcm(typeof data === "string" ? Buffer.from(data) : data);
          return;
        }
        // Control messages (probes, chat, screen share, renegotiations) all end
        // in gateway or TeamSpeak work; the TS server's flood protection bans
        // the gateway identity shared by every session, so one abusive client
        // must not be able to trigger it for everyone.
        if (!entry!.commandLimiter.tryRemoveToken()) {
          const now = Date.now();
          if (shouldReportRateLimit(entry!.lastRateLimitNoticeAt, now)) {
            entry!.lastRateLimitNoticeAt = now;
            sendProtocolError(sendJson, "RATE_LIMITED", "操作过于频繁，请稍后重试");
          }
          return;
        }

        const rawMessage = typeof data === "string" ? data : data.toString("utf-8");
        const webRtcMessage = parseWebRtcClientMessage(rawMessage);
        if (webRtcMessage?.type === "webrtcOffer") {
          if (deps.getWebRtcOptions()?.enabled !== true) {
            sendProtocolError(sendJson, "WEBRTC_DISABLED", "WebRTC 音频传输未启用");
            return;
          }
          if (!tsReady || session.state !== "connected") {
            sendProtocolError(sendJson, "SESSION_NOT_READY", "TeamSpeak 会话尚未就绪");
            return;
          }
          const { sdp, muted, accompanimentActive } = webRtcMessage.payload;
          void deps.handleWebRtcOffer(entry!, { ...sdp, muted, accompanimentActive }, sendJson);
          return;
        }
        if (webRtcMessage?.type === "webrtcStop") {
          void deps.stopWebRtc(entry!);
          return;
        }
        const screenShareMessage = parseScreenShareMessage(rawMessage);
        if (screenShareMessage) {
          if ("error" in screenShareMessage) {
            sendProtocolError(sendJson, screenShareMessage.error.code, screenShareMessage.error.message);
            return;
          }
          if (!tsReady || session.state !== "connected") {
            sendProtocolError(sendJson, "SESSION_NOT_READY", "TeamSpeak 会话尚未就绪");
            return;
          }
          deps.screenShares.handleMessage(entry!, screenShareMessage, sendJson);
          return;
        }
        const command = parseClientCommand(rawMessage);
        if ("error" in command) {
          sendProtocolError(sendJson, command.error.code, command.error.message);
          return;
        }
        if (!tsReady || session.state !== "connected") {
          sendProtocolError(sendJson, "SESSION_NOT_READY", "TeamSpeak 会话尚未就绪", command.requestId);
          return;
        }
        void handleCommand(entry!, command, sendJson);
      });
      socket.on("close", (code) => {
        deps.logger.info({ entryId, code, detached: entry?.detached === true }, "WebSocket closed");
        // 1000 is a deliberate leave (user disconnect or server-initiated
        // teardown): release everything. Any other close — reload, network
        // loss, proxy drop — keeps the TeamSpeak session for the resume
        // window when the session holds a reconnect ticket at all.
        if (code === 1000 || !deps.detachedPool.canDetach(entry)) {
          void deps.teardown(entryId, "websocket-close");
          return;
        }
        deps.detachedPool.detach(entry!);
      });
      // The close event decides detach vs teardown; an error alone (usually
      // followed by an abnormal close) must not pre-empt that decision.
      socket.on("error", (error) => {
        deps.logger.warn({ entryId, err: error instanceof Error ? error.message : String(error) }, "WebSocket error");
      });
    };
    bindSocketHandlers(ws);

    try {
      session.transition("connecting");
      session.transition("authenticating");
    } catch (error: unknown) {
      deps.logger.error({ err: error instanceof Error ? error.message : String(error), entryId }, "Session state initialization failed");
      void deps.teardown(entryId, "protocol-error");
      return;
    }

    void connectTeamSpeak(false);
  };
}
