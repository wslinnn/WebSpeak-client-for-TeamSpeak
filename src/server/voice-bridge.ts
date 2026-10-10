import { SessionAudioTransport, type VoiceEncoder } from "./session-audio.js";
import { SessionEventCoordinator, type SessionDirectoryState } from "./session-events.js";
import { ScreenShareCoordinator } from "./screen-share-coordinator.js";
import { handleCommand } from "./voice-commands.js";
import { createAudioFlowStats, snapshotAudioStats, type AudioFlowStats } from "./audio-stats.js";
export type { AudioFlowStats } from "./audio-stats.js";
import type { ServerMessage } from "../shared/server-messages.js";
import { parseWebRtcClientMessage } from "../shared/webrtc.js";
import { resolveVoiceMediaAddresses } from "./webrtc-config.js";
import type { ServerEvent as SharedServerEvent } from "../shared/voice-models.js";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { identityFromString } from "@echosixhiya/teamspeak-client";
import { TSClient, type TSClientOptions } from "./ts-client.js";
import type { Logger as LoggerType } from "../logger.js";
import { clientConnectionFailureCode, describeTeamSpeakError, normalizeTeamSpeakError } from "../errors.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey, type TeamSpeakTarget } from "../domain/teamspeak-target.js";
import { JoinTicketStore, type JoinTicketPayload } from "./join-ticket.js";
import type { ReconnectTicketStore } from "./reconnect-ticket.js";
import { IdentityLeaseStore } from "./identity-lease.js";
import { SessionManager, type ManagedSession, type SessionTeardownReason } from "./session-manager.js";
import { parseClientCommand } from "./voice-protocol.js";
import { isRecoverable, reconnectDelayMs, reconnectWindowOpen } from "./reconnect-policy.js";
import { WebRtcAudioSession, type WebRtcAudioOptions, type WebRtcAudioSessionOptions, type WebRtcSessionDescription } from "./webrtc-audio.js";
import { normalizeScreenShareIceServers, parseScreenShareMessage, type ScreenShareIceServer } from "./screen-share.js";
import { createVoiceEncoder } from "./opus-codec.js";
import { AvatarLruCache } from "./avatar-cache.js";
import { CommandRateLimiter, shouldReportRateLimit } from "./command-rate-limit.js";
import { resolveClientAddress } from "./client-ip.js";
import type { ServerPasswordGuard } from "./server-password-guard.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
// Detached sessions hold a live TeamSpeak connection, so the window must
// cover the realistic resume paths (page reload is instant, network blips
// recover within the browser's ~30s retry budget) without keeping a departed
// visitor's slot and identity lease hostage much longer than that.
const RESUME_GRACE_MS = 60_000;
// Avatars are rare downloads for a self-hosted deployment; the cap bounds
// worst-case memory (cap × 256KB SDK transfer ceiling) well below concern.
const AVATAR_CACHE_CAPACITY = 128;
function publicFailureDetail(error: ReturnType<typeof normalizeTeamSpeakError>): string | undefined {
  const serverMessage = error.diagnostics.serverMessage?.trim();
  const serverId = error.diagnostics.id?.trim();
  const detail = [serverMessage, serverId ? `server error id=${serverId}` : ""].filter(Boolean).join("; ");
  const safe = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return safe || undefined;
}

export interface VoiceBridgeOptions {
  joinTickets: JoinTicketStore;
  reconnectTickets?: ReconnectTicketStore;
  /** How long a detached (browser-gone, TeamSpeak-kept) session waits for its
   *  resume before the kept TeamSpeak connection is released. */
  resumeGraceMs?: number;
  webRtc?: WebRtcAudioOptions | (() => WebRtcAudioOptions);
  screenShareIceServers?: ScreenShareIceServer[] | (() => ScreenShareIceServer[]);
  trustProxy?: boolean;
  serverPasswordGuard?: ServerPasswordGuard;
}

interface VoiceBridgeDependencies {
  createTeamSpeakClient?(options: TSClientOptions, logger: LoggerType): TSClient;
  createEncoder?(): VoiceEncoder;
}

