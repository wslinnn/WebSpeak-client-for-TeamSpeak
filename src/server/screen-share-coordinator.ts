import { randomUUID } from "node:crypto";
import type { Logger } from "../logger.js";
import type { TSClient, TSRawNotification } from "./ts-client.js";
import { buildTeamSpeakCommand } from "./screen-share-signals.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey, type TeamSpeakTarget } from "../domain/teamspeak-target.js";
import type { ServerMessage } from "../shared/server-messages.js";
import type { ChannelInfo } from "../shared/voice-models.js";
import type { ScreenShareClientMessage, ScreenShareStreamDescription, ScreenShareViewerDescription } from "../shared/screen-share.js";
import { handleScreenShareNotification, relayScreenShareSignal, screenStreamKey, type ScreenShareRelayHost, type ScreenStreamRecord } from "./screen-share-relay.js";
import { createScreenShareDiscovery } from "./screen-share-discovery.js";

export interface ScreenShareParticipant {
  id: string;
  screenPeerId: string;
  nickname: string;
  target: TeamSpeakTarget;
  members: ReadonlyMap<number, { uid?: string }>;
  channelTree: ChannelInfo[];
  tsClient: Pick<TSClient, "getClientId" | "getChannelId" | "isConnected" | "sendProtocolCommand">;
}

/** Coordinates channel-scoped browser/native sharing; media stays peer-to-peer. */
export class ScreenShareCoordinator {
  private readonly screenStreams = new Map<string, ScreenStreamRecord>();
  private readonly discovery: { discover: (entry: ScreenShareParticipant) => Promise<void> };
  /** The state surface the native relay paths (signaling + TS6 notifications)
   *  operate on; they live in screen-share-relay.ts. */
  private readonly relay: ScreenShareRelayHost;

  constructor(
    private readonly entries: ReadonlyMap<string, ScreenShareParticipant>,
    private readonly sendToEntry: (entryId: string, message: ServerMessage) => void,
    private readonly logger: Pick<Logger, "debug" | "warn">,
  ) {
    this.discovery = createScreenShareDiscovery(entries, logger);
    this.relay = {
      entries,
      screenStreams: this.screenStreams,
      sendToEntry,
      logger,
      viewerCount: (stream) => this.screenShareViewerCount(stream),
      broadcast: (stream, message, excludeEntryId) => this.broadcastScreenMessage(stream, message, excludeEntryId),
      describe: (stream) => this.describeScreenStream(stream),
      viewerCountMessage: (stream) => this.screenShareViewerCountMessage(stream),
      leave: (entry, stream) => this.leaveScreenStream(entry, stream),
      stop: (stream, reason) => this.stopScreenStream(stream, reason),
    };
  }

