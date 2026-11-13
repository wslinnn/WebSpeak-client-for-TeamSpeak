const WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 10;

interface PeerWindow {
  startedAt: number;
  requests: number;
}

/**
 * Per-peer fixed-window request budget, shared by the unauthenticated endpoints
 * whose payloads are tiny (avatar bytes are also capped by a byte bucket — see
 * `ByteBucketRateLimiter`) or expensive per hit (RTP-lab offers each spin up a
 * peer connection with native Opus encoders). Count-based limits bound request
 * rate; anything whose cost scales with payload size belongs in the byte
 * bucket instead.
 */
export class FixedWindowRateLimiter {
  private readonly peers = new Map<string, PeerWindow>();

  constructor(private readonly maxTrackedPeers = 1024, private readonly maxRequests = DEFAULT_MAX_REQUESTS) {}

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
    if (current.requests >= this.maxRequests) return false;
    current.requests += 1;
    return true;
  }

  private prune(now: number): void {
    for (const [peer, window] of this.peers) {
      if (now - window.startedAt >= WINDOW_MS) this.peers.delete(peer);
    }
  }
}
