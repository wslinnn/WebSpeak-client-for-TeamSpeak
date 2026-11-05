import type { ClientChanges, ClientEntry, ClientUpdatedEvent } from "@honeybbq/teamspeak";
import type { TSChannelListing } from "./ts-client-protocol.js";

/** Gateway-owned directory member shape (the historical SDK
 *  DirectoryClientInfo): the upstream ClientEntry carries branded ids and a
 *  different status-field vocabulary, so the boundary adapts here and the
 *  session projection code stays untouched. */
export interface TSDirectoryClient {
  id: number;
  nickname: string;
  uid: string;
  channelID: bigint;
  type: number;
  serverGroups: string[];
  away?: boolean;
  awayMessage?: string;
  inputMuted?: boolean;
  outputMuted?: boolean;
  channelCommander?: boolean;
}

export interface TSDirectoryChannel {
  id: bigint;
  parentID: bigint;
  /** ID of the sibling channel after which this channel is placed. */
  order: bigint;
  name: string;
  description: string;
  passwordProtected?: boolean;
}

export interface TSDirectorySnapshot {
  channels: TSDirectoryChannel[];
  clients: TSDirectoryClient[];
}

/** Adapt a full SDK client row (clientEnter / clientlist) to the gateway shape. */
export function toTSDirectoryClient(entry: ClientEntry): TSDirectoryClient {
  return {
    id: entry.id,
    nickname: entry.nickname,
    uid: entry.uid ?? "",
    channelID: entry.channelID,
    type: entry.type,
    serverGroups: [...(entry.serverGroups ?? [])].map(String),
    ...(entry.isAway !== undefined ? { away: entry.isAway } : {}),
    ...(entry.awayMessage !== undefined ? { awayMessage: entry.awayMessage } : {}),
    ...(entry.isInputMuted !== undefined ? { inputMuted: entry.isInputMuted } : {}),
    ...(entry.isOutputMuted !== undefined ? { outputMuted: entry.isOutputMuted } : {}),
    ...(entry.isChannelCommander !== undefined ? { channelCommander: entry.isChannelCommander } : {}),
  };
}

/**
 * Adapt a notifyclientupdated diff to the gateway shape. Only keys the
 * notification carried are set: an absent key means "unchanged", a present
 * key carries the new value. `channelID` reaches the gateway even though
 * clientMoved is the authoritative move path — a group or name change may
 * travel on the same notification.
 */
export function toDirectoryClientChanges(event: ClientUpdatedEvent): Partial<TSDirectoryClient> & { id: number } {
  const changes = event.changes as ClientChanges;
  const info: Partial<TSDirectoryClient> & { id: number } = { id: event.clientID };
  if ("nickname" in changes && changes.nickname !== undefined) info.nickname = changes.nickname;
  if ("uid" in changes && changes.uid !== undefined) info.uid = changes.uid;
  if ("channelID" in changes && changes.channelID !== undefined) info.channelID = BigInt(changes.channelID);
  if ("serverGroups" in changes && changes.serverGroups !== undefined) info.serverGroups = [...changes.serverGroups].map(String);
  if ("isAway" in changes && changes.isAway !== undefined) info.away = changes.isAway;
  if ("awayMessage" in changes && changes.awayMessage !== undefined) info.awayMessage = changes.awayMessage;
  if ("isInputMuted" in changes && changes.isInputMuted !== undefined) info.inputMuted = changes.isInputMuted;
  if ("isOutputMuted" in changes && changes.isOutputMuted !== undefined) info.outputMuted = changes.isOutputMuted;
  if ("isChannelCommander" in changes && changes.isChannelCommander !== undefined) info.channelCommander = changes.isChannelCommander;
  return info;
}

/** Channel-tree refresh burst window: typed channel events coalesce into one
 *  authoritative `channellist` pull (人类操作节奏，突发合并一次全量）。 */
const CHANNEL_REFRESH_DEBOUNCE_MS = 150;

/**
 * The gateway's own channel tree. The upstream SDK dropped its
 * directorySnapshot event, so the tree is reconciled from raw channellist
 * rows and kept current by typed channel events, which coalesce into one
 * authoritative pull through this store's debounce.
 */
export class ChannelTreeStore {
  private readonly channels = new Map<bigint, TSDirectoryChannel>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    /** The session's public password flags by channel id (rawNotification path). */
    private readonly flags: () => ReadonlyMap<bigint, boolean>,
    /** One authoritative listing; a failed pull keeps the previous tree. */
    private readonly pull: () => Promise<TSChannelListing>,
    private readonly isCurrent: () => boolean,
    /** Connection generation; a pull must not publish across generations. */
    private readonly generation: () => number,
    /** Snapshot emission hook; receives flag-decorated channels. */
    private readonly onSnapshot: (channels: TSDirectoryChannel[]) => void,
    private readonly onRefreshError: (error: unknown) => void,
  ) {}

  /** Replace the tree with an authoritative listing (connect reconcile). */
  applyListing(listing: TSChannelListing): void {
    this.channels.clear();
    for (const channel of listing.channels) this.channels.set(channel.id, channel);
  }

  /** Flag-decorated channels in server order. */
  decorated(): TSDirectoryChannel[] {
    const flags = this.flags();
    if (!flags.size) return [...this.channels.values()];
    return [...this.channels.values()].map((channel) => {
      const passwordProtected = flags.get(channel.id);
      return passwordProtected === undefined ? channel : { ...channel, passwordProtected };
    });
  }

  /**
   * Typed channel events coalesce into one authoritative channellist pull:
   * the SDK's typed changes carry no description (bandwidth) and the lock
   * flags arrive on the same rows, so a single request rebuilds the whole
   * tree through one mapping path instead of chasing partial diffs.
   */
  scheduleRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshNow();
    }, CHANNEL_REFRESH_DEBOUNCE_MS);
  }

  private async refreshNow(): Promise<void> {
    if (!this.isCurrent()) return;
    const generation = this.generation();
    try {
      const listing = await this.pull();
      if (!this.isCurrent() || this.generation() !== generation) return;
      this.applyListing(listing);
      this.onSnapshot(this.decorated());
    } catch (error: unknown) {
      if (this.isCurrent() && this.generation() === generation) this.onRefreshError(error);
    }
  }

  clear(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.channels.clear();
  }
}
