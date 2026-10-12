/** One cached avatar: raw bytes, sniffed content type and a short content
 *  hash that versions the capability URL. */
export interface AvatarEntry {
  data: Buffer;
  mime: string;
  hash: string;
}

/**
 * Cross-session avatar byte cache shared by every voice session in the
 * gateway. Entries are keyed by an opaque capability id (the HMAC of a
 * TeamSpeak uid — see AvatarService), stable across reconnects and sessions,
 * so one download serves every current and future member with the same
 * identity. Entries are evicted least-recently-used to bound memory; the
 * loader only stores positives — failures stay view-local so they are
 * retried on the next connection instead of poisoning other sessions. This
 * class only stores values.
 */
export class AvatarLruCache {
  private readonly entries = new Map<string, AvatarEntry>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("Avatar cache capacity must be a positive integer");
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): AvatarEntry | undefined {
    const value = this.entries.get(key);
    // Refresh recency only for hits; Map iteration order is insertion order.
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, entry: AvatarEntry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
