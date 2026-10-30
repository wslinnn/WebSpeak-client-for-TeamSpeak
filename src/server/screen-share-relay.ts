import type { Logger } from "../logger.js";
import { buildTeamSpeakCommand, nativeViewerPeerId, parseNativeViewerPeerId, parseNumber, parseStreamSignalPayload, toBrowserScreenSignal } from "./screen-share-signals.js";
import { teamSpeakTargetKey } from "../domain/teamspeak-target.js";
import type { ServerMessage } from "../shared/server-messages.js";
import type { ScreenSharePeerSignal, ScreenShareStreamDescription } from "../shared/screen-share.js";
import type { ScreenShareParticipant } from "./screen-share-coordinator.js";

export interface ScreenStreamRecord extends ScreenShareStreamDescription {
  targetKey: string;
  channelId: bigint;
  ownerEntryId: string;
  viewerEntryIds: Map<string, symbol>;
  sourceClientId?: number;
  /** The gateway TS client that publishes a browser-owned stream to TS6. */
  teamSpeakPublisherEntryId?: string;
  /** The TS6 stream id paired with a browser-owned WebSpeak stream. */
  teamSpeakStreamId?: string;
  /** Native TS6 viewer client ids paired with a browser-owned stream. */
  nativeViewerClids: Set<number>;
}

// Stream ids are scoped to a TeamSpeak server. Keep the target in the key so
// two unrelated servers cannot overwrite each other's native stream record.
export function screenStreamKey(targetKey: string, streamId: string): string {
  return `${targetKey}\u0000${streamId}`;
}

/** The coordinator state the native relay paths (signaling + TS6
 *  notifications) need. The coordinator delegates with itself as host. */
export interface ScreenShareRelayHost {
  entries: ReadonlyMap<string, ScreenShareParticipant>;
  screenStreams: Map<string, ScreenStreamRecord>;
  sendToEntry: (entryId: string, message: ServerMessage) => void;
  logger: Pick<Logger, "debug" | "warn">;
  viewerCount: (stream: ScreenStreamRecord) => number;
  broadcast: (stream: ScreenStreamRecord, message: ServerMessage, excludeEntryId?: string) => void;
  describe: (stream: ScreenStreamRecord) => ScreenShareStreamDescription;
  viewerCountMessage: (stream: ScreenStreamRecord) => ServerMessage;
  leave: (entry: ScreenShareParticipant, stream: ScreenStreamRecord) => void;
  stop: (stream: ScreenStreamRecord, reason: string) => void;
}

