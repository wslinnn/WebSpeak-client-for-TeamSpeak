const WINDOW_MS = 60 * 1000;
const MAX_DOWNLOADS = 10;

interface PeerWindow {
  startedAt: number;
  requests: number;
}

/**
 * Bounds skin archive downloads (each up to 20 MB, minutes of airtime on a
 * 3 Mbit/s uplink) so one peer cannot monopolize the gateway's egress by
 * re-fetching packages in a loop.
 */
export class SkinDownloadRateLimiter {
  private readonly peers = new Map<string, PeerWindow>();

  constructor(private readonly maxTrackedPeers = 1024) {}

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
    if (current.requests >= MAX_DOWNLOADS) return false;
    current.requests += 1;
    return true;
  }

  private prune(now: number): void {
    for (const [peer, window] of this.peers) {
      if (now - window.startedAt >= WINDOW_MS) this.peers.delete(peer);
    }
  }
}
