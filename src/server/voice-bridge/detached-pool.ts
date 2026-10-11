import { WebSocket } from "ws";
import type { Logger as LoggerType } from "../../logger.js";
import type { SessionTeardownReason } from "../session-manager.js";
import type { WebClientEntry } from "./types.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface DetachedPoolDeps {
  entries: Map<string, WebClientEntry>;
  logger: LoggerType;
  resumeGraceMs: number;
  teardown: (entryId: string, reason: SessionTeardownReason) => Promise<void>;
  stopWebRtc: (entry: WebClientEntry) => Promise<void>;
  removeScreenPeer: (entryId: string) => void;
}

/** Detached-session lifecycle: a browser that dropped with a healthy
 *  TeamSpeak session and a reconnect ticket keeps that TeamSpeak connection
 *  for the resume window instead of tearing down; the heartbeat sweep releases
 *  it when nobody claims it back. Owns the ping/pong liveness loop for every
 *  attached socket. */
export class DetachedSessionPool {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: DetachedPoolDeps) {}

  canDetach(entry: WebClientEntry | null): entry is WebClientEntry {
    return Boolean(
      entry
      && this.deps.entries.get(entry.id) === entry
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
  detach(entry: WebClientEntry): void {
    entry.detached = true;
    entry.detachedAt = Date.now();
    entry.audioTransport?.close();
    entry.audioTransport = null;
    void this.deps.stopWebRtc(entry);
    this.deps.removeScreenPeer(entry.id);
    this.deps.logger.info({
      entryId: entry.id,
      nickname: entry.nickname,
      graceMs: this.deps.resumeGraceMs,
    }, "Voice session detached; keeping the TeamSpeak connection for resume");
  }

  /** Heartbeat-tick work for the detached pool: release kept sessions nobody
   *  claimed within the grace window. */
  sweepDetachedSessions(now: number): void {
    for (const entry of this.deps.entries.values()) {
      if (entry.detached !== true || entry.detachedAt === undefined) continue;
      if (now - entry.detachedAt < this.deps.resumeGraceMs) continue;
      this.deps.logger.info({ entryId: entry.id, nickname: entry.nickname }, "Resume grace window elapsed; releasing the kept session");
      void this.deps.teardown(entry.id, "resume-grace-elapsed");
    }
  }

  startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sweepDetachedSessions(Date.now());
      for (const entry of this.deps.entries.values()) {
        // Detached sessions hold no live socket to ping; the sweep above owns
        // their lifecycle.
        if (entry.detached) continue;
        if (entry.ws.readyState !== WebSocket.OPEN) continue;
        if (!entry.isAlive) {
          entry.ws.terminate();
          void this.deps.teardown(entry.id, "heartbeat-timeout");
          continue;
        }
        entry.isAlive = false;
        entry.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
