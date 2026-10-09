const WINDOW_MS = 10 * 60 * 1000;
const FREE_FAILURES = 5;
const BASE_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 15 * 60_000;
const MAX_COOLDOWN_STEPS = 5;

interface FailureRecord {
  failures: number;
  lastFailureAt: number;
}

function cooldownMs(failures: number): number {
  return Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** Math.min(MAX_COOLDOWN_STEPS, failures - FREE_FAILURES));
}

/**
 * Wrong TeamSpeak server passwords are counted per target, separate from the
 * per-peer join limiter: the join limiter alone still lets one machine probe
 * thirty passwords a minute through the gateway. A correct password clears the
 * target, so an administrator typo only causes a short, self-healing cooldown.
 */
export class ServerPasswordGuard {
  private readonly targets = new Map<string, FailureRecord>();

  constructor(private readonly maxTrackedTargets = 256) {}

  /** Milliseconds until the next user-supplied password attempt may proceed. */
  blockedForMs(targetKey: string, now = Date.now()): number {
    const record = this.targets.get(targetKey);
    if (!record) return 0;
    if (now - record.lastFailureAt >= WINDOW_MS) {
      this.targets.delete(targetKey);
      return 0;
    }
    if (record.failures < FREE_FAILURES) return 0;
    const cooldown = cooldownMs(record.failures);
    const elapsed = now - record.lastFailureAt;
    return elapsed >= cooldown ? 0 : cooldown - elapsed;
  }

  recordFailure(targetKey: string, now = Date.now()): void {
    if (this.targets.size >= this.maxTrackedTargets && !this.targets.has(targetKey)) {
      this.prune(now);
    }
    const current = this.targets.get(targetKey);
    const failures = !current || now - current.lastFailureAt >= WINDOW_MS ? 1 : current.failures + 1;
    this.targets.set(targetKey, { failures, lastFailureAt: now });
  }

  recordSuccess(targetKey: string): void {
    this.targets.delete(targetKey);
  }

  /** Test visibility into the bounded-tracking guarantee. */
  get trackedTargetCount(): number {
    return this.targets.size;
  }

  private prune(now: number): void {
    for (const [key, record] of this.targets) {
      if (now - record.lastFailureAt >= WINDOW_MS) this.targets.delete(key);
    }
    while (this.targets.size >= this.maxTrackedTargets) {
      const oldest = this.targets.keys().next().value;
      if (!oldest) break;
      this.targets.delete(oldest);
    }
  }
}
