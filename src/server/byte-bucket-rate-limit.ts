interface PeerBucket {
  tokens: number;
  refilledAt: number;
}

/**
 * 字节预算令牌桶（报告 21 S5）：皮肤包/预览是未认证下载，按「次数」限流挡不住
 * 单请求 20MiB——10 次/分 ≈ 27Mbps，是 3Mbps 上行的 9 倍。桶按字节记账，回填
 * 速率把单对端的持续出口压到上行的一个公平份额。
 *
 * 放行规则：满桶（首次访问或预算已回满）恒放行一次下载并把余量钳在 0——合法
 * 用户第一次点击就能拿到全量包，不受桶容量小于单包体积的影响；之后的请求需要
 * 桶内余额 ≥ 体积。304 重验证传 bytes=0，不消耗预算。
 */
export class ByteBucketRateLimiter {
  private readonly peers = new Map<string, PeerBucket>();

  constructor(
    private readonly capacityBytes: number,
    private readonly refillBytesPerMinute: number,
    private readonly maxTrackedPeers = 1024,
  ) {}

  allow(peer: string, bytes: number, now = Date.now()): boolean {
    const bucket = this.bucketOf(peer, now);
    if (bucket.tokens >= this.capacityBytes) {
      bucket.tokens = Math.max(0, this.capacityBytes - bytes);
      return true;
    }
    if (bucket.tokens >= bytes) {
      bucket.tokens -= bytes;
      return true;
    }
    return false;
  }

  /** 秒级 Retry-After：余额攒到 bytes 还需多久（0 = 现在就允许，含满桶恒放行）。 */
  blockedForMs(peer: string, bytes: number, now = Date.now()): number {
    const stored = this.peers.get(peer);
    const bucket = stored ? this.refill(stored, now) : undefined;
    if (!bucket || bucket.tokens >= bytes) return 0;
    const deficit = bytes - bucket.tokens;
    return Math.ceil((deficit / this.refillBytesPerMinute) * 60_000);
  }

  private bucketOf(peer: string, now: number): PeerBucket {
    const existing = this.peers.get(peer);
    if (existing) return this.refill(existing, now);
    this.prune(now);
    while (this.peers.size >= this.maxTrackedPeers) {
      const oldest = this.peers.keys().next().value;
      if (!oldest) break;
      this.peers.delete(oldest);
    }
    const fresh: PeerBucket = { tokens: this.capacityBytes, refilledAt: now };
    this.peers.set(peer, fresh);
    return fresh;
  }

  private refill(bucket: PeerBucket, now: number): PeerBucket {
    if (now > bucket.refilledAt) {
      const elapsedMinutes = (now - bucket.refilledAt) / 60_000;
      bucket.tokens = Math.min(this.capacityBytes, bucket.tokens + elapsedMinutes * this.refillBytesPerMinute);
      bucket.refilledAt = now;
    }
    return bucket;
  }

  private prune(now: number): void {
    // 超过一次回填周期无人访问的桶没有记账价值（上限容量一加即满）。
    for (const [peer, bucket] of this.peers) {
      if (now - bucket.refilledAt >= 60_000) this.peers.delete(peer);
    }
  }
}
