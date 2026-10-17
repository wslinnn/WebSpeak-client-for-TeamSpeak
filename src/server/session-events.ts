import type { ClientInfo } from "@echosixhiya/teamspeak-client";
import type { EventEmitter } from "node:events";
import type { WebSpeakError } from "../errors.js";
import type { ChannelInfo, ChannelMember } from "../shared/voice-models.js";
import type { ServerMessage } from "../shared/server-messages.js";
import { DirectorySynchronizer } from "./directory-sync.js";
import { mapChannelTree, normalizeDirectorySnapshot } from "./directory-view.js";
import { MemberAvatarLoader } from "./member-avatars.js";
import type { TSClient, TSChatMessage, TSDirectoryClient, TSDirectorySnapshot, TSRawNotification, TSVoiceData } from "./ts-client.js";

type SessionMember = ChannelMember & { uid: string };

/** F3 一级（报告 21/23）：clientUpdated 走不了字段级增量时的本地重建合并窗口。 */
const CLIENT_UPDATED_WINDOW_MS = 200;
/** F3 二级：每累计 N 次增量补丁拉一次全量 clientlist，字段语义漂移在此自愈。 */
const UPDATE_PATCH_CALIBRATION_INTERVAL = 50;

export interface SessionDirectoryState {
  channelTree: ChannelInfo[];
  members: Map<number, SessionMember>;
  whisperTargetIds: Set<number>;
  whisperActive: boolean;
}

interface SdkEvents {
  directorySnapshot: TSDirectorySnapshot;
  clientEnter: ClientInfo;
  clientLeave: { id: number };
  clientMoved: { id: number; targetChannelID?: bigint };
  clientUpdated: TSDirectoryClient;
  directoryClientsSnapshot: TSDirectoryClient[];
  rawNotification: TSRawNotification;
  voiceData: TSVoiceData;
  textMessage: TSChatMessage;
  poked: { invokerID: number; invokerUID: string; invokerName: string; message: string };
  kicked: WebSpeakError;
  disconnected: Error | undefined;
}

export interface SessionEventOptions {
  state: SessionDirectoryState;
  client: Pick<TSClient, "getClientId" | "getChannelId" | "getClientAvatar"> & Partial<Pick<TSClient, "refreshDirectoryClients">> & Pick<EventEmitter, "on" | "off">;
  /** Shared avatar publication: URL lookups over the cross-session cache. */
  avatars: { url(uid: string): string | null; store(uid: string, data: Buffer): boolean };
  nickname: string;
  requestedChannel?: string;
  isCurrent(): boolean;
  acceptsDirectory(): boolean;
  isPublished(): boolean;
  isConnected(): boolean;
  sendJson(message: ServerMessage): void;
  addEvent(kind: "joined" | "left" | "moved" | "poke", message: string): void;
  onDirectoryReady(): void;
  onClientLeave(id: number): void;
  onClientMove(id: number, channelId: bigint): void;
  onNotification(notification: TSRawNotification): void;
  onVoice(data: TSVoiceData): void;
  onKick(error: WebSpeakError): void;
  onDisconnect(error?: Error): void;
  onAvatarError(id: number, uid: string, error: unknown): void;
}

/** SDK listeners, directory projection and optional work owned by one session. */
export class SessionEventCoordinator {
  private readonly directory = new DirectorySynchronizer();
  private readonly avatars: MemberAvatarLoader;
  private readonly subscriptions: Array<() => void> = [];
  private closed = false;
  private clientId = 0;
  private channelId = 0n;
  private directoryStatusRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private directoryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private directoryRefreshWindow: { previousTree: ChannelInfo[]; previousMembers: ReadonlyMap<number, SessionMember> } | null = null;
  private incrementalPatchCount = 0;

