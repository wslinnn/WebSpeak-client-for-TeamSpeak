import { ScreenShareCoordinator } from "./screen-share-coordinator.js";
import { snapshotAudioStats, snapshotAudioStatus, type AudioFlowStats } from "./audio-stats.js";
export type { AudioFlowStats } from "./audio-stats.js";
import type { ServerMessage } from "../shared/server-messages.js";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import type { Logger as LoggerType } from "../logger.js";
import { formatTeamSpeakTarget } from "../domain/teamspeak-target.js";
import type { JoinTicketPayload } from "./join-ticket.js";
import { IdentityLeaseStore } from "./identity-lease.js";
import { SessionManager, type SessionTeardownReason } from "./session-manager.js";
import { WebRtcAudioSession, type WebRtcAudioOptions, type WebRtcAudioSessionOptions, type WebRtcSessionDescription } from "./webrtc-audio.js";
import { normalizeScreenShareIceServers, type ScreenShareIceServer } from "./screen-share.js";
import { AvatarLruCache } from "./avatar-cache.js";
import { AvatarService } from "./avatar-service.js";
import { createVoiceConnectionHandler } from "./voice-bridge/connection-handler.js";
import { DetachedSessionPool } from "./voice-bridge/detached-pool.js";
import { createVoiceRtc, type VoiceRtc } from "./voice-bridge/voice-rtc.js";
import type { WebClientEntry } from "./voice-bridge/types.js";

export type { VoiceBridgeDependencies, VoiceBridgeOptions } from "./voice-bridge/types.js";
import type { VoiceBridgeDependencies, VoiceBridgeOptions } from "./voice-bridge/types.js";

// Detached sessions hold a live TeamSpeak connection, so the window must
// cover the realistic resume paths — a page reload re-establishes the socket
// in seconds even on slow mobile networks — while a departed visitor's slot
// and identity lease are released promptly. Outages longer than the browser's
// own ~30s retry budget fall back to a manual rejoin.
const RESUME_GRACE_MS = 30_000;
// Avatars are rare downloads for a self-hosted deployment; the cap bounds
// worst-case memory (cap × 256KB SDK transfer ceiling) well below concern.
const AVATAR_CACHE_CAPACITY = 128;

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

export class VoiceBridge {
  private readonly sessionManager = new SessionManager();
  private readonly entries = new Map<string, WebClientEntry>();
  private readonly screenShares: ScreenShareCoordinator;
  private readonly identityLeases = new IdentityLeaseStore();
  // One cache serves every session: avatars are keyed by TeamSpeak uid, so a
  // reconnection or a second browser reuses the same download.
  private readonly avatarService = new AvatarService(new AvatarLruCache(AVATAR_CACHE_CAPACITY));
  // Completed sessions by transport path. The compatibility path is the
  // 768 kbit/s PCM fallback, so its share decides whether the Opus-over-WS
  // upgrade is worth building; this counter is its trigger measurement.
  private readonly transportOutcomes = { connected: 0, webrtc: 0, compat: 0 };
  private wss: WebSocketServer | null = null;
  private logger: LoggerType;
  private readonly resumeGraceMs: number;
  private readonly detachedPool: DetachedSessionPool;
  private readonly voiceRtc: VoiceRtc;
  private readonly connectionHandler: (ws: WebSocket, req: IncomingMessage) => Promise<void>;

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
    this.detachedPool = new DetachedSessionPool({
      entries: this.entries,
      logger: this.logger,
      resumeGraceMs: this.resumeGraceMs,
      teardown: (entryId, reason) => this.teardown(entryId, reason),
      stopWebRtc: entry => this.stopWebRtc(entry),
      removeScreenPeer: entryId => this.screenShares.removePeer(entryId),
    });
    this.voiceRtc = createVoiceRtc({
      entries: this.entries,
      logger: this.logger,
      getWebRtcOptions: () => this.getWebRtcOptions(),
      createWebRtcSession: this.createWebRtcSession,
    });
    this.connectionHandler = createVoiceConnectionHandler({
      entries: this.entries,
      logger: this.logger,
      options: this.options,
      dependencies: this.dependencies,
      sessionManager: this.sessionManager,
      identityLeases: this.identityLeases,
      avatars: this.avatarService,
      screenShares: this.screenShares,
      detachedPool: this.detachedPool,
      resolveConnection: url => this.resolveConnection(url),
      cleanupEntry: (entry, reason) => this.cleanupEntry(entry, reason),
      teardown: (entryId, reason) => this.teardown(entryId, reason),
      getWebRtcOptions: () => this.getWebRtcOptions(),
      getScreenShareIceServers: () => this.getScreenShareIceServers(),
      stopWebRtc: entry => this.stopWebRtc(entry),
      handleWebRtcOffer: (entry, offer, sendJson) => this.handleWebRtcOffer(entry, offer, sendJson),
    });
  }

  attach(server: Server): void {
    // Avatars travel as URLs now; the frame ceiling bounds the largest state
    // snapshots (event log, member roster) plus JSON overhead.
    this.wss = new WebSocketServer({ server, path: "/ws/voice", maxPayload: 512 * 1024 });
    this.detachedPool.startHeartbeat();

    this.wss.on("connection", this.connectionHandler);

    this.wss.on("error", (error) => {
      this.logger.error({ err: error }, "Voice WebSocket server error");
    });
    this.logger.info("Voice WebSocket endpoint ready at /ws/voice");
  }

  async shutdown(): Promise<void> {
    this.detachedPool.stop();
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
    return this.avatarService.size;
  }

  /** Read-only capability-URL projection of the avatar cache; the HTTP
   *  endpoint serves bytes from it without touching session state. */
  get avatars(): AvatarService {
    return this.avatarService;
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
      // 紧凑投影：不带 egressFramesByClient 全表（报告 21 附加项——teardown 日志
      // 曾把按客户端计数表整份拷进日志行）；全量快照仍走管理台诊断。
      audio: snapshotAudioStatus(entry),
    }, "Client session torn down");
  }

  /** Heartbeat-tick work for the detached pool: release kept sessions nobody
   *  claimed within the grace window. Public for tests. */
  sweepDetachedSessions(now: number): void {
    this.detachedPool.sweepDetachedSessions(now);
  }

  /** One full heartbeat pass (sweep + ping loop). Public for tests. */
  heartbeatTick(now: number): void {
    this.detachedPool.heartbeatTick(now);
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

  // Thin delegates keep the bridge-internal call sites (and the test fixture's
  // narrow view of the bridge) pointed at the extracted orchestration.
  private stopWebRtc(entry: WebClientEntry): Promise<void> {
    return this.voiceRtc.stopWebRtc(entry);
  }

  private handleWebRtcOffer(
    entry: WebClientEntry,
    offer: WebRtcSessionDescription,
    sendJson: (message: ServerMessage) => void,
  ): Promise<void> {
    return this.voiceRtc.handleWebRtcOffer(entry, offer, sendJson);
  }
}