  handleMessage(
    entry: ScreenShareParticipant,
    message: ScreenShareClientMessage,
    sendJson: (message: ServerMessage) => void,
  ): void {
    if (message.type === "screenShareList") {
      sendJson({ type: "screenShareList", streams: this.listScreenStreamsFor(entry) });
      return;
    }

    if (message.type === "screenShareStart") {
      if ([...this.screenStreams.values()].some((stream) => stream.source === "browser" && stream.ownerEntryId === entry.id)) {
        sendJson({ type: "screenShareError", requestId: message.requestId, code: "SCREEN_SHARE_ALREADY_ACTIVE", message: "你已经在共享屏幕" });
        return;
      }
      const stream: ScreenStreamRecord = {
        streamId: `screen-${randomUUID()}`,
        source: "browser",
        ownerPeerId: entry.screenPeerId,
        ownerClientId: entry.tsClient.getClientId() || undefined,
        ownerNickname: entry.nickname,
        name: message.name?.trim() || `${entry.nickname} 的屏幕`,
        audio: message.audio === true,
        createdAt: Date.now(),
        viewerCount: 0,
        viewers: [],
        targetKey: teamSpeakTargetKey(entry.target),
        channelId: entry.tsClient.getChannelId(),
        ownerEntryId: entry.id,
        viewerEntryIds: new Map(),
        teamSpeakPublisherEntryId: entry.id,
        nativeViewerClids: new Set(),
      };
      this.screenStreams.set(screenStreamKey(stream.targetKey, stream.streamId), stream);
      sendJson({ type: "screenShareStarted", requestId: message.requestId, stream: this.describeScreenStream(stream), owner: true });
      this.broadcastScreenMessage(stream, {
        type: "screenShareStarted",
        stream: this.describeScreenStream(stream),
        owner: false,
      }, entry.id);
      void this.publishBrowserScreenStream(entry, stream);
      return;
    }

    const stream = this.screenStreams.get(screenStreamKey(teamSpeakTargetKey(entry.target), message.streamId));
    if (!stream) {
      sendJson({ type: "screenShareError", requestId: "requestId" in message ? message.requestId : undefined, code: "SCREEN_SHARE_NOT_FOUND", message: "屏幕共享已结束或不存在" });
      return;
    }
    if (stream.targetKey !== teamSpeakTargetKey(entry.target) || stream.channelId !== entry.tsClient.getChannelId()) {
      sendJson({ type: "screenShareError", requestId: "requestId" in message ? message.requestId : undefined, code: "SCREEN_SHARE_TARGET_MISMATCH", message: "屏幕共享不属于当前服务器或频道" });
      return;
    }

    if (message.type === "screenShareStop") {
      if (stream.ownerEntryId !== entry.id) {
        sendJson({ type: "screenShareError", requestId: message.requestId, code: "SCREEN_SHARE_NOT_OWNER", message: "只有共享者可以结束共享" });
        return;
      }
      this.stopScreenStream(stream, "owner-stopped");
      if (message.requestId) sendJson({ type: "screenShareCompleted", requestId: message.requestId });
      return;
    }

    if (message.type === "screenShareJoin") {
      if (stream.ownerEntryId === entry.id) {
        sendJson({ type: "screenShareError", requestId: message.requestId, code: "SCREEN_SHARE_OWNER_CANNOT_JOIN", message: "共享者不能作为观看者加入自己的共享" });
        return;
      }
      const alreadyJoined = stream.viewerEntryIds.has(entry.id);
      if (!alreadyJoined) stream.viewerEntryIds.set(entry.id, Symbol("screen-membership"));
      stream.viewerCount = this.screenShareViewerCount(stream);
      sendJson({
        type: "screenShareJoined",
        requestId: message.requestId,
        stream: this.describeScreenStream(stream),
        ownerPeerId: stream.ownerPeerId,
        mode: stream.source,
      });
      if (stream.source === "browser" && !alreadyJoined) {
        this.sendToEntry(stream.ownerEntryId, {
          type: "screenShareViewerJoined",
          streamId: stream.streamId,
          viewerPeerId: entry.screenPeerId,
          viewerNickname: entry.nickname,
        });
      } else if (stream.source === "teamspeak" && !alreadyJoined) {
        void this.joinNativeScreenStream(entry, stream, sendJson, message.requestId);
      }
      if (!alreadyJoined) {
        this.broadcastScreenMessage(stream, this.screenShareViewerCountMessage(stream));
      }
      return;
    }

    if (message.type === "screenShareLeave") {
      this.leaveScreenStream(entry, stream);
      if (message.requestId) sendJson({ type: "screenShareCompleted", requestId: message.requestId });
      return;
    }

    if (message.type === "screenShareSignal") {
      relayScreenShareSignal(this.relay, entry, stream, message.targetPeerId, message.signal, sendJson);
    }
  }

  private listScreenStreamsFor(entry: ScreenShareParticipant): ScreenShareStreamDescription[] {
    const targetKey = teamSpeakTargetKey(entry.target);
    return [...this.screenStreams.values()]
      .filter((stream) => stream.targetKey === targetKey && stream.channelId === entry.tsClient.getChannelId())
      .map((stream) => this.describeScreenStream(stream));
  }

  discoverExistingStreams(entry: ScreenShareParticipant): Promise<void> {
    return this.discovery.discover(entry);
  }

  private describeScreenStream(stream: ScreenStreamRecord): ScreenShareStreamDescription {
    return {
      streamId: stream.streamId,
      source: stream.source,
      ownerPeerId: stream.ownerPeerId,
      ...(typeof stream.ownerClientId === "number" ? { ownerClientId: stream.ownerClientId } : {}),
      ownerNickname: stream.ownerNickname,
      name: stream.name,
      audio: stream.audio,
      createdAt: stream.createdAt,
      viewerCount: stream.viewerCount,
      viewers: this.describeScreenViewers(stream),
    };
  }