export function relayScreenShareSignal(
  host: ScreenShareRelayHost,
  entry: ScreenShareParticipant,
  stream: ScreenStreamRecord,
  targetPeerId: string,
  signal: ScreenSharePeerSignal,
  sendJson: (message: ServerMessage) => void,
): void {
  if (stream.source === "teamspeak") {
    if (!stream.viewerEntryIds.has(entry.id) || targetPeerId !== stream.ownerPeerId) {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_SIGNAL_FORBIDDEN", message: "无权发送该屏幕共享信令" });
      return;
    }
    const sourceClientId = stream.sourceClientId;
    if (!sourceClientId) {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_SOURCE_UNAVAILABLE", message: "共享来源暂不可用" });
      return;
    }
    if (signal.kind === "close") {
      host.leave(entry, stream);
      return;
    }
    if (signal.kind === "offer") {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_INVALID_SIGNAL", message: "观看端不能向 TeamSpeak 来源发送 offer" });
      return;
    }
    const payload = signal.kind === "iceCandidate"
      ? { cmd: "iceCandidate", args: { sdp: signal.candidate, ...(signal.sdpMid !== undefined ? { mid: signal.sdpMid } : {}), ...(signal.sdpMLineIndex !== undefined ? { mLine: signal.sdpMLineIndex } : {}) } }
      : { cmd: "answer", args: { answer: signal.sdp } };
    void entry.tsClient.sendProtocolCommand(buildTeamSpeakCommand("streamsignaling", {
      id: stream.streamId,
      clid: String(sourceClientId),
      json: JSON.stringify(payload),
    })).catch((error: unknown) => {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_SIGNAL_FAILED", message: error instanceof Error ? error.message : "屏幕共享信令发送失败" });
    });
    return;
  }

  if (stream.source === "browser" && entry.id === stream.ownerEntryId && targetPeerId.startsWith("ts-viewer-")) {
    const viewerClid = parseNativeViewerPeerId(targetPeerId);
    const publisher = stream.teamSpeakPublisherEntryId ? host.entries.get(stream.teamSpeakPublisherEntryId) : undefined;
    if (!viewerClid || !publisher || !stream.teamSpeakStreamId || !stream.nativeViewerClids.has(viewerClid)) {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_PEER_NOT_FOUND", message: "TeamSpeak 观看者已离开" });
      return;
    }
    if (signal.kind === "close") {
      void publisher.tsClient.sendProtocolCommand(buildTeamSpeakCommand("removeclientfromstream", {
        id: stream.teamSpeakStreamId,
        clid: String(viewerClid),
        reason: "1",
      })).then(() => {
        if (host.entries.get(entry.id) !== entry
          || host.screenStreams.get(screenStreamKey(stream.targetKey, stream.streamId)) !== stream
          || !stream.nativeViewerClids.delete(viewerClid)) return;
        // The native notification may already have removed this viewer.
        stream.viewerCount = host.viewerCount(stream);
        host.sendToEntry(entry.id, { type: "screenShareViewerLeft", streamId: stream.streamId, viewerPeerId: targetPeerId });
        host.broadcast(stream, host.viewerCountMessage(stream));
      }).catch((error: unknown) => {
        if (host.entries.get(entry.id) !== entry
          || host.screenStreams.get(screenStreamKey(stream.targetKey, stream.streamId)) !== stream) return;
        sendJson({ type: "screenShareError", code: "SCREEN_SHARE_SIGNAL_FAILED", message: error instanceof Error ? error.message : "无法移除 TeamSpeak 观看者" });
      });
      return;
    }
    if (signal.kind === "answer") {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_INVALID_SIGNAL", message: "TeamSpeak 观看端不能先发送 answer" });
      return;
    }
    let command: string;
    if (signal.kind === "offer") {
      command = buildTeamSpeakCommand("respondjoinstreamrequest", {
        id: stream.teamSpeakStreamId,
        clid: String(viewerClid),
        msg: "",
        offer: signal.sdp,
        decision: "1",
      });
    } else if (signal.kind === "iceCandidate") {
      command = buildTeamSpeakCommand("streamsignaling", {
        id: stream.teamSpeakStreamId,
        clid: String(viewerClid),
        json: JSON.stringify({ cmd: "iceCandidate", args: { sdp: signal.candidate, ...(signal.sdpMid !== undefined ? { mid: signal.sdpMid } : {}), ...(signal.sdpMLineIndex !== undefined ? { mLine: signal.sdpMLineIndex } : {}) } }),
      });
    } else {
      return;
    }
    void publisher.tsClient.sendProtocolCommand(command).catch((error: unknown) => {
      sendJson({ type: "screenShareError", code: "SCREEN_SHARE_SIGNAL_FAILED", message: error instanceof Error ? error.message : "屏幕共享信令发送失败" });
    });
    return;
  }

  const owner = host.entries.get(stream.ownerEntryId);
  const isOwner = entry.id === stream.ownerEntryId;
  const isViewer = stream.viewerEntryIds.has(entry.id);
  if (!owner || (!isOwner && !isViewer)) {
    sendJson({ type: "screenShareError", code: "SCREEN_SHARE_SIGNAL_FORBIDDEN", message: "无权发送该屏幕共享信令" });
    return;
  }
  // Keep the browser P2P graph bipartite: the owner may signal only an
  // active viewer, and a viewer may signal only the owner. Without this
  // check one viewer could inject SDP/ICE into another viewer's peer.
  const targetEntry = isOwner
    ? [...stream.viewerEntryIds.keys()]
      .map((id) => host.entries.get(id))
      .find((candidate) => candidate?.screenPeerId === targetPeerId)
    : targetPeerId === owner.screenPeerId ? owner : undefined;
  if (!targetEntry || targetEntry.id === entry.id) {
    sendJson({ type: "screenShareError", code: "SCREEN_SHARE_PEER_NOT_FOUND", message: "观看者已离开" });
    return;
  }
  // 候选交换定界仪器（debug 级）：双向计数可直接回答「候选卡在网关哪一侧」。
  host.logger.debug({
    from: entry.screenPeerId,
    to: targetEntry.screenPeerId,
    kind: signal.kind,
    streamId: stream.streamId,
  }, "Screen share signal relayed");
  host.sendToEntry(targetEntry.id, { type: "screenShareSignal", streamId: stream.streamId, fromPeerId: entry.screenPeerId, signal });
}

