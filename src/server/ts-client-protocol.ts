import type { DirectoryClientInfo, TextMessage } from "@echosixhiya/teamspeak-client";
import { Client as TS3FullClient } from "@echosixhiya/teamspeak-client";
import { parseChannelPasswordProtections } from "./channel-flags.js";

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
export function toTSChatMessage(msg: TextMessage): TSChatMessage {
  return {
    invokerName: msg.invokerName,
    invokerId: msg.invokerID,
    invokerUid: msg.invokerUID,
    message: msg.message,
    targetMode: msg.targetMode,
    targetId: msg.targetID,
  };
}

/**
 * The vendored SDK's listClients requests `-away -voice` but its parser keeps
 * only identity fields, so every member row arrived without away/mute flags
 * and the web client rendered "status unknown" until a notification happened
 * to carry them (never for the gateway's own client). Parse the same command
 * here so status flags survive; drop this once the SDK keeps them.
 */
export async function tsListClientsFull(client: TS3FullClient): Promise<DirectoryClientInfo[]> {
  const rows = await client.execCommandWithResponse("clientlist -uid -away -voice -groups", 5_000);
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

/**
 * TeamSpeak only includes channel flag fields (including the public
 * password-required bit) when the client asks for flags explicitly, and the
 * vendored SDK's listChannels never asks. Read the same command here so the
 * channel tree can mark locked channels; drop this once the SDK keeps flags.
 */
export async function tsListChannelFlags(client: TS3FullClient): Promise<Map<bigint, boolean>> {
  const rows = await client.execCommandWithResponse("channellist -flags", 5_000);
  return parseChannelPasswordProtections(rows);
}