  constructor(private readonly options: SessionEventOptions) {
    const { state, client } = options;
    this.avatars = new MemberAvatarLoader({
      members: state.members,
      avatarUrl: uid => options.avatars.url(uid),
      store: (uid, data) => options.avatars.store(uid, data),
      isCurrent: () => this.isCurrent() && options.isConnected(),
      load: (id, uid) => client.getClientAvatar(id, uid),
      publish: (uid, url) => options.sendJson({ type: "avatarUpdate", uid, url }),
      onError: options.onAvatarError,
    });
    // Subscribe before connect(): welcome events may precede the first snapshot.
    this.listenDirectory("directorySnapshot", snapshot => {
      this.flushPendingDirectoryRefresh();
      const previousTree = state.channelTree;
      const previousMembers = new Map(state.members);
      this.directory.applySnapshot(snapshot);
      this.refresh();
      this.trackChannelEvents(previousTree);
      const wasPublished = this.options.isPublished();
      options.onDirectoryReady();
      // sendInitialState answers the first snapshot with the one full channel
      // list a connection ever receives; a delta right after it would repeat
      // every member. Later snapshots continue with deltas only.
      if (wasPublished) this.publishDelta(previousTree, previousMembers);
      this.avatars.schedule();
    });
    this.listenDirectory("clientEnter", info => {
      this.flushPendingDirectoryRefresh();
      const previousTree = state.channelTree;
      const previousMembers = new Map(state.members);
      const candidateSelfId = client.getClientId();
      if (candidateSelfId > 0 && info.id === candidateSelfId) {
        this.clientId = candidateSelfId;
        if (info.channelID !== undefined && info.channelID !== 0n) this.channelId = info.channelID;
      }
      const wasKnown = state.members.has(info.id);
      this.directory.applyClientEnter(info);
      this.refresh();
      if (this.directoryStatusRefreshTimer) clearTimeout(this.directoryStatusRefreshTimer);
      this.directoryStatusRefreshTimer = setTimeout(() => {
        this.directoryStatusRefreshTimer = null;
        void options.client.refreshDirectoryClients?.();
      }, 300);
      if (options.isPublished()) {
        this.publishDelta(previousTree, previousMembers);
        if (!wasKnown && info.id !== this.clientId) options.addEvent("joined", `${info.nickname || "未知用户"} 加入了服务器`);
        this.avatars.schedule();
      }
    });
    this.listenDirectory("clientLeave", info => {
      this.flushPendingDirectoryRefresh();
      options.onClientLeave(info.id);
      const member = state.members.get(info.id);
      const previousTree = state.channelTree;
      const previousMembers = new Map(state.members);
      this.directory.applyClientLeave(info.id);
      this.refresh();
      if (options.isPublished() && member) {
        this.publishDelta(previousTree, previousMembers);
        if (info.id !== this.clientId) options.addEvent("left", `${member.nickname || "用户"} 离开了服务器`);
      }
    });
    this.listenDirectory("clientMoved", info => {
      if (info.targetChannelID === undefined || info.targetChannelID === 0n) return;
      this.flushPendingDirectoryRefresh();
      options.onClientMove(info.id, info.targetChannelID);
      const member = state.members.get(info.id);
      const previousTree = state.channelTree;
      const previousMembers = new Map(state.members);
      if (info.id === this.clientId) this.channelId = info.targetChannelID;
      this.directory.applyClientMoved(info.id, info.targetChannelID);
      this.refresh();
      if (options.isPublished()) {
        this.publishDelta(previousTree, previousMembers);
        if (info.id !== this.clientId) options.addEvent("moved", `${member?.nickname || "用户"} 移动到了其他频道`);
      }
    });
    this.listenDirectory("clientUpdated", info => {
      // 注意：这里不 flush 挂起窗口——连续 update 就该并入同一窗口；其他目录
      // 事件的 flush-at-top 已保证跨事件类型的 delta 次序。
      const { merged, channelChanged } = this.directory.applyClientUpdated(info);
      const member = this.options.state.members.get(info.id);
      // 二级：成员已知、频道未变、且没有挂起的重建窗口 → 字段级增量直接改视图
      // 并下发 memberUpdated，不再全量 clientlist/重建。窗口挂起期间一律入窗：
      // 视图尚未反映前序变化时打补丁会发出与 flush 重复的 delta。频道变更
      // （走 clientMoved 权威路径）或成员未知 → 一级合并窗口内做一次本地重建。
      if (member && !channelChanged && !this.directoryRefreshTimer) {
        this.applyMemberUpdatePatch(member, merged);
        this.incrementalPatchCount++;
        if (this.incrementalPatchCount % UPDATE_PATCH_CALIBRATION_INTERVAL === 0) {
          // 周期校准：拉一次全量 clientlist——视图与 TS 真值的字段漂移经
          // directoryClientsSnapshot 自愈并以修正 delta 呈现。
          void this.options.client.refreshDirectoryClients?.();
        }
        return;
      }
      this.deferFullDirectoryRefresh();
    });
    this.listenDirectory("directoryClientsSnapshot", clients => {
      const previousTree = state.channelTree;
      const previousMembers = new Map(state.members);
      this.directory.applyClientListSnapshot(clients);
      this.refresh();
      this.publishDelta(previousTree, previousMembers);
    });
    this.listen("rawNotification", options.onNotification);
    this.listen("voiceData", options.onVoice);
    this.listen("textMessage", message => {
      const scope = message.targetMode === 1 ? "private" : message.targetMode === 2 ? "channel" : "server";
      const targetId = message.targetId ?? 0n;
      // Channel notifications can omit target; bind them to the current channel.
      const effectiveTargetId = scope === "channel" && targetId === 0n ? client.getChannelId() : targetId;
      options.sendJson({ type: "chatMessage", scope,
        ...(effectiveTargetId !== 0n ? { targetId: String(effectiveTargetId) } : {}),
        senderUid: message.invokerUid, timestamp: Date.now(), invokerName: message.invokerName,
        invokerId: message.invokerId, message: message.message,
      });
    });
    this.listen("poked", event => {
      options.sendJson({ type: "pokeReceived", invokerId: event.invokerID, invokerUid: event.invokerUID, invokerName: event.invokerName, message: event.message, timestamp: Date.now() });
      options.addEvent("poke", `${event.invokerName || "用户"} 戳了你一下`);
    });
    this.listen("kicked", options.onKick);
    this.listen("disconnected", options.onDisconnect);
  }