export function handleScreenShareNotification(
  host: ScreenShareRelayHost,
  entry: ScreenShareParticipant,
  notification: { name: string; params: Record<string, string> },
): void {
  if (host.entries.get(entry.id) !== entry) return;
  const params = notification.params;
  if (notification.name === "notifyjoinstreamrequest") {
    const streamId = params.id || params.stream_id;
    const viewerClientId = parseNumber(params.clid);
    if (!streamId || !viewerClientId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const stream = [...host.screenStreams.values()].find((candidate) => candidate.targetKey === targetKey
      && candidate.source === "browser"
      && candidate.teamSpeakPublisherEntryId === entry.id
      && candidate.teamSpeakStreamId === streamId);
    if (!stream) return;
    stream.nativeViewerClids.add(viewerClientId);
    stream.viewerCount = host.viewerCount(stream);
    host.sendToEntry(stream.ownerEntryId, {
      type: "screenShareNativeViewerJoined",
      streamId: stream.streamId,
      viewerPeerId: nativeViewerPeerId(viewerClientId),
      viewerClientId,
    });
    host.broadcast(stream, host.viewerCountMessage(stream));
    return;
  }
  if (notification.name === "notifystreamstarted" || notification.name === "notifystreaminfo") {
    const streamId = params.id || params.stream_id;
    const sourceClientId = parseNumber(params.clid);
    if (!streamId || !sourceClientId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const publisherEntry = [...host.entries.values()].find((candidate) => candidate.target
      && teamSpeakTargetKey(candidate.target) === targetKey
      && candidate.tsClient.getClientId() === sourceClientId);
    const browserStream = publisherEntry
      ? [...host.screenStreams.values()].find((candidate) => candidate.targetKey === targetKey
        && candidate.source === "browser"
        && candidate.teamSpeakPublisherEntryId === publisherEntry.id
        && (!candidate.teamSpeakStreamId || candidate.teamSpeakStreamId === streamId))
      : undefined;
    if (browserStream) {
      browserStream.teamSpeakStreamId = streamId;
      return;
    }
    if (publisherEntry) {
      // A delayed setup acknowledgement can arrive after the browser stopped.
      // A gateway-owned publication is never a second native source.
      void publisherEntry.tsClient.sendProtocolCommand(buildTeamSpeakCommand("stopstream", { id: streamId, reason: "1" })).catch(() => undefined);
      return;
    }
    // Prefer the observer's directory; another connection can still be
    // processing an older snapshot of the same source.
    const sourceChannel = [entry, ...host.entries.values()]
      .filter(candidate => teamSpeakTargetKey(candidate.target) === targetKey && candidate.tsClient.isConnected())
      .map(candidate => candidate.channelTree.find(channel => channel.id !== "0" && channel.members?.some(member => member.id === sourceClientId)))
      .find(channel => channel !== undefined);
    // Do not guess a channel from the observer, or from a colliding client id
    // on another server. Discovery will retry after the directory is ready.
    if (!sourceChannel) return;
    const key = screenStreamKey(targetKey, streamId);
    let current = host.screenStreams.get(key);
    if (current && current.channelId !== BigInt(sourceChannel.id)) {
      // Retire the old channel's card and memberships before announcing the
      // corrected source. Never carry viewers across a channel boundary.
      for (const viewerId of current.viewerEntryIds.keys()) {
        const viewer = host.entries.get(viewerId);
        if (viewer) host.leave(viewer, current);
      }
      host.stop(current, "source-moved-channel");
      current = undefined;
    }
    const stream: ScreenStreamRecord = current ?? {
      streamId,
      source: "teamspeak",
      ownerPeerId: `ts-${sourceClientId}`,
      ownerClientId: sourceClientId,
      ownerNickname: params.name || `TeamSpeak 用户 ${sourceClientId}`,
      name: params.name || "TeamSpeak 屏幕共享",
      audio: params.audio === "1",
      createdAt: Date.now(),
      viewerCount: 0,
      viewers: [],
      targetKey,
      channelId: BigInt(sourceChannel.id),
      ownerEntryId: "",
      viewerEntryIds: new Map(),
      nativeViewerClids: new Set(),
      sourceClientId,
    };
    stream.sourceClientId = sourceClientId;
    stream.ownerNickname = params.name || stream.ownerNickname;
    stream.name = params.name || stream.name;
    stream.audio = params.audio === "1";
    host.screenStreams.set(key, stream);
    // Every gateway session attached to the same TS target sees the same
    // raw notification. Only the first one should announce a new stream to
    // browsers; otherwise each connected user receives duplicate cards.
    if (!current) {
      host.broadcast(stream, { type: "screenShareStarted", stream: host.describe(stream), owner: false });
    }
    return;
  }
  if (notification.name === "notifystreamstopped") {
    const streamId = params.id || params.stream_id;
    if (!streamId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const stream = host.screenStreams.get(screenStreamKey(targetKey, streamId));
    if (stream) {
      host.stop(stream, "source-stopped");
      return;
    }
    const browserStream = [...host.screenStreams.values()].find((candidate) => candidate.targetKey === targetKey
      && candidate.source === "browser"
      && candidate.teamSpeakStreamId === streamId);
    if (browserStream) {
      browserStream.teamSpeakStreamId = undefined;
      browserStream.nativeViewerClids.clear();
      browserStream.viewerCount = host.viewerCount(browserStream);
      host.sendToEntry(browserStream.ownerEntryId, {
        type: "screenShareError",
        code: "SCREEN_SHARE_NATIVE_PUBLISHER_STOPPED",
        message: "TeamSpeak 客户端屏幕共享通道已停止，网页共享仍可继续",
      });
      host.broadcast(browserStream, host.viewerCountMessage(browserStream));
    }
    return;
  }
  if (notification.name === "notifystreamclientleft") {
    const streamId = params.id || params.stream_id;
    const viewerClientId = parseNumber(params.clid);
    if (!streamId || !viewerClientId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const stream = [...host.screenStreams.values()].find((candidate) => candidate.targetKey === targetKey
      && candidate.source === "browser"
      && candidate.teamSpeakStreamId === streamId
      && candidate.nativeViewerClids.has(viewerClientId));
    if (!stream) return;
    stream.nativeViewerClids.delete(viewerClientId);
    stream.viewerCount = host.viewerCount(stream);
    host.sendToEntry(stream.ownerEntryId, {
      type: "screenShareViewerLeft",
      streamId: stream.streamId,
      viewerPeerId: nativeViewerPeerId(viewerClientId),
    });
    host.broadcast(stream, host.viewerCountMessage(stream));
    return;
  }
  if (notification.name === "notifyrespondjoinstreamrequest" || notification.name === "notifystreamsignaling") {
    const streamId = params.id || params.stream_id;
    if (!streamId) return;
    const targetKey = teamSpeakTargetKey(entry.target);
    const browserStream = notification.name === "notifystreamsignaling"
      ? [...host.screenStreams.values()].find((candidate) => candidate.targetKey === targetKey
        && candidate.source === "browser"
        && candidate.teamSpeakPublisherEntryId === entry.id
        && candidate.teamSpeakStreamId === streamId)
      : undefined;
    if (browserStream) {
      const viewerClientId = parseNumber(params.clid);
      if (!viewerClientId || !browserStream.nativeViewerClids.has(viewerClientId)) return;
      const payload = parseStreamSignalPayload(params.json || params.data || "");
      if (!payload) return;
      const signal = toBrowserScreenSignal(payload);
      if (!signal) return;
      host.sendToEntry(browserStream.ownerEntryId, {
        type: "screenShareSignal",
        streamId: browserStream.streamId,
        fromPeerId: nativeViewerPeerId(viewerClientId),
        signal,
      });
      return;
    }
    const stream = host.screenStreams.get(screenStreamKey(targetKey, streamId));
    if (!stream || stream.source !== "teamspeak" || !stream.viewerEntryIds.has(entry.id)) return;
    const payload = notification.name === "notifyrespondjoinstreamrequest"
      ? { cmd: "offer", args: { offer: params.offer || "" } }
      : parseStreamSignalPayload(params.json || params.data || "");
    if (!payload) return;
    const signal = toBrowserScreenSignal(payload);
    if (!signal) return;
    host.sendToEntry(entry.id, { type: "screenShareSignal", streamId, fromPeerId: stream.ownerPeerId, signal });
  }
}