export interface AdminSessionSummary {
  id: string;
  nickname: string;
  target: string;
  state: string;
  createdAt: string;
  ageSeconds: number;
  tsClientId: number | null;
  channelId: string | null;
  memberCount: number;
  audio: AudioFlowStats;
}

type ServerEvent = SharedServerEvent & { kind: "joined" | "left" | "moved" | "poke" | "connection" };

interface WebClientEntry extends SessionDirectoryState {
  id: string;
  session: ManagedSession;
  tsClient: TSClient;
  ws: WebSocket;
  nickname: string;
  rememberIdentity: boolean;
  clientIp: string;
  target: TeamSpeakTarget;
  identityLeaseKey?: string;
  webrtcPublicHost?: string;
  events: SessionEventCoordinator | null;
  eventLog: ServerEvent[];
  audioTransport: SessionAudioTransport | null;
  isAlive: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  audio: AudioFlowStats;
  webrtc: WebRtcAudioSession | null;
  webrtcGeneration: number;
  lastLatencyProbeAt: number;
  lastAudioStatsProbeAt: number;
  commandLimiter: CommandRateLimiter;
  lastRateLimitNoticeAt: number;
  connectedOnce: boolean;
  webrtcEverUsed: boolean;
  connectionFailureCode?: string;
  screenPeerId: string;
  /** Token delivered in `connected` for browser reload/drop recovery. */
  reconnectTicketToken?: string;
  /** Session kept alive while its browser is gone (see detachEntry): no live
   *  socket, TeamSpeak connection and directory state held for the resume
   *  window, then released by the heartbeat sweep. */
  detached?: boolean;
  detachedAt?: number;
  /** Set by the owning connection closure: rebinds a resume socket onto the
   *  kept session (re-registering handlers, recreating the audio transport
   *  and resending initial state) without touching TeamSpeak. Returns false
   *  when the session is no longer attachable. */
  attachSocket?: (socket: WebSocket) => boolean;
}

export class VoiceBridge {
  private readonly sessionManager = new SessionManager();
  private readonly entries = new Map<string, WebClientEntry>();
  private readonly screenShares: ScreenShareCoordinator;
  private readonly identityLeases = new IdentityLeaseStore();
  // One cache serves every session: avatars are keyed by TeamSpeak uid, so a
  // reconnection or a second browser reuses the same download.
  private readonly avatarCache = new AvatarLruCache(AVATAR_CACHE_CAPACITY);
  // Completed sessions by transport path. The compatibility path is the
  // 768 kbit/s PCM fallback, so its share decides whether the Opus-over-WS
  // upgrade is worth building; this counter is its trigger measurement.
  private readonly transportOutcomes = { connected: 0, webrtc: 0, compat: 0 };
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private logger: LoggerType;
  private readonly resumeGraceMs: number;

  constructor(
    private options: VoiceBridgeOptions,
    logger: LoggerType,
    private readonly createWebRtcSession: (options: WebRtcAudioSessionOptions) => WebRtcAudioSession = options => new WebRtcAudioSession(options),
    private readonly dependencies: VoiceBridgeDependencies = {},
  ) {
    this.logger = logger.child({ component: "voice-bridge" });
    this.resumeGraceMs = options.resumeGraceMs ?? RESUME_GRACE_MS;
    this.screenShares = new ScreenShareCoordinator(this.entries, (entryId, message) => {
      const entry = this.entries.get(entryId);
      if (entry?.ws.readyState === WebSocket.OPEN) entry.ws.send(JSON.stringify(message));
    }, this.logger);
  }

