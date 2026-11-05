import type { TextMessageEvent } from "@honeybbq/teamspeak";
import type { Client as TSFullClient } from "@honeybbq/teamspeak/client";
import { parseChannelPasswordProtections } from "./channel-flags.js";
import { toTSDirectoryClient, type TSDirectoryChannel, type TSDirectoryClient } from "./ts-client-directory.js";

export interface TSChatMessage {
  invokerName: string;
  invokerId: number;
  invokerUid: string;
  message: string;
  targetMode: number;
  targetId: bigint;
}

/**
 * Keep the TeamSpeak target id when adapting SDK events for the gateway.
 * Private-message events include a bigint targetID; dropping it makes the
 * bridge dereference undefined while echoing the message to the browser.
 */
export function toTSChatMessage(msg: TextMessageEvent): TSChatMessage {
  return {
    invokerName: msg.invokerName,
    invokerId: msg.invokerID,
    invokerUid: msg.invokerUID,
    message: msg.message,
    targetMode: msg.targetMode,
    targetId: BigInt(msg.targetID),
  };
}

/**
 * Keep member status flags the gateway cares about by reading clientlist
 * directly: the SDK's listClients keeps identity fields only, so rows read
 * through it arrive without away/mute flags and the web client would render
 * "status unknown" until a notification happened to carry them (never for the
 * gateway's own client).
 */
export async function tsListClientsFull(client: TSFullClient): Promise<TSDirectoryClient[]> {
  const rows = await client.exec("clientlist -uid -away -voice -groups", { timeoutMs: 5_000 });
  return rows.map(row => ({
    id: Number.parseInt(row.clid ?? "0", 10),
    nickname: row.client_nickname ?? "",
    uid: row.client_unique_identifier ?? "",
    channelID: BigInt(row.cid ?? "0"),
    type: Number.parseInt(row.client_type ?? "0", 10),
    serverGroups: (row.client_servergroups ?? "").split(",").filter(Boolean),
    ...(row.client_away !== undefined ? { away: row.client_away === "1" } : {}),
    ...(row.client_away_message !== undefined ? { awayMessage: row.client_away_message } : {}),
    ...(row.client_input_muted !== undefined ? { inputMuted: row.client_input_muted === "1" } : {}),
    ...(row.client_output_muted !== undefined ? { outputMuted: row.client_output_muted === "1" } : {}),
    ...(row.client_is_channel_commander !== undefined ? { channelCommander: row.client_is_channel_commander === "1" } : {}),
  }));
}

export interface TSChannelListing {
  channels: TSDirectoryChannel[];
  flags: Map<bigint, boolean>;
}

/**
 * The channel tree in one authoritative request. The SDK's listChannels omits
 * the description (bandwidth) and reads no password flag, while TeamSpeak
 * returns both on a plain `channellist -flags` row — the same command the
 * gateway already parsed for lock flags — so one request rebuilds tree and
 * flags together and keeps a single row→directory mapping path.
 */
export async function tsListChannelsFull(client: TSFullClient): Promise<TSChannelListing> {
  const rows = await client.exec("channellist -flags", { timeoutMs: 5_000 });
  const channels: TSDirectoryChannel[] = rows.map(row => ({
    id: BigInt(row.cid ?? "0"),
    parentID: BigInt(row.pid ?? "0"),
    order: BigInt(row.channel_order ?? "0"),
    name: row.channel_name ?? "",
    description: row.channel_description ?? "",
  }));
  return { channels, flags: parseChannelPasswordProtections(rows) };
}

/**
 * Directory data from the SDK's own server view, built from the welcome
 * sequence and pushed events — no `b_virtualserver_channel_list` /
 * `b_virtualserver_client_list` permission involved. This is the fallback for
 * servers that deny the raw listings (权限 id 27/29，ts.lwair.cn 实测): the old
 * SDK's welcome directorySnapshot covered exactly this case, and the upstream
 * view is its supported equivalent. The view is live as soon as `connect()`
 * resolves, and `hasPassword` doubles as the lock flag source.
 */
export function viewDirectoryClients(client: TSFullClient): TSDirectoryClient[] {
  return [...client.view.clients.values()].map(toTSDirectoryClient);
}

export function viewChannelListing(client: TSFullClient): TSChannelListing {
  const channels: TSDirectoryChannel[] = [];
  const flags = new Map<bigint, boolean>();
  for (const channel of client.view.channels.values()) {
    channels.push({
      id: channel.id,
      parentID: channel.parentID,
      order: channel.order,
      name: channel.name,
      description: channel.description ?? "",
    });
    flags.set(channel.id, channel.hasPassword);
  }
  return { channels, flags };
}

/** Pull the failed-permission id out of an SDK ServerError for diagnostics. */
export function describeSdkPermission(error: unknown): { code?: number | string; failedPermissionID?: number | string } {
  const e = error as { code?: number | string; failedPermissionID?: number | string };
  return { code: e?.code, failedPermissionID: e?.failedPermissionID };
}
