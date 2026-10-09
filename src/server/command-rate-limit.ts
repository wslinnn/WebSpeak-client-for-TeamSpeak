/**
 * Per-session token bucket for WebSocket control messages. Every text frame
 * ends in a TeamSpeak command or a JSON reply, and the TS server's flood
 * protection bans the gateway's shared identity — one abusive client must not
 * be able to take the whole room down with it. Voice frames are bounded
 * separately in session-audio.ts.
 */
export class CommandRateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly capacity = 30,
    private readonly refillPerSecond = 20,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefillAt = now;
  }

  tryRemoveToken(now = Date.now()): boolean {
    const elapsedSeconds = Math.max(0, (now - this.lastRefillAt) / 1000);
    this.lastRefillAt = now;
    if (this.tokens < this.capacity) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Rate-limit rejections answer at most once per interval per session. */
export function shouldReportRateLimit(lastNoticeAt: number, now: number, intervalMs = 1_000): boolean {
  return now - lastNoticeAt >= intervalMs;
}
