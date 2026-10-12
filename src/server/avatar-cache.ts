/**
 * Cross-session avatar cache shared by every voice session in the gateway.
 *
 * Avatars are keyed by TeamSpeak identity (uid), which is stable across
 * reconnects and sessions, so one download serves every current and future
 * member with the same uid. Entries are evicted least-recently-used to bound
 * memory; the loader only stores positives — failures stay session-local so
 * they are retried on the next connection instead of poisoning other
 * sessions. This class only stores values.
 */
export class AvatarLruCache {
  private readonly entries = new Map<string, string | null>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("Avatar cache capacity must be a positive integer");
  }

  get size(): number {
    return this.entries.size;
  }

  has(uid: string): boolean {
    return this.entries.has(uid);
  }

  get(uid: string): string | null | undefined {
    const value = this.entries.get(uid);
    // Refresh recency only for hits; Map iteration order is insertion order.
    if (value !== undefined) {
      this.entries.delete(uid);
      this.entries.set(uid, value);
    }
    return value;
  }

  set(uid: string, avatar: string | null): void {
    this.entries.delete(uid);
    this.entries.set(uid, avatar);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(uid: string): void {
    this.entries.delete(uid);
  }
}
