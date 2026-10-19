import { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { TSClient } from "../ts-client.js";
import type { Logger as LoggerType } from "../../logger.js";
import { clientConnectionFailureCode, describeTeamSpeakError, normalizeTeamSpeakError } from "../../errors.js";
import type { ServerMessage } from "../../shared/server-messages.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../../domain/teamspeak-target.js";
import type { JoinTicketPayload } from "../join-ticket.js";
import { SessionEventCoordinator } from "../session-events.js";
import type { SessionTeardownReason } from "../session-manager.js";
import { isRecoverable, reconnectDelayMs, reconnectWindowOpen } from "../reconnect-policy.js";
import type { WebRtcAudioOptions, WebRtcSessionDescription } from "../webrtc-audio.js";
import type { ScreenShareIceServer } from "../screen-share.js";
import { createAudioFlowStats } from "../audio-stats.js";
import { SessionAudioTransport } from "../session-audio.js";
import { createVoiceEncoder, OpusEncoder } from "../opus-codec.js";
import { CommandRateLimiter } from "../command-rate-limit.js";
import type { ScreenShareCoordinator } from "../screen-share-coordinator.js";
import type { SessionManager } from "../session-manager.js";
import type { IdentityLeaseStore } from "../identity-lease.js";
import type { AvatarService } from "../avatar-service.js";
import type { DetachedSessionPool } from "./detached-pool.js";
import type { ServerEvent, VoiceBridgeDependencies, VoiceBridgeOptions, WebClientEntry } from "./types.js";
import { admitConnection, notePasswordFailure } from "./connection-admission.js";
import { publicFailureDetail } from "./connection-request.js";
import { createConnectionFailureReporter } from "./connection-failure.js";
import { bindSocketHandlers } from "./connection-socket.js";
import { connectWithDialTimeout } from "./connection-dial.js";

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
    const entryId = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let entry: WebClientEntry | null = null;
    const admission = await admitConnection(deps, {
      ws,
      req,
      connection,
      entryId,
      onTeardown: async (reason) => {
        if (entry) await deps.cleanupEntry(entry, reason);
      },
    });
    if (!admission.ok) return;
    const { session, clientIp, webrtcPublicHost, identity, identityLeaseKey } = admission;
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
    }, deps.dependencies.createEncoder?.() ?? createVoiceEncoder(), undefined, new OpusEncoder(48_000, 1));
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
    // `connected` is only published once the directory sync has landed (see
    // sendInitialState), so the session is already past authentication while
    // hasConnectedOnce is still false. A transport drop inside that gap must
    // be handled rather than swallowed.
    const isSettling = () => session.state === "authenticating" || session.state === "syncing";
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
      if (wasReconnecting) sendJson({ type: "reconnected" });
      events.attachAvatars();
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
      attachSocketHandlers(next);
      try {
        entry!.audioTransport = createAudioTransport(next);
      } catch (error: unknown) {
        deps.logger.error({ err: error, entryId }, "Could not recreate Opus encoder for the resumed socket");
        void deps.teardown(entryId, "protocol-error");
        return false;
      }
      sendJson(connectedMessage());
      sendJson({ type: "channelList", channels: entry!.channelTree });
      events.attachAvatars();
      return true;
    };

    const resetDirectoryForReconnect = () => {
      tsReady = false;
      events.reset();
      void deps.stopWebRtc(entry!);
      initialStateSent = false;
    };

    const { failConnect, failReconnect } = createConnectionFailureReporter({
      entryId, entry: entry!, session, options: deps.options, targetKey: teamSpeakTargetKey(entry!.target),
      serverPassword, sendJson, ws, teardown: deps.teardown,
    });

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

    const connectTeamSpeak = async (isReconnect: boolean): Promise<void> => {
      try {
        await connectWithDialTimeout(tsClient);
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
        entry!.connectionFailureCode = failureCode;
        notePasswordFailure(deps.options, teamSpeakTargetKey(entry!.target), failureCode);
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
          failConnect(normalized);
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
        // A kick that lands before the session ever settled in (during the
        // first connect or a reconnect handshake) is terminal too: ignoring it
        // would leave the client on the connecting screen while the gateway
        // kept the dead session alive.
        if (!hasConnectedOnce && !isSettling()) return;
        resetDirectoryForReconnect();
        const failureCode = clientConnectionFailureCode(kick, serverPassword);
        const failureDetail = publicFailureDetail(kick);
        entry!.connectionFailureCode = failureCode;
        notePasswordFailure(deps.options, teamSpeakTargetKey(entry!.target), failureCode);
        deps.logger.warn({ entryId, code: failureCode, normalizedCode: kick.code, failureDetail: describeTeamSpeakError(kick) }, "TeamSpeak session ended by kick/ban");
        sendJson({ type: "connectionFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
        void deps.teardown(entryId, "teamSpeak-kicked");
      },
      onDisconnect: error => {
        const normalized = error ? normalizeTeamSpeakError(error) : null;
        if (isSettling()) {
          // `connected` was never published, so there is no live session to
          // interrupt -- but staying in `syncing` would leave the client on the
          // connecting screen with no recovery scheduled.
          if (!hasConnectedOnce) {
            deps.logger.warn({
              entryId,
              normalizedCode: normalized?.code,
              ...(normalized ? { failureDetail: describeTeamSpeakError(normalized) } : {}),
            }, "TeamSpeak connection lost before the session became usable");
            failConnect(normalized ?? normalizeTeamSpeakError(new Error("TeamSpeak connection lost during startup")));
            return;
          }
          // A reconnect attempt dropped mid-handshake. Detach the dead
          // transport and fall back into the recovery loop rather than
          // stalling in `syncing`.
          resetDirectoryForReconnect();
          try {
            session.transition("reconnecting");
          } catch {
            failReconnect(normalized ?? normalizeTeamSpeakError(new Error("TeamSpeak connection lost during reconnect")));
            return;
          }
          scheduleReconnect(normalized);
          return;
        }
        if (!hasConnectedOnce || session.state !== "connected") return;
        deps.screenShares.removePeer(entryId);
        resetDirectoryForReconnect();
        sendJson({ type: "disconnected", recoverable: isRecoverable(normalized) });
        scheduleReconnect(normalized);
      },
    });
    entry.events = events;

    /** Register the browser-socket handlers for the initial join and again
     *  for every adopted resume socket; the router only touches entry-level
     *  state via the context getters, never socket-level state. */
    const attachSocketHandlers = (socket: WebSocket): void => {
      bindSocketHandlers({
        deps,
        entryId,
        getEntry: () => entry,
        isSessionReady: () => tsReady && session.state === "connected",
        sendJson,
      }, socket);
    };
    attachSocketHandlers(ws);

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
