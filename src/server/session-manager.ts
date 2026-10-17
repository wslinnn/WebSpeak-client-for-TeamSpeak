import { canAcceptSession, MAX_ACTIVE_SESSIONS, MAX_SESSIONS_PER_PEER } from "../constants.js";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "syncing"
  | "connected"
  | "interrupted"
  | "reconnecting"
  | "disconnecting"
  | "failed";

export type SessionTeardownReason =
  | "client-disconnect"
  | "websocket-close"
  | "websocket-error"
  | "protocol-error"
  | "teamSpeak-disconnect"
  | "teamSpeak-kicked" // 会话被 TeamSpeak 服务器踢出/封禁时拆除
  | "teamSpeak-connect-failed"
  | "heartbeat-timeout"
  | "admin-terminated"
  | "superseded" // 同一会话的重连续任者接管（释放身份租约后让新连接进入）
  | "resume-grace-elapsed" // detached 会话宽限期内无人认领，释放保活的 TeamSpeak 连接
  | "gateway-shutdown";

const ALLOWED_TRANSITIONS: Record<ConnectionState, readonly ConnectionState[]> = {
  idle: ["connecting", "disconnecting"],
  connecting: ["authenticating", "reconnecting", "failed", "disconnecting"],
  authenticating: ["syncing", "reconnecting", "failed", "disconnecting"],
  syncing: ["connected", "reconnecting", "failed", "disconnecting"],
  connected: ["interrupted", "failed", "disconnecting"],
  interrupted: ["reconnecting", "failed", "disconnecting"],
  reconnecting: ["connecting", "failed", "disconnecting"],
  disconnecting: ["idle"],
  failed: ["disconnecting", "idle"],
};

export class ConnectionStateMachine {
  private current: ConnectionState = "idle";

  get state(): ConnectionState {
    return this.current;
  }

  transition(next: ConnectionState): void {
    if (next === this.current) return;
    if (!ALLOWED_TRANSITIONS[this.current].includes(next)) {
      throw new Error(`Illegal connection state transition: ${this.current} -> ${next}`);
    }
    this.current = next;
  }
}

export type SessionCleanup = (reason: SessionTeardownReason) => Promise<void>;

export class ManagedSession {
  readonly createdAt = Date.now();
  private readonly stateMachine = new ConnectionStateMachine();
  private teardownPromise: Promise<void> | null = null;

  constructor(
    readonly id: string,
    private readonly cleanup: SessionCleanup,
    readonly peerKey = "",
  ) {}

  get state(): ConnectionState {
    return this.stateMachine.state;
  }

  transition(next: ConnectionState): void {
    this.stateMachine.transition(next);
  }

  async teardown(reason: SessionTeardownReason): Promise<void> {
    if (this.teardownPromise) return this.teardownPromise;
    this.teardownPromise = (async () => {
      if (this.state !== "idle" && this.state !== "disconnecting") {
        this.stateMachine.transition("disconnecting");
      } else if (this.state === "idle") {
        this.stateMachine.transition("disconnecting");
      }
      try {
        await this.cleanup(reason);
      } catch {
        // Teardown is best effort and must not be interrupted by an already
        // closed socket, TeamSpeak client, or codec resource.
      } finally {
        if (this.state === "disconnecting") this.stateMachine.transition("idle");
      }
    })();
    return this.teardownPromise;
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly peerCounts = new Map<string, number>();
  private accepting = true;
  private peak = 0;
  private created = 0;

  /** S3：最近一次 admit 失败的原因（gateway-full=全局槽满，peer-limit=单对端
   *  并发上限）。admit 保持返回 null 的旧形状，调用方在 null 时读这里区分。 */
  rejectReason: "gateway-full" | "peer-limit" | null = null;

  admit(id: string, cleanup: SessionCleanup, peerKey = ""): ManagedSession | null {
    this.rejectReason = null;
    if (!this.accepting || !canAcceptSession(this.sessions.size)) {
      this.rejectReason = "gateway-full";
      return null;
    }
    if (peerKey && (this.peerCounts.get(peerKey) ?? 0) >= MAX_SESSIONS_PER_PEER) {
      this.rejectReason = "peer-limit";
      return null;
    }
    if (this.sessions.has(id)) throw new Error(`Session already exists: ${id}`);
    const session = new ManagedSession(id, cleanup, peerKey);
    this.sessions.set(id, session);
    if (peerKey) this.peerCounts.set(peerKey, (this.peerCounts.get(peerKey) ?? 0) + 1);
    this.created++;
    this.peak = Math.max(this.peak, this.sessions.size);
    return session;
  }

  get(id: string): ManagedSession | undefined {
    return this.sessions.get(id);
  }

  get activeCount(): number {
    return this.sessions.size;
  }

  get peakCount(): number {
    return this.peak;
  }

  get createdCount(): number {
    return this.created;
  }

  get isAccepting(): boolean {
    return this.accepting;
  }

  async teardown(id: string, reason: SessionTeardownReason): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    await session.teardown(reason);
    this.sessions.delete(id);
    if (session.peerKey) {
      const remaining = (this.peerCounts.get(session.peerKey) ?? 1) - 1;
      if (remaining <= 0) this.peerCounts.delete(session.peerKey);
      else this.peerCounts.set(session.peerKey, remaining);
    }
  }

  async shutdown(reason: SessionTeardownReason = "gateway-shutdown"): Promise<void> {
    this.accepting = false;
    await Promise.all([...this.sessions.keys()].map((id) => this.teardown(id, reason)));
  }

  get maxSessions(): number {
    return MAX_ACTIVE_SESSIONS;
  }
}