  private describeScreenViewers(stream: ScreenStreamRecord): ScreenShareViewerDescription[] {
    // The roster rides on every viewer-count broadcast. Keeping base64 avatars
    // out of it holds each broadcast to nicknames only instead of scaling with
    // the largest avatar in the channel.
    return [...stream.viewerEntryIds.keys()]
      .map((entryId) => this.entries.get(entryId))
      .filter((entry): entry is ScreenShareParticipant => Boolean(entry))
      .slice(0, 64)
      .map((entry) => ({
        peerId: entry.screenPeerId,
        nickname: entry.nickname,
      }));
  }

  private screenShareViewerCountMessage(stream: ScreenStreamRecord): ServerMessage {
    return {
      type: "screenShareViewerCount",
      streamId: stream.streamId,
      viewerCount: stream.viewerCount,
      viewers: this.describeScreenViewers(stream),
    };
  }

  private screenShareViewerCount(stream: ScreenStreamRecord): number {
    return stream.viewerEntryIds.size + stream.nativeViewerClids.size;
  }

  private broadcastScreenMessage(stream: ScreenStreamRecord, message: ServerMessage, excludeEntryId?: string): void {
    for (const candidate of this.entries.values()) {
      if (candidate.id === excludeEntryId || candidate.target && teamSpeakTargetKey(candidate.target) !== stream.targetKey) continue;
      // A stream is scoped to the source channel. Do not leak its card or
      // viewer roster to users who are connected to another channel on the
      // same TeamSpeak target.
      if (candidate.id !== stream.ownerEntryId) {
        try {
          if (candidate.tsClient.getChannelId() !== stream.channelId) continue;
        } catch {
          continue;
        }
      }
      this.sendToEntry(candidate.id, message);
    }
  }

  private stopScreenStream(stream: ScreenStreamRecord, reason: string): void {
    if (!this.screenStreams.delete(screenStreamKey(stream.targetKey, stream.streamId))) return;
    if (stream.source === "browser" && stream.teamSpeakStreamId && stream.teamSpeakPublisherEntryId) {
      const publisher = this.entries.get(stream.teamSpeakPublisherEntryId);
      if (publisher) {
        void publisher.tsClient.sendProtocolCommand(buildTeamSpeakCommand("stopstream", {
          id: stream.teamSpeakStreamId,
          reason: "1",
        })).catch((error: unknown) => {
          this.logger.warn({ streamId: stream.teamSpeakStreamId, err: error instanceof Error ? error.message : String(error) }, "Could not stop native screen publication");
        });
      }
    }
    const message: ServerMessage = { type: "screenShareStopped", streamId: stream.streamId, reason };
    this.broadcastScreenMessage(stream, message);
    stream.viewerEntryIds.clear();
    stream.nativeViewerClids.clear();
    stream.viewerCount = 0;
  }

  private leaveScreenStream(entry: ScreenShareParticipant, stream: ScreenStreamRecord): void {
    if (!stream.viewerEntryIds.delete(entry.id)) return;
    stream.viewerCount = this.screenShareViewerCount(stream);
    if (stream.source === "browser") this.sendToEntry(stream.ownerEntryId, { type: "screenShareViewerLeft", streamId: stream.streamId, viewerPeerId: entry.screenPeerId });
    else {
      void entry.tsClient.sendProtocolCommand(buildTeamSpeakCommand("removeclientfromstream", {
        id: stream.streamId,
        clid: String(entry.tsClient.getClientId()),
        reason: "1",
      })).catch(() => undefined);
    }
    this.sendToEntry(entry.id, { type: "screenShareLeft", streamId: stream.streamId });
    this.broadcastScreenMessage(stream, this.screenShareViewerCountMessage(stream));
  }

  private async publishBrowserScreenStream(entry: ScreenShareParticipant, stream: ScreenStreamRecord): Promise<void> {
    try {
      await entry.tsClient.sendProtocolCommand(buildTeamSpeakCommand("setupstream", {
        name: stream.name,
        type: "3",
        bitrate: "4608",
        accessibility: "1",
        mode: "1",
        viewer_limit: "0",
        audio: stream.audio ? "1" : "0",
      }));
    } catch (error: unknown) {
      this.logger.warn({
        target: formatTeamSpeakTarget(entry.target),
        streamId: stream.streamId,
        err: error instanceof Error ? error.message : String(error),
      }, "Could not publish browser screen share to TeamSpeak");
    }
  }

