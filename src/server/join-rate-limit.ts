const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

interface PeerWindow {
  startedAt: number;
  requests: number;
}

/** Bounds opaque join-ticket creation so one peer cannot fill the in-memory store. */
export class JoinRateLimiter {
  private readonly peers = new Map<string, PeerWindow>();

  constructor(private readonly maxTrackedPeers = 2048) {}

  allow(peer: string, now = Date.now()): boolean {
    const current = this.peers.get(peer);
    if (!current || now - current.startedAt >= WINDOW_MS) {
      this.prune(now);
      while (this.peers.size >= this.maxTrackedPeers) {
        const oldest = this.peers.keys().next().value;
        if (!oldest) break;
        this.peers.delete(oldest);
      }
      this.peers.set(peer, { startedAt: now, requests: 1 });
      return true;
    }
    if (current.requests >= MAX_REQUESTS) return false;
    current.requests += 1;
    return true;
  }

  /** Remaining window time for a peer that is currently blocked, in milliseconds
   *  (0 when the peer is not throttled). The join endpoint reports this as
   *  Retry-After so a reconnecting browser can wait instead of burning its
   *  reconnect budget on blind retries (报告 21 F5). */
  blockedForMs(peer: string, now = Date.now()): number {
    const current = this.peers.get(peer);
    if (!current || current.requests < MAX_REQUESTS) return 0;
    const remaining = WINDOW_MS - (now - current.startedAt);
    return remaining > 0 ? remaining : 0;
  }

  private prune(now: number): void {
    for (const [peer, window] of this.peers) {
      if (now - window.startedAt >= WINDOW_MS) this.peers.delete(peer);
    }
  }
}