  attach(server: Server): void {
    // Avatar data is delivered as a data URL in a memberAvatar message. Keep
    // the frame limit above the encoded avatar ceiling with room for JSON.
    this.wss = new WebSocketServer({ server, path: "/ws/voice", maxPayload: 512 * 1024 });
    this.startHeartbeat();

    this.wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
      const connection = this.resolveConnection(url);
      if (!connection) {
        ws.close(4001, "Join ticket required");
        return;
      }

      // A resume ticket whose predecessor still sits in the detached pool
      // adopts the kept TeamSpeak session instead of building a new one: the
      // browser view reattaches and TeamSpeak never sees a reconnect.
      const resumeEntryId = typeof connection.resumeOfEntryId === "string" ? connection.resumeOfEntryId : "";
      const resumeTarget = resumeEntryId ? this.entries.get(resumeEntryId) : undefined;
      if (resumeTarget?.detached === true && typeof resumeTarget.attachSocket === "function") {
        if (resumeTarget.attachSocket(ws)) {
          this.logger.info({ entryId: resumeEntryId, nickname: resumeTarget.nickname, target: formatTeamSpeakTarget(resumeTarget.target) }, "Voice session resumed onto kept TeamSpeak connection");
          return;
        }
        this.logger.warn({ entryId: resumeEntryId }, "Resume target no longer attachable; the browser must rebuild the session");
        ws.close(4001, "RESUME_UNAVAILABLE");
        return;
      }

      const { target, serverPassword, nickname } = connection;
      const channelName = connection.channel;
      const clientIp = resolveClientIp(req, this.options.trustProxy === true);
      const webrtcPublicHost = resolveWebRtcPublicHost(req);
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
      const session = this.sessionManager.admit(entryId, async (reason) => {
        if (entry) await this.cleanupEntry(entry, reason);
      });
      if (!session) {
        this.logger.warn({ max: this.sessionManager.maxSessions }, "Max clients reached");
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
        const predecessor = this.entries.get(predecessorEntryId);
        if (predecessor && predecessor.id !== entryId) {
          // A hung TeamSpeak disconnect must not stall admission forever: the
          // explicit lease release below is idempotent and unblocks the lease
          // even if the full teardown is still waiting on the SDK.
          await Promise.race([
            this.sessionManager.teardown(predecessor.id, "superseded"),
            new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
          ]);
          if (predecessor.identityLeaseKey) this.identityLeases.release(predecessor.identityLeaseKey, predecessor.id);
        }
      }
      if (identityLeaseKey && !this.identityLeases.acquire(identityLeaseKey, entryId)) {
        this.logger.warn({ entryId, nickname, target: formatTeamSpeakTarget(target) }, "TeamSpeak identity already in use");
        void this.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
        ws.close(4005, "IDENTITY_IN_USE");
        return;
      }

      this.logger.info({
        entryId,
        nickname,
        clientIp,
        channel: channelName,
        target: formatTeamSpeakTarget(target),
      }, "WebClient connecting");
      let tsClient: TSClient;
      try {
        const createClient = this.dependencies.createTeamSpeakClient ?? ((options, logger) => new TSClient(options, logger));
        tsClient = createClient({ target, nickname, serverPassword, defaultChannel: channelName, identity }, this.logger);
      } catch (error: unknown) {
        if (identityLeaseKey) this.identityLeases.release(identityLeaseKey, entryId);
        this.logger.error({ err: error, entryId }, "Could not create TeamSpeak client");
        void this.sessionManager.teardown(entryId, "teamSpeak-connect-failed");
        // A 4003 with a bare close used to be reported as "identity rejected".
        // Send a structured failure so the browser says the TeamSpeak client
        // could not be created (server down / unreachable) instead.
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "connectionFailed", code: "TEAM_SPEAK_CLIENT_UNAVAILABLE", detail: "TeamSpeak client unavailable" }));
        ws.close(4003, "TEAM_SPEAK_CLIENT_UNAVAILABLE");
        return;
      }
      // One reconnect ticket per accepted socket: the browser holds it for a
      // page reload or a transport drop, and the `connected` message delivers
      // it. It never re-consumes the invite; TTL and single-consume bound reuse.
      const reconnectTicketToken = this.options.reconnectTickets?.issue(connection, entryId);
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
      this.entries.set(entryId, entry!);
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
            this.options.reconnectTickets?.updateChannel(entryId, channelName);
            currentConnection = { ...currentConnection, channel: channelName };
          }
        }
        const socket = entry?.ws;
        if (this.entries.get(entryId) === entry && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      };
      const createAudioTransport = (socket: WebSocket): SessionAudioTransport => new SessionAudioTransport({
        audio: entry!.audio, socket, client: tsClient,
        isCurrent: () => this.entries.get(entryId) === entry,
        isReady: () => tsReady && session.state === "connected",
        selfId: () => entry!.events?.selfId ?? 0,
        peer: () => entry!.webrtc,
        whisperTargets: () => entry!.whisperActive ? [...entry!.whisperTargetIds] : null,
        sendJson: message => sendJson(message),
      }, this.dependencies.createEncoder?.() ?? createVoiceEncoder());
      try {
        entry.audioTransport = createAudioTransport(ws);
      } catch (error: unknown) {
        this.logger.error({ err: error, entryId }, "Could not create Opus encoder");
        void this.teardown(entryId, "teamSpeak-connect-failed");
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
          this.logger.info({
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
        events.scheduleAvatars();
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
        webrtcAvailable: this.getWebRtcOptions()?.enabled === true,
        webRtcStunServer: this.getWebRtcOptions()?.stunServer ?? "",
        screenShareIceServers: this.getScreenShareIceServers(),
        ...(entry!.reconnectTicketToken ? { reconnectTicket: entry!.reconnectTicketToken } : {}),
        ...(entry!.rememberIdentity ? { identity: tsClient.getIdentityString() } : {}),
      });

      /** Reattach a resume socket to this kept session: swap the entry's
       *  socket, re-register the handlers, recreate the audio transport and
       *  resend the full state. TeamSpeak never learns the view went away. */
      entry!.attachSocket = (next: WebSocket): boolean => {
        if (this.entries.get(entryId) !== entry || !entry!.detached) return false;
        if (!tsReady || !initialStateSent || session.state !== "connected") return false;
        entry!.ws = next;
        entry!.detached = false;
        entry!.detachedAt = undefined;
        entry!.reconnectTicketToken = this.options.reconnectTickets?.issue(currentConnection, entryId);
        bindSocketHandlers(next);
        try {
          entry!.audioTransport = createAudioTransport(next);
        } catch (error: unknown) {
          this.logger.error({ err: error, entryId }, "Could not recreate Opus encoder for the resumed socket");
          void this.teardown(entryId, "protocol-error");
          return false;
        }
        sendJson(connectedMessage());
        sendJson({ type: "channelList", channels: entry!.channelTree });
        events.scheduleAvatars();
        return true;
      };

      const resetDirectoryForReconnect = () => {
        tsReady = false;
        events.reset();
        void this.stopWebRtc(entry!);
        initialStateSent = false;
      };

      // Wrong server passwords are the one credential a browser client may
      // guess freely, so they are counted per target in the shared guard and
      // the join endpoint refuses user-supplied passwords while it cools down.
      const notePasswordFailure = (failureCode: string | undefined) => {
        if (failureCode !== "SERVER_PASSWORD_REQUIRED" && failureCode !== "INVALID_SERVER_PASSWORD") return;
        this.options.serverPasswordGuard?.recordFailure(teamSpeakTargetKey(entry!.target));
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
        void this.teardown(entryId, "teamSpeak-connect-failed");
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

      const connectTeamSpeak = async (isReconnect: boolean): Promise<void> => {
        try {
          await tsClient.connect();
          if (session.state !== "authenticating") return;
          session.transition("syncing");
          tsReady = true;
          this.options.serverPasswordGuard?.recordSuccess(teamSpeakTargetKey(entry!.target));
          events.syncSelf();
          sendInitialState();
          void this.screenShares.discoverExistingStreams(entry!).catch((error: unknown) => {
            this.logger.debug({ entryId, err: error instanceof Error ? error.message : String(error) }, "Could not discover existing TeamSpeak screen streams");
          });
        } catch (error: unknown) {
          const normalized = normalizeTeamSpeakError(error);
          const failureCode = clientConnectionFailureCode(normalized, serverPassword);
          const failureDetail = publicFailureDetail(normalized);
          entry!.connectionFailureCode = failureCode;
          notePasswordFailure(failureCode);
          this.logger.warn({
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
            void this.teardown(entryId, "teamSpeak-connect-failed");
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
        avatarCache: this.avatarCache,
        isCurrent: () => this.entries.get(entryId) === entry && session.state !== "disconnecting" && session.state !== "idle" && session.state !== "failed",
        acceptsDirectory: () => session.state === "authenticating" || session.state === "syncing" || session.state === "connected",
        isPublished: () => tsReady && initialStateSent,
        isConnected: () => tsReady && session.state === "connected",
        sendJson, addEvent: addServerEvent, onDirectoryReady: sendInitialState,
        onClientLeave: id => {
          this.screenShares.onClientLeave(entry!, id);
          entry!.webrtc?.setMemberVolume(id, 1);
        },
        onClientMove: (id, channelId) => this.screenShares.onClientMove(entry!, id, channelId),
        onNotification: notification => this.screenShares.handleNotification(entry!, notification),
        onVoice: data => entry!.audioTransport?.receiveTeamSpeak(data),
        onAvatarError: (clientId, uid, error) => this.logger.debug({
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
          this.logger.warn({ entryId, code: failureCode, normalizedCode: kick.code, failureDetail: describeTeamSpeakError(kick) }, "TeamSpeak session ended by kick/ban");
          sendJson({ type: "connectionFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
          void this.teardown(entryId, "teamSpeak-kicked");
        },
        onDisconnect: error => {
          if (!hasConnectedOnce || session.state !== "connected") return;
          this.screenShares.removePeer(entryId);
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
          if (this.entries.get(entryId) !== entry) return;
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
            if (this.getWebRtcOptions()?.enabled !== true) {
              sendProtocolError(sendJson, "WEBRTC_DISABLED", "WebRTC 音频传输未启用");
              return;
            }
            if (!tsReady || session.state !== "connected") {
              sendProtocolError(sendJson, "SESSION_NOT_READY", "TeamSpeak 会话尚未就绪");
              return;
            }
            const { sdp, muted, accompanimentActive } = webRtcMessage.payload;
            void this.handleWebRtcOffer(entry!, { ...sdp, muted, accompanimentActive }, sendJson);
            return;
          }
          if (webRtcMessage?.type === "webrtcStop") {
            void this.stopWebRtc(entry!);
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
            this.screenShares.handleMessage(entry!, screenShareMessage, sendJson);
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
          this.logger.info({ entryId, code, detached: entry?.detached === true }, "WebSocket closed");
          // 1000 is a deliberate leave (user disconnect or server-initiated
          // teardown): release everything. Any other close — reload, network
          // loss, proxy drop — keeps the TeamSpeak session for the resume
          // window when the session holds a reconnect ticket at all.
          if (code === 1000 || !this.canDetachEntry(entry)) {
            void this.teardown(entryId, "websocket-close");
            return;
          }
          this.detachEntry(entry!);
        });
        // The close event decides detach vs teardown; an error alone (usually
        // followed by an abnormal close) must not pre-empt that decision.
        socket.on("error", (error) => {
          this.logger.warn({ entryId, err: error instanceof Error ? error.message : String(error) }, "WebSocket error");
        });
      };
      bindSocketHandlers(ws);

      try {
        session.transition("connecting");
        session.transition("authenticating");
      } catch (error: unknown) {
        this.logger.error({ err: error instanceof Error ? error.message : String(error), entryId }, "Session state initialization failed");
        void this.teardown(entryId, "protocol-error");
        return;
      }

      void connectTeamSpeak(false);
    });

    this.wss.on("error", (error) => {
      this.logger.error({ err: error }, "Voice WebSocket server error");
    });
    this.logger.info("Voice WebSocket endpoint ready at /ws/voice");
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await this.sessionManager.shutdown("gateway-shutdown");
    const wss = this.wss;
    this.wss = null;
    if (!wss) return;
    await new Promise<void>((resolve) => {
      try { wss.close(() => resolve()); } catch { resolve(); }
    });
  }

  getActiveCount(): number {
    return this.sessionManager.activeCount;
  }

  getPeakCount(): number {
    return this.sessionManager.peakCount;
  }

  getCreatedCount(): number {
    return this.sessionManager.createdCount;
  }

  /** Diagnostic visibility into the shared cross-session avatar cache. */
  get avatarCacheSize(): number {
    return this.avatarCache.size;
  }

  /**
   * Completed sessions by transport path. `compat` sessions are PCM-fallback
   * users; a sustained compat share above ~5% is the agreed trigger for
   * building the Opus-over-WS upgrade of the fallback path.
   */
  getTransportOutcomes(): { connected: number; webrtc: number; compat: number; compatRatio: number } {
    const { connected, webrtc, compat } = this.transportOutcomes;
    return { connected, webrtc, compat, compatRatio: connected > 0 ? compat / connected : 0 };
  }

  getSessionSummaries(): AdminSessionSummary[] {
    const now = Date.now();
    return [...this.entries.values()]
      .sort((left, right) => left.session.createdAt - right.session.createdAt)
      .map((entry) => {
        let tsClientId: number | null = null;
        let channelId: string | null = null;
        try { tsClientId = entry.tsClient.getClientId() || null; } catch { /* still connecting */ }
        try {
          const id = entry.tsClient.getChannelId();
          channelId = id === 0n ? null : id.toString();
        } catch { /* still connecting */ }
        return {
          id: entry.id,
          nickname: entry.nickname,
          target: formatTeamSpeakTarget(entry.target),
          state: entry.session.state,
          createdAt: new Date(entry.session.createdAt).toISOString(),
          ageSeconds: Math.max(0, Math.floor((now - entry.session.createdAt) / 1000)),
          tsClientId,
          channelId,
          memberCount: entry.members.size,
          audio: snapshotAudioStats(entry),
        };
      });
  }

  async terminateSession(entryId: string): Promise<boolean> {
    if (!this.entries.has(entryId)) return false;
    await this.sessionManager.teardown(entryId, "admin-terminated");
    return true;
  }

  /** Whether the entry currently sits in the detached pool with a healthy
   *  TeamSpeak session, i.e. a resume exchange should keep (not rebuild) it. */
  isDetachedResumable(entryId: string): boolean {
    const entry = this.entries.get(entryId);
    return Boolean(entry?.detached === true && entry.attachSocket && entry.session.state === "connected");
  }

  private canDetachEntry(entry: WebClientEntry | null): entry is WebClientEntry {
    return Boolean(
      entry
      && this.entries.get(entry.id) === entry
      && entry.detached !== true
      && entry.reconnectTicketToken
      && entry.attachSocket
      && entry.session.state === "connected",
    );
  }

  /** Browser gone (reload, network loss, proxy drop) with a healthy TeamSpeak
   *  session and a reconnect ticket: keep the TeamSpeak connection and
   *  directory state for the resume window instead of tearing down. The
   *  heartbeat sweep releases it when nobody claims it back. */
  private detachEntry(entry: WebClientEntry): void {
    entry.detached = true;
    entry.detachedAt = Date.now();
    entry.audioTransport?.close();
    entry.audioTransport = null;
    void this.stopWebRtc(entry);
    this.screenShares.removePeer(entry.id);
    this.logger.info({
      entryId: entry.id,
      nickname: entry.nickname,
      graceMs: this.resumeGraceMs,
    }, "Voice session detached; keeping the TeamSpeak connection for resume");
  }

  private async teardown(entryId: string, reason: SessionTeardownReason): Promise<void> {
    await this.sessionManager.teardown(entryId, reason);
  }

  private async cleanupEntry(entry: WebClientEntry, reason: SessionTeardownReason): Promise<void> {
    this.screenShares.removePeer(entry.id);
    // A torn-down session can never be adopted, not even during the close
    // handshake's async window.
    entry.attachSocket = undefined;
    if (this.entries.get(entry.id) === entry) this.entries.delete(entry.id);
    if (entry.connectedOnce) {
      this.transportOutcomes.connected += 1;
      if (entry.webrtcEverUsed) this.transportOutcomes.webrtc += 1;
      else this.transportOutcomes.compat += 1;
    }
    entry.events?.close();
    entry.events = null;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    entry.audioTransport?.close();
    entry.audioTransport = null;
    await this.stopWebRtc(entry);
    entry.whisperTargetIds.clear();
    entry.whisperActive = false;
    entry.channelTree = [];
    entry.members.clear();
    try { await entry.tsClient.disconnect(); } catch { /* disconnect is intentionally idempotent */ }
    // Preserve WebSocketServer's close listener, which removes this socket
    // from its clients set and allows server shutdown to finish.
    entry.ws.removeAllListeners("message");
    entry.ws.removeAllListeners("pong");
    if (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING) {
      if (reason === "heartbeat-timeout" || reason === "gateway-shutdown") entry.ws.terminate();
      else entry.ws.close(reason === "protocol-error" ? 1008 : 1000, reason);
    }
    if (entry.identityLeaseKey) this.identityLeases.release(entry.identityLeaseKey, entry.id);
    this.logger.info({
      entryId: entry.id,
      nickname: entry.nickname,
      clientIp: entry.clientIp,
      target: formatTeamSpeakTarget(entry.target),
      reason,
      ...(entry.connectionFailureCode ? { failureCode: entry.connectionFailureCode } : {}),
      durationSeconds: Math.max(0, Math.floor((Date.now() - entry.session.createdAt) / 1000)),
      audio: { ...entry.audio },
    }, "Client session torn down");
  }

  /** Heartbeat-tick work for the detached pool: release kept sessions nobody
   *  claimed within the grace window. Public for tests. */
  sweepDetachedSessions(now: number): void {
    for (const entry of this.entries.values()) {
      if (entry.detached !== true || entry.detachedAt === undefined) continue;
      if (now - entry.detachedAt < this.resumeGraceMs) continue;
      this.logger.info({ entryId: entry.id, nickname: entry.nickname }, "Resume grace window elapsed; releasing the kept session");
      void this.teardown(entry.id, "resume-grace-elapsed");
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sweepDetachedSessions(Date.now());
      for (const entry of this.entries.values()) {
        // Detached sessions hold no live socket to ping; the sweep above owns
        // their lifecycle.
        if (entry.detached) continue;
        if (entry.ws.readyState !== WebSocket.OPEN) continue;
        if (!entry.isAlive) {
          entry.ws.terminate();
          void this.teardown(entry.id, "heartbeat-timeout");
          continue;
        }
        entry.isAlive = false;
        entry.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private resolveConnection(url: URL): JoinTicketPayload | null {
    const token = url.searchParams.get("ticket");
    return token ? this.options.joinTickets.consume(token) : null;
  }

  private getWebRtcOptions(): WebRtcAudioOptions | undefined {
    const configured = this.options.webRtc;
    return typeof configured === "function" ? configured() : configured;
  }

  private getScreenShareIceServers(): ScreenShareIceServer[] {
    const configured = this.options.screenShareIceServers;
    const servers = typeof configured === "function" ? configured() : configured;
    return normalizeScreenShareIceServers(servers);
  }

  private async stopWebRtc(entry: WebClientEntry): Promise<void> {
    const generation = ++entry.webrtcGeneration;
    const peer = entry.webrtc;
    entry.webrtc = null;
    // Enqueue the reset even while an offer is still preparing its first peer.
    // A later offer's input changes are then ordered after this restoration.
    const restoreInput = this.entries.get(entry.id) === entry && entry.tsClient.isConnected()
      ? entry.tsClient.setAccompanimentActive(false).catch(() => undefined)
      : Promise.resolve();
    if (!peer) { await restoreInput; return; }
    try { await peer.close(); } catch { /* peer teardown is idempotent */ }
    await restoreInput;
    if (entry.webrtcGeneration === generation) {
      try { Object.assign(entry.audio, peer.getStats()); } catch { /* diagnostics must not abort cleanup */ }
    }
  }

  private async handleWebRtcOffer(
    entry: WebClientEntry,
    offer: WebRtcSessionDescription,
    sendJson: (message: ServerMessage) => void,
  ): Promise<void> {
    const closing = this.stopWebRtc(entry);
    const generation = entry.webrtcGeneration;
    const isCurrent = (): boolean => entry.webrtcGeneration === generation
      && this.entries.get(entry.id) === entry && entry.session.state === "connected"
      && entry.ws.readyState === WebSocket.OPEN;
    await closing;
    if (!isCurrent()) return;
    const config = this.getWebRtcOptions();
    if (!config?.enabled) return;
    const muted = offer.muted === true;
    try {
      // The offer carries the browser's initial mute state. WebRTC can silence
      // the browser track locally, but TeamSpeak clients only see the state
      // after the gateway updates its own TS client as well.
      await entry.tsClient.setInputMuted(muted);
      if (isCurrent()) await entry.tsClient.setAccompanimentActive(offer.accompanimentActive === true);
    } catch (error: unknown) {
      if (isCurrent()) this.logger.warn({ entryId: entry.id, muted, err: error instanceof Error ? error.message : String(error) }, "Could not synchronize initial microphone mute state");
    }
    if (!isCurrent()) return;
    let peer: WebRtcAudioSession | null = null;
    const isCurrentPeer = (): boolean => isCurrent() && peer !== null && entry.webrtc === peer;
    try {
      const publicAddresses = await resolveVoiceMediaAddresses(config.publicHost || entry.webrtcPublicHost, config.ipv6Enabled === true);
      if (!isCurrent()) return;
      peer = this.createWebRtcSession({
        connectionId: entry.id,
        publicAddresses,
        ...(config.publicHost || entry.webrtcPublicHost ? { publicHost: config.publicHost || entry.webrtcPublicHost } : {}),
        ipv6Enabled: config.ipv6Enabled,
        stunServer: config.stunServer,
        udpPortRange: config.udpPortRange,
        logger: this.logger,
        microphoneMuted: muted,
        accompanimentActive: offer.accompanimentActive === true,
        onVoiceFrame: (data, codec) => {
          if (isCurrentPeer()) entry.audioTransport?.receiveWebRtc(data, codec);
        },
        onVoiceActivity: (clientIds) => {
          if (isCurrentPeer()) sendJson({ type: "voiceActivity", clientIds });
        },
      });
      entry.webrtc = peer;
      const answer = await peer.createAnswer({ type: offer.type, sdp: offer.sdp });
      if (!isCurrentPeer()) {
        try { await peer.close(); } catch { /* a replaced peer may already be closed */ }
        return;
      }
      sendJson({ type: "webrtcAnswer", payload: { sdp: answer } });
      entry.webrtcEverUsed = true;
      this.logger.info({ entryId: entry.id }, "WebRTC audio negotiation completed");
    } catch (error: unknown) {
      if (entry.webrtc === peer) entry.webrtc = null;
      try { await peer?.close(); } catch { /* best effort */ }
      if (isCurrent()) {
        try { await entry.tsClient.setAccompanimentActive(false); } catch { /* best effort */ }
        if (!isCurrent()) return;
        this.logger.warn({ entryId: entry.id, err: error instanceof Error ? error.message : String(error) }, "WebRTC audio negotiation failed");
        sendJson({ type: "webrtcError", code: "WEBRTC_NEGOTIATION_FAILED" });
      }
    }
  }
}

function resolveWebRtcPublicHost(request: IncomingMessage): string | undefined {
  const origin = firstHeader(request.headers.origin);
  const forwardedHost = firstHeader(request.headers["x-forwarded-host"]);
  const directHost = firstHeader(request.headers.host);
  for (const candidate of [origin, forwardedHost, directHost]) {
    const host = normalizeWebRtcHost(candidate);
    if (host) return host;
  }
  return undefined;
}

function resolveClientIp(request: IncomingMessage, trustProxy: boolean): string {
  const header = request.headers["x-forwarded-for"];
  return resolveClientAddress(
    request.socket.remoteAddress,
    Array.isArray(header) ? header[0] : header,
    trustProxy,
  );
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
