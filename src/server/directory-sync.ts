import type { TSDirectoryClient, TSDirectorySnapshot } from "./ts-client.js";

type DirectoryDelta =
  | { type: "clientEnter"; info: TSDirectoryClient }
  | { type: "clientLeave"; id: number }
  | { type: "clientMoved"; id: number; channelID: bigint }
  | { type: "clientUpdated"; id: number; changes: Partial<TSDirectoryClient> }
  | { type: "clientListSnapshot"; clients: TSDirectoryClient[] };

/**
 * Merges staged welcome snapshots with events received while the snapshot is
 * in flight. Some TS6 welcome data arrives in more than one partial snapshot,
 * so a later snapshot must not hide clients that were present in an earlier
 * one. Explicit leave events remain authoritative removals.
 */
export class DirectorySynchronizer {
  private snapshot: TSDirectorySnapshot | null = null;
  private clients = new Map<number, TSDirectoryClient>();
  // A delayed welcome snapshot or update must not undo an explicit leave.
  // Client IDs can be reused, so a new enter event releases the tombstone.
  private departedClientIds = new Set<number>();
  private pending: DirectoryDelta[] = [];

  get ready(): boolean {
    return this.snapshot !== null;
  }

  applySnapshot(snapshot: TSDirectorySnapshot): void {
    this.snapshot = { channels: snapshot.channels.slice(), clients: [] };
    for (const client of snapshot.clients) {
      if (this.departedClientIds.has(client.id)) continue;
      const previous = this.clients.get(client.id);
      this.clients.set(client.id, previous ? { ...previous, ...client } : client);
    }
    const pending = this.pending.splice(0);
    for (const delta of pending) this.applyDelta(delta);
  }

  applyClientEnter(info: TSDirectoryClient): void {
    this.applyOrQueue({ type: "clientEnter", info });
  }

  applyClientLeave(id: number): void {
    this.applyOrQueue({ type: "clientLeave", id });
  }

  applyClientMoved(id: number, channelID: bigint): void {
    this.applyOrQueue({ type: "clientMoved", id, channelID });
  }

  /**
   * Merges one notifyclientupdated diff (only the keys the notification
   * carried) into the directory and reports whether the client's channel
   * changed (报告 21 F3 二级：频道未变时调用方可走字段级增量，频道变更仍走
   * clientMoved 权威路径的全量重建）。快照未就绪（事件入队）时无视图可增量，
   * 按未变化返回且 merged 为 null——成员此时必然同样未知，调用方走全量刷新。
   * 返回的 merged 是合并后的完整成员，供字段级增量直接消费。
   */
  applyClientUpdated(id: number, changes: Partial<TSDirectoryClient>): { merged: TSDirectoryClient | null; channelChanged: boolean } {
    if (!this.snapshot || this.departedClientIds.has(id)) {
      this.applyOrQueue({ type: "clientUpdated", id, changes });
      return { merged: null, channelChanged: false };
    }
    const current = this.clients.get(id);
    if (!current) return { merged: null, channelChanged: false };
    const channelChanged = changes.channelID !== undefined && changes.channelID !== current.channelID;
    const merged: TSDirectoryClient = { ...current, ...changes };
    this.clients.set(id, merged);
    return { merged, channelChanged };
  }

  applyClientListSnapshot(clients: TSDirectoryClient[]): void {
    this.applyOrQueue({ type: "clientListSnapshot", clients });
  }

  getSnapshot(): TSDirectorySnapshot | null {
    if (!this.snapshot) return null;
    return {
      channels: this.snapshot.channels.slice(),
      clients: [...this.clients.values()],
    };
  }

  clear(): void {
    this.snapshot = null;
    this.clients.clear();
    this.departedClientIds.clear();
    this.pending = [];
  }

  private applyOrQueue(delta: DirectoryDelta): void {
    if (!this.snapshot) {
      if (this.pending.length < 4096) this.pending.push(delta);
      return;
    }
    this.applyDelta(delta);
  }

  private applyDelta(delta: DirectoryDelta): void {
    if (delta.type === "clientEnter") {
      this.departedClientIds.delete(delta.info.id);
      this.clients.set(delta.info.id, delta.info);
      return;
    }
    if (delta.type === "clientLeave") {
      this.departedClientIds.add(delta.id);
      this.clients.delete(delta.id);
      return;
    }
    if (delta.type === "clientUpdated") {
      if (this.departedClientIds.has(delta.id)) return;
      const current = this.clients.get(delta.id);
      // A present key carries the new value — including an undefined one,
      // which the server sent to clear the property.
      if (current) this.clients.set(delta.id, { ...current, ...delta.changes });
      return;
    }
    if (delta.type === "clientListSnapshot") {
      for (const info of delta.clients) {
        // An authoritative pull adds members the event stream missed, enriches
        // known ones, and must not resurrect someone who left while the
        // asynchronous list request was in flight.
        if (this.departedClientIds.has(info.id)) continue;
        const current = this.clients.get(info.id);
        this.clients.set(info.id, current ? { ...current, ...info } : info);
      }
      return;
    }
    const current = this.clients.get(delta.id);
    if (current) this.clients.set(delta.id, { ...current, channelID: delta.channelID });
  }
}