  get ready(): boolean { return this.directory.ready; }
  get selfId(): number { return this.clientId; }

  private isCurrent(): boolean { return !this.closed && this.options.isCurrent(); }

  private listen<K extends keyof SdkEvents>(name: K, handler: (data: SdkEvents[K]) => void): void {
    const listener = (data: SdkEvents[K]) => { if (this.isCurrent()) handler(data); };
    this.options.client.on(name, listener);
    this.subscriptions.push(() => this.options.client.off(name, listener));
  }

  private listenDirectory<K extends keyof SdkEvents>(name: K, handler: (data: SdkEvents[K]) => void): void {
    this.listen(name, data => { if (this.options.acceptsDirectory()) handler(data); });
  }

  syncSelf(): void {
    if (!this.isCurrent()) return;
    this.clientId = this.options.client.getClientId();
    const channelId = this.options.client.getChannelId();
    if (channelId !== 0n) this.channelId = channelId;
    this.refresh();
    if (this.clientId > 0 && !this.options.state.members.has(this.clientId)) {
      this.directory.applyClientEnter({ id: this.clientId, nickname: this.options.nickname, channelID: this.channelId, uid: "", type: 1, serverGroups: [] });
      this.refresh();
    }
  }

  /** View (re)attachment: one idempotent URL snapshot covers every visible
   *  member the cache can serve; transfer failures retry once; new downloads
   *  defer to the batch. */
  attachAvatars(): void {
    const snapshot = this.avatars.snapshot();
    if (snapshot.length) this.options.sendJson({ type: "avatarSnapshot", avatars: snapshot });
    this.avatars.retryFailedDownloads();
    this.avatars.schedule();
  }

  private refresh(): void {
    const snapshot = this.directory.getSnapshot();
    if (!snapshot) return;
    const { state, client } = this.options;
    const selfId = this.clientId || client.getClientId();
    const sdkChannelId = client.getChannelId();
    if (this.channelId === 0n && sdkChannelId !== 0n) this.channelId = sdkChannelId;
    const normalized = normalizeDirectorySnapshot(snapshot, selfId, this.channelId, this.options.nickname, this.options.requestedChannel);
    state.channelTree = mapChannelTree(normalized);
    state.members.clear();
    for (const member of normalized.clients) {
      state.members.set(member.id, { id: member.id, nickname: member.nickname, uid: member.uid,
        away: member.away, awayMessage: member.awayMessage,
        inputMuted: member.inputMuted, outputMuted: member.outputMuted, channelCommander: member.channelCommander,
      });
    }
    this.syncWhisperTargets();
  }

