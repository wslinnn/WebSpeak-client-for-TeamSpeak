import type { TSClientAvatar } from "./ts-client.js";

/** 同一 uid 的定向重载冷却：notifyclientupdated 可短时连发，防止打爆
 *  TeamSpeak 文件传输通道。 */
const RELOAD_COOLDOWN_MS = 10_000;

interface AvatarMember {
  id: number;
  uid: string;
}

export interface MemberAvatarOptions {
  members: ReadonlyMap<number, AvatarMember>;
  /** Capability URL for a cached avatar; null when the uid has no bytes. */
  avatarUrl(uid: string): string | null;
  /** Validates, hashes and caches downloaded bytes; false rejects unusable
   *  or oversized images. */
  store(uid: string, data: Buffer): boolean;
  isCurrent(): boolean;
  load(id: number, uid: string): Promise<TSClientAvatar | null>;
  publish(uid: string, url: string): void;
  onError(id: number, uid: string, error: unknown): void;
}

/**
 * Optional SDK downloads belong to one connected directory generation. The
 * loader only moves bytes from TeamSpeak into the shared AvatarService —
 * delivery to views is URL-shaped and therefore cheap and idempotent: every
 * view (re)attachment sends the cached snapshot (`snapshot()`) and every
 * completed download pushes one update. Download attempts are tracked
 * view-locally in `attempted`: "absent" means TeamSpeak has no image for the
 * identity (or it was unusable) and retrying is pointless, "error" means the
 * transfer failed and the next attachment tries once more. Nothing here
 * tracks which view has seen what — the snapshot is always the full set.
 */
export class MemberAvatarLoader {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private batch: symbol | null = null;
  private readonly attempted = new Map<string, "absent" | "error">();
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private reloadBatch: symbol | null = null;
  private readonly reloadPending = new Set<string>();
  private readonly reloadCooldown = new Map<string, number>();
  private closed = false;

  constructor(private readonly options: MemberAvatarOptions) {}

  private isCurrent(): boolean {
    return !this.closed && this.options.isCurrent();
  }

  /** View (re)attachment payload: the cached URL set for every visible
   *  member. The snapshot is idempotent and tiny, so re-sending it on every
   *  attach cannot miss anyone and tracks no per-view state. */
  snapshot(): Array<{ uid: string; url: string }> {
    const items: Array<{ uid: string; url: string }> = [];
    if (!this.isCurrent()) return items;
    for (const member of this.options.members.values()) {
      if (!member.uid) continue;
      const url = this.options.avatarUrl(member.uid);
      if (url) items.push({ uid: member.uid, url });
    }
    return items;
  }

  /** View (re)attachment: the TeamSpeak file-transfer port may have recovered
   *  since a transfer failed, so error-class identities get one more try;
   *  true absents keep their verdict. */
  retryFailedDownloads(): void {
    for (const [uid, outcome] of this.attempted) {
      if (outcome === "error") this.attempted.delete(uid);
    }
  }

  schedule(delayMs = 0): void {
    if (!this.isCurrent() || this.timer !== null || this.batch !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, delayMs);
    this.timer.unref?.();
  }

  private pendingDownloads(): AvatarMember[] {
    const byUid = new Map<string, AvatarMember>();
    for (const member of this.options.members.values()) {
      if (!member.uid || this.attempted.has(member.uid)) continue;
      // Cached identities are already served by the snapshot; only bytes the
      // gateway lacks need a TeamSpeak transfer.
      if (this.options.avatarUrl(member.uid)) continue;
      byUid.set(member.uid, member);
    }
    return [...byUid.values()];
  }