  private async joinNativeScreenStream(
    entry: ScreenShareParticipant,
    stream: ScreenStreamRecord,
    sendJson: (message: ServerMessage) => void,
    requestId?: string,
  ): Promise<void> {
    const membership = stream.viewerEntryIds.get(entry.id);
    const sourceClientId = stream.sourceClientId;
    if (!entry.tsClient.getClientId() || !sourceClientId) {
      sendJson({ type: "screenShareError", requestId, code: "SCREEN_SHARE_SOURCE_UNAVAILABLE", message: "共享来源暂不可用" });
      return;
    }
    try {
      await entry.tsClient.sendProtocolCommand(buildTeamSpeakCommand("joinstreamrequest", {
        id: stream.streamId,
        // TS6 uses the source client id on joinstreamrequest. The requesting
        // gateway session is identified later by the response/signaling
        // notification delivered to this TS connection.
        clid: String(sourceClientId),
        msg: "",
        is_remove: "0",
        muted: "0",
        volume: "0",
        hidden: "0",
      }));
    } catch (error: unknown) {
      if (this.entries.get(entry.id) !== entry
        || this.screenStreams.get(screenStreamKey(stream.targetKey, stream.streamId)) !== stream
        || stream.viewerEntryIds.get(entry.id) !== membership) return;
      this.leaveScreenStream(entry, stream);
      sendJson({ type: "screenShareError", requestId, code: "SCREEN_SHARE_JOIN_FAILED", message: error instanceof Error ? error.message : "无法加入屏幕共享" });
    }
  }

  removePeer(entryId: string): void {
    for (const stream of [...this.screenStreams.values()]) {
      if (stream.ownerEntryId === entryId) {
        this.stopScreenStream(stream, "owner-disconnected");
        continue;
      }
      const entry = this.entries.get(entryId);
      if (entry && stream.viewerEntryIds.has(entryId)) this.leaveScreenStream(entry, stream);
    }
    const departing = this.entries.get(entryId);
    if (!departing) return;
    const targetKey = teamSpeakTargetKey(departing.target);
    if (![...this.entries.values()].some(entry => entry.id !== entryId && teamSpeakTargetKey(entry.target) === targetKey)) {
      // Native notifications are not observed while no session is attached.
      // Rediscover on the next connection instead of retaining stale cards.
      for (const stream of [...this.screenStreams.values()]) {
        if (stream.targetKey === targetKey) this.stopScreenStream(stream, "target-disconnected");
      }
    }
  }

  onClientMove(entry: ScreenShareParticipant, movedClientId: number, targetChannelId: bigint): void {
    const targetKey = teamSpeakTargetKey(entry.target);
    const selfMoved = movedClientId === entry.tsClient.getClientId();
    for (const stream of [...this.screenStreams.values()]) {
      if (stream.targetKey !== targetKey) continue;
      // A browser share belongs to the gateway user's current channel. Stop
      // it when that user moves so existing viewers cannot keep a cross-
      // channel peer alive.
      if (selfMoved && stream.source === "browser" && stream.ownerEntryId === entry.id && stream.channelId !== targetChannelId) {
        this.stopScreenStream(stream, "owner-moved-channel");
        continue;
      }
      // Native TS6 shares are channel-scoped as well. The notification is
      // observed by every gateway session, so stop the shared record once the
      // native source changes channels.
      if (stream.source === "teamspeak" && stream.sourceClientId === movedClientId && stream.channelId !== targetChannelId) {
        this.stopScreenStream(stream, "source-moved-channel");
        continue;
      }
      if (selfMoved && stream.viewerEntryIds.has(entry.id) && stream.channelId !== targetChannelId) {
        this.leaveScreenStream(entry, stream);
      }
    }
  }

  onClientLeave(entry: ScreenShareParticipant, clientId: number): void {
    const targetKey = teamSpeakTargetKey(entry.target);
    for (const stream of [...this.screenStreams.values()]) {
      if (stream.targetKey === targetKey && stream.source === "teamspeak" && stream.sourceClientId === clientId) {
        this.stopScreenStream(stream, "source-left");
      }
    }
  }

  handleNotification(entry: ScreenShareParticipant, notification: TSRawNotification): void {
    handleScreenShareNotification(this.relay, entry, notification);
  }
}
