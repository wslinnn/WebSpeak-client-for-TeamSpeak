import { avatarDataUrl } from "./directory-view.js";
import type { TSClientAvatar } from "./ts-client.js";

interface AvatarMember {
  id: number;
  uid: string;
}

/** Only the cache surface the loader needs; plain Maps and AvatarLruCache both fit. */
export interface AvatarCache {
  get(uid: string): string | null | undefined;
  set(uid: string, avatar: string): unknown;
  has(uid: string): boolean;
  delete(uid: string): unknown;
}

// Every member's avatar is relayed to every other member over the shared
// 3 Mbit/s uplink; oversized files (TeamSpeak allows several MB) would eat the
// voice budget per viewer, so they are skipped like failed transfers.
export const MAX_RELAY_AVATAR_BYTES = 256 * 1024;

export interface MemberAvatarOptions {
  members: ReadonlyMap<number, AvatarMember>;
  /** Shared across sessions; holds positives only. */
  cache: AvatarCache;
  isCurrent(): boolean;
  load(id: number, uid: string): Promise<TSClientAvatar | null>;
  publish(uid: string, avatar: string): void;
  onError(id: number, uid: string, error: unknown): void;
}

/**
 * Optional SDK downloads belong to one connected directory generation.
 * Downloaded avatars land in the shared cross-session cache, and cached
 * positives are re-published to every later session that can see the member:
 * the cache only spares the TeamSpeak file transfer, never the delivery — a
 * fresh session has not seen the bytes yet. Failures and unusable images stay
 * session-local (in `attempted`), so the next connection retries them
 * naturally without poisoning other sessions.
 */
export class MemberAvatarLoader {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private batch: symbol | null = null;
  private readonly attempted = new Set<string>();
  private closed = false;

  constructor(private readonly options: MemberAvatarOptions) {}

  private isCurrent(): boolean {
    return !this.closed && this.options.isCurrent();
  }

  private pendingMembers(): AvatarMember[] {
    const byUid = new Map<string, AvatarMember>();
    for (const member of this.options.members.values()) {
      if (!member.uid || this.attempted.has(member.uid)) continue;
      byUid.set(member.uid, member);
    }
    return [...byUid.values()];
  }

  schedule(delayMs = 0): void {
    if (!this.isCurrent() || this.timer !== null || this.batch !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, delayMs);
    this.timer.unref?.();
  }

  private async refresh(): Promise<void> {
    if (!this.isCurrent() || this.batch !== null) return;
    const batch = Symbol("avatar batch");
    this.batch = batch;
    const isCurrent = () => this.batch === batch && this.isCurrent();
    try {
      // Keep SDK file transfers sequential and retain the existing batch limit.
      for (const member of this.pendingMembers().slice(0, 50)) {
        if (!isCurrent()) return;
        if (this.options.members.get(member.id)?.uid !== member.uid) continue;
        this.attempted.add(member.uid);
        // A cache hit still needs its delivery to this session; only the
        // TeamSpeak download is skipped.
        const cached = this.options.cache.get(member.uid);
        if (cached) {
          this.options.publish(member.uid, cached);
          continue;
        }
        try {
          const loaded = await this.options.load(member.id, member.uid);
          if (!isCurrent()) return;
          const current = this.options.members.get(member.id);
          if (current?.uid !== member.uid) continue;
          const avatar = loaded && loaded.data.byteLength <= MAX_RELAY_AVATAR_BYTES ? avatarDataUrl(loaded.data) : null;
          if (avatar) {
            this.options.cache.set(member.uid, avatar);
            this.options.publish(member.uid, avatar);
          }
          // Absent, denied or oversized images store nothing: `attempted`
          // keeps them from retrying this session, and the next session
          // retries them by itself.
        } catch (error: unknown) {
          if (!isCurrent()) return;
          if (this.options.members.get(member.id)?.uid !== member.uid) continue;
          // Permission and file-transfer failures are optional, not join errors.
          this.options.onError(member.id, member.uid, error);
        }
      }
    } finally {
      // A late old batch must not clear a newer generation's running work.
      if (this.batch === batch) {
        this.batch = null;
        if (this.isCurrent() && this.pendingMembers().length) this.schedule(250);
      }
    }
  }

  reset(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.batch = null;
    // Failure state lives only in `attempted`, so clearing it makes the next
    // connection retry failed downloads while the shared cache keeps serving
    // positives without a second transfer.
    this.attempted.clear();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reset();
  }
}