  /** Prunes whisper targets that lost their member (left, or became self) and
   *  publishes the change. Shared by the full rebuild and the incremental
   *  member patch so both paths keep identical target semantics. */
  private syncWhisperTargets(): void {
    const { state, client } = this.options;
    const previousTargets = [...state.whisperTargetIds].sort((a, b) => a - b);
    const selfId = this.clientId || client.getClientId();
    for (const id of state.whisperTargetIds) {
      if (!state.members.has(id) || id === selfId) state.whisperTargetIds.delete(id);
    }
    if (!state.whisperTargetIds.size) state.whisperActive = false;
    const nextTargets = [...state.whisperTargetIds].sort((a, b) => a - b);
    if (this.options.isPublished() && (previousTargets.length !== nextTargets.length || previousTargets.some((id, index) => id !== nextTargets[index]))) {
      this.options.sendJson({ type: "whisperTargets", targetIds: nextTargets, active: state.whisperActive });
    }
  }

  /** F3 二级：把一次 clientUpdated 以字段级增量落到视图（members 与频道名册
   *  共享同一成员对象，引用替换）并下发 memberUpdated；通知未携带的字段
   *  （SDK 解析后为 undefined）按「未变化」跳过。 */
  private applyMemberUpdatePatch(member: SessionMember, merged: TSDirectoryClient): void {
    const changes: Partial<Pick<ChannelMember, "nickname" | "uid" | "away" | "awayMessage" | "inputMuted" | "outputMuted" | "channelCommander">> = {};
    if (merged.nickname !== undefined && merged.nickname !== member.nickname) changes.nickname = merged.nickname;
    if (merged.uid !== undefined && merged.uid !== member.uid) changes.uid = merged.uid;
    if (merged.away !== undefined && merged.away !== member.away) changes.away = merged.away;
    if (merged.awayMessage !== undefined && merged.awayMessage !== member.awayMessage) changes.awayMessage = merged.awayMessage;
    if (merged.inputMuted !== undefined && merged.inputMuted !== member.inputMuted) changes.inputMuted = merged.inputMuted;
    if (merged.outputMuted !== undefined && merged.outputMuted !== member.outputMuted) changes.outputMuted = merged.outputMuted;
    if (merged.channelCommander !== undefined && merged.channelCommander !== member.channelCommander) changes.channelCommander = merged.channelCommander;
    const { state } = this.options;
    if (Object.keys(changes).length) {
      const next: SessionMember = { ...member, ...changes };
      state.members.set(member.id, next);
      for (const channel of state.channelTree) {
        const position = channel.members?.findIndex(entry => entry.id === member.id) ?? -1;
        if (position >= 0 && channel.members) channel.members[position] = next;
      }
      if (this.options.isPublished()) this.options.sendJson({ type: "memberUpdated", id: member.id, ...changes });
    }
    this.syncWhisperTargets();
  }

  /** F3 一级：把一次走不了增量的 clientUpdated 并入 200ms 合并窗口——窗口内
   *  多条更新只做一次本地重建，delta 相对窗口起点计算，覆盖整窗变化。 */
  private deferFullDirectoryRefresh(): void {
    if (this.directoryRefreshTimer) return;
    this.directoryRefreshWindow = {
      previousTree: [...this.options.state.channelTree],
      previousMembers: new Map(this.options.state.members),
    };
    this.directoryRefreshTimer = setTimeout(() => {
      this.directoryRefreshTimer = null;
      this.flushPendingDirectoryRefresh();
    }, CLIENT_UPDATED_WINDOW_MS);
  }

  private flushPendingDirectoryRefresh(): void {
    if (this.directoryRefreshTimer) {
      clearTimeout(this.directoryRefreshTimer);
      this.directoryRefreshTimer = null;
    }
    const window = this.directoryRefreshWindow;
    if (!window) return;
    this.directoryRefreshWindow = null;
    this.refresh();
    this.publishDelta(window.previousTree, window.previousMembers);
  }

