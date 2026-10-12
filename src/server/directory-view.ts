import type { ChannelInfo } from "../shared/voice-models.js";
import type { TSDirectorySnapshot } from "./ts-client.js";

// Avatars are intentionally absent from the directory projection: embedding
// images in every channelList resends multiplied directory traffic by the
// largest avatar in the tree. They travel as capability URLs (avatarSnapshot
// / avatarUpdate messages) from the shared cross-session cache instead.
export function mapChannelTree(snapshot: TSDirectorySnapshot): ChannelInfo[] {
  return snapshot.channels.map((channel) => ({
    id: String(channel.id),
    parentID: String(channel.parentID),
    order: String(channel.order),
    name: channel.name || "未命名频道",
    description: channel.description || "",
    members: snapshot.clients
      .filter((client) => client.channelID === channel.id)
      .map((client) => ({
        id: client.id,
        nickname: client.nickname || "未知用户",
        uid: client.uid,
        away: client.away,
        awayMessage: client.awayMessage,
        inputMuted: client.inputMuted,
        outputMuted: client.outputMuted,
        channelCommander: client.channelCommander,
      })),
  }));
}

export function normalizeDirectorySnapshot(
  snapshot: TSDirectorySnapshot,
  selfId: number,
  selfChannelId: bigint,
  nickname: string,
  requestedChannelName?: string,
): TSDirectorySnapshot {
  if (selfId <= 0) return snapshot;

  const clients = snapshot.clients.slice();
  const selfIndex = clients.findIndex((client) => client.id === selfId);
  const snapshotChannelId = selfIndex >= 0 ? clients[selfIndex]!.channelID : 0n;
  const requestedName = requestedChannelName?.trim().toLocaleLowerCase();
  const requestedChannel = requestedName
    ? snapshot.channels.find((channel) => channel.name.trim().toLocaleLowerCase() === requestedName)
    : undefined;
  const resolvedChannelId = selfChannelId !== 0n
    ? selfChannelId
    : snapshotChannelId !== 0n
      ? snapshotChannelId
      : requestedChannel?.id ?? snapshot.channels[0]?.id ?? 0n;
  if (selfIndex >= 0) {
    const current = clients[selfIndex]!;
    if (resolvedChannelId !== 0n) clients[selfIndex] = { ...current, channelID: resolvedChannelId };
  } else if (resolvedChannelId !== 0n) {
    clients.push({ id: selfId, nickname, uid: "", channelID: resolvedChannelId, type: 1, serverGroups: [] });
  }

  return { ...snapshot, clients };
}