  private async refresh(): Promise<void> {
    if (!this.isCurrent() || this.batch !== null) return;
    const batch = Symbol("avatar batch");
    this.batch = batch;
    const isCurrent = () => this.batch === batch && this.isCurrent();
    try {
      // Keep SDK file transfers sequential and retain the existing batch limit.
      for (const member of this.pendingDownloads().slice(0, 50)) {
        if (!isCurrent()) return;
        if (this.options.members.get(member.id)?.uid !== member.uid) continue;
        try {
          const loaded = await this.options.load(member.id, member.uid);
          if (!isCurrent()) return;
          const current = this.options.members.get(member.id);
          if (current?.uid !== member.uid) continue;
          const stored = loaded !== null && this.options.store(member.uid, loaded.data);
          if (stored) {
            this.attempted.delete(member.uid);
            const url = this.options.avatarUrl(member.uid);
            if (url) this.options.publish(member.uid, url);
          } else {
            // Absent, denied or unusable: retrying cannot help this view.
            this.attempted.set(member.uid, "absent");
          }
        } catch (error: unknown) {
          if (!isCurrent()) return;
          if (this.options.members.get(member.id)?.uid !== member.uid) continue;
          // Permission and file-transfer failures are optional, not join errors.
          this.attempted.set(member.uid, "error");
          this.options.onError(member.id, member.uid, error);
        }
      }
    } finally {
      // A late old batch must not clear a newer generation's running work.
      if (this.batch === batch) {
        this.batch = null;
        if (this.isCurrent() && this.pendingDownloads().length) this.schedule(250);
      }
    }
  }

  /** 25 号一期：目录通知携带头像标志时的定向重载。绕过 attempted 台账与
   *  「已有 URL 跳过」的去重（头像可能已更换，字节变了内容 hash 才会变），
   *  per-uid 冷却防 notify 风暴；与常规批共用 batch 槽位防并发传输。 */
  scheduleReload(uid: string, delayMs = 0): void {
    if (this.closed || !uid) return;
    const now = Date.now();
    if (now - (this.reloadCooldown.get(uid) ?? 0) < RELOAD_COOLDOWN_MS) return;
    this.reloadCooldown.set(uid, now);
    this.attempted.delete(uid);
    this.reloadPending.add(uid);
    if (this.reloadTimer !== null) return;
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.runReloadBatch();
    }, delayMs);
    this.reloadTimer.unref?.();
  }

  private async runReloadBatch(): Promise<void> {
    if (this.closed || this.batch !== null || this.reloadPending.size === 0) {
      // 常规批占用时稍后重试，避免丢弃待重载身份。
      if (this.reloadPending.size > 0) this.scheduleReload([...this.reloadPending][0], 250);
      return;
    }
    const batch = Symbol("avatar reload batch");
    this.batch = batch;
    const isCurrent = () => this.batch === batch && this.isCurrent();
    const uids = [...this.reloadPending];
    this.reloadPending.clear();
    try {
      for (const uid of uids) {
        if (!isCurrent()) return;
        const member = [...this.options.members.values()].find((candidate) => candidate.uid === uid);
        if (!member) continue;
        try {
          const loaded = await this.options.load(member.id, member.uid);
          if (!isCurrent()) return;
          const stored = loaded !== null && this.options.store(uid, loaded.data);
          if (stored) {
            const url = this.options.avatarUrl(uid);
            if (url) this.options.publish(uid, url);
          } else {
            this.attempted.set(uid, "absent");
          }
        } catch (error: unknown) {
          if (!isCurrent()) return;
          this.attempted.set(uid, "error");
          this.options.onError(member.id, uid, error);
        }
      }
    } finally {
      if (this.batch === batch) this.batch = null;
    }
  }

  reset(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.reloadTimer !== null) clearTimeout(this.reloadTimer);
    this.timer = null;
    this.reloadTimer = null;
    this.batch = null;
    this.reloadPending.clear();
    this.reloadCooldown.clear();
    // The ledger is view-local: a new TeamSpeak connection retries absent
    // identities (the member may have set an avatar) and errored transfers
    // alike, while the shared cache keeps serving positives without a second
    // transfer.
    this.attempted.clear();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reset();
  }
}