  /** Diffs the rebuilt directory against the caller's snapshot and sends only the changes. */
  private publishDelta(previousTree: ChannelInfo[], previousMembers: ReadonlyMap<number, SessionMember>): void {
    if (!this.options.isPublished()) return;
    const { state } = this.options;
    const deltas: ServerMessage[] = [];
    const previousChannels = new Map(previousTree.map(channel => [channel.id, channel]));
    for (const channel of state.channelTree) {
      const before = previousChannels.get(channel.id);
      if (!before) deltas.push({ type: "channelCreated", channel });
      else if (before.name !== channel.name || before.description !== channel.description) {
        deltas.push({ type: "channelUpdated", id: channel.id, name: channel.name, ...(channel.description ? { description: channel.description } : {}) });
      }
    }
    for (const channel of previousTree) {
      if (!state.channelTree.some(current => current.id === channel.id)) deltas.push({ type: "channelRemoved", id: channel.id });
    }

    const channelOfMember = (tree: ChannelInfo[], id: number): string | undefined =>
      tree.find(channel => channel.members?.some(member => member.id === id))?.id;
    const previousById = previousMembers;
    for (const member of state.members.values()) {
      const before = previousById.get(member.id);
      const channelId = channelOfMember(state.channelTree, member.id);
      if (!before) {
        deltas.push({ type: "memberEnter", id: member.id, nickname: member.nickname, uid: member.uid,
          isSelf: member.id === this.clientId, away: member.away, awayMessage: member.awayMessage,
          inputMuted: member.inputMuted, outputMuted: member.outputMuted, channelCommander: member.channelCommander,
          ...(channelId ? { channelId } : {}) });
        continue;
      }
      if (channelOfMember(previousTree, member.id) !== channelId) {
        deltas.push({ type: "memberMoved", id: member.id, ...(channelId ? { channelId } : {}) });
      }
      const changes: Partial<Pick<ChannelMember, "nickname" | "uid" | "away" | "awayMessage" | "inputMuted" | "outputMuted" | "channelCommander">> = {};
      if (before.nickname !== member.nickname) changes.nickname = member.nickname;
      if (before.uid !== member.uid) changes.uid = member.uid;
      if (before.away !== member.away) changes.away = member.away;
      if (before.awayMessage !== member.awayMessage) changes.awayMessage = member.awayMessage;
      if (before.inputMuted !== member.inputMuted) changes.inputMuted = member.inputMuted;
      if (before.outputMuted !== member.outputMuted) changes.outputMuted = member.outputMuted;
      if (before.channelCommander !== member.channelCommander) changes.channelCommander = member.channelCommander;
      if (Object.keys(changes).length) deltas.push({ type: "memberUpdated", id: member.id, ...changes });
    }
    for (const member of previousById.values()) {
      if (!state.members.has(member.id)) deltas.push({ type: "memberLeave", id: member.id });
    }
    for (const delta of deltas) this.options.sendJson(delta);
  }

  private trackChannelEvents(previous: ChannelInfo[]): void {
    if (!this.options.isPublished()) return;
    const before = new Map(previous.map(channel => [channel.id, channel]));
    const after = new Map(this.options.state.channelTree.map(channel => [channel.id, channel]));
    for (const channel of after.values()) {
      if (!before.has(channel.id)) this.options.addEvent("joined", `频道「${channel.name}」已创建`);
      else if (before.get(channel.id)?.name !== channel.name) this.options.addEvent("moved", `频道已重命名为「${channel.name}」`);
    }
    for (const channel of before.values()) if (!after.has(channel.id)) this.options.addEvent("left", `频道「${channel.name}」已删除`);
  }

  reset(): void {
    if (this.directoryStatusRefreshTimer) clearTimeout(this.directoryStatusRefreshTimer);
    this.directoryStatusRefreshTimer = null;
    if (this.directoryRefreshTimer) clearTimeout(this.directoryRefreshTimer);
    this.directoryRefreshTimer = null;
    this.directoryRefreshWindow = null;
    this.avatars.reset();
    this.clientId = 0;
    this.channelId = 0n;
    this.directory.clear();
    this.options.state.channelTree = [];
    this.options.state.members.clear();
    this.options.state.whisperTargetIds.clear();
    this.options.state.whisperActive = false;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.directoryStatusRefreshTimer) clearTimeout(this.directoryStatusRefreshTimer);
    this.directoryStatusRefreshTimer = null;
    if (this.directoryRefreshTimer) clearTimeout(this.directoryRefreshTimer);
    this.directoryRefreshTimer = null;
    this.directoryRefreshWindow = null;
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
    this.avatars.close();
    this.reset();
  }
}
